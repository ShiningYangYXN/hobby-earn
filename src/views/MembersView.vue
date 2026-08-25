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
} from 'naive-ui'
import { IconPlus, IconVip } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { buildMemberColumns } from '@/components/columns/member-columns'
import { tableScrollX } from '@/stores/types'
import type { Member } from '@/stores/types'
import MemberModal from '@/components/modals/MemberModal.vue'
import MemberTypeModal from '@/components/modals/MemberTypeModal.vue'

const router = useRouter()
const msg = useMessage()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()

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
  await memberStore.remove(m.id)
  msg.success('会员已删除')
}
async function toggleActive(m: Member) {
  const next = m.isActive === false
  await memberStore.update(m.id, { isActive: next })
  msg.success(next ? '会员已启用' : '会员已停用')
}

const columns = computed(() => buildMemberColumns({ openEdit, removeMember, toggleActive }))

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
      <NFlex align="center" justify="space-between">
        <NText>会员种类用于给会员分类，新建会员时可选择所属种类。</NText>
        <NButton type="primary" @click="openTypeManagement">
          <NIcon :size="16">
            <IconVip />
          </NIcon>
          管理会员种类
        </NButton>
      </NFlex>
    </NCard>

    <NCard title="会员列表">
      <NFlex vertical :size="12">
        <NFlex align="center" :size="12" wrap>
          <NSelect v-model:value="typeFilter" :options="typeOptions" style="width: 160px" />
          <NSelect v-model:value="statusFilter" :options="statusOptions" style="width: 140px" />
          <NInput
            v-model:value="keyword"
            placeholder="搜索姓名 / 手机"
            clearable
            style="width: 200px"
          />
          <NButton type="primary" @click="openNew">
            <NIcon :size="16">
              <IconPlus />
            </NIcon>
            新建会员
          </NButton>
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
