<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NScrollbar,
  NButton,
  useMessage,
} from 'naive-ui'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const memberTypeStore = useMemberTypeStore()

const editing = computed(() => !!props.id)

const form = ref({ name: '' })

watch(
  () => props.id,
  async (id) => {
    if (!memberTypeStore.types.length) await memberTypeStore.load()
    if (id) {
      const t = memberTypeStore.types.find((x) => x.id === id)
      form.value = { name: t?.name ?? '' }
    } else {
      form.value = { name: '' }
    }
  },
  { immediate: true },
)

async function save() {
  if (!form.value.name.trim()) {
    msg.warning('请填写种类名称')
    return
  }
  try {
    if (editing.value && props.id) {
      await memberTypeStore.update(props.id, { name: form.value.name.trim() })
      msg.success('种类已更新')
    } else {
      await memberTypeStore.create(form.value.name.trim())
      msg.success('种类已创建')
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
    :title="editing ? '编辑会员种类' : '新建会员种类'"
    preset="card"
    class="modal-md"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar class="modal-scroll">
      <NForm label-placement="top">
        <NFormItem label="种类名称" required>
          <NInput v-model:value="form.name" placeholder="如：普通会员 / VIP" />
        </NFormItem>
      </NForm>
    </NScrollbar>
    <template #footer>
      <NButton @click="close">取消</NButton>
      <NButton type="primary" @click="save">保存</NButton>
    </template>
  </NModal>
</template>
