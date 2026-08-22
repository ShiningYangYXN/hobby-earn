<script setup lang="ts">
import { ref, computed, reactive, onMounted, onUnmounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { useMessage } from 'naive-ui'
import {
  NCard,
  NEmpty,
  NModal,
  NButton,
  NFlex,
  NText,
  NH2,
  NRadioGroup,
  NRadioButton,
  NDataTable,
  NTag,
  NFormItem,
  NScrollbar,
} from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { buildMeterColumns } from '@/components/columns/meter-columns'
import { fmt, subtotalOf, type Order, type OrderItem, type OrderStatus, type PaymentMethod } from '@/stores/types'

const msg = useMessage()
const route = useRoute()
const orderStore = useOrderStore()

const payOpts: { label: string; value: PaymentMethod }[] = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

const statusLabel = (s: OrderStatus) =>
  ({ pending: '待处理', confirmed: '已确认', in_progress: '执行中', completed: '已完成', cancelled: '已取消' })[s]
const statusType = (s: OrderStatus) =>
  ({ pending: 'warning', confirmed: 'info', in_progress: 'success', completed: 'success', cancelled: 'default' })[s] as
    | 'warning'
    | 'info'
    | 'success'
    | 'default'

onMounted(async () => {
  await orderStore.load()
  const open = route.query.open
  if (typeof open === 'string') {
    const o = orderStore.orders.find((x) => x.id === open)
    if (o) openOrder(o)
  }
})

// 仅显示可计价的订单（待处理 / 已确认 / 执行中）
const priceable = computed(() =>
  orderStore.orders.filter((o) => ['pending', 'confirmed', 'in_progress'].includes(o.status)),
)

const orderColumns = computed(() => buildMeterColumns({ openOrder }))

function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}

const showPricing = ref(false)
const pricing = ref<{ order: Order; items: OrderItem[] } | null>(null)
const running = reactive<Record<number, boolean>>({})
const payMethod = ref<PaymentMethod>('cash')

let timer: number | null = null
function ensureTimer() {
  if (timer) return
  timer = window.setInterval(() => {
    if (!pricing.value) return
    pricing.value.items.forEach((it, idx) => {
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

async function openOrder(o: Order) {
  if (o.status === 'pending') await orderStore.beginExecute(o.id)
  const fresh = orderStore.orders.find((x) => x.id === o.id)
  if (!fresh) return
  pricing.value = { order: fresh, items: fresh.items.map((it) => ({ ...it })) }
  Object.keys(running).forEach((k) => delete running[Number(k)])
  payMethod.value = 'cash'
  showPricing.value = true
}
function toggle(idx: number) {
  running[idx] = !(running[idx] ?? false)
  if (running[idx]) ensureTimer()
  else if (!Object.values(running).some(Boolean)) stopTimer()
}
function resetItem(idx: number) {
  if (pricing.value) pricing.value.items[idx]!.elapsed = 0
}
function incQty(idx: number) {
  if (pricing.value) pricing.value.items[idx]!.quantity += 1
}
function decQty(idx: number) {
  if (pricing.value && pricing.value.items[idx]!.quantity > 1) pricing.value.items[idx]!.quantity -= 1
}

const liveSubtotal = computed(() => (pricing.value ? subtotalOf(pricing.value.items) : 0))

async function saveProgress() {
  if (!pricing.value) return
  stopTimer()
  await orderStore.saveExecution(
    pricing.value.order.id,
    pricing.value.items.map((it) => ({ ...it })),
  )
  msg.success('进度已保存')
}
async function finish(m: PaymentMethod) {
  if (!pricing.value) return
  stopTimer()
  await orderStore.finalize(
    pricing.value.order.id,
    pricing.value.items.map((it) => ({ ...it })),
    pricing.value.order.discountRecords,
    m,
  )
  msg.success('已完成并收款')
  closePricing()
}
function closePricing() {
  stopTimer()
  showPricing.value = false
  pricing.value = null
}

watch(showPricing, (v) => {
  if (!v) stopTimer()
})
onUnmounted(stopTimer)
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">计价器</NH2>
    <NCard>
      <NFlex vertical :size="8">
        <NText depth="3">打开已有订单进行计价（仅显示待处理 / 执行中订单）</NText>
        <NDataTable
          v-if="priceable.length"
          :columns="orderColumns"
          :data="priceable"
          :pagination="false"
          size="small"
        />
        <NEmpty v-else description="暂无可计价的订单，请先在「订单管理」新建" />
      </NFlex>
    </NCard>

    <NModal
      v-model:show="showPricing"
      title="计价"
      preset="card"
      class="modal-xl"
      :bordered="false"
      :mask-closable="false"
    >
      <NScrollbar style="max-height: 72vh">
        <template v-if="pricing">
          <NFlex vertical :size="10">
            <NFlex align="center" :size="8">
              <NTag type="info" size="small">{{ pricing.order.memberName }}</NTag>
              <NTag size="small">单号 {{ pricing.order.id.slice(-8) }}</NTag>
              <NTag size="small" :type="statusType(pricing.order.status)">{{
                statusLabel(pricing.order.status)
              }}</NTag>
            </NFlex>

            <NEmpty v-if="!pricing.items.length" description="该订单无计价项目" />
            <NCard v-for="(it, idx) in pricing.items" :key="idx" size="small">
              <NFlex vertical :size="6">
                <NText strong>{{ it.serviceName }}</NText>
                <NFlex align="center" justify="space-between">
                  <NText depth="3">{{ it.pricingMode === 'hourly' ? '已计时长' : '数量' }}</NText>
                  <NFlex align="center" :size="10">
                    <span class="meter-num">{{
                      it.pricingMode === 'hourly' ? fmtElapsed(it.elapsed ?? 0) : it.quantity
                    }}</span>
                    <template v-if="it.pricingMode === 'hourly'">
                      <NButton size="small" :type="running[idx] ? 'warning' : 'primary'" @click="toggle(idx)">
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
                <NText depth="3">当前金额</NText>
                <span class="meter-num">¥{{ fmt(liveSubtotal) }}</span>
              </NFlex>
            </NCard>

            <NFormItem label="支付方式">
              <NRadioGroup v-model:value="payMethod">
                <NRadioButton v-for="p in payOpts" :key="p.value" :value="p.value">{{ p.label }}</NRadioButton>
              </NRadioGroup>
            </NFormItem>
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
  </NFlex>
</template>
