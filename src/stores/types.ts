/** 业务类型 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  return 'id-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10)
}
export function now(): string { return new Date().toISOString() }
export function fmt(cents: number): string { return (cents / 100).toFixed(2) }
export function genCode(): string {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  return Array.from({ length: 6 }, () => c[Math.floor(Math.random() * c.length)]).join('')
}

/* ── 会员 ── */
export interface Member {
  id: string; name: string; phone?: string;
  joinDate: string; tags: string[]; referrerId?: string; notes?: string
}

/* ── 会员种类（完全自定义）── */
export interface MemberType {
  id: string; name: string
}

/* ── 价格条目 ── */
export type PricingMode = 'hourly' | 'perPiece'
export interface PriceEntry {
  id: string; name: string; category: string;
  pricingMode: PricingMode; basePrice: number; description?: string; isActive: boolean
}

/* ── 订单 ── */
export interface OrderItem {
  priceEntryId: string; serviceName: string; pricingMode: PricingMode;
  quantity: number; unitPrice: number
  elapsed?: number   // 累计秒数（工时项目）
  hourlyRate?: number // 每小时的金额（分），用于展示
}
export interface DiscountRecord {
  discountId: string; discountType: string; ruleType: string;
  description: string; discountAmount: number
}
export type OrderStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled'
export type PaymentMethod = 'cash' | 'wechat' | 'alipay' | 'transfer'
export interface Order {
  id: string; memberId: string; memberName: string; items: OrderItem[]
  subtotal: number; discountRecords: DiscountRecord[]
  discountAmount: number; finalAmount: number
  status: OrderStatus; paymentMethod?: PaymentMethod
  createdAt: string; completedAt?: string; notes?: string
}

/* ── 优惠 ── */
export type DiscountType = 'coupon' | 'timeLimited' | 'member' | 'firstOrder' | 'repeatOrder' | 'referral'
export type RuleType = 'fixed' | 'percentage'
export interface Discount {
  id: string; name: string; discountType: DiscountType; ruleType: RuleType
  value: number; minAmount: number; maxDiscount?: number
  code?: string; validFrom: string; validUntil: string
  usageLimit: number | null; usedCount: number
  memberLimit: number | null; memberUsedCount: Record<string, number>
  repeatThreshold?: number; referrerMemberId?: string
  isActive: boolean
}
