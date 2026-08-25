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
  NSelect,
  NInput,
  NDatePicker,
  NH2,
  NIcon,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useUiStore } from '@/stores/useUiStore'
import { buildOrderColumns } from '@/components/columns/order-columns'
import { tableScrollX } from '@/stores/types'
import { type Order, type OrderStatus } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const orderStore = useOrderStore()
const memberStore = useMemberStore()
const ui = useUiStore()

const statusOptions = [
  { label: '全部状态', value: 'all' },
  { label: '待处理', value: 'pending' },
  { label: '执行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已关闭', value: 'closed' },
]
const discountOptions = [
  { label: '全部订单', value: '' },
  { label: '有优惠', value: 'has' },
  { label: '无优惠', value: 'none' },
]
const statusFilter = ref<OrderStatus | 'all'>('all')
const memberFilter = ref('')
const discountFilter = ref('')
const dateRange = ref<[number, number] | null>(null)
const keyword = ref('')

const memberOptions = computed(() => [
  { label: '全部会员', value: '' },
  ...memberStore.members
    .filter((m) => m.isActive !== false)
    .map((m) => ({ label: m.name, value: m.id })),
])

const list = computed(() =>
  orderStore.orders.filter((o) => {
    if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
    if (memberFilter.value && o.memberId !== memberFilter.value) return false
    if (discountFilter.value === 'has' && o.discountRecords.length === 0) return false
    if (discountFilter.value === 'none' && o.discountRecords.length > 0) return false
    if (dateRange.value) {
      const [start, end] = dateRange.value
      const t = new Date(o.createdAt).getTime()
      if (t < start || t > end + 86400000 - 1) return false
    }
    if (keyword.value.trim()) {
      const k = keyword.value.trim().toLowerCase()
      if (!(o.memberName.toLowerCase().includes(k) || o.id.toLowerCase().includes(k))) return false
    }
    return true
  }),
)

function openCreate() {
  router.push({ name: 'order-new' })
}
function openDetail(o: Order) {
  router.push({ name: 'order-detail', params: { id: o.id } })
}
function goMeter(o: Order) {
  router.push('/price-meter/' + o.id)
}
function doCancel(o: Order) {
  dialog.warning({
    title: '关闭订单',
    content: '关闭后订单将变为「已关闭」，并退还已用优惠用量；确认关闭？',
    positiveText: '关闭',
    negativeText: '取消',
    onPositiveClick: async () => {
      await orderStore.cancel(o.id, { rollbackDiscounts: true })
      msg.success('订单已关闭')
    },
  })
}
function doReopen(o: Order) {
  dialog.info({
    title: '重新使用优惠',
    content:
      '将恢复订单为「待处理」状态，并重新占用该订单关联的优惠（重新使用优惠）。若优惠已过期或已达上限将无法重新打开。确认继续？',
    positiveText: '重新打开',
    negativeText: '取消',
    onPositiveClick: async () => {
      const res = await orderStore.reopen(o.id)
      if (res.ok) {
        msg.success('订单已重新打开，优惠已重新使用')
      } else {
        msg.error(res.reason ?? '无法重新打开')
      }
    },
  })
}
function remove(o: Order) {
  if (o.status === 'completed' && !ui.advancedMode) {
    msg.warning('已完成订单需开启「高级模式」（关于页）后才能删除')
    return
  }
  dialog.warning({
    title: '删除订单',
    content: '删除后不可恢复，确认删除？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await orderStore.remove(o.id)
      msg.success('订单已删除')
    },
  })
}

const columns = buildOrderColumns({
  openDetail,
  goMeter,
  doCancel,
  doReopen,
  doDelete: remove,
  advancedMode: ui.advancedMode,
})

onMounted(() => {
  if (!orderStore.orders.length) orderStore.load()
})
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">订单管理</NH2>
    <NCard>
      <NFlex vertical :size="12">
        <NFlex align="center" :size="12" wrap>
          <NSelect v-model:value="statusFilter" :options="statusOptions" style="width: 160px" />
          <NSelect v-model:value="memberFilter" :options="memberOptions" style="width: 160px" />
          <NSelect v-model:value="discountFilter" :options="discountOptions" style="width: 140px" />
          <NDatePicker v-model:value="dateRange" type="daterange" clearable placeholder="下单日期" style="width: 240px" />
          <NInput v-model:value="keyword" placeholder="搜索会员 / 订单号" clearable style="width: 200px" />
          <NButton type="primary" @click="openCreate">
            <NIcon :size="16">
              <IconPlus />
            </NIcon> 新建订单
          </NButton>
        </NFlex>
        <NDataTable :columns="columns" :data="list" :pagination="{ pageSize: 10 }" :scroll-x="tableScrollX(columns)" size="small" />
        <NText v-if="!list.length" depth="3">暂无订单。</NText>
      </NFlex>
      <RouterView />
    </NCard>
  </NFlex>
</template>
