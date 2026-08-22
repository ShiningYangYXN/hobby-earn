<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute, RouterView } from 'vue-router'
import {
  NDataTable,
  NButton,
  NFlex,
  NText,
  NCard,
  NSelect,
  NInput,
  NEmpty,
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { buildMemberColumns } from '@/components/columns/member-columns'
import { buildMemberTypeColumns } from '@/components/columns/member-type-columns'
import type { Member, MemberType } from '@/stores/types'
import MemberModal from '@/components/modals/MemberModal.vue'
import MemberTypeModal from '@/components/modals/MemberTypeModal.vue'

const router = useRouter()
const msg = useMessage()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()

// 路由控制弹窗：/members、/members/new、/members/:id、/members/types、/members/types/:id
const route = useRoute()
const showMemberModal = computed(
  () => route.name === 'member-new' || route.name === 'member-edit',
)
const showTypeModal = computed(
  () => route.name === 'member-type-new' || route.name === 'member-type-edit',
)
const memberModalId = computed(() =>
  route.name === 'member-edit' ? (route.params.id as string) : undefined,
)
const typeModalId = computed(() =>
  route.name === 'member-type-edit' ? (route.params.id as string) : undefined,
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
    if (typeFilter.value && m.typeId !== typeFilter.value) return false
    if (statusFilter.value === 'active' && m.isActive === false) return false
    if (statusFilter.value === 'inactive' && m.isActive !== false) return false
    if (keyword.value.trim()) {
      const k = keyword.value.trim().toLowerCase()
      if (
        !(m.name.toLowerCase().includes(k) || (m.phone ?? '').toLowerCase().includes(k))
      )
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

const columns = computed(() =>
  buildMemberColumns({ openEdit, removeMember, toggleActive }),
)

// 会员种类管理
const typeColumns = computed(() =>
  buildMemberTypeColumns({
    editType: (id: string) => editType(id),
    removeType: (t: MemberType) => removeType(t),
  }),
)
function openNewType() {
  router.push({ name: 'member-type-new' })
}
function editType(id: string) {
  router.push({ name: 'member-type-edit', params: { id } })
}
async function removeType(t: MemberType) {
  await memberTypeStore.remove(t.id)
  msg.success('种类已删除')
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

    <NCard title="会员种类">
      <NFlex vertical :size="12">
        <NFlex align="center" justify="space-between">
          <NText depth="3">管理会员分类，新建会员时可选择所属种类</NText>
          <NButton type="primary" @click="openNewType">
            <IconPlus :size="16" /> 新建种类
          </NButton>
        </NFlex>
        <NDataTable
          v-if="memberTypeStore.types.length"
          :columns="typeColumns"
          :data="memberTypeStore.types"
          size="small"
          :pagination="false"
        />
        <NEmpty v-else description="暂无会员种类，点击右上角新建" />
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
            <IconPlus :size="16" /> 新建会员
          </NButton>
        </NFlex>
        <NDataTable
          v-if="list.length"
          :columns="columns"
          :data="list"
          :pagination="{ pageSize: 10 }"
          size="small"
        />
        <NEmpty v-else description="暂无会员" />
      </NFlex>
    </NCard>

    <RouterView />
    <MemberModal v-if="showMemberModal" :id="memberModalId" />
    <MemberTypeModal v-if="showTypeModal" :id="typeModalId" />
  </NFlex>
</template>
