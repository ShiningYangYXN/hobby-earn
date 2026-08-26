<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import {
  NDataTable,
  NButton,
  NFlex,
  NEmpty,
  NCard,
  NInput,
  NSelect,
  NH2,
  NIcon,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconPlus, IconTags } from '@tabler/icons-vue'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { buildServiceColumns } from '@/components/columns/service-columns'
import { tableScrollX } from '@/stores/types'
import { type ServiceEntry } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()

const keyword = ref('')
const filterCategory = ref('')
const filterMode = ref('')
const filterActive = ref('')

const categoryOptions = computed(() => [
  { label: '全部分类', value: '' },
  ...categoryStore.categories.map((c) => ({ label: c.name, value: c.id })),
])
const modeOptions = [
  { label: '全部计价方式', value: '' },
  { label: '工时', value: 'hourly' },
  { label: '按件', value: 'perPiece' },
]
const activeOptions = [
  { label: '全部状态', value: '' },
  { label: '启用', value: 'active' },
  { label: '停用', value: 'inactive' },
]

const filtered = computed<ServiceEntry[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return serviceStore.services.filter((p) => {
    if (filterCategory.value && !(p.categoryIds ?? []).includes(filterCategory.value)) return false
    if (filterMode.value && p.pricingMode !== filterMode.value) return false
    if (filterActive.value === 'active' && !p.isActive) return false
    if (filterActive.value === 'inactive' && p.isActive) return false
    if (kw && !`${p.name}${(p.categoryIds ?? []).join('')}`.toLowerCase().includes(kw)) return false
    return true
  })
})

function openCreate() {
  router.push({ name: 'service-new' })
}
function openEdit(p: ServiceEntry) {
  router.push({ name: 'service-edit', params: { id: p.id } })
}
async function toggle(p: ServiceEntry) {
  await serviceStore.update(p.id, { isActive: !p.isActive })
}
const columns = buildServiceColumns({ openEdit, toggle, remove })

function remove(p: ServiceEntry) {
  dialog.warning({
    title: '删除服务',
    content: `确认删除「${p.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await serviceStore.remove(p.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!serviceStore.services.length) serviceStore.load()
  if (!categoryStore.categories.length) categoryStore.load()
})
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">服务管理</NH2>
    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" justify="space-between" :size="12" wrap>
          <NFlex align="center" :size="12" wrap>
            <NInput v-model:value="keyword" placeholder="搜索名称 / 分类" clearable style="width: 200px" />
            <NSelect v-model:value="filterCategory" :options="categoryOptions" style="width: 150px" />
            <NSelect v-model:value="filterMode" :options="modeOptions" style="width: 160px" />
            <NSelect v-model:value="filterActive" :options="activeOptions" style="width: 130px" />
          </NFlex>
          <NFlex align="center" :size="12" wrap>
            <NButton @click="router.push({ name: 'categories' })">
              <NIcon :size="16">
                <IconTags />
              </NIcon>
              管理分类
            </NButton>
            <NButton type="primary" @click="openCreate">
              <NIcon :size="16">
                <IconPlus />
              </NIcon>
              新建服务
            </NButton>
          </NFlex>
        </NFlex>

        <NDataTable v-if="filtered.length" :columns="columns" :data="filtered" :pagination="{ pageSize: 10 }"
          :scroll-x="tableScrollX(columns)" size="small" />
        <NEmpty v-else description="暂无服务" />
      </NFlex>
      <RouterView />
    </NCard>
  </NFlex>
</template>
