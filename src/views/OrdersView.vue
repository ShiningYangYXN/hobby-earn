<script setup lang="ts">
import { h, ref, computed, onMounted } from 'vue'
import { NButton, NCard, NSpace, NDataTable, NTag, NModal, NForm, NFormItem, NSelect, useMessage, useDialog } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { fmt, type Order, type OrderItem, type OrderStatus, type PaymentMethod } from '@/stores/types'

const msg = useMessage()
const dialog = useDialog()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
onMounted(async () => { await Promise.all([orderStore.load(), discountStore.load()]) })

const statusFilter = ref<OrderStatus | 'all'>('all')
const keyword = ref('')

const filtered = computed<Order[]>(() => orderStore.orders.filter((o: Order) => {
  if (statusFilter.value !== 'all' && o.status !== statusFilter.value) return false
  if (keyword.value) { const q = keyword.value.toLowerCase(); return o.memberName.includes(q) || o.id.includes(q) }
  return true
}))

const statusCfg: Record<OrderStatus, { label: string; type: 'warning' | 'info' | 'success' | 'default' }> = {
  pending: { label: '待处理', type: 'warning' },
  confirmed: { label: '进行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'default' },
}

const doing = ref<Order | null>(null)
const showDone = ref(false)
const pay = ref<PaymentMethod>('cash')
const payOptions = [{ label: '现金', value: 'cash' }, { label: '微信', value: 'wechat' }, { label: '支付宝', value: 'alipay' }, { label: '转账', value: 'transfer' }]

function openComplete(o: Order): void { doing.value = o; pay.value = 'cash'; showDone.value = true }

async function doComplete(): Promise<void> {
  const o = doing.value
  if (!o) return
  try {
    await orderStore.complete(o.id, pay.value)
    for (const r of o.discountRecords) await discountStore.recordUsage(r.discountId, o.memberId)
    msg.success('已完成'); doing.value = null; showDone.value = false
  } catch (e: unknown) { msg.error(String(e)) }
}

function doCancel(o: Order) {
  dialog.warning({ title: '取消订单', content: '确定取消？', positiveText: '取消', negativeText: '返回', onPositiveClick: async () => { await orderStore.cancel(o.id); msg.success('已取消') } })
}
function doDelete(o: Order) {
  dialog.warning({ title: '删除订单', content: '不可恢复，确定？', positiveText: '删除', negativeText: '取消', onPositiveClick: async () => { await orderStore.remove(o.id); msg.success('已删除') } })
}

const detail = ref<Order | null>(null)
const showDetail = ref(false)
function openDetail(o: Order) { detail.value = o; showDetail.value = true }
function itemSubtotal(i: OrderItem): number {
  if (i.pricingMode === 'hourly' && i.elapsed) return Math.round((i.hourlyRate ?? i.unitPrice) / 3600 * i.elapsed)
  return i.unitPrice * i.quantity
}
const itemColumns = computed(() => [
  { title: '项目', key: 'serviceName' },
  { title: '计价', key: 'pm', width: 70, render: (i: OrderItem) => i.pricingMode === 'hourly' ? '工时' : '按件' },
  { title: '数量/时长', key: 'qty', width: 120, render: (i: OrderItem) => i.pricingMode === 'hourly'
    ? (() => { const m = Math.floor((i.elapsed || 0) / 60); const s = (i.elapsed || 0) % 60; return `${m}'${s.toString().padStart(2, '0')}` })()
    : `×${i.quantity}` },
  { title: '单价', key: 'unit', width: 90, render: (i: OrderItem) => '¥' + fmt(i.unitPrice) + (i.pricingMode === 'hourly' ? '/h' : '') },
  { title: '小计', key: 'sub', width: 90, render: (i: OrderItem) => '¥' + fmt(itemSubtotal(i)) },
])
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <NSpace justify="space-between" align="center">
      <h2 style="margin:0">订单管理</h2>
      <NButton to="/price-meter" route type="primary"><IconPlus /> 新建订单</NButton>
    </NSpace>
    <NCard size="small">
      <NSpace :size="12">
        <NInput v-model:value="keyword" placeholder="搜索会员名或订单号…" clearable style="width:200px" />
        <NSelect v-model:value="statusFilter" :options="[{ label: '全部', value: 'all' }, { label: '待处理', value: 'pending' }, { label: '进行中', value: 'confirmed' }, { label: '已完成', value: 'completed' }, { label: '已取消', value: 'cancelled' }]" style="width:120px" />
        <span>共 {{ filtered.length }} 条</span>
      </NSpace>
    </NCard>
    <NDataTable
      :columns="[
        { title: '订单号', key: 'id', width: 100, render: (row: Order) => row.id.slice(-8) },
        { title: '会员', key: 'memberName', width: 100 },
        { title: '项目', key: 'items', width: 220, render: (row: Order) => row.items.map((i: { serviceName: string; pricingMode: string; quantity: number; elapsed?: number }) => {
          if (i.pricingMode === 'hourly' && i.elapsed) {
            const m = Math.floor(i.elapsed / 60)
            const s = i.elapsed % 60
            return `${i.serviceName} ${m}'${s.toString().padStart(2,'0')}`
          }
          return `${i.serviceName}×${i.quantity}`
        }).join(', ') },
        { title: '小计', key: 'subtotal', width: 80, render: (row: Order) => '¥' + fmt(row.subtotal) },
        { title: '优惠', key: 'discountAmount', width: 80, render: (row: Order) => row.discountAmount > 0 ? '-¥' + fmt(row.discountAmount) : '—' },
        { title: '实收', key: 'finalAmount', width: 80, render: (row: Order) => h('span', { style: { color: 'var(--n-success-color)', fontWeight: 600 } }, '¥' + fmt(row.finalAmount)) },
        { title: '状态', key: 'status', width: 80, render: (row: Order) => h(NTag, { type: statusCfg[row.status].type, size: 'tiny' }, () => statusCfg[row.status].label) },
        { title: '时间', key: 'createdAt', width: 140, render: (row: Order) => new Date(row.createdAt).toLocaleString() },
        { title: '操作', key: 'actions', width: 160,         render: (row: Order) => h(NSpace, { size: 4 }, () => [
          h(NButton, { size: 'tiny', onClick: () => openDetail(row) }, () => '详情'),
          row.status === 'pending'   && h(NButton, { size: 'tiny', type: 'primary', onClick: () => orderStore.confirm(row.id) }, () => '确认'),
          row.status === 'confirmed' && h(NButton, { size: 'tiny', type: 'success', onClick: () => openComplete(row) }, () => '完成'),
          (row.status !== 'completed' && row.status !== 'cancelled') && h(NButton, { size: 'tiny', type: 'warning', onClick: () => doCancel(row) }, () => '取消'),
          row.status === 'cancelled' && h(NButton, { size: 'tiny', type: 'error', onClick: () => doDelete(row) }, () => '删除'),
        ]) },
      ]"
      :data="filtered" :pagination="{ pageSize: 15 }" size="small"
    />
    <NModal v-model:show="showDone" title="完成订单" preset="card" style="width:360px">
      <div v-if="doing">
        <p>订单：{{ doing.id.slice(-8) }} · {{ doing.memberName }}</p>
        <p>实收：<strong style="color:var(--n-success-color)">¥{{ fmt(doing.finalAmount) }}</strong></p>
        <NForm label-width="80" style="margin-top:12px">
          <NFormItem label="支付方式"><NSelect v-model:value="pay" :options="payOptions" /></NFormItem>
        </NForm>
      </div>
      <template #footer><NSpace justify="end"><NButton @click="doing = null">取消</NButton><NButton type="primary" @click="doComplete">确认收款</NButton></NSpace></template>
    </NModal>

    <NModal v-model:show="showDetail" title="订单详情" preset="card" style="width:520px">
      <div v-if="detail">
        <NSpace :size="6" style="margin-bottom:8px">
          <NTag size="small">单号 {{ detail.id.slice(-8) }}</NTag>
          <NTag size="small" type="info">{{ detail.memberName }}</NTag>
          <NTag size="small" :type="statusCfg[detail.status].type">{{ statusCfg[detail.status].label }}</NTag>
          <NTag v-if="detail?.paymentMethod" size="small">{{ payOptions.find(p => p.value === detail!.paymentMethod)?.label }}</NTag>
        </NSpace>
        <div style="color:var(--n-text-color-3);font-size:12px;margin-bottom:8px">创建：{{ new Date(detail.createdAt).toLocaleString() }}</div>
        <NDataTable :columns="itemColumns" :data="detail?.items ?? []" :pagination="false" size="small" />
        <NSpace vertical :size="4" style="margin-top:12px">
          <NSpace justify="space-between"><span>小计</span><span>¥{{ fmt(detail.subtotal) }}</span></NSpace>
          <template v-if="(detail?.discountRecords ?? []).length">
            <NSpace v-for="r in (detail?.discountRecords ?? [])" :key="r.discountId" justify="space-between" style="color:var(--n-warning-color)">
              <span>优惠 · {{ r.description }}</span><span>-¥{{ fmt(r.discountAmount) }}</span>
            </NSpace>
          </template>
          <NSpace justify="space-between" style="font-weight:700;font-size:16px">
            <span>实收</span><span style="color:var(--n-success-color)">¥{{ fmt(detail.finalAmount) }}</span>
          </NSpace>
          <div v-if="detail.notes" style="font-size:13px;color:var(--n-text-color-3)">备注：{{ detail.notes }}</div>
        </NSpace>
      </div>
      <template #footer><NSpace justify="end"><NButton @click="showDetail = false">关闭</NButton></NSpace></template>
    </NModal>
  </NSpace>
</template>
