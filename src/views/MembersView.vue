<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import { NDataTable, NButton, NFlex, NText, NCard, useDialog, useMessage } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { buildMemberColumns } from '@/components/columns/member-columns'
import { type Member } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()

function openCreate() {
  router.push({ name: 'member-new' })
}
function openEdit(m: Member) {
  router.push({ name: 'member-edit', params: { id: m.id } })
}
const columns = buildMemberColumns({ openEdit, removeMember: remove })

function remove(m: Member) {
  dialog.warning({
    title: '删除会员',
    content: `确认删除会员「${m.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await memberStore.remove(m.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!memberStore.members.length) memberStore.load()
  if (!memberTypeStore.types.length) memberTypeStore.load()
})
</script>

<template>
  <NCard title="会员管理">
    <NFlex justify="end" style="margin-bottom: 12px">
      <NButton type="primary" @click="openCreate"> <IconPlus :size="16" /> 新建会员 </NButton>
    </NFlex>
    <NDataTable
      :columns="columns"
      :data="memberStore.members"
      :pagination="{ pageSize: 10 }"
      size="small"
    />
    <NText v-if="!memberStore.members.length" depth="3">暂无会员，点击右上角新建。</NText>
    <RouterView />
  </NCard>
</template>
