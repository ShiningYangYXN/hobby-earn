import { ref, computed } from 'vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { subtotalOf, itemAmount, type Discount, type DiscountRecord, type OrderItem } from '@/stores/types'

/**
 * 订单/计价场景下的优惠应用逻辑：
 * - 券码兑换（OTP 输入）与自动优惠（会员/首单/累次/推广/限时）手动勾选
 * - 互斥分组内只保留减免最大者
 * - 用量在 commitUsage 时计入，已计入的不会重复计入；移除已计入项会退回用量
 */
export function useDiscountApply(getMemberId: () => string | null, getItems: () => OrderItem[]) {
  const discountStore = useDiscountStore()
  const orderStore = useOrderStore()
  const memberStore = useMemberStore()
  const priceStore = usePriceStore()

  const applied = ref<Discount[]>([])
  const countedIds = ref<Set<string>>(new Set())
  const couponInput = ref<string[]>([])
  const couponError = ref('')

  const subtotal = computed(() => subtotalOf(getItems()))

  // 订单项命中的商品分类（用于品类优惠判定）
  function categories(): string[] {
    const set = new Set<string>()
    for (const it of getItems()) {
      const p = priceStore.prices.find((x) => x.id === it.priceEntryId)
      if (p?.category) set.add(p.category)
    }
    return [...set]
  }
  // 品类优惠：仅对命中指定品类的订单项计算金额
  function categorySubtotal(categoryIds: string[]): number {
    const matched = new Set(categoryIds)
    let s = 0
    for (const it of getItems()) {
      const p = priceStore.prices.find((x) => x.id === it.priceEntryId)
      if (p?.category && matched.has(p.category)) s += itemAmount(it)
    }
    return s
  }

  function memberTypeId(): string | undefined {
    const mid = getMemberId()
    if (!mid) return undefined
    return memberStore.members.find((m) => m.id === mid)?.typeId
  }
  function completedCount(): number {
    const mid = getMemberId()
    if (!mid) return 0
    return orderStore.orders.filter((o) => o.memberId === mid && o.status === 'completed').length
  }

  function calc(d: Discount) {
    const mid = getMemberId()
    if (!mid) return null
    return discountStore.calcDiscount(
      d,
      subtotal.value,
      mid,
      completedCount(),
      memberTypeId(),
      categories(),
      d.discountType === 'category' ? categorySubtotal(d.categoryIds ?? []) : undefined,
    )
  }

  const eligibleAuto = computed<Discount[]>(() => {
    const mid = getMemberId()
    if (!mid) return []
    return discountStore.discounts.filter(
      (d) => d.discountType !== 'coupon' && d.isActive && !!calc(d),
    )
  })

  function redeemCoupon(code: string) {
    couponError.value = ''
    const mid = getMemberId()
    if (!mid) {
      couponError.value = '请先选择会员'
      return
    }
    const trimmed = code.trim().toUpperCase()
    if (!trimmed) return
    const res = discountStore.checkCode(trimmed, mid)
    if (!res.ok) {
      couponError.value = res.reason ?? '券码不可用'
      return
    }
    const d = discountStore.findByCode(trimmed)
    if (!d) {
      couponError.value = '券码不存在'
      return
    }
    if (applied.value.some((a) => a.id === d.id)) {
      couponError.value = '该券已添加'
      return
    }
    applied.value.push(d)
    couponInput.value = []
  }

  function dropApplied(id: string) {
    const i = applied.value.findIndex((a) => a.id === id)
    if (i < 0) return
    if (countedIds.value.has(id)) {
      const mid = getMemberId()
      if (mid) discountStore.rollbackUsage(id, mid)
      countedIds.value.delete(id)
    }
    applied.value.splice(i, 1)
  }

  function toggleAuto(d: Discount) {
    const i = applied.value.findIndex((a) => a.id === d.id)
    if (i >= 0) dropApplied(d.id)
    else applied.value.push(d)
  }

  function hydrate(records: DiscountRecord[] | undefined) {
    applied.value = []
    countedIds.value = new Set()
    for (const r of records ?? []) {
      const d = discountStore.discounts.find((x) => x.id === r.discountId)
      if (d && calc(d)) {
        applied.value.push(d)
        countedIds.value.add(d.id)
      }
    }
  }

  // 评估折扣对当前运行价格的实际贡献（用于互斥组内择优）
  function effectiveContribution(d: Discount, currentPrice: number): number {
    const r = calc(d)
    if (!r) return 0
    if (d.ruleType === 'percentage') {
      const newPrice = Math.floor((currentPrice * d.value) / 100)
      return currentPrice - newPrice
    }
    return Math.min(d.value, currentPrice)
  }

  function pickDiscounts(discounts: Discount[], currentPrice: number): Discount[] {
    const groups = new Map<string, Discount[]>()
    const noGroup: Discount[] = []
    for (const d of discounts) {
      const gs = d.exclusiveGroups ?? []
      if (gs.length) {
        for (const g of gs) {
          if (!groups.has(g)) groups.set(g, [])
          groups.get(g)!.push(d)
        }
      } else noGroup.push(d)
    }
    const picked: Discount[] = [...noGroup]
    for (const [, arr] of groups) {
      arr.sort((a, b) => effectiveContribution(b, currentPrice) - effectiveContribution(a, currentPrice))
      picked.push(arr[0]!)
    }
    return picked
  }

  const records = computed<DiscountRecord[]>(() => {
    const picked = pickDiscounts(applied.value.filter((d) => !!calc(d)), subtotal.value)
    // 应用顺序：先乘（percentage）后减（fixed），保底不低于 0
    const result: DiscountRecord[] = []
    let price = subtotal.value
    const pcts = picked.filter((d) => d.ruleType === 'percentage')
    const fixeds = picked.filter((d) => d.ruleType === 'fixed')
    for (const d of pcts) {
      const r = calc(d)
      if (!r) continue
      const newPrice = Math.floor((price * d.value) / 100)
      const amt = price - newPrice
      price = newPrice
      result.push({
        discountId: d.id,
        discountType: d.discountType,
        ruleType: d.ruleType,
        description: r.desc,
        discountAmount: amt,
      })
    }
    for (const d of fixeds) {
      const r = calc(d)
      if (!r) continue
      const amt = Math.min(d.value, price)
      price = Math.max(0, price - d.value)
      result.push({
        discountId: d.id,
        discountType: d.discountType,
        ruleType: d.ruleType,
        description: r.desc,
        discountAmount: amt,
      })
    }
    return result
  })
  // 直接按运行价格计算最终金额，保证 discountAmount + finalAmount = subtotal 始终成立
  const { discountAmount, finalAmount } = (() => {
    const _discountAmount = computed(() => {
      const picked = pickDiscounts(applied.value.filter((d) => !!calc(d)), subtotal.value)
      let price = subtotal.value
      for (const d of picked.filter((x) => x.ruleType === 'percentage')) {
        const r = calc(d)
        if (!r) continue
        price = Math.floor((price * d.value) / 100)
      }
      for (const d of picked.filter((x) => x.ruleType === 'fixed')) {
        const r = calc(d)
        if (!r) continue
        price = Math.max(0, price - d.value)
      }
      return Math.max(0, subtotal.value - price)
    })
    const _finalAmount = computed(() => Math.max(0, subtotal.value - _discountAmount.value))
    return { discountAmount: _discountAmount, finalAmount: _finalAmount }
  })()

  async function commitUsage() {
    const mid = getMemberId()
    if (!mid) return
    for (const d of applied.value) {
      if (!countedIds.value.has(d.id)) {
        await discountStore.recordUsage(d.id, mid)
        countedIds.value.add(d.id)
      }
    }
  }

  function reset() {
    applied.value = []
    countedIds.value = new Set()
    couponInput.value = []
    couponError.value = ''
  }

  return {
    applied,
    couponInput,
    couponError,
    subtotal,
    eligibleAuto,
    redeemCoupon,
    toggleAuto,
    dropApplied,
    hydrate,
    records,
    discountAmount,
    finalAmount,
    commitUsage,
    reset,
  }
}
