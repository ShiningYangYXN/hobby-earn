<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { NButton, NCard, NFlex, NDataTable, NInput, NSelect, NText, NH2, useMessage, useDialog } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useUiStore } from '@/stores/useUiStore'
import { type Order, type OrderStatus } from '@/stores/types'
import { buildOrderColumns } from '@/components/columns/order-columns'
import OrderDetailModal from '@/components/modals/OrderDetailModal.vue'
import NewOrderModal from '@/components/modals/NewOrderModal.vue'

const msg = useMessage()
const dialog = useDialog()
const router = useRouter()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const ui = useUiStore()
onMounted(async () => {
  await Promise.all([orderStore.load(), discountStore.load()])
})

function goMeter(o: Order) {
  router.push({ path: '/price-meter', query: { open: o.id } })
}

const statusFilter = ref<OrderStatus | 'all'>('all')
const keyword = ref('')

const filtered = computed<Order[]>(() =>
  orderStore.orders.filter((o: Order) => {
    if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
    if (keyword.value) {
      const q = keyword.value.toLowerCase()
      return o.memberName.includes(q) || o.id.includes(q)
    }
    return true
  }),
)

function doCancel(o: Order) {
  dialog.warning({
    title: '关闭订单',
    content: '确定关闭该订单？已用优惠将自动退回。',
    positiveText: '关闭',
    negativeText: '返回',
    onPositiveClick: async () => {
      for (const r of o.discountRecords) await discountStore.rollbackUsage(r.discountId, o.memberId)
      await orderStore.cancel(o.id)
      msg.success('已关闭')
    },
  })
}
function doDelete(o: Order) {
  if (o.status === 'completed' && !ui.advancedMode) {
    msg.warning('请先在右上角开启「高级模式」后再删除已完成订单')
    return
  }
  dialog.warning({
    title: '删除订单',
    content: '不可恢复，已用优惠将自动退回，确定？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      for (const r of o.discountRecords) await discountStore.rollbackUsage(r.discountId, o.memberId)
      await orderStore.remove(o.id)
      msg.success('已删除')
    },
  })
}

const detail = ref<Order | null>(null)
const showDetail = ref(false)
function openDetail(o: Order) {
  detail.value = o
  showDetail.value = true
}

const orderColumns = computed(() =>
  buildOrderColumns({
    openDetail,
    goMeter,
    doCancel,
    doDelete,
    advancedMode: ui.advancedMode,
  }),
)

const showCreate = ref(false)
</script>

<template>
  <NFlex vertical :size="16">
    <NFlex justify="space-between" align="center">
      <NH2 prefix="bar">订单管理</NH2>
      <NButton type="primary" @click="showCreate = true"> <IconPlus /> 新建订单 </NButton>
    </NFlex>
    <NCard size="small">
      <NFlex justify="space-between" align="center">
        <NInput
          v-model:value="keyword"
          placeholder="搜索会员名或订单号…"
          clearable
          style="width: 200px"
        />
        <NFlex align="center">
          <NText type="info">共 {{ filtered.length }} 条</NText>
          <NSelect
            v-model:value="statusFilter"
            :options="[
              { label: '全部', value: 'all' },
              { label: '待处理', value: 'pending' },
              { label: '执行中', value: 'in_progress' },
              { label: '已完成', value: 'completed' },
              { label: '已取消', value: 'cancelled' },
            ]"
            style="width: 120px"
          />
        </NFlex>
      </NFlex>
    </NCard>
    <NDataTable
      :columns="orderColumns"
      :data="filtered"
      :pagination="{ pageSize: 10 }"
      size="small"
    />

    <OrderDetailModal
      :show="showDetail"
      :order="detail"
      @update:show="showDetail = $event"
      @cancel="doCancel"
      @delete="doDelete"
      @go-meter="goMeter"
    />
    <NewOrderModal :show="showCreate" @update:show="showCreate = $event" />
  </NFlex>
</template>
