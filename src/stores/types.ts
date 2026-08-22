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

/* ── 价格条目 ── */
export type PricingMode = 'hourly' | 'perPiece'
export interface PriceEntry {
  id: string
  name: string
  category: string
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

/* ── 优惠 ── */
export type DiscountType =
  | 'coupon'
  | 'timeLimited'
  | 'member'
  | 'firstOrder'
  | 'repeatOrder'
  | 'category'
export type RuleType = 'fixed' | 'percentage'
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
  memberTypeIds?: string[]
  categoryIds?: string[] // 品类优惠：仅对命中分类的订单项生效
  exclusiveGroups?: string[] // 互斥组（多选）：归属同一组的优惠只生效减免最大者
  isActive: boolean
}
