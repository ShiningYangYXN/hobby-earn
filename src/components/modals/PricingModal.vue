<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted } from 'vue'
import {
  NModal,
  NCard,
  NEmpty,
  NFlex,
  NText,
  NButton,
  NRadioGroup,
  NRadioButton,
  NTag,
  NFormItem,
  NScrollbar,
  NSelect,
  useMessage,
} from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePriceStore } from '@/stores/usePriceStore'
import {
  fmt,
  subtotalOf,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
} from '@/stores/types'

const props = defineProps<{ show: boolean; orderId: string | null }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
  completed: []
}>()

const msg = useMessage()
const orderStore = useOrderStore()
const priceStore = usePriceStore()

const payOpts: { label: string; value: PaymentMethod }[] = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

const statusLabel = (s: OrderStatus) =>
  ({ pending: '待处理', in_progress: '执行中', completed: '已完成', cancelled: '已取消' })[s]
const statusType = (s: OrderStatus) =>
  ({ pending: 'warning', in_progress: 'info', completed: 'success', cancelled: 'default' })[s] as
    | 'warning'
    | 'info'
    | 'success'
    | 'default'

const order = ref<Order | null>(null)
const items = ref<OrderItem[]>([])
const running = reactive<Record<number, boolean>>({})
const payMethod = ref<PaymentMethod>('cash')
const newServiceId = ref<string | null>(null)

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

let timer: number | null = null
function ensureTimer() {
  if (timer) return
  timer = window.setInterval(() => {
    items.value.forEach((it, idx) => {
      if (it.pricingMode === 'hourly' && running[idx]) it.elapsed = (it.elapsed ?? 0) + 1
    })
  }, 1000)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function load() {
  if (!props.show || !props.orderId) return
  if (!priceStore.prices.length) await priceStore.load()
  let o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  if (o.status === 'pending') await orderStore.beginExecute(o.id)
  o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  order.value = o
  items.value = o.items.map((it) => ({ ...it }))
  Object.keys(running).forEach((k) => delete running[Number(k)])
  payMethod.value = 'cash'
  newServiceId.value = null
}

watch(
  () => [props.show, props.orderId],
  () => load(),
  { immediate: true },
)
watch(
  () => props.show,
  (v) => {
    if (!v) stopTimer()
  },
)
onUnmounted(stopTimer)

function toggle(idx: number) {
  running[idx] = !(running[idx] ?? false)
  if (running[idx]) ensureTimer()
  else if (!Object.values(running).some(Boolean)) stopTimer()
}
function resetItem(idx: number) {
  if (items.value[idx]) items.value[idx]!.elapsed = 0
}
function incQty(idx: number) {
  if (items.value[idx]) items.value[idx]!.quantity += 1
}
function decQty(idx: number) {
  if (items.value[idx] && items.value[idx]!.quantity > 1) items.value[idx]!.quantity -= 1
}

const priceOptions = computed(() =>
  priceStore.prices
    .filter((p) => p.isActive)
    .map((p) => ({
      label: `${p.name}（${p.pricingMode === 'hourly' ? '工时' : '按件'} ¥${(
        p.basePrice / 100
      ).toFixed(2)}${p.pricingMode === 'hourly' ? '/h' : '/件'}）`,
      value: p.id,
    })),
)
function addService() {
  if (!newServiceId.value) return
  const p = priceStore.prices.find((x) => x.id === newServiceId.value)
  if (!p) return
  items.value.push({
    priceEntryId: p.id,
    serviceName: p.name,
    pricingMode: p.pricingMode,
    quantity: p.pricingMode === 'hourly' ? 1 : 1,
    unitPrice: p.basePrice,
    elapsed: p.pricingMode === 'hourly' ? 0 : undefined,
    hourlyRate: p.pricingMode === 'hourly' ? p.basePrice : undefined,
  })
  newServiceId.value = null
}

const liveSubtotal = computed(() => subtotalOf(items.value))

async function saveProgress() {
  if (!order.value) return
  stopTimer()
  await orderStore.saveExecution(
    order.value.id,
    items.value.map((it) => ({ ...it })),
  )
  msg.success('进度已保存')
  emit('saved')
}
async function finish(m: PaymentMethod) {
  if (!order.value) return
  stopTimer()
  await orderStore.finalize(
    order.value.id,
    items.value.map((it) => ({ ...it })),
    order.value.discountRecords,
    m,
  )
  msg.success('已完成并收款')
  emit('completed')
  emit('update:show', false)
}
function closePricing() {
  stopTimer()
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="show"
    title="计价"
    preset="card"
    class="modal-xl"
    :mask-closable="false"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NScrollbar class="modal-scroll">
      <template v-if="order">
        <NFlex vertical :size="10">
          <NFlex align="center" :size="8">
            <NTag type="info" size="small">{{ order.memberName }}</NTag>
            <NTag size="small">单号 {{ order.id.slice(-8) }}</NTag>
            <NTag size="small" :type="statusType(order.status)">{{ statusLabel(order.status) }}</NTag>
          </NFlex>

          <NEmpty v-if="!items.length" description="该订单无计价项目" />
          <NCard v-for="(it, idx) in items" :key="idx" size="small">
            <NFlex vertical :size="6">
              <NText strong>{{ it.serviceName }}</NText>
              <NFlex align="center" justify="space-between">
                <NText depth="3">{{ it.pricingMode === 'hourly' ? '已计时长' : '数量' }}</NText>
                <NFlex align="center" :size="10">
                  <span class="meter-num">{{
                    it.pricingMode === 'hourly' ? fmtElapsed(it.elapsed ?? 0) : it.quantity
                  }}</span>
                  <template v-if="it.pricingMode === 'hourly'">
                    <NButton
                      size="small"
                      :type="running[idx] ? 'warning' : 'primary'"
                      @click="toggle(idx)"
                    >
                      {{ running[idx] ? '暂停' : '计时' }}
                    </NButton>
                    <NButton size="small" @click="resetItem(idx)">重置</NButton>
                  </template>
                  <template v-else>
                    <NButton size="small" @click="decQty(idx)">−</NButton>
                    <NButton size="small" @click="incQty(idx)">+</NButton>
                  </template>
                </NFlex>
              </NFlex>
            </NFlex>
          </NCard>

          <NCard size="small">
            <NFlex justify="space-between" align="center">
              <NText depth="3">补充服务项目</NText>
              <NFlex align="center" :size="8" style="flex: 1; min-width: 0">
                <NSelect
                  v-model:value="newServiceId"
                  :options="priceOptions"
                  placeholder="选择要追加的服务"
                  clearable
                  filterable
                  style="flex: 1; min-width: 0"
                />
                <NButton size="small" type="primary" :disabled="!newServiceId" @click="addService"
                  >添加</NButton
                >
              </NFlex>
            </NFlex>
          </NCard>

          <NCard size="small">
            <NFlex justify="space-between" align="center">
              <NText depth="3">当前金额</NText>
              <span class="meter-num">¥{{ fmt(liveSubtotal) }}</span>
            </NFlex>
          </NCard>

          <NFormItem label="支付方式">
            <NRadioGroup v-model:value="payMethod">
              <NRadioButton v-for="p in payOpts" :key="p.value" :value="p.value">{{ p.label }}</NRadioButton>
            </NRadioGroup>
          </NFormItem>

          <NText v-if="order.notes" depth="3" class="detail-note">备注：{{ order.notes }}</NText>
        </NFlex>
      </template>
    </NScrollbar>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="closePricing">取消</NButton>
        <NButton @click="saveProgress">保存进度</NButton>
        <NButton type="primary" @click="finish(payMethod)">完成并收款</NButton>
      </NFlex>
    </template>
  </NModal>
</template>
