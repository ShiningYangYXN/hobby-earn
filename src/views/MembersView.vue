<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import {
  NDataTable,
  NButton,
  NFlex,
  NCard,
  NSelect,
  NInput,
  NEmpty,
  NH2,
  NIcon,
  useMessage,
  useDialog,
} from 'naive-ui'
import { IconPlus, IconVip } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useUiStore } from '@/stores/useUiStore'
import { buildMemberColumns } from '@/components/columns/member-columns'
import { tableScrollX } from '@/stores/types'
import type { Member } from '@/stores/types'
import MemberModal from '@/components/modals/MemberModal.vue'
import MemberTypeModal from '@/components/modals/MemberTypeModal.vue'

const router = useRouter()
const msg = useMessage()
const dialog = useDialog()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const uiStore = useUiStore()

function hasAssoc(m: Member): boolean {
  const hasOrders = orderStore.orders.some((o) => o.memberId === m.id)
  const hasDiscounts = discountStore.discounts.some((d) => d.scope?.memberIds?.includes(m.id))
  return hasOrders || hasDiscounts
}

// 非作弊模式下有关联的会员：隐藏删除按钮（而非禁用）
function canDeleteMember(m: Member): boolean {
  if (hasAssoc(m) && !uiStore.advancedMode) return false
  return true
}

// 路由控制弹窗：/members、/members/new、/members/:id、/members/types、/members/types/:id
const route = useRoute()
const showMemberModal = computed(() => route.name === 'member-new' || route.name === 'member-edit')
const showTypeModal = computed(() => route.name === 'member-types')
const memberModalId = computed(() =>
  route.name === 'member-edit' ? (route.params.id as string) : undefined,
)

const typeOptions = computed(() => [
  { label: '全部种类', value: '' },
  ...memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
])
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
]
const typeFilter = ref('')
const statusFilter = ref('')
const keyword = ref('')

const list = computed(() =>
  memberStore.members.filter((m) => {
    if (typeFilter.value && !(m.typeIds ?? []).includes(typeFilter.value)) return false
    if (statusFilter.value === 'active' && m.isActive === false) return false
    if (statusFilter.value === 'inactive' && m.isActive !== false) return false
    if (keyword.value.trim()) {
      const k = keyword.value.trim().toLowerCase()
      if (!(m.name.toLowerCase().includes(k) || (m.phone ?? '').toLowerCase().includes(k)))
        return false
    }
    return true
  }),
)

function openNew() {
  router.push({ name: 'member-new' })
}
function openEdit(m: Member) {
  router.push({ name: 'member-edit', params: { id: m.id } })
}
async function removeMember(m: Member) {
  const assoc = hasAssoc(m)
  const doRemove = async () => {
    try {
      await memberStore.remove(m.id)
      msg.success('会员已删除')
    } catch (e) {
      msg.error('删除失败：' + (e as Error).message)
    }
  }
  if (assoc) {
    dialog.warning({
      title: '删除会员',
      content:
        '该会员存在关联订单或优惠。删除将一并清理关联订单，并将「专属优惠」直接删除、非专属优惠移除其引用。确认删除？',
      positiveText: '删除',
      negativeText: '取消',
      onPositiveClick: doRemove,
    })
    return
  }
  await doRemove()
}
async function toggleActive(m: Member) {
  const next = m.isActive === false
  await memberStore.update(m.id, { isActive: next })
  msg.success(next ? '会员已启用' : '会员已停用')
}

const columns = computed(() =>
  buildMemberColumns({ openEdit, removeMember, toggleActive, canDelete: canDeleteMember }),
)

function openTypeManagement() {
  router.push({ name: 'member-types' })
}

onMounted(async () => {
  if (!memberStore.members.length) await memberStore.load()
  if (!memberTypeStore.types.length) await memberTypeStore.load()
})

// 路由参数变化时刷新列表
watch(
  () => route.fullPath,
  async () => {
    if (!memberStore.members.length) await memberStore.load()
    if (!memberTypeStore.types.length) await memberTypeStore.load()
  },
)
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">会员管理</NH2>

    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" justify="space-between" :size="12" wrap>
          <NFlex align="center" :size="12" wrap>
            <NInput
              v-model:value="keyword"
              placeholder="搜索姓名 / 手机"
              clearable
              style="width: 200px"
            />
            <NSelect v-model:value="typeFilter" :options="typeOptions" style="width: 160px" />
            <NSelect v-model:value="statusFilter" :options="statusOptions" style="width: 140px" />
          </NFlex>
          <NFlex align="center" :size="12" wrap>
            <NButton @click="openTypeManagement">
              <NIcon :size="16">
                <IconVip />
              </NIcon>
              管理会员种类
            </NButton>
            <NButton type="primary" @click="openNew">
              <NIcon :size="16">
                <IconPlus />
              </NIcon>
              新建会员
            </NButton>
          </NFlex>
        </NFlex>
        <NDataTable
          v-if="list.length"
          :columns="columns"
          :data="list"
          :pagination="{ pageSize: 10 }"
          :scroll-x="tableScrollX(columns)"
          size="small"
        />
        <NEmpty v-else description="暂无会员" />
      </NFlex>
    </NCard>

    <RouterView />
    <MemberModal v-if="showMemberModal" :id="memberModalId" />
    <MemberTypeModal v-if="showTypeModal" />
  </NFlex>
</template>
