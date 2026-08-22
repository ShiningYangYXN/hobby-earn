<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NButton,
  NIcon,
  NDataTable,
  NFlex,
  NEmpty,
  useMessage,
} from 'naive-ui'
import { IconX, IconDeviceFloppy, IconPlus } from '@tabler/icons-vue'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { buildMemberTypeColumns } from '@/components/columns/member-type-columns'
import type { MemberType } from '@/stores/types'

const router = useRouter()
const msg = useMessage()
const memberTypeStore = useMemberTypeStore()

// 内联表单状态：null 表示列表态，否则为编辑中的种类 id（undefined 表示新建）
const editId = ref<string | undefined | null>(null)
const form = ref({ name: '' })

const isFormMode = computed(() => editId.value !== null)

onMounted(async () => {
  if (!memberTypeStore.types.length) await memberTypeStore.load()
})

watch(
  () => memberTypeStore.types.length,
  () => {
    if (!memberTypeStore.types.length) memberTypeStore.load()
  },
)

const typeColumns = computed(() =>
  buildMemberTypeColumns({
    editType: (id: string) => openEdit(id),
    removeType: (t: MemberType) => removeType(t),
  }),
)

function openNew() {
  editId.value = undefined
  form.value = { name: '' }
}
function openEdit(id: string) {
  const t = memberTypeStore.types.find((x) => x.id === id)
  editId.value = id
  form.value = { name: t?.name ?? '' }
}
async function removeType(t: MemberType) {
  await memberTypeStore.remove(t.id)
  msg.success('种类已删除')
}

async function save() {
  if (!form.value.name.trim()) {
    msg.warning('请填写种类名称')
    return
  }
  try {
    if (editId.value) {
      await memberTypeStore.update(editId.value, { name: form.value.name.trim() })
      msg.success('种类已更新')
    } else {
      await memberTypeStore.create(form.value.name.trim())
      msg.success('种类已创建')
    }
    cancel()
  } catch (e) {
    msg.error('保存失败：' + (e as Error).message)
  }
}

function cancel() {
  editId.value = null
  form.value = { name: '' }
}

function close() {
  router.push('/members')
}
</script>

<template>
  <NModal :show="true" :title="isFormMode ? (editId ? '编辑会员种类' : '新建会员种类') : '会员种类管理'" preset="card" class="modal-md"
    :autoFocus="false" @update:show="close">
    <NForm v-if="isFormMode" labelPlacement="top">
      <NFormItem label="种类名称" required>
        <NInput v-model:value="form.name" placeholder="如：普通会员 / VIP" />
      </NFormItem>
    </NForm>

    <NFlex v-else vertical :size="12">
      <NFlex align="center" justify="space-between">
        <span>管理会员分类，新建会员时可选择所属种类</span>
        <NButton type="primary" @click="openNew">
          <NIcon :size="16">
            <IconPlus />
          </NIcon> 新建种类
        </NButton>
      </NFlex>
      <NDataTable v-if="memberTypeStore.types.length" :columns="typeColumns" :data="memberTypeStore.types" size="small"
        :pagination="false" />
      <NEmpty v-else description="暂无会员种类，点击右上角新建" />
    </NFlex>

    <template #footer>
      <NFlex justify="end">
        <NButton v-if="isFormMode" @click="cancel">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton v-if="isFormMode" type="primary" @click="save">
          <NIcon>
            <IconDeviceFloppy />
          </NIcon>
          保存
        </NButton>
        <NButton v-else @click="close">
          <NIcon>
            <IconX />
          </NIcon>
          关闭
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>
