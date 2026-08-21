<script setup lang="ts">
import { h, ref, onMounted } from 'vue'
import { NButton, NCard, NSpace, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, useMessage } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import type { Member } from '@/stores/types'

const message = useMessage()
const memberStore = useMemberStore()
onMounted(() => memberStore.load())

const showModal = ref(false)
const form = ref({ name: '', phone: '', tags: [] as string[], notes: '' })
const tagOptions = [
  { label: '学生', value: 'student' }, { label: 'VIP', value: 'vip' },
  { label: '新会员', value: 'new' }, { label: '普通', value: 'regular' },
]

async function save() {
  if (!form.value.name.trim()) { message.warning('请输入姓名'); return }
  try {
    await memberStore.create(form.value)
    message.success('创建成功')
    showModal.value = false
    form.value = { name: '', phone: '', tags: [], notes: '' }
  } catch (e: unknown) { message.error(String(e)) }
}

function removeMember(m: Member) {
  import('naive-ui').then(({ useDialog }) => {
    useDialog().warning({
      title: '确认删除', content: `删除会员「${m.name}」？`,
      positiveText: '删除', negativeText: '取消',
      onPositiveClick: async () => { await memberStore.remove(m.id); message.success('已删除') },
    })
  })
}
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <NSpace justify="space-between" align="center">
      <h2 style="margin:0">会员管理</h2>
      <NButton type="primary" @click="showModal = true"><IconPlus /> 新建会员</NButton>
    </NSpace>
    <NCard>
      <NDataTable
        :columns="[
          { title: '姓名', key: 'name' },
          { title: '手机', key: 'phone', width: 140 },
          { title: '标签', key: 'tags', width: 160, render: (row: Member) => row.tags.map((t: string) => h('span', { style: { marginRight: 4, fontSize: 12, padding: '1px 6px', background: 'var(--n-tag-color)', borderRadius: 4 } }, t)) },
          { title: '加入时间', key: 'joinDate', width: 150, render: (row: Member) => new Date(row.joinDate).toLocaleString() },
          { title: '操作', key: 'actions', width: 80, render: (row: Member) => h('button', { style: 'background:none;border:none;color:var(--n-error-color);cursor:pointer;font-size:12px', onClick: () => removeMember(row) }, '删除') },
        ]"
        :data="memberStore.members"
        :pagination="{ pageSize: 15 }"
        size="small"
      />
    </NCard>
    <NModal v-model:show="showModal" title="新建会员" preset="card" style="width:380px">
      <NForm label-width="60">
        <NFormItem label="姓名"><NInput v-model:value="form.name" placeholder="会员姓名" /></NFormItem>
        <NFormItem label="手机"><NInput v-model:value="form.phone" placeholder="选填" /></NFormItem>
        <NFormItem label="标签"><NSelect v-model:value="form.tags" multiple :options="tagOptions" placeholder="选填" /></NFormItem>
        <NFormItem label="备注"><NInput v-model:value="form.notes" type="textarea" :rows="2" /></NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="save">保存</NButton>
        </NSpace>
      </template>
    </NModal>
  </NSpace>
</template>
