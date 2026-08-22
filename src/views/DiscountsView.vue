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
import { IconPlus, IconLayersIntersect } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { buildDiscountColumns } from '@/components/columns/discount-columns'
import { type Discount } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const discountStore = useDiscountStore()

function openGroups() {
  router.push('/discounts/exclusive-groups')
}

const keyword = ref('')
const filterType = ref('')
const filterStatus = ref('')

const typeOptions = [
  { label: '全部类型', value: '' },
  { label: '限时', value: 'timeLimited' },
  { label: '会员', value: 'member' },
  { label: '首单', value: 'firstOrder' },
  { label: '累次', value: 'repeatOrder' },
  { label: '品类', value: 'category' },
  { label: '券码', value: 'coupon' },
]
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '可用', value: 'active' },
  { label: '已过期', value: 'expired' },
  { label: '已停用', value: 'disabled' },
  { label: '已兑完', value: 'exhausted' },
]

const filtered = computed<Discount[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return discountStore.discounts.filter((d) => {
    if (filterType.value && d.discountType !== filterType.value) return false
    if (filterStatus.value && discountStore.discountStatus(d) !== filterStatus.value) return false
    if (kw && !`${d.name}${d.code ?? ''}`.toLowerCase().includes(kw)) return false
    return true
  })
})

function openCreate() {
  router.push({ name: 'discount-new' })
}
function openEdit(d: Discount) {
  router.push({ name: 'discount-edit', params: { id: d.id } })
}
function copyCode(code?: string) {
  if (!code) {
    msg.warning('该优惠没有券码')
    return
  }
  navigator.clipboard
    .writeText(code)
    .then(() => msg.success('券码已复制'))
    .catch(() => msg.error('复制失败'))
}
function toggle(d: Discount) {
  discountStore.update(d.id, { isActive: !d.isActive })
}

const columns = buildDiscountColumns({ copyCode, openEdit, toggle, remove })

function remove(d: Discount) {
  dialog.warning({
    title: '删除优惠',
    content: `确认删除「${d.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await discountStore.remove(d.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!discountStore.discounts.length) discountStore.load()
})
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">优惠管理</NH2>
    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" :size="12" wrap>
          <NInput
            v-model:value="keyword"
            placeholder="搜索名称 / 券码"
            clearable
            style="width: 200px"
          />
          <NSelect v-model:value="filterType" :options="typeOptions" style="width: 140px" />
          <NSelect v-model:value="filterStatus" :options="statusOptions" style="width: 130px" />
          <NButton type="primary" @click="openCreate">
            <NIcon :size="16">
              <IconPlus />
            </NIcon>
            新建优惠
          </NButton>
          <NButton @click="openGroups">
            <NIcon :size="16">
              <IconLayersIntersect />
            </NIcon>
            互斥组管理
          </NButton>
        </NFlex>

        <NDataTable
          :columns="columns"
          :data="filtered"
          :pagination="{ pageSize: 10 }"
          size="small"
        />
        <NText v-if="!filtered.length" depth="3">没有符合条件的优惠。</NText>
      </NFlex>
    </NCard>
    <RouterView />
  </NFlex>
</template>
