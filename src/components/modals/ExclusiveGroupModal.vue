<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NInput,
  NFlex,
  NButton,
  NIcon,
  NSpace,
  NText,
  useMessage,
  NPopconfirm,
} from 'naive-ui'
import { IconPlus, IconDeviceFloppy, IconX, IconTrash, IconPencil } from '@tabler/icons-vue'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useDiscountStore } from '@/stores/useDiscountStore'

const router = useRouter()
const store = useExclusiveGroupStore()
const discountStore = useDiscountStore()
const msg = useMessage()

const name = ref('')
const editingId = ref<string | null>(null)

function close() {
  router.push('/discounts')
}

async function load() {
  await store.load()
}

onMounted(load)

async function save() {
  const n = name.value.trim()
  if (!n) {
    msg.warning('请输入互斥组名称')
    return
  }
  if (editingId.value) {
    await store.update(editingId.value, { name: n })
    msg.success('已更新')
  } else {
    await store.create(n)
    msg.success('已添加')
  }
  name.value = ''
  editingId.value = null
}

function editRow(id: string, current: string) {
  editingId.value = id
  name.value = current
}

function cancelEdit() {
  editingId.value = null
  name.value = ''
}

// 删除互斥组时，级联清理优惠里的归属
async function removeRow(id: string) {
  await store.remove(id)
  await discountStore.removeExclusiveGroupRef(id)
  msg.success('已删除')
}
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    title="互斥组管理"
    style="width: 420px"
    :bordered="false"
    @update:show="close"
  >
    <NFlex vertical :size="12">
      <NFlex :size="8">
        <NInput v-model:value="name" placeholder="输入互斥组名称" @keyup.enter="save" />
        <NButton type="primary" @click="save">
          <NIcon>
            <IconPlus v-if="!editingId" />
            <IconDeviceFloppy v-else />
          </NIcon>
          {{ editingId ? '保存' : '添加' }}
        </NButton>
        <NButton v-if="editingId" @click="cancelEdit">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
      </NFlex>

      <NText v-if="!store.groups.length" depth="3">暂无互斥组，请在上方添加。</NText>
      <NSpace v-else vertical :size="6">
        <NFlex
          v-for="g in store.groups"
          :key="g.id"
          align="center"
          justify="space-between"
          class="eg-row"
        >
          <NText>{{ g.name }}</NText>
          <NFlex :size="4">
            <NButton size="tiny" @click="editRow(g.id, g.name)">
              <NIcon>
                <IconPencil />
              </NIcon>
              编辑
            </NButton>
            <NPopconfirm @positive-click="removeRow(g.id)">
              <template #trigger>
                <NButton size="tiny" type="error">
                  <NIcon>
                    <IconTrash />
                  </NIcon>
                  删除
                </NButton>
              </template>
              删除后将从所有优惠中移除该互斥组归属，确认？
            </NPopconfirm>
          </NFlex>
        </NFlex>
      </NSpace>
    </NFlex>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">关闭</NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<style scoped>
.eg-row {
  padding: 6px 10px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
}
</style>
