<script setup lang="ts">
import { computed } from 'vue'
import {
  NModal,
  NScrollbar,
  NFlex,
  NText,
  NTag,
  NButton,
  NDataTable,
} from 'naive-ui'
import { fmt, itemAmount, type Order, type OrderItem, type OrderStatus } from '@/stores/types'
import { useUiStore } from '@/stores/useUiStore'

const props = defineProps<{ show: boolean; order: Order | null }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  cancel: [order: Order]
  delete: [order: Order]
  'go-meter': [order: Order]
}>()

const ui = useUiStore()

const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'warning' | 'info' | 'success' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '执行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'default' },
}

const itemColumns = computed(() => [
  { title: '项目', key: 'serviceName' },
  {
    title: '计价',
    key: 'pm',
    width: 70,
    render: (i: OrderItem) => (i.pricingMode === 'hourly' ? '工时' : '按件'),
  },
  {
    title: '数量/时长',
    key: 'qty',
    width: 120,
    render: (i: OrderItem) =>
      i.pricingMode === 'hourly'
        ? (() => {
            const m = Math.floor((i.elapsed || 0) / 60)
            const s = (i.elapsed || 0) % 60
            return `${m}'${s.toString().padStart(2, '0')}`
          })()
        : `×${i.quantity}`,
  },
  {
    title: '单价',
    key: 'unit',
    width: 90,
    render: (i: OrderItem) =>
      '¥' + fmt(i.unitPrice) + (i.pricingMode === 'hourly' ? '/h' : ''),
  },
  { title: '小计', key: 'sub', width: 90, render: (i: OrderItem) => '¥' + fmt(itemAmount(i)) },
])

const o = computed(() => props.order)
</script>

<template>
  <NModal
    :show="show"
    title="订单详情"
    preset="card"
    class="modal-md"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NScrollbar class="modal-scroll">
      <template v-if="o">
        <NFlex :size="6" style="margin-bottom: 8px">
          <NTag size="small">单号 {{ o.id.slice(-8) }}</NTag>
          <NTag size="small" type="info">{{ o.memberName }}</NTag>
          <NTag size="small" :type="statusCfg[o.status].type">{{ statusCfg[o.status].label }}</NTag>
          <NTag v-if="o.paymentMethod" size="small">{{
            payOptions.find((p) => p.value === o?.paymentMethod)?.label
          }}</NTag>
        </NFlex>
        <NText depth="3" class="detail-meta">创建：{{ new Date(o.createdAt).toLocaleString() }}</NText>
        <NDataTable :columns="itemColumns" :data="o.items ?? []" :pagination="false" size="small" />
        <NFlex vertical :size="4" class="detail-summary">
          <NFlex justify="space-between"><span>小计</span><span>¥{{ fmt(o.subtotal) }}</span></NFlex>
          <template v-if="(o.discountRecords ?? []).length">
            <NFlex v-for="r in o.discountRecords ?? []" :key="r.discountId" justify="space-between">
              <NText type="warning">优惠 · {{ r.description }}</NText>
              <NText type="warning">-¥{{ fmt(r.discountAmount) }}</NText>
            </NFlex>
          </template>
          <NFlex justify="space-between" class="detail-final">
            <span>实收</span>
            <NText type="success" strong>¥{{ fmt(o.finalAmount) }}</NText>
          </NFlex>
          <NText depth="3" class="detail-note">备注：{{ o.notes || '无' }}</NText>
        </NFlex>

        <NFlex :size="8" style="margin-top: 12px">
          <NButton
            v-if="o.status === 'pending' || o.status === 'in_progress'"
            type="primary"
            size="small"
            @click="emit('go-meter', o)"
            >去计价</NButton
          >
          <NButton
            v-if="o.status !== 'completed' && o.status !== 'cancelled'"
            type="warning"
            size="small"
            @click="emit('cancel', o)"
            >关闭订单</NButton
          >
          <NButton
            v-if="o.status === 'cancelled' || (o.status === 'completed' && ui.advancedMode)"
            type="error"
            size="small"
            @click="emit('delete', o)"
            >删除</NButton
          >
        </NFlex>
      </template>
    </NScrollbar>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="emit('update:show', false)">关闭</NButton>
      </NFlex>
    </template>
  </NModal>
</template>
