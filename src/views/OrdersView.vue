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
  NScrollbar,
  NSelect,
  NInputNumber,
  NTag,
  useMessage,
  useDialog,
  NH2,
  NText,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import {
  fmt,
  itemAmount,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/stores/types'
import { buildOrderColumns } from '@/components/columns/order-columns'

const msg = useMessage()
const dialog = useDialog()
const router = useRouter()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const priceStore = usePriceStore()
const memberStore = useMemberStore()
onMounted(async () => {
  await Promise.all([
    orderStore.load(),
    discountStore.load(),
    priceStore.load(),
    memberStore.load(),
  ])
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

const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

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
  { title: '小计', key: 'sub', width: 90, render: (i: OrderItem) => '¥' + fmt(itemAmount(i)) },
])

const orderColumns = computed(() =>
  buildOrderColumns({ openDetail, goMeter, doCancel, doDelete }),
)

/* ── 新建订单弹窗 ── */
const showCreate = ref(false)
const newMember = ref<string | null>(null)
const newItems = ref<{ priceId: string; quantity: number }[]>([])
const newNotes = ref('')

const memberOptions = computed(() =>
  memberStore.members.map((m) => ({ label: m.name, value: m.id })),
)
const priceOptions = computed(() =>
  priceStore.prices
    .filter((p) => p.isActive)
    .map((p) => ({
      label: `${p.name}（${p.pricingMode === 'hourly' ? '工时' : '按件'} ¥${(p.basePrice / 100).toFixed(2)}${p.pricingMode === 'hourly' ? '/h' : '/件'}）`,
      value: p.id,
    })),
)
function rowPrice(priceId: string) {
  return priceStore.prices.find((p) => p.id === priceId)
}
const canCreate = computed(
  () => !!newMember.value && newItems.value.some((r) => r.priceId),
)

function openCreate() {
  newMember.value = null
  newItems.value = []
  newNotes.value = ''
  showCreate.value = true
}
function addItem() {
  newItems.value.push({ priceId: '', quantity: 1 })
}
function removeItem(idx: number) {
  newItems.value.splice(idx, 1)
}
async function doCreate() {
  if (!newMember.value) return
  const member = memberStore.members.find((m) => m.id === newMember.value)
  if (!member) return
  const items: OrderItem[] = newItems.value
    .filter((r) => r.priceId)
    .map((r) => {
      const p = rowPrice(r.priceId)!
      return {
        priceEntryId: p.id,
        serviceName: p.name,
        pricingMode: p.pricingMode,
        quantity: p.pricingMode === 'hourly' ? 1 : r.quantity,
        unitPrice: p.basePrice,
        elapsed: p.pricingMode === 'hourly' ? 0 : undefined,
        hourlyRate: p.pricingMode === 'hourly' ? p.basePrice : undefined,
      }
    })
  if (!items.length) return
  await orderStore.create(member.id, member.name, items, { notes: newNotes.value })
  msg.success('订单已创建')
  showCreate.value = false
}
</script>

<template>
  <NFlex vertical :size="16">
    <NFlex justify="space-between" align="center">
      <NH2 prefix="bar">订单管理</NH2>
      <NButton type="primary" @click="openCreate"> <IconPlus /> 新建订单 </NButton>
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

    <NModal v-model:show="showDetail" title="订单详情" preset="card" class="modal-md">
      <NScrollbar style="max-height: 72vh">
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
          <NText depth="3" class="detail-meta"
            >创建：{{ new Date(detail.createdAt).toLocaleString() }}</NText
          >
          <NDataTable
            :columns="itemColumns"
            :data="detail?.items ?? []"
            :pagination="false"
            size="small"
          />
          <NFlex vertical :size="4" class="detail-summary">
            <NFlex justify="space-between"
              ><span>小计</span><span>¥{{ fmt(detail.subtotal) }}</span></NFlex
            >
            <template v-if="(detail?.discountRecords ?? []).length">
              <NFlex
                v-for="r in detail?.discountRecords ?? []"
                :key="r.discountId"
                justify="space-between"
              >
                <NText type="warning">优惠 · {{ r.description }}</NText>
                <NText type="warning">-¥{{ fmt(r.discountAmount) }}</NText>
              </NFlex>
            </template>
            <NFlex justify="space-between" class="detail-final">
              <span>实收</span>
              <NText type="success" strong>¥{{ fmt(detail.finalAmount) }}</NText>
            </NFlex>
            <NText v-if="detail.notes" depth="3" class="detail-note"
              >备注：{{ detail.notes }}</NText
            >
          </NFlex>
        </template>
      </NScrollbar>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="showDetail = false">关闭</NButton>
        </NFlex>
      </template>
    </NModal>

    <NModal v-model:show="showCreate" title="新建订单" preset="card" class="modal-md">
      <NForm label-placement="top">
        <NFormItem label="会员" :required="true">
          <NSelect
            v-model:value="newMember"
            :options="memberOptions"
            placeholder="选择会员"
            filterable
            clearable
          />
        </NFormItem>
        <NFlex vertical :size="8">
          <NFlex justify="space-between" align="center">
            <NText strong>服务项</NText>
            <NButton size="small" @click="addItem"><IconPlus /> 添加</NButton>
          </NFlex>
          <NCard v-for="(row, idx) in newItems" :key="idx" size="small">
            <NFlex align="center" :size="8">
              <NSelect
                v-model:value="row.priceId"
                :options="priceOptions"
                placeholder="选择服务"
                style="flex: 1; min-width: 0"
              />
              <template v-if="rowPrice(row.priceId)?.pricingMode === 'perPiece'">
                <NInputNumber v-model:value="row.quantity" :min="1" style="width: 110px" />
              </template>
              <template v-else>
                <NText depth="3" style="white-space: nowrap">计时计价</NText>
              </template>
              <NButton size="small" type="error" text @click="removeItem(idx)">移除</NButton>
            </NFlex>
          </NCard>
          <NEmpty v-if="!newItems.length" description="请添加至少一个服务项" />
        </NFlex>
        <NFormItem label="备注" style="margin-top: 8px">
          <NInput
            v-model:value="newNotes"
            type="textarea"
            :rows="2"
            placeholder="可填写备注…"
          />
        </NFormItem>
      </NForm>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="showCreate = false">取消</NButton>
          <NButton type="primary" :disabled="!canCreate" @click="doCreate">创建订单</NButton>
        </NFlex>
      </template>
    </NModal>
  </NFlex>
</template>
