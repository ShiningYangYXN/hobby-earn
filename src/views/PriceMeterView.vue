<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import {
  NButton, NCard, NSpace, NDivider, NSelect, NInput, NInputOtp, NCheckbox,
  NModal, NTag, NIcon, useMessage,
} from 'naive-ui'
import {
  IconPlus, IconMinus, IconPlayerPlay, IconPlayerPause, IconPlayerStop, IconTrash,
} from '@tabler/icons-vue'
import { usePriceStore } from '@/stores/usePriceStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { fmt, type PriceEntry, type Member, type OrderItem, type DiscountRecord, type Discount } from '@/stores/types'

const msg = useMessage()
const priceStore = usePriceStore()
const orderStore = useOrderStore()
const memberStore = useMemberStore()
const discountStore = useDiscountStore()

onMounted(async () => {
  await Promise.all([priceStore.load(), memberStore.load(), discountStore.load(), orderStore.load()])
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

// ── 购物车 ──
const cart = ref<OrderItem[]>([])
const orderNotes = ref('')
const showDisc = ref(false)
const codeValue = ref<string[]>([])

// ── 优惠：非券码（自动适用，可开关）+ 券码（OTP 兑换）──
const nonCouponIds = ref<string[]>([])
const couponIds = ref<string[]>([])
const discIds = computed<string[]>(() => [...nonCouponIds.value, ...couponIds.value])

function completedCountOf(memberId: string): number {
  return orderStore.orders.filter(o => o.memberId === memberId && o.status === 'completed').length
}

const eligibleNonCoupon = computed<Discount[]>(() => {
  const memberId = selectedMember.value?.id ?? ''
  const completed = completedCountOf(memberId)
  return discountStore.discounts.filter(
    d => d.discountType !== 'coupon' && !!discountStore.calcDiscount(d, subtotal.value, memberId, completed),
  )
})

function discountAmountOf(d: Discount): number {
  const memberId = selectedMember.value?.id ?? ''
  return discountStore.calcDiscount(d, subtotal.value, memberId, completedCountOf(memberId))?.amount ?? 0
}

function addNonCoupon(id: string) { if (!nonCouponIds.value.includes(id)) nonCouponIds.value.push(id) }
function removeNonCoupon(id: string) { nonCouponIds.value = nonCouponIds.value.filter(x => x !== id) }
function removeDisc(id: string) {
  nonCouponIds.value = nonCouponIds.value.filter(x => x !== id)
  couponIds.value = couponIds.value.filter(x => x !== id)
}

function openDisc() {
  showDisc.value = true
  codeValue.value = []
  nonCouponIds.value = eligibleNonCoupon.value.map(d => d.id)
}

function applyCode() {
  const code = (codeValue.value ?? []).join('').toUpperCase()
  if (code.length < 6) { msg.warning('请输入 6 位券码'); return }
  const d = discountStore.findByCode(code)
  if (!d || !discountStore.isValidCode(code)) { msg.warning('券码无效、已使用或已过期'); return }
  if (!couponIds.value.includes(d.id)) couponIds.value.push(d.id)
  codeValue.value = []
  msg.success('券码已兑换')
}

// ── 计时器（全局唯一）──
const timerElapsed = ref<Record<string, number>>({})
const timerRunning = ref<Record<string, boolean>>({})
const tickId = ref<ReturnType<typeof setInterval> | null>(null)

function ensureTicker() {
  if (tickId.value !== null) return
  tickId.value = window.setInterval(() => {
    for (const id in timerRunning.value) {
      if (timerRunning.value[id]) {
        timerElapsed.value[id] = (timerElapsed.value[id] ?? 0) + 1
      }
    }
  }, 1000)
}
function stopTicker() {
  if (tickId.value !== null) {
    clearInterval(tickId.value)
    tickId.value = null
  }
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

const subtotal = computed(() =>
  cart.value.reduce((s, i) => s + itemCost.value(i), 0))

const discRecords = computed(() => {
  const out: Array<{ id: string; desc: string; amount: number }> = []
  const memberId = selectedMember.value?.id ?? ''
  const completed = completedCountOf(memberId)
  for (const id of discIds.value) {
    const d = discountStore.discounts.find(x => x.id === id)
    if (!d) continue
    const r = discountStore.calcDiscount(d, subtotal.value, memberId, completed)
    if (r) out.push({ id, ...r })
  }
  return out
})

const finalAmount = computed(() => Math.max(0, subtotal.value - discRecords.value.reduce((s, r) => s + r.amount, 0)))

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}'${s.toString().padStart(2, '0')}`
}

function addEntry(p: PriceEntry) {
  const idx = cart.value.findIndex(i => i.priceEntryId === p.id)
  if (idx >= 0) {
    cart.value[idx] = { ...cart.value[idx]!, quantity: cart.value[idx]!.quantity + 1 }
  } else {
    const item: OrderItem = {
      priceEntryId: p.id,
      serviceName: p.name,
      pricingMode: p.pricingMode,
      quantity: 1,
      unitPrice: p.basePrice,
      hourlyRate: p.basePrice,
      elapsed: 0,
    }
    cart.value.push(item)
    if (p.pricingMode === 'hourly') {
      timerElapsed.value[p.id] = 0
      timerRunning.value[p.id] = false
    }
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

async function submitOrder() {
  if (!cart.value.length) { msg.warning('请添加服务项目'); return }
  stopAllTimers()
  const memberId = selectedMember.value?.id ?? ''
  const memberName = selectedMember.value?.name ?? '散客'
  try {
    const items = cart.value.map(i => {
      if (i.pricingMode === 'hourly') {
        return { ...i, elapsed: timerElapsed.value[i.priceEntryId] ?? 0 }
      }
      return i
    })
    const appliedDiscounts = discIds.value
      .map(id => {
        const d = discountStore.discounts.find(x => x.id === id)
        const r = discRecords.value.find(x => x.id === id)
        if (!d || !r) return null
        return { discountId: id, discountType: d.discountType, ruleType: d.ruleType, description: r.desc, discountAmount: r.amount } as DiscountRecord
      })
      .filter((x): x is DiscountRecord => x !== null)
    await orderStore.create(memberId, memberName, items, {
      discountRecords: appliedDiscounts,
      discountAmount: appliedDiscounts.reduce((s, r) => s + r.discountAmount, 0),
      notes: orderNotes.value,
    })
    msg.success('订单已创建')
    selectedMember.value = null
    cart.value = []
    nonCouponIds.value = []
    couponIds.value = []
    orderNotes.value = ''
    codeValue.value = []
    timerElapsed.value = {}
    timerRunning.value = {}
  } catch (e: unknown) { msg.error(String(e)) }
}
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <h2 style="margin:0">计价器</h2>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;">
      <!-- 左栏：选择会员 + 服务项目 -->
      <NCard size="small">
        <template #header><strong>选择会员</strong></template>
        <NSelect v-model:value="selectedMemberId" :options="memberOptions" filterable clearable
          placeholder="搜索姓名/手机并点选（留空为散客）" />
        <NSpace v-if="selectedMember" align="center" style="margin-top:8px">
          <NTag type="success" size="small">✓ {{ selectedMember.name }}</NTag>
          <NTag v-for="t in selectedMember.tags" :key="t" size="tiny">{{ t }}</NTag>
        </NSpace>
        <span v-else style="font-size:12px;color:var(--n-text-color-3)">当前为散客</span>
        <NDivider style="margin:12px 0 8px">服务项目</NDivider>
        <NSpace vertical :size="6" style="max-height:400px;overflow-y:auto">
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

      <!-- 右栏：购物车 -->
      <NCard size="small" title="购物车">
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
                style="display:flex;align-items:center;gap:6px;min-width:110px;justify-content:flex-end">
                <span
                  style="font-size:13px;color:var(--n-text-color-3);min-width:44px;text-align:right;font-variant-numeric:tabular-nums">
                  {{ formatTime(timerElapsed[item.priceEntryId] ?? 0) }}
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

          <div v-if="discIds.length" style="margin-top:8px">
            <NTag v-for="r in discRecords" :key="r.id" type="warning" size="tiny" closable style="margin-right:4px"
              @close="removeDisc(r.id)">{{ r.desc }}</NTag>
          </div>

          <NDivider style="margin:12px 0" />
          <NSpace vertical :size="4">
            <NSpace justify="space-between"><span>小计</span><span>¥{{ fmt(subtotal) }}</span></NSpace>
            <NSpace v-if="discRecords.length" justify="space-between" style="color:var(--n-warning-color)">
              <span>优惠</span><span>-¥{{fmt(discRecords.reduce((s, r) => s + r.amount, 0))}}</span>
            </NSpace>
            <NSpace justify="space-between" style="font-weight:700;font-size:16px">
              <span>实收</span>
              <span style="color:var(--n-success-color)">¥{{ fmt(finalAmount) }}</span>
            </NSpace>
          </NSpace>
          <NInput v-model:value="orderNotes" placeholder="备注（可选）" clearable style="margin-top:8px" />
          <NButton type="primary" size="large" block style="margin-top:12px" :disabled="!cart.length"
            @click="submitOrder">确认下单
          </NButton>
        </template>
      </NCard>
    </div>

    <NModal v-model:show="showDisc" title="优惠" preset="card" style="width:380px">
      <NSpace vertical :size="12">
        <div v-if="eligibleNonCoupon.length">
          <div style="font-size:12px;color:var(--n-text-color-3);margin-bottom:6px">自动适用优惠（可手动关闭）</div>
          <NSpace vertical :size="6">
            <div v-for="d in eligibleNonCoupon" :key="d.id"
              style="display:flex;align-items:center;gap:8px">
              <NCheckbox :checked="nonCouponIds.includes(d.id)"
                @update:checked="v => v ? addNonCoupon(d.id) : removeNonCoupon(d.id)" />
              <span style="flex:1">{{ d.name }}</span>
              <span style="color:var(--n-warning-color)">-¥{{ fmt(discountAmountOf(d)) }}</span>
            </div>
          </NSpace>
        </div>
        <NDivider v-if="eligibleNonCoupon.length" style="margin:4px 0" />
        <div>
          <div style="font-size:12px;color:var(--n-text-color-3);margin-bottom:6px">券码兑换</div>
          <NInputOtp :length="6" v-model:value="codeValue" block @keyup.enter="applyCode" />
          <NButton type="primary" block style="margin-top:8px" @click="applyCode">兑换</NButton>
        </div>
      </NSpace>
    </NModal>
  </NSpace>
</template>
