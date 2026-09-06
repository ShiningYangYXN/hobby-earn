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
import { IconPlus, IconLayersIntersect, IconTransitionTop } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useUiStore } from '@/stores/useUiStore'
import { buildDiscountColumns } from '@/components/columns/discount-columns'
import { tableScrollX } from '@/stores/types'
import { type Discount, ruleTypeLabel, isCouponRequired } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const discountStore = useDiscountStore()
const orderStore = useOrderStore()
const uiStore = useUiStore()

function openExclusiveGroups() {
  router.push('/discounts/exclusive-groups')
}
function openLimitGroups() {
  router.push('/discounts/limit-groups')
}

const keyword = ref('')
const filterRule = ref('')
const filterStatus = ref('')

const ruleOptions = [
  { label: '全部执行方式', value: '' },
  ...Object.entries(ruleTypeLabel).map(([value, label]) => ({ label, value })),
  { label: '券码兑换', value: 'coupon' },
]
const statusOptions = [
  { label: '全部状态', value: '' },
  { label: '可用', value: 'active' },
  { label: '未开始', value: 'upcoming' },
  { label: '已过期', value: 'expired' },
  { label: '已停用', value: 'disabled' },
  { label: '已兑完', value: 'exhausted' },
]

const filtered = computed<Discount[]>(() => {
  const kw = keyword.value.trim().toLowerCase()
  return discountStore.discounts.filter((d) => {
    if (filterRule.value === 'coupon' && !isCouponRequired(d)) return false
    if (filterRule.value && filterRule.value !== 'coupon' && d.ruleType !== filterRule.value)
      return false
    if (filterStatus.value && discountStore.discountStatus(d) !== filterStatus.value) return false
    if (kw && !`${d.name}${d.couponCode ?? ''}`.toLowerCase().includes(kw)) return false
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

// 引用（捕获）该优惠的订单数（>0 时普通模式下禁止删除）
function orderRefCount(d: Discount): number {
  return orderStore.orders.filter((o) => o.discountRecords.some((r) => r.discountId === d.id))
    .length
}
// 被订单引用的优惠：非作弊模式隐藏删除按钮，作弊模式允许递归删除
function canDelete(d: Discount): boolean {
  return orderRefCount(d) === 0 || uiStore.labMode
}

const columns = buildDiscountColumns({ copyCode, openEdit, toggle, remove, canDelete })

function remove(d: Discount) {
  const n = orderRefCount(d)
  const doRemove = async () => {
    try {
      await discountStore.remove(d.id)
      msg.success(n ? `优惠与 ${n} 笔关联订单已一并删除` : '已删除')
    } catch (e) {
      msg.error('删除失败：' + (e as Error).message)
    }
  }
  if (n) {
    dialog.warning({
      title: '递归删除优惠（作弊模式）',
      content: `「${d.name}」已被 ${n} 笔订单引用。作弊模式下将连同这 ${n} 笔订单一并强制删除，且不可恢复。确认删除？`,
      positiveText: '递归删除',
      negativeText: '取消',
      onPositiveClick: doRemove,
    })
    return
  }
  dialog.warning({
    title: '删除优惠',
    content: `确认删除「${d.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: doRemove,
  })
}

onMounted(() => {
  if (!discountStore.discounts.length) discountStore.load()
  // 订单是「是否被引用」的判定依据，必须加载后再允许删除
  if (!orderStore.orders.length) orderStore.load()
})
</script>

<template>
  <NFlex vertical>
    <NH2 prefix="bar">优惠管理</NH2>
    <NCard>
      <NFlex vertical>
        <NFlex align="center" justify="space-between" wrap>
          <NFlex align="center" wrap>
            <NInput
              v-model:value="keyword"
              placeholder="搜索名称 / 券码"
              clearable
              style="width: 200px"
            />
            <NSelect v-model:value="filterRule" :options="ruleOptions" style="width: 150px" />
            <NSelect v-model:value="filterStatus" :options="statusOptions" style="width: 130px" />
          </NFlex>
          <NFlex align="center" wrap>
            <NButton @click="openExclusiveGroups">
              <NIcon>
                <IconLayersIntersect />
              </NIcon>
              互斥组管理
            </NButton>
            <NButton @click="openLimitGroups">
              <NIcon>
                <IconTransitionTop />
              </NIcon>
              上限组管理
            </NButton>
            <NButton type="primary" @click="openCreate">
              <NIcon>
                <IconPlus />
              </NIcon>
              新建优惠
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
        <NEmpty v-else description="暂无优惠" />
      </NFlex>
    </NCard>
    <RouterView />
  </NFlex>
</template>
