// ============================================================
// 金额单位：分（避免浮点精度问题）
// ============================================================

// ============================================================
// 会员 / 会员类型
// ============================================================
export interface Member {
  id: string
  name: string
  phone?: string
  remark?: string
  isActive?: boolean // 是否启用（false=停用）；缺省视为启用
  joinDate?: string // 入会时间（ISO 字符串，由 now() 生成）
  notes?: string // 备注
  typeIds?: string[] // 所属会员类型 id 集合
}

export interface MemberType {
  id: string
  name: string
  remark?: string
}

// ============================================================
// 分类 / 价格项
// ============================================================
export interface Category {
  id: string
  name: string
  remark?: string
}

export type PricingMode = 'hourly' | 'perPiece'

export interface PriceEntry {
  id: string
  name: string
  isActive: boolean
  remark?: string
  description?: string // 价格项描述 / 备注说明
  pricingMode: PricingMode
  basePrice: number
  categoryIds: string[]
}

// ============================================================
// 优惠系统 —— 完全解耦的「指标组合」模型
//
// 一个优惠由以下相互独立的指标自由组合而成：
//   1. ruleType        优惠执行方式（fixed 满减 / percentage 打折 / stepDown 每满减 / perItem 件件减）
//   2. scope           作用域指标（会员类型 / 指定会员 / 时段 / 品类 / 单品），可多选自由组合
//   3. random          随机指标（随机立减 / 随机打折），范围随机，捕获后固化
//   4. period          周期指标（并入「指定时段」，用 cron 表达式灵活控制生效窗口）
//   5. triggerChance   随机触发指标（按概率触发，仅自动优惠生效）
//   6. couponCode      券码开关（附加到任意优惠；非空=需手动兑换，且不得自动触发；
//                          空=自动触发）。触发方式完全由券码是否非空推导，无需单独字段。
// ============================================================

/** 优惠执行方式 */
export type RuleType = 'fixed' | 'percentage' | 'stepDown' | 'perItem'

/** 作用域指标键 */
export type ScopeKey = 'memberTypes' | 'members' | 'timeWindow' | 'categories' | 'items'

/** 作用域对象：每个维度可选，全部命中才生效；省略即不限 */
export interface DiscountScope {
  memberTypeIds?: string[] // 指定会员类型可用（满足其一）
  memberIds?: string[] // 指定会员可用（满足其一）
  categories?: string[] // 指定品类可用（订单含其一即命中）
  items?: string[] // 指定单品可用（订单含其一即命中）
  timeWindow?: TimeWindow // 指定时段可用
}

/** 指定时段（含周期） */
export interface TimeWindow {
  validFrom?: string // ISO，空=不限开始
  validUntil?: string // ISO，空=不限结束
  /** 周期表达式：魔改 5 字段「分 时 日 月 周」；空=仅受 validFrom/Until 限制 */
  cron?: string
}

/** 随机指标 */
export interface RandomConfig {
  kind: 'amount' | 'ratio' // 随机立减 / 随机打折
  min: number // amount: 分；ratio: 下限（0-100）
  max: number // amount: 分；ratio: 上限（0-100）
}

// —— 标签常量（供 UI 复用） ——
export const ruleTypeLabel: Record<RuleType, string> = {
  fixed: '满减',
  percentage: '打折',
  stepDown: '每满减',
  perItem: '件件减',
}
export const scopeKeyLabel: Record<ScopeKey, string> = {
  memberTypes: '指定会员类型',
  members: '指定会员',
  timeWindow: '指定时段',
  categories: '指定品类',
  items: '指定单品',
}

export function ruleTypeLabelOf(t: RuleType): string {
  return ruleTypeLabel[t]
}
export function scopeKeyLabelOf(k: ScopeKey): string {
  return scopeKeyLabel[k]
}

/**
 * 折扣力度(0-100，表示乘客支付的比例) 按高铁规则显示为折数：
 *   88 -> 8.8折，85 -> 8.5折，90 -> 9折，100 -> 不打折
 * 用于非管理页（下单/结算/订单详情等面向用户的场景）。
 */
export function formatZhe(value: number): string {
  if (value >= 100) return '不打折'
  const zhe = value / 10
  const s = Number.isInteger(zhe) ? String(zhe) : zhe.toFixed(1)
  return `${s}折`
}

/** 触发方式完全由券码推导：有券码=需手动兑换，无券码=自动 */
export function isCouponRequired(d: Discount): boolean {
  return !!d.couponCode
}

export interface Discount {
  id: string
  name: string
  isActive: boolean
  remark?: string

  // —— 优惠执行方式 ——
  ruleType: RuleType
  value: number // fixed: 减免金额(分)；percentage: 折扣力度(0-100，如 85=打8.5折)；stepDown: 每阶梯减免(分)；perItem: 每件立减金额(分)
  minAmount: number // 满减/打折门槛(分)；stepDown: 每满金额(分)；perItem: 不适用（按件计，无门槛）
  maxDiscount?: number // 最大减免封顶(分)，仅 percentage/stepDown/perItem 有意义；random.amount 时也作封顶
  maxUnits?: number // 最大执行件数/阶梯数：perItem 限制立减件数，stepDown 限制生效阶梯数；留空=不限

  // —— 作用域指标（省略即不限） ——
  scope?: DiscountScope

  // —— 随机指标（可选） ——
  random?: RandomConfig

  // —— 随机触发指标（可选，仅自动优惠生效） ——
  triggerChance?: number // 0-100 概率；存在且 <100 时按概率触发

  // —— 券码（附加开关） ——
  couponCode?: string // 例如 'AB12CD'；非空=需手动兑换且不得自动触发；空=自动触发

  // —— 用量控制 ——
  usageLimit?: number // 总可用次数；0/undefined=不限
  usedCount: number
  memberLimit?: number // 每会员限用次数；0/undefined=不限
  memberUsed?: Record<string, number> // 各会员已用次数

  // —— 生效上限组 ——
  limitGroups?: string[] // 关联的 DiscountLimitGroup.id

  // —— 互斥组 ——
  exclusiveGroupId?: string | null

  createdAt: number
}

/** 给定优惠是否带有券码开关 */
export function hasCouponCode(d: Discount): boolean {
  return !!d.couponCode
}

// ============================================================
// 互斥组 / 上限组
// ============================================================
export interface ExclusiveGroup {
  id: string
  name: string
  discountIds: string[]
  remark?: string
}
export interface DiscountLimitGroup {
  id: string
  name: string
  limitType: 'amount' | 'ratio' // 金额封顶 / 比例封顶
  limitValue: number // amount: 分；ratio: 0-100
  scope: 'all' | 'items' | 'categories' // 封顶作用范围
  itemIds?: string[] // scope=items 时的单品集合
  categoryIds?: string[] // scope=categories 时的品类集合
  discountIds: string[]
  remark?: string
}

// ============================================================
// 订单 / 订单项 / 优惠记录
// ============================================================
export type OrderStatus = 'pending' | 'in_progress' | 'completed' | 'closed'

export interface OrderItem {
  priceEntryId: string
  serviceName: string
  pricingMode: PricingMode
  quantity: number
  unitPrice: number
  hourlyRate?: number
  elapsed?: number
}

export interface FeeLine {
  name: string
  amount: number
}

/**
 * 优惠记录：订单一旦「捕获」某优惠，其资格与数额在此刻固化，
 * 之后无论优惠定义如何变化（如随机范围调整、停用、过期），
 * 已落库的记录都不再改变。
 */
export interface DiscountRecord {
  discountId: string
  name: string // 捕获时固化的优惠名称
  ruleType: RuleType
  discountAmount: number // 实际减免（分），随机优惠在此固化

  // 捕获时固化的作用域快照（用于展示「为何命中」）
  scopeSnapshot?: DiscountScope
  randomSnapshot?: RandomConfig
  triggerChanceSnapshot?: number
  couponCodeSnapshot?: string

  // 用于互斥/上限组反查
  exclusiveGroupId?: string | null
  limitGroups?: string[]

  // 随机数额类：停表/下单抽取后固化的实际捕获值（amount=分；ratio=0-100 百分比）
  capturedRandom?: number
  // 随机触发类：下单时固化的「优惠资格」是否命中（true=生效，false=未触发，undefined=非随机）
  triggered?: boolean
}

export interface Order {
  id: string
  createdAt: string // 创建时间（ISO 字符串，由 now() 生成）
  updatedAt: string // 最近更新时间（ISO 字符串）
  completedAt?: string // 完成时间（ISO 字符串，由 now() 生成）；缺省=未完成
  status: OrderStatus
  memberId: string | null
  memberName: string
  items: OrderItem[]
  discountRecords: DiscountRecord[]
  discountAmount: number
  finalAmount: number
  subtotal: number
  fees?: FeeLine[]
  feeAmount?: number
  paymentMethod?: PaymentMethod
  notes?: string
  couponCode?: string
}

export type PaymentMethod = 'cash' | 'ecny' | 'unionpay' | 'wechat' | 'alipay'

export const paymentMethodLabel: Record<PaymentMethod, string> = {
  cash: '现金',
  ecny: '数字人民币',
  unionpay: '云闪付',
  wechat: '微信',
  alipay: '支付宝',
}

// ============================================================
// 通用标签
// ============================================================
export const orderStatusLabel: Record<OrderStatus, string> = {
  pending: '待处理',
  in_progress: '执行中',
  completed: '已完成',
  closed: '已关闭',
}

// ============================================================
// 工具函数
// ============================================================
export function itemAmount(it: OrderItem): number {
  // 工时计费：按已计时长（秒）* 时薪（分/小时）换算，无视 quantity
  if (it.pricingMode === 'hourly') {
    const rate = it.hourlyRate ?? it.unitPrice ?? 0
    return Math.round(((it.elapsed ?? 0) / 3600) * rate)
  }
  return Math.round((it.quantity || 0) * (it.unitPrice || 0))
}

export function fmt(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}¥${(abs / 100).toFixed(2)}`
}

export function fmtElapsed(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const pad = (n: number) => String(n).padStart(2, '0')
  if (h > 0) return `${pad(h)}:${pad(m)}:${pad(s)}`
  return `${pad(m)}:${pad(s)}`
}

export function categorySubtotal(items: OrderItem[], categoryIds: string[]): number {
  return items
    .filter((it) => categoryIds.includes(it.priceEntryId))
    .reduce((s, it) => s + itemAmount(it), 0)
}

export function genId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}
export const uid = genId

// 订单号格式：order-{{timestamp}}-{{randomString}}
export function genOrderId(): string {
  return `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
export function now(): string {
  return new Date().toISOString()
}
export function subtotalOf(items: OrderItem[]): number {
  return items.reduce((s, it) => s + itemAmount(it), 0)
}

export function genCouponCode(len = 6): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * 汇总一组表格列的最小列宽（width/minWidth），用于 NDataTable 的 scroll-x。
 * 只要总和超过容器宽度，表格就会出现横向滚动条，避免列被无限挤压。
 */
export function tableScrollX(cols: { width?: number; minWidth?: number }[]): number {
  return cols.reduce((sum, c) => sum + (c.width ?? c.minWidth ?? 100), 0)
}
