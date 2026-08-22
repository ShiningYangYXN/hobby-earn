<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import {
  NDataTable,
  NButton,
  NFlex,
  NText,
  NCard,
  NInput,
  NSelect,
  NH2,
  NIcon,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { usePriceStore } from '@/stores/usePriceStore'
import { buildPriceColumns } from '@/components/columns/price-columns'
import { type PriceEntry } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const priceStore = usePriceStore()

const keyword = ref('')
const filterCategory = ref('')
const filterMode = ref('')
const filterActive = ref('')

const categoryOptions = computed(() => {
  const set = new Set<string>()
  for (const p of priceStore.prices) if (p.category) set.add(p.category)
  return [{ label: '全部分类', value: '' }, ...[...set].map((c) => ({ label: c, value: c }))]
})
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

const filtered = computed<PriceEntry[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return priceStore.prices.filter((p) => {
    if (filterCategory.value && p.category !== filterCategory.value) return false
    if (filterMode.value && p.pricingMode !== filterMode.value) return false
    if (filterActive.value === 'active' && !p.isActive) return false
    if (filterActive.value === 'inactive' && p.isActive) return false
    if (kw && !`${p.name}${p.category ?? ''}`.toLowerCase().includes(kw)) return false
    return true
  })
})

function openCreate() {
  router.push({ name: 'price-new' })
}
function openEdit(p: PriceEntry) {
  router.push({ name: 'price-edit', params: { id: p.id } })
}
async function toggle(p: PriceEntry) {
  await priceStore.update(p.id, { isActive: !p.isActive })
}
const columns = buildPriceColumns({ openEdit, toggle, remove })

function remove(p: PriceEntry) {
  dialog.warning({
    title: '删除价格项',
    content: `确认删除「${p.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await priceStore.remove(p.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!priceStore.prices.length) priceStore.load()
})
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">价格管理</NH2>
    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" :size="12" wrap>
          <NInput
            v-model:value="keyword"
            placeholder="搜索名称 / 分类"
            clearable
            style="width: 200px"
          />
          <NSelect v-model:value="filterCategory" :options="categoryOptions" style="width: 150px" />
          <NSelect v-model:value="filterMode" :options="modeOptions" style="width: 160px" />
          <NSelect v-model:value="filterActive" :options="activeOptions" style="width: 130px" />
          <NButton type="primary" @click="openCreate">
            <NIcon :size="16"><IconPlus /></NIcon> 新建价格项
          </NButton>
        </NFlex>

        <NDataTable
          :columns="columns"
          :data="filtered"
          :pagination="{ pageSize: 10 }"
          size="small"
        />
        <NText v-if="!filtered.length" depth="3">没有符合条件的价格项。</NText>
      </NFlex>
      <RouterView />
    </NCard>
  </NFlex>
</template>
