<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NScrollbar,
  NFlex,
  NText,
  NTag,
  NButton,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconShare, IconTrash, IconX } from '@tabler/icons-vue'
import { fmt, itemAmount, type Order, type OrderItem, type OrderStatus } from '@/stores/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useUiStore } from '@/stores/useUiStore'

const props = defineProps<{ id: string }>()
const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const ui = useUiStore()

const order = computed<Order | null>(() => orderStore.orders.find((o) => o.id === props.id) ?? null)

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'success' | 'info' | 'warning' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '执行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'default' },
}

const columns = [
  { title: '服务', key: 'serviceName' },
  {
    title: '单价',
    key: 'unitPrice',
    render: (row: OrderItem) => fmt(row.unitPrice),
  },
  {
    title: '数量',
    key: 'qty',
    render: (row: OrderItem) =>
      row.pricingMode === 'hourly'
        ? fmt(Math.round((row.elapsed ?? 0) * (row.hourlyRate ?? 0)))
        : row.quantity + ' 件',
  },
  {
    title: '小计',
    key: 'amount',
    render: (row: OrderItem) => fmt(itemAmount(row)),
  },
]

const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '其他', value: 'ecny' },
]

function close() {
  router.push('/orders')
}

function goMeter() {
  router.push('/price-meter/' + props.id)
}

function doCancel() {
  const o = order.value
  if (!o) return
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
      close()
    },
  })
}

function doDelete() {
  const o = order.value
  if (!o) return
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
      close()
    },
  })
}
</script>

<template>
  <NModal
    :show="!!order"
    title="订单详情"
    preset="card"
    class="modal-lg"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar v-if="order" class="modal-scroll">
      <NDescriptions :column="2" bordered size="small">
        <NDescriptionsItem label="订单号">{{ order.id }}</NDescriptionsItem>
        <NDescriptionsItem label="状态">
          <NTag :type="statusCfg[order.status as OrderStatus].type" size="small">
            {{ statusCfg[order.status as OrderStatus].label }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="会员">{{ order.memberName }}</NDescriptionsItem>
        <NDescriptionsItem label="创建时间">{{
          new Date(order.createdAt).toLocaleString()
        }}</NDescriptionsItem>
        <NDescriptionsItem label="备注" :span="2">
          {{ order.notes || '无' }}
        </NDescriptionsItem>
      </NDescriptions>

      <NDataTable
        :columns="columns"
        :data="order.items"
        :pagination="false"
        size="small"
        style="margin-top: 12px"
      />

      <NFlex justify="space-between" style="margin-top: 12px">
        <NText>小计：{{ fmt(order.subtotal) }}</NText>
        <NText type="error" v-if="order.discountAmount"
          >优惠：-{{ fmt(order.discountAmount) }}</NText
        >
        <NText strong>应收：{{ fmt(order.finalAmount) }}</NText>
      </NFlex>
      <NText depth="3" v-if="order.paymentMethod" style="display: block; margin-top: 6px">
        收款方式：
        <NTag v-if="order.paymentMethod" size="small">
          {{ payOptions.find((p) => p.value === order?.paymentMethod)?.label }}
        </NTag>
      </NText>
    </NScrollbar>

    <template #footer>
      <NFlex justify="end">
        <NButton
          v-if="order && (order.status === 'pending' || order.status === 'in_progress')"
          @click="doCancel"
        >
          <IconX :size="16" /> 关闭订单
        </NButton>
        <NButton
          v-if="order && (order.status === 'pending' || order.status === 'in_progress')"
          type="primary"
          @click="goMeter"
        >
          <IconShare :size="16" /> 去计价
        </NButton>
        <NButton v-if="order && order.status === 'cancelled'" type="error" @click="doDelete">
          <IconTrash :size="16" /> 删除
        </NButton>
        <NButton
          v-if="order && order.status === 'completed' && ui.advancedMode"
          type="error"
          @click="doDelete"
        >
          <IconTrash :size="16" /> 删除
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>
