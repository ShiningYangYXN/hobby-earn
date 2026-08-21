<script setup lang="ts">
import { h, ref, computed, onMounted } from 'vue'
import { NButton, NCard, NSpace, NDataTable, NModal, NForm, NFormItem, NInput, NSelect, NTag, NIcon, useMessage, useDialog } from 'naive-ui'
import { IconPlus, IconTag } from '@tabler/icons-vue'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import type { Member, MemberType } from '@/stores/types'

const message = useMessage()
const dialog = useDialog()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()

onMounted(async () => {
  await memberStore.load()
  await memberTypeStore.load()
})

// ── 会员新建 / 编辑 ──
const showModal = ref(false)
const editingId = ref<string | null>(null)
const form = ref({ name: '', phone: '', tags: [] as string[], notes: '' })
const typeOptions = computed(() => memberTypeStore.types.map((t: MemberType) => ({ label: t.name, value: t.name })))

function openCreate() {
  editingId.value = null
  form.value = { name: '', phone: '', tags: [], notes: '' }
  showModal.value = true
}
function openEdit(m: Member) {
  editingId.value = m.id
  form.value = { name: m.name, phone: m.phone ?? '', tags: [...m.tags], notes: m.notes ?? '' }
  showModal.value = true
}
async function save() {
  if (!form.value.name.trim()) { message.warning('请输入姓名'); return }
  try {
    if (editingId.value) {
      await memberStore.update(editingId.value, { ...form.value })
    } else {
      await memberStore.create(form.value)
    }
    message.success('已保存')
    showModal.value = false
  } catch (e: unknown) { message.error(String(e)) }
}

function removeMember(m: Member) {
  dialog.warning({
    title: '确认删除', content: `删除会员「${m.name}」？`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { await memberStore.remove(m.id); message.success('已删除') },
  })
}

// ── 会员种类管理（完全自定义）──
const showTypeModal = ref(false)
const newTypeName = ref('')
async function addType() {
  try { await memberTypeStore.create(newTypeName.value); newTypeName.value = '' }
  catch (e: unknown) { message.error(String(e)) }
}
function removeType(t: MemberType) {
  dialog.warning({
    title: '确认删除', content: `删除种类「${t.name}」？已标记该种类的会员不受影响。`,
    positiveText: '删除', negativeText: '取消',
    onPositiveClick: async () => { await memberTypeStore.remove(t.id); message.success('已删除') },
  })
}

const columns = computed(() => [
  { title: '姓名', key: 'name' },
  { title: '手机', key: 'phone', width: 140, render: (row: Member) => row.phone || '-' },
  { title: '标签', key: 'tags', width: 200, render: (row: Member) => h(NSpace, { size: 4 }, () => row.tags.map((t: string) => h(NTag, { size: 'tiny' }, () => t))) },
  { title: '加入时间', key: 'joinDate', width: 160, render: (row: Member) => new Date(row.joinDate).toLocaleString() },
  {
    title: '操作', key: 'actions', width: 130,
    render: (row: Member) => h(NSpace, { size: 4 }, () => [
      h(NButton, { size: 'tiny', onClick: () => openEdit(row) }, () => '编辑'),
      h(NButton, { size: 'tiny', type: 'error', onClick: () => removeMember(row) }, () => '删除'),
    ]),
  },
])
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <NSpace justify="space-between" align="center">
      <h2 style="margin:0">会员管理</h2>
      <NSpace align="center">
        <NButton quaternary @click="showTypeModal = true">
          <template #icon><NIcon><IconTag /></NIcon></template>
          管理种类
        </NButton>
        <NButton type="primary" @click="openCreate">
          <template #icon><NIcon><IconPlus /></NIcon></template>
          新建会员
        </NButton>
      </NSpace>
    </NSpace>

    <NCard>
      <NDataTable :columns="columns" :data="memberStore.members" :pagination="{ pageSize: 15 }" size="small" />
    </NCard>

    <NModal v-model:show="showModal" :title="editingId ? '编辑会员' : '新建会员'" preset="card" style="width:380px">
      <NForm label-width="60">
        <NFormItem label="姓名"><NInput v-model:value="form.name" placeholder="会员姓名" /></NFormItem>
        <NFormItem label="手机"><NInput v-model:value="form.phone" placeholder="选填" /></NFormItem>
        <NFormItem label="种类"><NSelect v-model:value="form.tags" multiple :options="typeOptions" placeholder="选填" /></NFormItem>
        <NFormItem label="备注"><NInput v-model:value="form.notes" type="textarea" :rows="2" /></NFormItem>
      </NForm>
      <template #footer>
        <NSpace justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="save">保存</NButton>
        </NSpace>
      </template>
    </NModal>

    <NModal v-model:show="showTypeModal" title="会员种类管理" preset="card" style="width:380px">
      <NSpace vertical :size="8">
        <NCard v-for="t in memberTypeStore.types" :key="t.id" size="small"
          style="display:flex;align-items:center;justify-content:space-between">
          <span>{{ t.name }}</span>
          <NButton size="tiny" type="error" @click="removeType(t)">删除</NButton>
        </NCard>
        <NSpace>
          <NInput v-model:value="newTypeName" placeholder="新种类名称" @keydown.enter="addType" />
          <NButton type="primary" @click="addType">添加</NButton>
        </NSpace>
      </NSpace>
    </NModal>
  </NSpace>
</template>
