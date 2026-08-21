import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Discount } from './types'
import { uid, genCode } from './types'

export const useDiscountStore = defineStore('discount', () => {
  const discounts = ref<Discount[]>([])
  const activeDiscounts = computed(() => discounts.value.filter(d => d.isActive && inRange(d)))

  async function load() { discounts.value = await getAll<Discount>('discounts') }

  async function create(d: Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'>): Promise<Discount> {
    const item: Discount = {
      ...d, id: uid(), usedCount: 0, memberUsedCount: {},
      code: d.discountType === 'coupon' ? (d.code ?? genCode()) : undefined,
    }
    await add('discounts', item); discounts.value.push(item); return item
  }

  async function update(id: string, patch: Partial<Discount>): Promise<void> {
    const idx = discounts.value.findIndex(x => x.id === id)
    if (idx < 0) throw new Error('not found')
    discounts.value[idx] = { ...discounts.value[idx]!, ...patch }
    await put('discounts', discounts.value[idx]!)
  }

  async function recordUsage(id: string, memberId: string): Promise<void> {
    const idx = discounts.value.findIndex(x => x.id === id)
    if (idx < 0) throw new Error('not found')
    const cur = discounts.value[idx]!
    discounts.value[idx] = {
      ...cur,
      usedCount: cur.usedCount + 1,
      memberUsedCount: { ...cur.memberUsedCount, [memberId]: (cur.memberUsedCount[memberId] ?? 0) + 1 },
    }
    await put('discounts', discounts.value[idx]!)
  }

  async function remove(id: string): Promise<void> {
    discounts.value = discounts.value.filter(x => x.id !== id)
    await del('discounts', id)
  }

  function findByCode(code: string): Discount | undefined {
    return discounts.value.find(d => d.code?.toUpperCase() === code.toUpperCase())
  }

  function isValidCode(code: string): boolean {
    const d = findByCode(code.toUpperCase())
    return !!d && d.isActive && inRange(d) && (d.usageLimit === null || d.usedCount < d.usageLimit)
  }

  function calcDiscount(d: Discount, subtotal: number, memberId: string, completedCount: number): { desc: string; amount: number } | null {
    if (!d.isActive || !inRange(d) || subtotal < d.minAmount) return null
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return null
    if (d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit) return null
    if (d.discountType === 'firstOrder' && completedCount > 0) return null
    if (d.discountType === 'repeatOrder' && completedCount < (d.repeatThreshold ?? 1)) return null
    const amount = d.ruleType === 'percentage'
      ? Math.min(Math.floor(subtotal * d.value / 100), d.maxDiscount ?? Infinity)
      : Math.min(d.value, subtotal)
    const desc = d.ruleType === 'percentage'
      ? `满${cents(d.minAmount)}打${d.value}折`
      : `满${cents(d.minAmount)}减${cents(d.value)}`
    return { desc, amount }
  }

  return { discounts, activeDiscounts, load, create, update, recordUsage, remove, findByCode, isValidCode, calcDiscount }
})

function inRange(d: Discount): boolean {
  const now = Date.now()
  // 空字符串视为不限制（永久有效）
  if (d.validFrom && now < Date.parse(d.validFrom)) return false
  if (d.validUntil && now > Date.parse(d.validUntil)) return false
  return true
}
function cents(c: number): string { return (c / 100).toFixed(0) }
