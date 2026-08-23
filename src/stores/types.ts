/** 业务类型 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
export function now(): string {
  return new Date().toISOString()
}
export function fmt(cents: number): string {
  return (cents / 100).toFixed(2)
}
export function fmtElapsed(s: number): string {
  const m = Math.floor(s / 60)
  const sec = s % 60
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
}
export const CODE_LENGTH = 6
export function genCode(): string {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'
  return Array.from({ length: CODE_LENGTH }, () => c[Math.floor(Math.random() * c.length)]).join('')
}
// 校验券码格式：必须为 CODE_LENGTH 位大写字母或数字
export function isValidCodeFormat(code: string): boolean {
  const re = new RegExp(`^[A-Z0-9]{${CODE_LENGTH}}$`)
  return re.test(code)
}

// 单个订单项的金额：工时项仅按已计时长计费，未计时为 0（不回落到 unitPrice*quantity）
export function itemAmount(i: OrderItem): number {
  if (i.pricingMode === 'hourly') {
    return i.elapsed ? Math.round(((i.hourlyRate ?? i.unitPrice) / 3600) * i.elapsed) : 0
  }
  return i.unitPrice * i.quantity
}
export function subtotalOf(items: OrderItem[]): number {
  return items.reduce((s, i) => s + itemAmount(i), 0)
}

/* ── 会员 ── */
export interface Member {
  id: string
  name: string
  phone?: string
  joinDate: string
  notes?: string
  typeId?: string
  isActive: boolean
}

/* ── 会员种类（完全自定义）── */
export interface MemberType {
  id: string
  name: string
}

/* ── 服务分类（独立管理，可多选）── */
export interface Category {
  id: string
  name: string
}

/* ── 价格条目 ── */
export type PricingMode = 'hourly' | 'perPiece'
export interface PriceEntry {
  id: string
  name: string
  categoryIds: string[] // 可归属多个分类
  pricingMode: PricingMode
  basePrice: number
  description?: string
  isActive: boolean
}

/* ── 订单 ── */
export interface OrderItem {
  priceEntryId: string
  serviceName: string
  pricingMode: PricingMode
  quantity: number
  unitPrice: number
  elapsed?: number // 累计秒数（工时项目）
  hourlyRate?: number // 每小时的金额（分），用于展示
}
export interface DiscountRecord {
  discountId: string
  discountType: string
  ruleType: string
  description: string
  discountAmount: number
}
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'closed'
export type PaymentMethod = 'cash' | 'ecny' | 'unionpay' | 'wechat' | 'alipay'
export interface Order {
  id: string
  memberId: string
  memberName: string
  items: OrderItem[]
  subtotal: number
  discountRecords: DiscountRecord[]
  discountAmount: number
  finalAmount: number
  status: OrderStatus
  paymentMethod?: PaymentMethod
  createdAt: string
  completedAt?: string
  notes?: string
}

/* ── 互斥组（独立管理，优惠可多选归属）── */
export interface ExclusiveGroup {
  id: string
  name: string
}

/* ── 上限组（组内优惠可叠加，但合计不得超过组上限）── */
export interface DiscountLimitGroup {
  id: string
  name: string
  limitType: 'amount' | 'ratio' // amount=定值（分）；ratio=比例（百分比 0-100）
  limit: number // amount 时为分；ratio 时为百分比
  scope: 'all' | 'items' | 'categories' // 计算上限的基准范围
  itemIds?: string[] // scope=items 时生效
  categoryIds?: string[] // scope=categories 时生效
}

/* ── 优惠 ── */
export const discountTypeLabel: Record<string, string> = {
  coupon: '优惠券',
  timeLimited: '限时优惠',
  member: '会员折扣',
  firstOrder: '首单优惠',
  repeatOrder: '复购优惠',
  category: '品类优惠',
  exclusive: '专属优惠',
  periodic: '周期优惠',
  item: '单品优惠',
  custom: '自定义',
}
export type DiscountType =
  | 'coupon'
  | 'timeLimited'
  | 'member'
  | 'firstOrder'
  | 'repeatOrder'
  | 'category'
  | 'exclusive'
  | 'periodic'
  | 'item'
  | 'custom'

// 周期生效维度：daily 每日 / weekly 按星期 / monthly 按日期 / cron 表达式
export type PeriodType = 'daily' | 'weekly' | 'monthly' | 'cron'

export function discountTypeLabelOf(t: string): string {
  return discountTypeLabel[t] ?? t
}

export const ruleTypeLabel: Record<string, string> = {
  fixed: '满减',
  percentage: '打折',
  stepDown: '每满减',
}
export type RuleType = 'fixed' | 'percentage' | 'stepDown'

export function ruleTypeLabelOf(t: string): string {
  return ruleTypeLabel[t] ?? t
}
export interface Discount {
  id: string
  name: string
  discountType: DiscountType
  ruleType: RuleType
  value: number
  minAmount: number
  maxDiscount?: number
  code?: string
  validFrom: string
  validUntil: string
  usageLimit: number | null
  usedCount: number
  memberLimit: number | null
  memberUsedCount: Record<string, number>
  repeatThreshold?: number
  memberTypeIds?: string[] // 会员类型限定（member 类型 / 自定义）
  categoryIds?: string[] // 品类优惠：仅对命中分类的订单项生效
  itemIds?: string[] // 单品优惠：指定具体价格项参与
  exclusiveGroups?: string[] // 互斥组（多选）：归属同一组的优惠只生效减免最大者
  limitGroupId?: string // 上限组：组内优惠可叠加但合计受组上限约束
  // 专属优惠：限定可使用的会员
  memberIds?: string[]
  // 周期优惠：按周期生效
  periodType?: PeriodType
  periodValues?: number[] // weekly: 0-6（周日-周六）；monthly: 1-31
  cronExpr?: string // periodType=cron 时的 cron 表达式（5 字段，参考 cron 规则）
  isActive: boolean
}
