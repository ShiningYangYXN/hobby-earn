<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NScrollbar,
  NButton,
  useMessage,
} from 'naive-ui'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()

const editing = computed(() => !!props.id)
const typeOptions = computed(() =>
  memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
)

const form = ref({ name: '', phone: '', typeId: null as string | null, notes: '' })

watch(
  () => props.id,
  async (id) => {
    if (!memberTypeStore.types.length) await memberTypeStore.load()
    if (id) {
      const m = memberStore.members.find((x) => x.id === id)
      if (m)
        form.value = {
          name: m.name,
          phone: m.phone ?? '',
          typeId: m.typeId ?? null,
          notes: m.notes ?? '',
        }
      else form.value = { name: '', phone: '', typeId: null, notes: '' }
    } else {
      form.value = { name: '', phone: '', typeId: null, notes: '' }
    }
  },
  { immediate: true },
)

async function save() {
  if (!form.value.name) {
    msg.warning('请填写会员名称')
    return
  }
  try {
    const payload = {
      name: form.value.name,
      phone: form.value.phone,
      typeId: form.value.typeId ?? undefined,
      notes: form.value.notes,
    }
    if (editing.value && props.id) {
      await memberStore.update(props.id, payload)
      msg.success('会员已更新')
    } else {
      await memberStore.create(payload)
      msg.success('会员已创建')
    }
    router.push('/members')
  } catch (e) {
    msg.error('保存失败：' + (e as Error).message)
  }
}

function close() {
  router.push('/members')
}
</script>

<template>
  <NModal
    :show="true"
    :title="editing ? '编辑会员' : '新建会员'"
    preset="card"
    class="modal-md"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar class="modal-scroll">
      <NForm label-placement="top">
        <NFormItem label="名称" required>
          <NInput v-model:value="form.name" placeholder="会员名称" />
        </NFormItem>
        <NFormItem label="电话">
          <NInput v-model:value="form.phone" placeholder="可选" />
        </NFormItem>
        <NFormItem label="会员类型">
          <NSelect
            v-model:value="form.typeId"
            :options="typeOptions"
            placeholder="不限定"
            clearable
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput
            v-model:value="form.notes"
            type="textarea"
            placeholder="备注（可选）"
            :autosize="{ minRows: 2, maxRows: 4 }"
          />
        </NFormItem>
      </NForm>
    </NScrollbar>
    <template #footer>
      <NButton @click="close">取消</NButton>
      <NButton type="primary" @click="save">保存</NButton>
    </template>
  </NModal>
</template>
