<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NList,
  NListItem,
  NInput,
  NButton,
  NFlex,
  NIcon,
  useDialog,
  useMessage,
  NEmpty,
} from 'naive-ui'
import { IconPlus, IconTrash, IconX } from '@tabler/icons-vue'
import { useCategoryStore } from '@/stores/useCategoryStore'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const categoryStore = useCategoryStore()

const newName = ref('')

onMounted(() => {
  if (!categoryStore.categories.length) categoryStore.load()
})

async function create() {
  const name = newName.value.trim()
  if (!name) {
    msg.warning('请输入分类名称')
    return
  }
  if (categoryStore.categories.some((c) => c.name === name)) {
    msg.warning('分类已存在')
    return
  }
  await categoryStore.create(name)
  newName.value = ''
}
async function remove(id: string, name: string) {
  dialog.warning({
    title: '删除分类',
    content: `确认删除分类「${name}」？引用该分类的价格项、优惠、上限组将同步移除该分类。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await categoryStore.remove(id)
      msg.success('已删除')
    },
  })
}
function close() {
  router.push('/prices')
}
</script>

<template>
  <NModal
    :show="true"
    title="服务分类管理"
    preset="card"
    class="modal-md"
    :autoFocus="false"
    @update:show="close"
  >
    <NFlex vertical :size="12">
      <NFlex :size="8">
        <NInput
          v-model:value="newName"
          placeholder="新分类名称"
          style="flex: 1"
          @keyup.enter="create"
        />
        <NButton type="primary" @click="create">
          <NIcon :size="16"><IconPlus /></NIcon> 添加
        </NButton>
      </NFlex>
      <NList v-if="categoryStore.categories.length" bordered>
        <NListItem v-for="c in categoryStore.categories" :key="c.id">
          <span>{{ c.name }}</span>
          <template #suffix>
            <NButton size="small" quaternary type="error" @click="remove(c.id, c.name)">
              <NIcon :size="16"><IconTrash /></NIcon>
            </NButton>
          </template>
        </NListItem>
      </NList>
      <NEmpty v-else description="暂无分类" />
    </NFlex>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">
          <NIcon :size="16"><IconX /></NIcon> 关闭
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>
