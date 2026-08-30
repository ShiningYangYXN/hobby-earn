import { ref } from 'vue'
import { defineStore } from 'pinia'
import {
  type Discount,
  type DiscountScope,
  type DiscountRecord,
  type RandomConfig,
  type OrderItem,
  type TimeWindow,
  genDiscountId,
  normalizeCouponCode,
  isValidCouponCode,
} from './types'
import { getAll, put, del } from './db'
import type { Order } from './types'
import { useOrderStore } from './useOrderStore'
import { useUiStore } from './useUiStore'

type DiscountStatus = 'active' | 'upcoming' | 'expired' | 'disabled' | 'exhausted'

// ============================================================
// 周期表达式：魔改 5 字段「分 时 日 月 周」
// 支持 * / 数字 / 逗号列表 / 区间(a-b)
// ============================================================
function parseCronField(field: string, min: number, max: number): ((v: number) => boolean) | null {
  if (!field || field.trim() === '*') return null
  const tests: ((v: number) => boolean)[] = []
  for (const part of field.split(',')) {
    const p = part.trim()
    if (!p) continue
    if (p.includes('/')) {
      const [range, stepStr = ''] = p.split('/')
      const step = parseInt(stepStr, 10)
      if (Number.isNaN(step) || step <= 0) continue
      let lo = min
      let hi = max
      if (range && range !== '*') {
        if (range.includes('-')) {
          const [a = NaN, b = NaN] = range.split('-').map((x) => parseInt(x, 10))
          lo = a
          hi = b
        } else {
          lo = hi = parseInt(range, 10)
        }
      }
      tests.push((v) => v >= lo && v <= hi && (v - lo) % step === 0)
    } else if (p.includes('-')) {
      const [a = NaN, b = NaN] = p.split('-').map((x) => parseInt(x, 10))
      tests.push((v) => v >= a && v <= b)
    } else {
      const n = parseInt(p, 10)
      if (!Number.isNaN(n)) tests.push((v) => v === n)
    }
  }
  if (!tests.length) return null
  return (v) => tests.some((t) => t(v))
}

/** 判断当前时间是否落在周期窗口内（cron 命中且 validFrom/Until 允许） */
export function inTimeWindow(win: TimeWindow | undefined, now: Date = new Date()): boolean {
  if (!win) return true
  if (win.validFrom) {
    const from = new Date(win.validFrom)
    if (!Number.isNaN(from.getTime()) && now < from) return false
  }
  if (win.validUntil) {
    const until = new Date(win.validUntil)
    if (!Number.isNaN(until.getTime()) && now > until) return false
  }
  if (win.cron && win.cron.trim() && win.cron.trim() !== '*') {
    const parts = win.cron.trim().split(/\s+/)
    const [minF, hourF, dayF, monthF, dowF] = [
      parts[0] ?? '*',
      parts[1] ?? '*',
      parts[2] ?? '*',
      parts[3] ?? '*',
      parts[4] ?? '*',
    ]
    const m = parseCronField(minF, 0, 59)
    const h = parseCronField(hourF, 0, 23)
    const d = parseCronField(dayF, 1, 31)
    const mo = parseCronField(monthF, 1, 12)
    const dw = parseCronField(dowF, 0, 6)
    if (m && !m(now.getMinutes())) return false
    if (h && !h(now.getHours())) return false
    if (d && !d(now.getDate())) return false
    if (mo && !mo(now.getMonth() + 1)) return false
    if (dw && !dw(now.getDay())) return false
  }
  return true
}

/** 作用域资格判定：全部指定维度均命中才返回 true */
export function scopeEligible(
  scope: DiscountScope | undefined,
  ctx: {
    memberId: string | null
    memberTypeId: string | null
    items: OrderItem[]
    categoryIdsOf: (priceEntryId: string) => string[]
    now?: Date
  },
): boolean {
  if (!scope) return true
  if (scope.memberTypeIds?.length) {
    if (!ctx.memberTypeId || !scope.memberTypeIds.includes(ctx.memberTypeId)) return false
  }
  if (scope.memberIds?.length) {
    if (!ctx.memberId || !scope.memberIds.includes(ctx.memberId)) return false
  }
  if (scope.categories?.length) {
    const orderCats = new Set<string>()
    for (const it of ctx.items) for (const c of ctx.categoryIdsOf(it.priceEntryId)) orderCats.add(c)
    if (!scope.categories.some((c) => orderCats.has(c))) return false
  }
  if (scope.items?.length) {
    const orderItems = new Set(ctx.items.map((it) => it.priceEntryId))
    if (!scope.items.some((i) => orderItems.has(i))) return false
  }
  if (scope.timeWindow && !inTimeWindow(scope.timeWindow, ctx.now)) return false
  return true
}

/** 捕获随机数值：amount→分；ratio→0-100 */
export function captureRandom(rnd: RandomConfig, rng: () => number = Math.random): number {
  const lo = Math.min(rnd.min, rnd.max)
  const hi = Math.max(rnd.min, rnd.max)
  const raw = lo + rng() * (hi - lo)
  return rnd.kind === 'amount' ? Math.round(raw) : Math.round(raw)
}

// ============================================================
// Store
// ============================================================
export const useDiscountStore = defineStore('discount', () => {
  const discounts = ref<Discount[]>([])
  const loaded = ref(false)

  async function load() {
    discounts.value = await getAll<Discount>('discounts')
    loaded.value = true
  }
  function findById(id: string): Discount | undefined {
    return discounts.value.find((d) => d.id === id)
  }

  // —— 状态判定 ——
  function discountStatus(d: Discount, memberId: string | null = null): DiscountStatus {
    if (!d.isActive) return 'disabled'
    const now = new Date()
    const from = d.scope?.timeWindow?.validFrom
    const until = d.scope?.timeWindow?.validUntil
    if (from && now < new Date(from)) return 'upcoming'
    if (until && now > new Date(until)) return 'expired'
    if (d.usageLimit && d.usedCount >= d.usageLimit) return 'exhausted'
    if (memberId && d.memberLimit && (d.memberUsed?.[memberId] ?? 0) >= d.memberLimit)
      return 'exhausted'
    return 'active'
  }
  function isUsable(d: Discount, memberId: string | null = null): boolean {
    return discountStatus(d, memberId) === 'active'
  }

  // —— 自动触发候选（auto + 作用域命中 + 券码未附加） ——
  // 注意：随机触发(triggerChance)的「资格」不在候选阶段判定，留待下单时固化，
  // 否则每次重算候选都会重新掷骰，导致计价器计时期间反复重新投掷。
  function autoCandidates(ctx: {
    memberId: string | null
    memberTypeId: string | null
    items: OrderItem[]
    categoryIdsOf: (priceEntryId: string) => string[]
    now?: Date
  }): Discount[] {
    return discounts.value.filter((d) => {
      if (d.couponCode) return false // 带券码=需手动兑换，不得自动触发
      if (!isUsable(d, ctx.memberId)) return false
      if (!scopeEligible(d.scope, ctx)) return false
      return true
    })
  }

  // —— 券码兑换：仅 coupon 触发或带券码的优惠，且准入 ——
  function redeemByCode(
    code: string,
    ctx: {
      memberId: string | null
      memberTypeId: string | null
      items: OrderItem[]
      categoryIdsOf: (priceEntryId: string) => string[]
    },
  ): Discount | null {
    const c = normalizeCouponCode(code)
    if (!isValidCouponCode(c)) return null // 非 6 位券码一律无效
    const d = discounts.value.find((x) => x.couponCode && normalizeCouponCode(x.couponCode) === c)
    if (!d) return null
    if (!isUsable(d, ctx.memberId)) return null
    if (!scopeEligible(d.scope, ctx)) return null
    return d
  }

  // —— 优惠计算（作用于 baseAmount，返回减免额，保证 <= base）
  // units: 仅 perItem 使用，表示优惠范围内的总件数 ——
  function calcDiscount(
    d: Discount,
    baseAmount: number,
    capturedRandom?: number,
    units?: number,
  ): number {
    let amount = 0
    const base = Math.max(0, baseAmount)
    if (d.ruleType === 'fixed') {
      if (d.random?.kind === 'amount' && capturedRandom != null) {
        // 随机金额：以捕获到的随机值为立减额
        if (base >= d.minAmount) amount = capturedRandom
      } else if (base >= d.minAmount) {
        amount = d.value
      }
    } else if (d.ruleType === 'percentage') {
      // value / capturedRandom 表示「支付比例」(0-100)：88 = 8.8折 = 支付 88%，减免 12%
      // 先折后减：减免额 = base * (100 - 支付比例) / 100；0 = 免单（全免）
      // 资格核验以原价（base）为准：未达门槛 minAmount 不享受该折扣
      const r = d.random?.kind === 'ratio' && capturedRandom != null ? capturedRandom : d.value
      if (base >= d.minAmount) amount = Math.round((base * (100 - r)) / 100)
    } else if (d.ruleType === 'stepDown') {
      if (d.minAmount > 0) {
        let steps = Math.floor(base / d.minAmount)
        if (d.maxUnits != null) steps = Math.min(steps, d.maxUnits)
        amount = steps * d.value
      }
    } else if (d.ruleType === 'perItem') {
      let u = units ?? 0
      if (d.maxUnits != null) u = Math.min(u, d.maxUnits)
      amount = Math.round(u * d.value)
    }
    amount = Math.min(amount, base)
    const cap =
      d.random?.kind === 'amount' && capturedRandom != null ? capturedRandom : d.maxDiscount
    if (cap != null) amount = Math.min(amount, cap)
    return amount
  }

  // —— 生成 DiscountRecord（捕获随机/资格快照，固化） ——
  function makeRecord(
    d: Discount,
    discountAmount: number,
    capturedRandom?: number,
  ): DiscountRecord {
    return {
      discountId: d.id,
      name: d.name,
      ruleType: d.ruleType,
      discountAmount,
      scopeSnapshot: d.scope ? JSON.parse(JSON.stringify(d.scope)) : undefined,
      randomSnapshot: d.random ? { ...d.random } : undefined,
      triggerChanceSnapshot: d.triggerChance,
      couponCodeSnapshot: d.couponCode,
      exclusiveGroupId: d.exclusiveGroupId ?? null,
      limitGroups: d.limitGroups ? [...d.limitGroups] : [],
      capturedRandom: capturedRandom,
    }
  }

  // —— 用量管理 ——
  async function recordUsage(d: Discount, memberId?: string | null) {
    const next: Discount = { ...d, usedCount: d.usedCount + 1 }
    if (memberId) {
      const mu = { ...d.memberUsed }
      mu[memberId] = (mu[memberId] ?? 0) + 1
      next.memberUsed = mu
    }
    await put('discounts', next)
    Object.assign(d, next)
  }
  async function rollbackUsage(d: Discount, memberId?: string | null) {
    const next: Discount = { ...d, usedCount: Math.max(0, d.usedCount - 1) }
    if (memberId && next.memberUsed?.[memberId] != null) {
      next.memberUsed = {
        ...next.memberUsed,
        [memberId]: Math.max(0, (next.memberUsed[memberId] ?? 0) - 1),
      }
    }
    await put('discounts', next)
    Object.assign(d, next)
  }

  // —— 增删改 ——
  function emptyDiscount(): Omit<Discount, 'id' | 'createdAt' | 'usedCount'> {
    return {
      name: '',
      isActive: true,
      ruleType: 'fixed',
      value: 0,
      minAmount: 0,
    }
  }
  async function add(d: Omit<Discount, 'id' | 'createdAt' | 'usedCount'>): Promise<Discount> {
    const full: Discount = {
      ...d,
      // 数据层兜底：券码统一大写存储
      couponCode: d.couponCode ? normalizeCouponCode(d.couponCode) : d.couponCode,
      id: genDiscountId(),
      createdAt: Date.now(),
      usedCount: 0,
      memberUsed: {},
    }
    await put('discounts', full)
    discounts.value.push(full)
    return full
  }
  async function update(id: string, patch: Partial<Discount>) {
    // 已用次数为统计字段，默认只读；仅作弊模式可改写
    if (patch.usedCount !== undefined && !useUiStore().advancedMode) {
      throw new Error('已用次数为统计字段，需开启作弊模式才能修改')
    }
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) return
    const next = { ...discounts.value[idx]!, ...patch }
    // 数据层兜底：券码统一大写存储
    if (next.couponCode) next.couponCode = normalizeCouponCode(next.couponCode)
    await put('discounts', next)
    discounts.value[idx] = next
  }

  /** 引用（捕获）了该优惠的订单：订单的 discountRecords 固化记录 */
  function ordersUsing(id: string): Order[] {
    const orderStore = useOrderStore()
    return orderStore.orders.filter((o) => o.discountRecords.some((r) => r.discountId === id))
  }

  // 删除优惠：
  // - 已被订单捕获时默认禁止删除；开启作弊模式后「递归删除」——连同引用它的订单一并强制删除
  // - force：内部级联（如删除会员时连带删除其专属优惠）跳过引用校验，直接递归删除
  async function remove(id: string, opts: { force?: boolean } = {}): Promise<void> {
    const relatedOrders = ordersUsing(id)
    if (relatedOrders.length && !opts.force && !useUiStore().advancedMode) {
      throw new Error(`优惠已被 ${relatedOrders.length} 笔订单引用，需开启作弊模式后递归删除`)
    }
    if (relatedOrders.length) {
      const orderStore = useOrderStore()
      for (const o of relatedOrders) {
        await orderStore.remove(o.id, { force: true, rollbackDiscounts: true })
      }
    }
    await del('discounts', id)
    discounts.value = discounts.value.filter((x) => x.id !== id)
  }

  return {
    discounts,
    loaded,
    load,
    findById,
    discountStatus,
    isUsable,
    autoCandidates,
    redeemByCode,
    scopeEligible,
    inTimeWindow,
    calcDiscount,
    makeRecord,
    captureRandom,
    recordUsage,
    rollbackUsage,
    add,
    update,
    remove,
    ordersUsing,
    emptyDiscount,
  }
})
