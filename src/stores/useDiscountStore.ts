import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Discount } from './types'
import { uid, genCode, isValidCodeFormat, CODE_LENGTH } from './types'

export const useDiscountStore = defineStore('discount', () => {
  const discounts = ref<Discount[]>([])
  const activeDiscounts = computed(() => discounts.value.filter((d) => d.isActive && inRange(d)))

  async function load() {
    const raw = (await getAll<Discount>('discounts')) as (Discount & { exclusiveGroup?: string })[]
    // 兼容旧数据：单值 exclusiveGroup 字符串迁移为 exclusiveGroups 数组
    discounts.value = raw.map((d) => {
      if (d.exclusiveGroup && (!d.exclusiveGroups || d.exclusiveGroups.length === 0)) {
        return { ...d, exclusiveGroups: [d.exclusiveGroup] }
      }
      return d
    })
  }

  async function create(
    d: Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'>,
  ): Promise<Discount> {
    let code: string | undefined
    if (d.discountType === 'coupon') {
      if (d.code && d.code.trim()) {
        if (!isValidCodeFormat(d.code.toUpperCase())) {
          throw new Error(`券码必须为 ${CODE_LENGTH} 位字母或数字`)
        }
        code = d.code.toUpperCase()
      } else {
        code = genCode()
      }
    }
    const item: Discount = {
      ...d,
      id: uid(),
      usedCount: 0,
      memberUsedCount: {},
      code,
    }
    await add('discounts', item)
    discounts.value.push(item)
    return item
  }

  async function update(id: string, patch: Partial<Discount>): Promise<void> {
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...discounts.value[idx]!, ...patch }
    // 编辑时若改为券码类型且手动填写了券码，需校验位数
    if (next.discountType === 'coupon' && next.code && !isValidCodeFormat(next.code.toUpperCase())) {
      throw new Error(`券码必须为 ${CODE_LENGTH} 位字母或数字`)
    }
    discounts.value[idx] = next
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

  // 删除互斥组时，从所有优惠里移除该组归属（级联清理）
  async function removeExclusiveGroupRef(groupId: string): Promise<void> {
    for (const d of discounts.value) {
      if (d.exclusiveGroups && d.exclusiveGroups.includes(groupId)) {
        const next = {
          ...d,
          exclusiveGroups: d.exclusiveGroups.filter((g) => g !== groupId),
        }
        await put('discounts', next)
      }
    }
    discounts.value = discounts.value.map((d) =>
      d.exclusiveGroups && d.exclusiveGroups.includes(groupId)
        ? { ...d, exclusiveGroups: d.exclusiveGroups.filter((g) => g !== groupId) }
        : d,
    )
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

  // 优惠当前状态：停用 / 过期 / 已达上限 / 可用
  function discountStatus(
    d: Discount,
    memberId?: string,
  ): 'active' | 'expired' | 'disabled' | 'exhausted' {
    if (!d.isActive) return 'disabled'
    if (!inRange(d)) return 'expired'
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return 'exhausted'
    if (memberId && d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit)
      return 'exhausted'
    return 'active'
  }
  // 优惠当前是否仍可使用（重新打开订单时用于校验）
  function isUsable(d: Discount, memberId?: string): boolean {
    return discountStatus(d, memberId) === 'active'
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
    categories?: string[],
  ): { desc: string; amount: number } | null {
    if (!d.isActive || !inRange(d) || subtotal < d.minAmount) return null
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return null
    if (d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit) return null
    if (d.discountType === 'member') {
      if (!d.memberTypeIds || d.memberTypeIds.length === 0) return null
      if (!memberTypeId || !d.memberTypeIds.includes(memberTypeId)) return null
    }
    if (d.discountType === 'category') {
      const cats = d.categoryIds ?? []
      if (!cats.length) return null
      // 仅当订单包含命中的品类时才生效
      if (!categories || !categories.some((c) => cats.includes(c))) return null
    }
    if (d.discountType === 'firstOrder' && completedCount > 0) return null
    if (d.discountType === 'repeatOrder' && completedCount < (d.repeatThreshold ?? 1)) return null
    const amount =
      d.ruleType === 'percentage'
        ? // 乘法打折：value 为「折率百分比」（如 90 = 打 9 折，实付 90%）
          Math.min(subtotal - Math.floor((subtotal * d.value) / 100), d.maxDiscount ?? Infinity)
        : // 减法：直接减固定金额（分）
          Math.min(d.value, subtotal)
    let desc =
      d.ruleType === 'percentage'
        ? `满${cents(d.minAmount)}打${(d.value / 10).toString()}折`
        : `满${cents(d.minAmount)}减${cents(d.value)}`
    if (d.discountType === 'category' && d.categoryIds && d.categoryIds.length) {
      desc += `（限${d.categoryIds.join('/')}）`
    }
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
    removeExclusiveGroupRef,
    findByCode,
    isValidCode,
    checkCode,
    calcDiscount,
    discountStatus,
    isUsable,
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
