<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NButton,
  NInput,
  NCard,
  NFlex,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NSelect,
  useMessage,
  useDialog,
  NH2,
  NText,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import {
  fmt,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
} from '@/stores/types'
import { buildOrderColumns } from '@/components/columns/order-columns'

const msg = useMessage()
const dialog = useDialog()
const router = useRouter()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
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

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'warning' | 'info' | 'success' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  confirmed: { label: '已确认', type: 'info' },
  in_progress: { label: '执行中', type: 'success' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'default' },
}

const doing = ref<Order | null>(null)
const showDone = ref(false)
const pay = ref<PaymentMethod>('cash')
const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

function openComplete(o: Order): void {
  doing.value = o
  pay.value = 'cash'
  showDone.value = true
}

async function doComplete(): Promise<void> {
  const o = doing.value
  if (!o) return
  try {
    await orderStore.complete(o.id, pay.value)
    msg.success('已完成')
    doing.value = null
    showDone.value = false
  } catch (e: unknown) {
    msg.error(String(e))
  }
}

function doCancel(o: Order) {
  dialog.warning({
    title: '取消订单',
    content: '确定取消？已用优惠将自动退回。',
    positiveText: '取消',
    negativeText: '返回',
    onPositiveClick: async () => {
      for (const r of o.discountRecords) await discountStore.rollbackUsage(r.discountId, o.memberId)
      await orderStore.cancel(o.id)
      msg.success('已取消')
    },
  })
}
function doDelete(o: Order) {
  dialog.warning({
    title: '删除订单',
    content: '不可恢复，已用优惠将自动退回，确定？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      for (const r of o.discountRecords) await discountStore.rollbackUsage(r.discountId, o.memberId)
      await orderStore.cancel(o.id)
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
function itemSubtotal(i: OrderItem): number {
  if (i.pricingMode === 'hourly' && i.elapsed)
    return Math.round(((i.hourlyRate ?? i.unitPrice) / 3600) * i.elapsed)
  return i.unitPrice * i.quantity
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
    render: (i: OrderItem) => '¥' + fmt(i.unitPrice) + (i.pricingMode === 'hourly' ? '/h' : ''),
  },
  { title: '小计', key: 'sub', width: 90, render: (i: OrderItem) => '¥' + fmt(itemSubtotal(i)) },
])

const orderColumns = computed(() =>
  buildOrderColumns({ openDetail, goMeter, openComplete, doCancel, doDelete }),
)
</script>

<template>
  <NFlex vertical :size="16">
    <NFlex justify="space-between" align="center">
      <NH2 prefix="bar">订单管理</NH2>
      <NButton to="/price-meter" route type="primary"> <IconPlus /> 新建订单 </NButton>
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
              { label: '已确认', value: 'confirmed' },
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
      :pagination="{ pageSize: 15 }"
      size="small"
    />
    <NModal v-model:show="showDone" title="完成订单" preset="card" class="modal-sm">
      <template v-if="doing">
        <NText>订单：{{ doing.id.slice(-8) }} · {{ doing.memberName }}</NText>
        <br />
        <NText
          >实收：<NText strong type="success">¥{{ fmt(doing.finalAmount) }}</NText>
        </NText>
        <NForm label-width="80" style="margin-top: 12px">
          <NFormItem label="支付方式">
            <NSelect v-model:value="pay" :options="payOptions" />
          </NFormItem>
        </NForm>
      </template>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="doing = null">取消</NButton>
          <NButton type="primary" @click="doComplete">确认收款</NButton>
        </NFlex>
      </template>
    </NModal>

    <NModal v-model:show="showDetail" title="订单详情" preset="card" class="modal-md">
      <template v-if="detail">
        <NFlex :size="6" style="margin-bottom: 8px">
          <NTag size="small">单号 {{ detail.id.slice(-8) }}</NTag>
          <NTag size="small" type="info">{{ detail.memberName }}</NTag>
          <NTag size="small" :type="statusCfg[detail.status].type">{{
            statusCfg[detail.status].label
          }}</NTag>
          <NTag v-if="detail?.paymentMethod" size="small">{{
            payOptions.find((p) => p.value === detail!.paymentMethod)?.label
          }}</NTag>
        </NFlex>
        <div style="color: var(--n-text-color-3); font-size: 12px; margin-bottom: 8px">
          创建：{{ new Date(detail.createdAt).toLocaleString() }}
        </div>
        <NDataTable
          :columns="itemColumns"
          :data="detail?.items ?? []"
          :pagination="false"
          size="small"
        />
        <NFlex vertical :size="4" style="margin-top: 12px">
          <NFlex justify="space-between"
            ><span>小计</span><span>¥{{ fmt(detail.subtotal) }}</span></NFlex
          >
          <template v-if="(detail?.discountRecords ?? []).length">
            <NFlex
              v-for="r in detail?.discountRecords ?? []"
              :key="r.discountId"
              justify="space-between"
              style="color: var(--n-warning-color)"
            >
              <span>优惠 · {{ r.description }}</span
              ><span>-¥{{ fmt(r.discountAmount) }}</span>
            </NFlex>
          </template>
          <NFlex justify="space-between" style="font-weight: 700; font-size: 16px">
            <span>实收</span
            ><span style="color: var(--n-success-color)">¥{{ fmt(detail.finalAmount) }}</span>
          </NFlex>
          <NText v-if="detail.notes" style="font-size: 13px; color: var(--n-text-color-3)"
            >备注：{{ detail.notes }}</NText
          >
        </NFlex>
      </template>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="showDetail = false">关闭</NButton>
        </NFlex>
      </template>
    </NModal>
  </NFlex>
</template>
