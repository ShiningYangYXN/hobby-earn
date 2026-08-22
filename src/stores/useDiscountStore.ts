import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Discount } from './types'
import { uid, genCode } from './types'

export const useDiscountStore = defineStore('discount', () => {
  const discounts = ref<Discount[]>([])
  const activeDiscounts = computed(() => discounts.value.filter((d) => d.isActive && inRange(d)))

  async function load() {
    discounts.value = await getAll<Discount>('discounts')
  }

  async function create(
    d: Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'>,
  ): Promise<Discount> {
    const item: Discount = {
      ...d,
      id: uid(),
      usedCount: 0,
      memberUsedCount: {},
      code:
        d.discountType === 'coupon'
          ? d.code && d.code.trim()
            ? d.code.toUpperCase()
            : genCode()
          : undefined,
    }
    await add('discounts', item)
    discounts.value.push(item)
    return item
  }

  async function update(id: string, patch: Partial<Discount>): Promise<void> {
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    discounts.value[idx] = { ...discounts.value[idx]!, ...patch }
    await put('discounts', discounts.value[idx]!)
  }

  async function recordUsage(id: string, memberId: string): Promise<void> {
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const cur = discounts.value[idx]!
    discounts.value[idx] = {
      ...cur,
      usedCount: cur.usedCount + 1,
      memberUsedCount: {
        ...cur.memberUsedCount,
        [memberId]: (cur.memberUsedCount[memberId] ?? 0) + 1,
      },
    }
    await put('discounts', discounts.value[idx]!)
  }

  async function remove(id: string): Promise<void> {
    discounts.value = discounts.value.filter((x) => x.id !== id)
    await del('discounts', id)
  }

  // 订单取消时回滚用量（防止已用券码被永久占用）
  async function rollbackUsage(id: string, memberId: string): Promise<void> {
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) return
    const cur = discounts.value[idx]!
    const m = (cur.memberUsedCount[memberId] ?? 0) - 1
    discounts.value[idx] = {
      ...cur,
      usedCount: Math.max(0, cur.usedCount - 1),
      memberUsedCount: { ...cur.memberUsedCount, [memberId]: Math.max(0, m) },
    }
    await put('discounts', discounts.value[idx]!)
  }

  function findByCode(code: string): Discount | undefined {
    return discounts.value.find((d) => d.code?.toUpperCase() === code.toUpperCase())
  }

  function isValidCode(code: string): boolean {
    const d = findByCode(code.toUpperCase())
    return !!d && d.isActive && inRange(d) && (d.usageLimit === null || d.usedCount < d.usageLimit)
  }

  // 详细校验券码可用性（含每人上限），用于兑换时拦截超兑
  function checkCode(code: string, memberId?: string): { ok: boolean; reason?: string } {
    const d = findByCode(code.toUpperCase())
    if (!d) return { ok: false, reason: '券码不存在' }
    if (!d.isActive) return { ok: false, reason: '券码已停用' }
    if (!inRange(d)) return { ok: false, reason: '券码已过期' }
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit)
      return { ok: false, reason: '券码已达使用上限' }
    if (memberId && d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit)
      return { ok: false, reason: '您已使用过该券' }
    return { ok: true }
  }

  function calcDiscount(
    d: Discount,
    subtotal: number,
    memberId: string,
    completedCount: number,
    memberTypeId?: string,
  ): { desc: string; amount: number } | null {
    if (!d.isActive || !inRange(d) || subtotal < d.minAmount) return null
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return null
    if (d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit) return null
    if (d.discountType === 'member') {
      if (!d.memberTypeIds || d.memberTypeIds.length === 0) return null
      if (!memberTypeId || !d.memberTypeIds.includes(memberTypeId)) return null
    }
    if (d.discountType === 'firstOrder' && completedCount > 0) return null
    if (d.discountType === 'repeatOrder' && completedCount < (d.repeatThreshold ?? 1)) return null
    const amount =
      d.ruleType === 'percentage'
        ? Math.min(Math.floor((subtotal * d.value) / 100), d.maxDiscount ?? Infinity)
        : Math.min(d.value, subtotal)
    const desc =
      d.ruleType === 'percentage'
        ? `满${cents(d.minAmount)}打${d.value}折`
        : `满${cents(d.minAmount)}减${cents(d.value)}`
    return { desc, amount }
  }

  return {
    discounts,
    activeDiscounts,
    load,
    create,
    update,
    recordUsage,
    rollbackUsage,
    remove,
    findByCode,
    isValidCode,
    checkCode,
    calcDiscount,
  }
})

function inRange(d: Discount): boolean {
  const now = Date.now()
  // 空字符串视为不限制（永久有效）
  if (d.validFrom && now < Date.parse(d.validFrom)) return false
  if (d.validUntil && now > Date.parse(d.validUntil)) return false
  return true
}
function cents(c: number): string {
  return (c / 100).toFixed(0)
}
