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
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useUiStore } from '@/stores/useUiStore'
import { buildOrderColumns } from '@/components/columns/order-columns'
import { type Order, type OrderStatus } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const ui = useUiStore()

const statusOptions = [
  { label: '待处理', value: 'pending' },
  { label: '执行中', value: 'in_progress' },
  { label: '已完成', value: 'completed' },
  { label: '已取消', value: 'cancelled' },
]
const statusFilter = ref<OrderStatus | 'all'>('all')
const keyword = ref('')

const list = computed(() =>
  orderStore.orders.filter((o) => {
    if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
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
    content: '关闭后订单将变为「已取消」，可退还已用优惠；确认关闭？',
    positiveText: '关闭',
    negativeText: '取消',
    onPositiveClick: async () => {
      for (const rec of o.discountRecords) {
        await discountStore.rollbackUsage(rec.discountId, o.memberId)
      }
      await orderStore.cancel(o.id)
      msg.success('订单已关闭')
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
      for (const rec of o.discountRecords) {
        await discountStore.rollbackUsage(rec.discountId, o.memberId)
      }
      await orderStore.remove(o.id)
      msg.success('订单已删除')
    },
  })
}

const columns = buildOrderColumns({
  openDetail,
  goMeter,
  doCancel,
  doDelete: remove,
  advancedMode: ui.advancedMode,
})

onMounted(() => {
  if (!orderStore.orders.length) orderStore.load()
})
</script>

<template>
  <NCard title="订单管理">
    <NFlex vertical :size="12">
      <NFlex align="center" :size="12">
        <NSelect v-model:value="statusFilter" :options="statusOptions" style="width: 160px" />
        <NInput
          v-model:value="keyword"
          placeholder="搜索会员 / 订单号"
          clearable
          style="width: 220px"
        />
        <NButton type="primary" @click="openCreate"> <IconPlus :size="16" /> 新建订单 </NButton>
      </NFlex>
      <NDataTable :columns="columns" :data="list" :pagination="{ pageSize: 10 }" size="small" />
      <NText v-if="!list.length" depth="3">暂无订单。</NText>
    </NFlex>
    <RouterView />
  </NCard>
</template>
