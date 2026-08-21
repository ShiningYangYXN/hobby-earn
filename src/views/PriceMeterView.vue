<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import {
  NButton, NCard, NSpace, NDivider, NSelect, NInput, NInputNumber, NInputOtp, NCheckbox,
  NModal, NTag, NIcon, NRadioGroup, NRadio, useMessage,
} from 'naive-ui'
import {
  IconPlus, IconMinus, IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconTrash,
} from '@tabler/icons-vue'
import { usePriceStore } from '@/stores/usePriceStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { fmt, type PriceEntry, type Member, type Order, type OrderItem, type DiscountRecord, type Discount, type DiscountType, type PaymentMethod } from '@/stores/types'

const msg = useMessage()
const route = useRoute()
const priceStore = usePriceStore()
const orderStore = useOrderStore()
const memberStore = useMemberStore()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()

const PAYMENTS: Array<{ label: string; value: PaymentMethod }> = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

onMounted(async () => {
  await Promise.all([priceStore.load(), memberStore.load(), discountStore.load(), orderStore.load(), memberTypeStore.load()])
  const openId = route.query.open
  if (typeof openId === 'string') {
    const o = orderStore.orders.find(x => x.id === openId)
    if (o && (o.status === 'confirmed' || o.status === 'in_progress')) await openOrder(o)
  }
})
onBeforeUnmount(stopAllTimers)

// ── 会员选择（可搜索 + 点选，清空即散客）──
const selectedMember = ref<Member | null>(null)
const selectedMemberId = computed<string | null>({
  get: () => selectedMember.value?.id ?? null,
  set: (id) => { selectedMember.value = id ? memberStore.members.find(m => m.id === id) ?? null : null },
})
const memberOptions = computed(() =>
  memberStore.members.map(m => ({
    label: m.phone ? `${m.name}（${m.phone}）` : m.name,
    value: m.id,
  })),
)

// ── 购物车（预订）──
const cart = ref<OrderItem[]>([])
const orderNotes = ref('')

// ── 执行中订单（实际计时）──
const activeOrder = ref<Order | null>(null)
const execItems = ref<OrderItem[]>([])
const isExecuting = computed(() => activeOrder.value !== null)

// ── 优惠：非券码（满足条件自动适用，可手动排除）+ 券码（OTP 兑换，输满即兑）──
const showDisc = ref(false)
const showBook = ref(false)
const showPicker = ref(false)
const codeValue = ref<string[]>([])
const excludedNonCoupon = ref<string[]>([])
const couponIds = ref<string[]>([])
const payMethod = ref<PaymentMethod>('cash')

function completedCountOf(memberId: string): number {
  return orderStore.orders.filter(o => o.memberId === memberId && o.status === 'completed').length
}

// 当前正在计价的“购物车”：预订用 cart，执行用 execItems
const cartItems = computed<OrderItem[]>(() => isExecuting.value ? execItems.value : cart.value)
const curMemberId = computed(() =>
  isExecuting.value ? (activeOrder.value?.memberId ?? '') : (selectedMember.value?.id ?? ''))
const curMemberTypeId = computed(() => {
  if (isExecuting.value) {
    const m = memberStore.members.find(x => x.id === activeOrder.value?.memberId)
    return m?.typeId ?? ''
  }
  return selectedMember.value?.typeId ?? ''
})

const eligibleNonCoupon = computed<Discount[]>(() => {
  const memberId = curMemberId.value
  const completed = completedCountOf(memberId)
  return discountStore.discounts.filter(
    d => d.discountType !== 'coupon' && !!discountStore.calcDiscount(d, subtotal.value, memberId, completed, curMemberTypeId.value),
  )
})
const appliedNonCoupon = computed<Discount[]>(() =>
  eligibleNonCoupon.value.filter(d => !excludedNonCoupon.value.includes(d.id)),
)
const discIds = computed<string[]>(() => [...appliedNonCoupon.value.map(d => d.id), ...couponIds.value])

// 互斥券：同一 exclusiveGroup 仅保留一个，先到先得
const resolvedDiscIds = computed<string[]>(() => {
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of discIds.value) {
    const d = discountStore.discounts.find(x => x.id === id)
    if (!d) continue
    const g = d.exclusiveGroup?.trim()
    if (g && seen.has(g)) continue
    if (g) seen.add(g)
    out.push(id)
  }
  return out
})

function discountAmountOf(d: Discount): number {
  const memberId = curMemberId.value
  return discountStore.calcDiscount(d, subtotal.value, memberId, completedCountOf(memberId), curMemberTypeId.value)?.amount ?? 0
}

function toggleNonCoupon(id: string, on: boolean) {
  if (on) excludedNonCoupon.value = excludedNonCoupon.value.filter(x => x !== id)
  else if (!excludedNonCoupon.value.includes(id)) excludedNonCoupon.value.push(id)
}
function removeDisc(id: string, type: string) {
  if (type === 'coupon') couponIds.value = couponIds.value.filter(x => x !== id)
  else if (!excludedNonCoupon.value.includes(id)) excludedNonCoupon.value.push(id)
}

function openDisc() {
  showDisc.value = true
  codeValue.value = []
}

function applyCode(raw?: string) {
  const code = (raw ?? (codeValue.value ?? []).join('')).toUpperCase()
  if (code.length < 6) { if (!raw) msg.warning('请输入 6 位券码'); return }
  const res = discountStore.checkCode(code, curMemberId.value)
  if (!res.ok) { codeValue.value = []; msg.error(res.reason ?? '券码不可用'); return }
  const d = discountStore.findByCode(code)!
  if (couponIds.value.includes(d.id)) { codeValue.value = []; return }
  const g = d.exclusiveGroup?.trim()
  if (g) {
    const conflict = discountStore.discounts.find(x => x.id !== d.id && x.exclusiveGroup?.trim() === g && discIds.value.includes(x.id))
    if (conflict) { codeValue.value = []; msg.error('该券与已用优惠互斥，无法叠加'); return }
  }
  couponIds.value.push(d.id)
  codeValue.value = []
  showDisc.value = false
  msg.success('券码已兑换')
}

watch(codeValue, (val) => {
  const up = (val ?? []).map(c => c.toUpperCase())
  if ((codeValue.value ?? []).join('') !== up.join('')) codeValue.value = up
  if (up.length === 6) applyCode(up.join(''))
}, { deep: true })

// ── 计时器（全局唯一；预订仅填预计值不启动，执行时真实运行）──
const timerElapsed = ref<Record<string, number>>({})
const timerRunning = ref<Record<string, boolean>>({})
const tickId = ref<ReturnType<typeof setInterval> | null>(null)

function ensureTicker() {
  if (tickId.value !== null) return
  tickId.value = window.setInterval(() => {
    for (const id in timerRunning.value) {
      if (timerRunning.value[id]) timerElapsed.value[id] = (timerElapsed.value[id] ?? 0) + 1
    }
  }, 1000)
}
function stopTicker() {
  if (tickId.value !== null) { clearInterval(tickId.value); tickId.value = null }
}
function startTimer(id: string) {
  timerElapsed.value[id] = timerElapsed.value[id] ?? 0
  timerRunning.value[id] = true
  ensureTicker()
}
function pauseTimer(id: string) {
  timerRunning.value[id] = false
  if (!Object.values(timerRunning.value).some(Boolean)) stopTicker()
}
function resetTimer(id: string) {
  timerElapsed.value[id] = 0
  timerRunning.value[id] = false
  if (!Object.values(timerRunning.value).some(Boolean)) stopTicker()
}
function stopAllTimers() {
  for (const id in timerRunning.value) timerRunning.value[id] = false
  stopTicker()
}

const itemCost = computed(() => {
  return (item: OrderItem) => {
    if (item.pricingMode === 'hourly') {
      const elapsed = timerElapsed.value[item.priceEntryId] ?? 0
      const rate = item.hourlyRate ?? item.unitPrice
      return Math.round(rate / 3600 * elapsed)
    }
    return item.unitPrice * item.quantity
  }
})

const subtotal = computed(() => cartItems.value.reduce((s, i) => s + itemCost.value(i), 0))

const discRecords = computed(() => {
  const out: Array<{ id: string; type: DiscountType; desc: string; amount: number }> = []
  const memberId = curMemberId.value
  const completed = completedCountOf(memberId)
  for (const id of resolvedDiscIds.value) {
    const d = discountStore.discounts.find(x => x.id === id)
    if (!d) continue
    const r = discountStore.calcDiscount(d, subtotal.value, memberId, completed, curMemberTypeId.value)
    if (r) out.push({ id, type: d.discountType, ...r })
  }
  return out
})

const appliedDiscounts = computed<DiscountRecord[]>(() =>
  discRecords.value.map(r => {
    const d = discountStore.discounts.find(x => x.id === r.id)!
    return { discountId: r.id, discountType: d.discountType, ruleType: d.ruleType, description: r.desc, discountAmount: r.amount }
  }),
)

const finalAmount = computed(() =>
  Math.max(0, subtotal.value - discRecords.value.reduce((s, r) => s + r.amount, 0)))

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

// 预订时长设置（分钟 + 秒，分别绑定到 timerElapsed 的总秒数）
function setDur(id: string, seconds: number) {
  timerElapsed.value[id] = Math.max(0, Math.round(seconds))
}

function addEntry(p: PriceEntry) {
  const idx = cart.value.findIndex(i => i.priceEntryId === p.id)
  if (idx >= 0) {
    cart.value[idx] = { ...cart.value[idx]!, quantity: cart.value[idx]!.quantity + 1 }
  } else {
    const item: OrderItem = {
      priceEntryId: p.id, serviceName: p.name, pricingMode: p.pricingMode,
      quantity: 1, unitPrice: p.basePrice, hourlyRate: p.basePrice, elapsed: 0,
    }
    cart.value.push(item)
    if (p.pricingMode === 'hourly') timerElapsed.value[p.id] = 0
  }
}
function rmCart(i: number) {
  const item = cart.value[i]
  if (item?.pricingMode === 'hourly') {
    pauseTimer(item.priceEntryId)
    delete timerElapsed.value[item.priceEntryId]
    delete timerRunning.value[item.priceEntryId]
  }
  cart.value.splice(i, 1)
}

// ── 预订（下单器）：创建 pending 订单，预计时长不实际计时 ──
async function bookOrder() {
  if (!cart.value.length) { msg.warning('请添加服务项目'); return }
  const memberId = selectedMember.value?.id ?? ''
  const memberName = selectedMember.value?.name ?? '散客'
  try {
    const items = cart.value.map(i => i.pricingMode === 'hourly' ? { ...i, elapsed: timerElapsed.value[i.priceEntryId] ?? 0 } : i)
    const applied = appliedDiscounts.value
    await orderStore.create(memberId, memberName, items, {
      discountRecords: applied,
      discountAmount: applied.reduce((s, r) => s + r.discountAmount, 0),
      notes: orderNotes.value,
    })
    for (const r of applied) await discountStore.recordUsage(r.discountId, memberId)
    msg.success('预订已创建')
    selectedMember.value = null
    cart.value = []
    excludedNonCoupon.value = []
    couponIds.value = []
    orderNotes.value = ''
    codeValue.value = []
    timerElapsed.value = {}
  } catch (e: unknown) { msg.error(String(e)) }
}

// ── 执行（计价器）：打开已确认/执行中订单，真实计时 ──
async function openOrder(o: Order) {
  try {
    await openOrderInner(o)
  } catch (e: unknown) { msg.error(String(e)) }
}
async function openOrderInner(o: Order) {
  await orderStore.beginExecute(o.id)
  const fresh = orderStore.orders.find(x => x.id === o.id)
  if (!fresh) return
  activeOrder.value = fresh
  execItems.value = fresh.items.map(i => ({ ...i }))
  for (const i of execItems.value) {
    if (i.pricingMode === 'hourly') {
      // 首次计费从 0 开始；若是从“暂停保留进度”恢复的执行中订单，则续接已计时长
      timerElapsed.value[i.priceEntryId] = o.status === 'in_progress' ? (i.elapsed ?? 0) : 0
    }
  }
  couponIds.value = fresh.discountRecords
    .filter(r => discountStore.discounts.find(d => d.id === r.discountId)?.discountType === 'coupon')
    .map(r => r.discountId)
  excludedNonCoupon.value = []
  payMethod.value = fresh.paymentMethod ?? 'cash'
  showPicker.value = false
}

// 暂停执行：保留进度（订单仍为执行中），稍后可继续
async function pauseExec() {
  if (!activeOrder.value) return
  const items = execItems.value.map(i => i.pricingMode === 'hourly' ? { ...i, elapsed: timerElapsed.value[i.priceEntryId] ?? 0 } : i)
  stopAllTimers()
  try {
    await orderStore.saveExecution(activeOrder.value.id, items)
    msg.info('已暂停，可稍后在计价器继续')
  } catch (e: unknown) { msg.error(String(e)) }
  activeOrder.value = null
  execItems.value = []
  timerElapsed.value = {}
}

// 完成执行：按实时时长结算
async function finalizeOrder() {
  if (!activeOrder.value) return
  const items = execItems.value.map(m => m.pricingMode === 'hourly' ? { ...m, elapsed: timerElapsed.value[m.priceEntryId] ?? 0 } : m)
  try {
    await orderStore.finalize(activeOrder.value.id, items, appliedDiscounts.value, payMethod.value)
    stopAllTimers()
    msg.success('订单已完成')
  } catch (e: unknown) { msg.error(String(e)) }
  activeOrder.value = null
  execItems.value = []
  timerElapsed.value = {}
  excludedNonCoupon.value = []
  couponIds.value = []
}

function closeBook() {
  showBook.value = false
}
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <div style="display:flex;align-items:center;justify-content:space-between">
      <h2 style="margin:0">计价器</h2>
      <NSpace>
        <NButton @click="showBook = true">新建订单</NButton>
        <NButton type="primary" @click="showPicker = true">打开订单</NButton>
      </NSpace>
    </div>

    <!-- 执行中视图 -->
    <template v-if="isExecuting && activeOrder">
      <NCard size="small">
        <template #header><strong>执行中订单</strong></template>
        <NSpace align="center">
          <NTag type="success" size="small">✓ {{ activeOrder.memberName }}</NTag>
          <NTag size="tiny">单号 {{ activeOrder.id.slice(0, 8) }}</NTag>
          <span style="font-size:12px;color:var(--n-text-color-3)">实时计时中，完成后结算</span>
        </NSpace>
      </NCard>

      <NCard size="small" title="服务项目">
        <NSpace vertical :size="2">
          <div v-for="(item, i) in execItems" :key="item.priceEntryId + '-' + i"
            style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--n-border-color)">
            <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.serviceName }}</span>

            <div v-if="item.pricingMode === 'perPiece'"
              style="display:flex;align-items:center;gap:6px;min-width:110px;justify-content:flex-end">
              <NButton size="tiny" circle @click="item.quantity = Math.max(1, item.quantity - 1)">
                <NIcon><IconMinus /></NIcon>
              </NButton>
              <span style="font-size:13px;min-width:20px;text-align:center">{{ item.quantity }}</span>
              <NButton size="tiny" circle @click="item.quantity = item.quantity + 1">
                <NIcon><IconPlus /></NIcon>
              </NButton>
            </div>

            <div v-else
              style="display:flex;align-items:center;gap:6px;min-width:230px;justify-content:flex-end">
              <span style="font-size:12px;color:var(--n-text-color-3);min-width:150px;text-align:right;font-variant-numeric:tabular-nums">
                预订 {{ formatTime(item.elapsed ?? 0) }} · 实际 {{ formatTime(timerElapsed[item.priceEntryId] ?? 0) }}
              </span>
              <NButton size="tiny" circle :type="timerRunning[item.priceEntryId] ? 'warning' : 'success'"
                @click="timerRunning[item.priceEntryId] ? pauseTimer(item.priceEntryId) : startTimer(item.priceEntryId)">
                <NIcon>
                  <IconPlayerPause v-if="timerRunning[item.priceEntryId]" />
                  <IconPlayerPlay v-else />
                </NIcon>
              </NButton>
              <NButton size="tiny" circle @click="resetTimer(item.priceEntryId)">
                <NIcon><IconPlayerStop /></NIcon>
              </NButton>
            </div>

            <span style="font-weight:600;min-width:64px;text-align:right"
              :style="item.pricingMode === 'hourly' ? 'color:var(--n-success-color)' : ''">
              ¥{{ fmt(itemCost(item)) }}
            </span>
          </div>
        </NSpace>

        <NSpace style="margin-top:12px">
          <NButton size="small" @click="openDisc">
            <template #icon><NIcon><IconPlus /></NIcon></template>
            优惠
          </NButton>
        </NSpace>
        <div v-if="resolvedDiscIds.length" style="margin-top:8px">
          <NTag v-for="r in discRecords" :key="r.id" type="warning" size="tiny" closable style="margin-right:4px"
            @close="removeDisc(r.id, r.type)">{{ r.desc }}</NTag>
        </div>

        <NDivider style="margin:12px 0" />
        <NSpace vertical :size="4">
          <NSpace justify="space-between"><span>小计</span><span>¥{{ fmt(subtotal) }}</span></NSpace>
          <NSpace v-if="discRecords.length" justify="space-between" style="color:var(--n-warning-color)">
            <span>优惠</span><span>-¥{{ fmt(discRecords.reduce((s, r) => s + r.amount, 0)) }}</span>
          </NSpace>
          <NSpace justify="space-between" style="font-weight:700;font-size:16px">
            <span>实收</span>
            <span style="color:var(--n-success-color)">¥{{ fmt(finalAmount) }}</span>
          </NSpace>
        </NSpace>

        <NDivider style="margin:12px 0" />
        <div style="font-size:13px;margin-bottom:6px">支付方式</div>
        <NRadioGroup v-model:value="payMethod">
          <NSpace>
            <NRadio v-for="p in PAYMENTS" :key="p.value" :value="p.value">{{ p.label }}</NRadio>
          </NSpace>
        </NRadioGroup>

        <NSpace style="margin-top:14px">
          <NButton type="primary" size="large" @click="finalizeOrder">完成订单</NButton>
          <NButton size="large" @click="pauseExec">暂停（保留进度）</NButton>
        </NSpace>
      </NCard>
    </template>

    <!-- 空状态：引导打开订单 -->
    <template v-else>
      <NCard size="small">
        <NSpace vertical :size="10">
          <span style="color:var(--n-text-color-3)">计价器用于实际执行已确认的订单（真实计时）。点击下方订单开始，或新建一笔订单。</span>
          <div v-if="orderStore.executableOrders.length === 0" style="color:var(--n-text-color-3);font-size:13px">暂无可执行订单（请先在订单页确认订单）。</div>
          <NCard v-for="o in orderStore.executableOrders" :key="o.id" size="small"
            style="display:flex;align-items:center;justify-content:space-between">
            <div>
              <div style="font-weight:500">{{ o.memberName }}</div>
              <div style="font-size:12px;color:var(--n-text-color-3)">
                单号 {{ o.id.slice(0, 8) }} ·
                <NTag size="tiny" :type="o.status === 'in_progress' ? 'warning' : 'info'">
                  {{ o.status === 'in_progress' ? '执行中' : '待执行' }}
                </NTag>
                · {{ o.items.length }} 项
              </div>
            </div>
            <NButton size="small" type="primary" @click="openOrder(o)">打开</NButton>
          </NCard>
        </NSpace>
      </NCard>
    </template>

    <!-- 下单器（预订模态框） -->
    <NModal v-model:show="showBook" title="新建订单" preset="card" style="width:840px" @close="closeBook">
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
        <NCard size="small">
          <template #header><strong>选择会员</strong></template>
          <NSelect v-model:value="selectedMemberId" :options="memberOptions" filterable clearable
            placeholder="搜索姓名/手机并点选（留空为散客）" />
          <NSpace v-if="selectedMember" align="center" style="margin-top:8px">
            <NTag type="success" size="small">✓ {{ selectedMember.name }}</NTag>
          </NSpace>
          <span v-else style="font-size:12px;color:var(--n-text-color-3)">当前为散客</span>
          <NDivider style="margin:12px 0 8px">服务项目</NDivider>
          <NSpace vertical :size="6" style="max-height:360px;overflow-y:auto">
            <NCard v-for="p in priceStore.activePrices" :key="p.id" size="small"
              style="display:flex;align-items:center;justify-content:space-between">
              <div>
                <div style="font-weight:500">{{ p.name }}</div>
                <div style="font-size:12px;color:var(--n-text-color-3)">
                  {{ p.category }} ·
                  <NTag type="info" size="tiny">{{ p.pricingMode === 'hourly' ? '工时' : '按件' }}</NTag>
                  · ¥{{ fmt(p.basePrice) }}/h
                </div>
              </div>
              <NButton size="tiny" @click="addEntry(p)">添加</NButton>
            </NCard>
          </NSpace>
        </NCard>

        <NCard size="small" title="购物车（预计）">
          <template v-if="!cart.length" #default>
            <NSpace vertical align="center" style="padding:24px">
              <span style="color:var(--n-text-color-3)">购物车为空</span>
            </NSpace>
          </template>
          <template v-else #default>
            <NSpace vertical :size="2">
              <div v-for="(item, i) in cart" :key="item.priceEntryId + '-' + i"
                style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--n-border-color)">
                <span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{{ item.serviceName }}</span>

                <div v-if="item.pricingMode === 'perPiece'"
                  style="display:flex;align-items:center;gap:6px;min-width:110px;justify-content:flex-end">
                  <NButton size="tiny" circle @click="item.quantity = Math.max(1, item.quantity - 1)">
                    <NIcon><IconMinus /></NIcon>
                  </NButton>
                  <span style="font-size:13px;min-width:20px;text-align:center">{{ item.quantity }}</span>
                  <NButton size="tiny" circle @click="item.quantity = item.quantity + 1">
                    <NIcon><IconPlus /></NIcon>
                  </NButton>
                </div>

                <div v-else
                  style="display:flex;align-items:center;gap:6px;min-width:240px;justify-content:flex-end">
                  <span style="font-size:12px;color:var(--n-text-color-3);min-width:74px;text-align:right;font-variant-numeric:tabular-nums">
                    预订 {{ formatTime(timerElapsed[item.priceEntryId] ?? 0) }}
                  </span>
                  <NInputNumber :value="Math.floor((timerElapsed[item.priceEntryId] ?? 0) / 60)"
                    @update:value="v => setDur(item.priceEntryId, (v ?? 0) * 60 + ((timerElapsed[item.priceEntryId] ?? 0) % 60))"
                    :min="0" :step="5" size="tiny" style="width:78px" :show-button="false" placeholder="分" />
                  <span style="font-size:13px;color:var(--n-text-color-3)">分</span>
                  <NInputNumber :value="(timerElapsed[item.priceEntryId] ?? 0) % 60"
                    @update:value="v => setDur(item.priceEntryId, Math.floor((timerElapsed[item.priceEntryId] ?? 0) / 60) * 60 + (v ?? 0))"
                    :min="0" :max="59" size="tiny" style="width:70px" :show-button="false" placeholder="秒" />
                  <span style="font-size:13px;color:var(--n-text-color-3)">秒</span>
                </div>

                <span style="font-weight:600;min-width:64px;text-align:right"
                  :style="item.pricingMode === 'hourly' ? 'color:var(--n-success-color)' : ''">
                  ¥{{ fmt(itemCost(item)) }}
                </span>

                <NButton size="tiny" type="error" circle @click="rmCart(i)">
                  <NIcon><IconTrash /></NIcon>
                </NButton>
              </div>
            </NSpace>

            <NSpace style="margin-top:12px">
              <NButton size="small" @click="openDisc">
                <template #icon><NIcon><IconPlus /></NIcon></template>
                优惠
              </NButton>
              <NButton size="small" type="warning" @click="cart = []">清空</NButton>
            </NSpace>

            <div v-if="resolvedDiscIds.length" style="margin-top:8px">
              <NTag v-for="r in discRecords" :key="r.id" type="warning" size="tiny" closable style="margin-right:4px"
                @close="removeDisc(r.id, r.type)">{{ r.desc }}</NTag>
            </div>

            <NDivider style="margin:12px 0" />
            <NSpace vertical :size="4">
              <NSpace justify="space-between"><span>小计</span><span>¥{{ fmt(subtotal) }}</span></NSpace>
              <NSpace v-if="discRecords.length" justify="space-between" style="color:var(--n-warning-color)">
                <span>优惠</span><span>-¥{{ fmt(discRecords.reduce((s, r) => s + r.amount, 0)) }}</span>
              </NSpace>
              <NSpace justify="space-between" style="font-weight:700;font-size:16px">
                <span>预计实收</span>
                <span style="color:var(--n-success-color)">¥{{ fmt(finalAmount) }}</span>
              </NSpace>
            </NSpace>
            <NInput v-model:value="orderNotes" placeholder="备注（可选）" clearable style="margin-top:8px" />
            <NButton type="primary" size="large" block style="margin-top:12px" :disabled="!cart.length"
              @click="bookOrder">确认下单
            </NButton>
          </template>
        </NCard>
      </div>
    </NModal>

    <!-- 打开订单：选择已确认/执行中的订单 -->
    <NModal v-model:show="showPicker" title="打开订单" preset="card" style="width:520px">
      <NSpace vertical :size="8">
        <div v-if="orderStore.executableOrders.length === 0" style="color:var(--n-text-color-3);font-size:13px">暂无可执行订单。</div>
        <NCard v-for="o in orderStore.executableOrders" :key="o.id" size="small"
          style="display:flex;align-items:center;justify-content:space-between">
          <div>
            <div style="font-weight:500">{{ o.memberName }}</div>
            <div style="font-size:12px;color:var(--n-text-color-3)">
              单号 {{ o.id.slice(0, 8) }} · {{ o.items.length }} 项
            </div>
          </div>
          <NButton size="small" type="primary" @click="openOrder(o)">打开</NButton>
        </NCard>
      </NSpace>
    </NModal>

    <!-- 优惠 -->
    <NModal v-model:show="showDisc" title="优惠" preset="card" style="width:380px">
      <NSpace vertical :size="12">
        <div v-if="eligibleNonCoupon.length">
          <div style="font-size:12px;color:var(--n-text-color-3);margin-bottom:6px">自动适用优惠（可手动关闭）</div>
          <NSpace vertical :size="6">
            <div v-for="d in eligibleNonCoupon" :key="d.id"
              style="display:flex;align-items:center;gap:8px">
              <NCheckbox :checked="!excludedNonCoupon.includes(d.id)"
                @update:checked="v => toggleNonCoupon(d.id, v)" />
              <span style="flex:1">{{ d.name }}</span>
              <span style="color:var(--n-warning-color)">-¥{{ fmt(discountAmountOf(d)) }}</span>
            </div>
          </NSpace>
        </div>
        <NDivider v-if="eligibleNonCoupon.length" style="margin:4px 0" />
        <div>
          <div style="font-size:12px;color:var(--n-text-color-3);margin-bottom:6px">券码兑换</div>
          <NInputOtp :length="6" v-model:value="codeValue" block />
          <div style="font-size:12px;color:var(--n-text-color-3);margin-top:6px">输满 6 位自动兑换，兑换后自动关闭</div>
        </div>
      </NSpace>
    </NModal>
  </NSpace>
</template>
