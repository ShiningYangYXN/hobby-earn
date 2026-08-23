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
    let next = { ...discounts.value[idx]!, ...patch }
    // 编辑时若改为券码类型且手动填写了券码，需校验位数并统一大写
    if (next.discountType === 'coupon') {
      if (next.code && next.code.trim()) {
        if (!isValidCodeFormat(next.code.toUpperCase())) {
          throw new Error(`券码必须为 ${CODE_LENGTH} 位字母或数字`)
        }
        next = { ...next, code: next.code.toUpperCase() }
      } else {
        next = { ...next, code: undefined }
      }
    }
    await put('discounts', next)
    discounts.value[idx] = next
  }

  async function recordUsage(id: string, memberId: string): Promise<void> {
    const idx = discounts.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const cur = discounts.value[idx]!
    const next = {
      ...cur,
      usedCount: cur.usedCount + 1,
      memberUsedCount: {
        ...cur.memberUsedCount,
        [memberId]: (cur.memberUsedCount[memberId] ?? 0) + 1,
      },
    }
    await put('discounts', next)
    discounts.value[idx] = next
  }

  async function remove(id: string): Promise<void> {
    await del('discounts', id)
    discounts.value = discounts.value.filter((x) => x.id !== id)
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
    const next = {
      ...cur,
      usedCount: Math.max(0, cur.usedCount - 1),
      memberUsedCount: { ...cur.memberUsedCount, [memberId]: Math.max(0, m) },
    }
    await put('discounts', next)
    discounts.value[idx] = next
  }

  // 优惠当前状态：停用 / 未开始 / 过期 / 已达上限 / 可用
  function discountStatus(
    d: Discount,
    memberId?: string,
  ): 'active' | 'expired' | 'disabled' | 'exhausted' | 'upcoming' {
    if (!d.isActive) return 'disabled'
    const now = Date.now()
    // 未开始：设置了开始时间且尚未到达（结束时间用于「过期」判定）
    if (d.validFrom && now < Date.parse(d.validFrom)) return 'upcoming'
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
    if (!d) return false
    const st = discountStatus(d)
    return st === 'active' || st === 'upcoming'
  }

  // 详细校验券码可用性（含每人上限），用于兑换时拦截超兑
  function checkCode(code: string, memberId?: string): { ok: boolean; reason?: string } {
    const d = findByCode(code.toUpperCase())
    if (!d) return { ok: false, reason: '券码不存在' }
    if (!d.isActive) return { ok: false, reason: '券码已停用' }
    if (!inRange(d)) return { ok: false, reason: '券码已过期' }
    if (d.validFrom && Date.now() < Date.parse(d.validFrom))
      return { ok: false, reason: '券码未到使用时间' }
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
    categoryAmount?: number,
    itemIds?: string[],
    itemAmount?: number,
  ): { desc: string; amount: number } | null {
    if (!d.isActive) return null
    // 自定义/通用优惠：validFrom 之前视为未开始，不生效
    if (d.validFrom && Date.now() < Date.parse(d.validFrom)) return null
    if (!inRange(d)) return null
    if (subtotal < (d.minAmount ?? 0)) return null
    if (d.usageLimit !== null && d.usedCount >= d.usageLimit) return null
    if (d.memberLimit !== null && (d.memberUsedCount[memberId] ?? 0) >= d.memberLimit) return null
    if (d.discountType === 'member') {
      if (!d.memberTypeIds || d.memberTypeIds.length === 0) return null
      if (!memberTypeId || !d.memberTypeIds.includes(memberTypeId)) return null
    }
    if (d.discountType === 'category') {
      const cats = d.categoryIds ?? []
      if (!cats.length) return null
      if (!categories || !categories.some((c) => cats.includes(c))) return null
    }
    if (d.discountType === 'item') {
      const ids = d.itemIds ?? []
      if (!ids.length) return null
      if (!itemIds || !itemIds.some((i) => ids.includes(i))) return null
    }
    // 自定义模板下，categoryIds/itemIds 同样用来限定生效范围（不限定时作用于全单）
    if (d.discountType === 'custom') {
      if (d.categoryIds && d.categoryIds.length) {
        if (!categories || !categories.some((c) => d.categoryIds!.includes(c))) return null
      }
      if (d.itemIds && d.itemIds.length) {
        if (!itemIds || !itemIds.some((i) => d.itemIds!.includes(i))) return null
      }
    }
    if (d.discountType === 'firstOrder' && completedCount > 0) return null
    // 累次优惠：仅在第 N、2N、3N...单时生效（如 threshold=5：第5单、第10单、第15单…）
    if (d.discountType === 'repeatOrder') {
      const threshold = d.repeatThreshold ?? 1
      if (threshold < 1 || completedCount % threshold !== threshold - 1) return null
    }
    // 专属优惠：仅限指定会员可用
    if (d.discountType === 'exclusive') {
      if (!d.memberIds || d.memberIds.length === 0) return null
      if (!d.memberIds.includes(memberId)) return null
    }
    // 周期优惠：按周期维度判断是否当天生效
    if (d.discountType === 'periodic' && !matchesPeriod(d)) return null
    // 品类/单品优惠：只对命中分类/单品的订单项金额计算折扣
    let baseAmount = subtotal
    if (d.discountType === 'category') {
      baseAmount = categoryAmount !== undefined ? categoryAmount : 0
    } else if (d.discountType === 'item') {
      baseAmount = itemAmount !== undefined ? itemAmount : 0
    } else if (d.discountType === 'custom') {
      if (d.categoryIds && d.categoryIds.length && categoryAmount !== undefined)
        baseAmount = categoryAmount
      else if (d.itemIds && d.itemIds.length && itemAmount !== undefined)
        baseAmount = itemAmount
    }
    let amount: number
    let desc: string
    if (d.ruleType === 'percentage') {
      // 乘法打折：value 为「折率百分比」（如 90 = 打 9 折，实付 90%），受最大减免上限约束
      amount = Math.min(
        baseAmount - Math.floor((baseAmount * d.value) / 100),
        d.maxDiscount ?? Infinity,
      )
      desc = `满${cents(d.minAmount)}打${(d.value / 10).toString()}折`
    } else if (d.ruleType === 'stepDown') {
      // 每满减：每满 minAmount 减 value，封顶为 floor(baseAmount/minAmount) 档
      const steps = d.minAmount > 0 ? Math.floor(baseAmount / d.minAmount) : 0
      amount = Math.min(steps * d.value, d.maxDiscount ?? Infinity)
      desc = `每满${cents(d.minAmount)}减${cents(d.value)}（共${steps}档）`
    } else {
      // 满减：直接减固定金额（分）。满减的优惠上限无意义，故不约束
      amount = Math.min(d.value, baseAmount)
      desc = `满${cents(d.minAmount)}减${cents(d.value)}`
    }
    if (d.discountType === 'category' && d.categoryIds && d.categoryIds.length) {
      desc += `（限${d.categoryIds.join('/')}）`
    }
    if (d.discountType === 'item' && d.itemIds && d.itemIds.length) {
      desc += `（限单品）`
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
  // validFrom 仅用于表示「未开始」(upcoming)，不在此处拦截
  if (d.validUntil && now > Date.parse(d.validUntil)) return false
  return true
}
// 周期优惠：按周期维度判断是否当天生效
function matchesPeriod(d: Discount): boolean {
  const t = d.periodType
  if (!t || t === 'daily') return true
  // cron 表达式（魔改，5 字段：分 时 日 月 周），支持 * / 列表 / 区间
  if (t === 'cron') return d.cronExpr ? matchCron(d.cronExpr, new Date()) : false
  const now = new Date()
  if (t === 'weekly') {
    const day = now.getDay() // 0=周日 .. 6=周六
    return (d.periodValues ?? []).includes(day)
  }
  if (t === 'monthly') {
    const date = now.getDate() // 1..31
    return (d.periodValues ?? []).includes(date)
  }
  return true
}
// 魔改 cron：5 字段 [分 时 日 月 周]，支持 *、数字、逗号列表(1,2,5)、区间(9-18)
function matchCron(expr: string, date: Date): boolean {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return false
  const vals = [
    date.getMinutes(),
    date.getHours(),
    date.getDate(),
    date.getMonth() + 1,
    date.getDay(),
  ]
  return parts.every((p, i) => matchField(p, vals[i]!))
}
function matchField(field: string, val: number): boolean {
  if (field === '*') return true
  return field.split(',').every((seg) => {
    if (seg.includes('-')) {
      const parts = seg.split('-').map((x) => Number(x))
      const a = parts[0]
      const b = parts[1]
      if (a === undefined || b === undefined || Number.isNaN(a) || Number.isNaN(b)) return false
      return val >= a && val <= b
    }
    const n = Number(seg)
    return !Number.isNaN(n) && val === n
  })
}
function cents(c: number): string {
  return (c / 100).toFixed(2)
}
