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
import { IconPlus, IconTags, IconLayersIntersect, IconTransitionTop } from '@tabler/icons-vue'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useUiStore } from '@/stores/useUiStore'
import { useServiceLimitGroupStore } from '@/stores/useServiceLimitGroupStore'
import { useServiceExclusiveGroupStore } from '@/stores/useServiceExclusiveGroupStore'
import { buildServiceColumns } from '@/components/columns/service-columns'
import { tableScrollX } from '@/stores/types'
import { type ServiceEntry } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()
const orderStore = useOrderStore()
const uiStore = useUiStore()
const limitGroupStore = useServiceLimitGroupStore()
const exclusiveGroupStore = useServiceExclusiveGroupStore()

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
// 引用该服务的订单数（>0 时普通模式下禁止删除）
function orderRefCount(p: ServiceEntry): number {
  return orderStore.orders.filter((o) => o.items.some((it) => it.priceEntryId === p.id)).length
}
// 被订单引用的服务：非作弊模式隐藏删除按钮，作弊模式允许递归删除
function canDelete(p: ServiceEntry): boolean {
  return orderRefCount(p) === 0 || uiStore.labMode
}

const columns = buildServiceColumns({ openEdit, toggle, remove, canDelete })

function remove(p: ServiceEntry) {
  const n = orderRefCount(p)
  const doRemove = async () => {
    try {
      await serviceStore.remove(p.id)
      msg.success(n ? `服务与 ${n} 笔关联订单已一并删除` : '已删除')
    } catch (e) {
      msg.error('删除失败：' + (e as Error).message)
    }
  }
  if (n) {
    dialog.warning({
      title: '递归删除服务（作弊模式）',
      content: `「${p.name}」已被 ${n} 笔订单引用。作弊模式下将连同这 ${n} 笔订单一并强制删除，并退还它们占用的优惠用量，且不可恢复。确认删除？`,
      positiveText: '递归删除',
      negativeText: '取消',
      onPositiveClick: doRemove,
    })
    return
  }
  dialog.warning({
    title: '删除服务',
    content: `确认删除「${p.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: doRemove,
  })
}

onMounted(() => {
  if (!serviceStore.services.length) serviceStore.load()
  if (!categoryStore.categories.length) categoryStore.load()
  // 订单是「是否被引用」的判定依据，必须加载后再允许删除
  if (!orderStore.orders.length) orderStore.load()
  // 分组表用于「可用限制」列把组 id 解析成名称
  if (!limitGroupStore.groups.length) limitGroupStore.load()
  if (!exclusiveGroupStore.groups.length) exclusiveGroupStore.load()
})
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">服务管理</NH2>
    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" justify="space-between" :size="12" wrap>
          <NFlex align="center" :size="12" wrap>
            <NInput
              v-model:value="keyword"
              placeholder="搜索名称 / 分类"
              clearable
              class="filter-control"
            />
            <NSelect
              v-model:value="filterCategory"
              :options="categoryOptions"
              class="filter-control"
            />
            <NSelect v-model:value="filterMode" :options="modeOptions" class="filter-control" />
            <NSelect v-model:value="filterActive" :options="activeOptions" class="filter-control" />
          </NFlex>
          <NFlex align="center" :size="12" wrap>
            <NButton @click="router.push({ name: 'categories' })">
              <NIcon :size="16">
                <IconTags />
              </NIcon>
              管理分类
            </NButton>
            <NButton @click="router.push({ name: 'service-exclusive-groups' })">
              <NIcon :size="16">
                <IconLayersIntersect />
              </NIcon>
              管理互斥组
            </NButton>
            <NButton @click="router.push({ name: 'service-limit-groups' })">
              <NIcon :size="16">
                <IconTransitionTop />
              </NIcon>
              管理限购组
            </NButton>
            <NButton type="primary" @click="openCreate">
              <NIcon :size="16">
                <IconPlus />
              </NIcon>
              新建服务
            </NButton>
          </NFlex>
        </NFlex>

        <NDataTable
          v-if="filtered.length"
          :columns="columns"
          :data="filtered"
          :pagination="{ pageSize: 10 }"
          :scroll-x="tableScrollX(columns)"
          size="small"
        />
        <NEmpty v-else description="暂无服务" />
      </NFlex>
      <RouterView />
    </NCard>
  </NFlex>
</template>
