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
// 分类 / 服务项
// ============================================================
export interface Category {
  id: string
  name: string
  remark?: string
}

export type PricingMode = 'hourly' | 'perPiece'

export interface ServiceEntry {
  id: string
  name: string
  isActive: boolean
  remark?: string
  description?: string // 服务项描述 / 备注说明
  pricingMode: PricingMode
  basePrice: number
  categoryIds: string[]
  // —— 专属服务：限定可添加的会员 / 会员类型；两者皆空＝不限（散客亦可添加） ——
  memberIds?: string[] // 仅这些会员可添加
  memberTypeIds?: string[] // 仅这些会员类型下的会员可添加
}

/** 服务是否为「专属服务」（限定了会员或会员类型） */
export function isExclusiveService(s: ServiceEntry): boolean {
  return (s.memberIds?.length ?? 0) > 0 || (s.memberTypeIds?.length ?? 0) > 0
}

/**
 * 判断某会员能否添加该服务：
 * - 非专属服务（会员与会员类型皆空）：任何人（含散客）可添加；
 * - 专属服务：散客一律不可；命中指定会员，或其所属会员类型命中，即可添加。
 */
export function canMemberUseService(
  s: ServiceEntry,
  memberId: string | null,
  memberTypeIds: string[] = [],
): boolean {
  if (!isExclusiveService(s)) return true
  if (!memberId) return false
  if ((s.memberIds ?? []).includes(memberId)) return true
  const typeIds = s.memberTypeIds ?? []
  return typeIds.length ? typeIds.some((t) => memberTypeIds.includes(t)) : false
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
  if (value === 0) return '免单'
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
  minAmount: number // 保底消费(分)，门槛，0=不限：所有执行方式的最低消费门槛（含 stepDown 的起用门槛）
  // 最大减免封顶(分)：calcDiscount 对所有执行方式都生效（含 fixed，可把固定立减压得更低）；
  // 例外是随机立减（random.kind='amount'），此时封顶由捕获到的随机值取代，该字段不参与
  maxDiscount?: number
  maxUnits?: number // 最大执行件数/阶梯数：perItem 限制立减件数，stepDown 限制生效阶梯数；留空=不限
  stepAmount?: number // 阶梯步长(分)，仅 stepDown：每满该金额减免一个 value；0/undefined=不限

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

  // —— 互斥组（可归属多个，执行时需同时满足每个所属组的规则） ——
  exclusiveGroupIds?: string[]

  createdAt: number
}

/** 给定优惠是否带有券码开关 */
export function hasCouponCode(d: Discount): boolean {
  return !!d.couponCode
}

/** 券码固定长度：仅 6 位有效 */
export const COUPON_CODE_LENGTH = 6

/** 券码归一化：去空格并统一大写，校验与比对前一律先过此函数 */
export function normalizeCouponCode(code: string): string {
  return code.trim().toUpperCase()
}

/** 券码是否合法：6 位字母或数字 */
export function isValidCouponCode(code: string): boolean {
  return new RegExp(`^[A-Z0-9]{${COUPON_CODE_LENGTH}}$`).test(normalizeCouponCode(code))
}

/**
 * 优惠规则的简短描述（面向用户展示，供下单/结算/订单详情复用）。
 * 传入 capturedRandom 时按已抽取的随机值展示实际力度，否则展示随机范围。
 */
export function discountRuleText(d: Discount, capturedRandom?: number): string {
  const parts: string[] = []
  const rnd = d.random
  const captured = capturedRandom ?? null
  if (d.ruleType === 'percentage') {
    const r = rnd?.kind === 'ratio' && captured != null ? captured : d.value
    parts.push(formatZhe(r))
    if (d.minAmount > 0) parts.push(`满${fmt(d.minAmount)}可用`)
  } else if (d.ruleType === 'stepDown') {
    if (d.minAmount > 0) parts.push(`满${fmt(d.minAmount)}可用`)
    parts.push(`每满${fmt(d.stepAmount ?? 0)}减${fmt(d.value)}`)
    if (d.maxUnits != null) parts.push(`最多${d.maxUnits}阶`)
  } else if (d.ruleType === 'perItem') {
    if (d.minAmount > 0) parts.push(`满${fmt(d.minAmount)}可用`)
    parts.push(`每件减${fmt(d.value)}`)
    if (d.maxUnits != null) parts.push(`最多${d.maxUnits}件`)
  } else {
    const v = rnd?.kind === 'amount' && captured != null ? captured : d.value
    parts.push(d.minAmount > 0 ? `满${fmt(d.minAmount)}减${fmt(v)}` : `立减${fmt(v)}`)
  }
  if (rnd && captured == null) {
    const lo = Math.min(rnd.min, rnd.max)
    const hi = Math.max(rnd.min, rnd.max)
    parts.push(
      rnd.kind === 'amount'
        ? `随机 ${fmt(lo)}~${fmt(hi)}`
        : `随机 ${formatZhe(lo)}~${formatZhe(hi)}`,
    )
  }
  // 随机立减的捕获值即最终立减额，此时 maxDiscount 不再额外封顶
  if (d.maxDiscount != null && !(rnd?.kind === 'amount' && captured != null)) {
    parts.push(`最高减${fmt(d.maxDiscount)}`)
  }
  if (d.triggerChance != null && d.triggerChance < 100) parts.push(`${d.triggerChance}%概率触发`)
  return parts.join(' · ')
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
  exclusiveGroupIds?: string[]
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

// 订单号格式（保持不变）：order-{{timestamp}}-{{randomString}}
export function genOrderId(): string {
  return `order-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}
// 号码格式统一为 `前缀-{{timestamp}}-######`：
//   - 第二部分（中间段）与订单号规则一致，使用 Date.now().toString(36) 时间戳编码；
//   - 第三部分（末尾 6 位）随机串，便于展示与人工核对，并降低同毫秒碰撞概率。
const ID_ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyz'
function randomCode(len: number): string {
  let s = ''
  for (let i = 0; i < len; i++) s += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)]
  return s
}
function tsSeg(): string {
  return Date.now().toString(36)
}
// 会员号格式：member-{{timestamp}}-######
export function genMemberId(): string {
  return `member-${tsSeg()}-${randomCode(6)}`
}
// 服务号格式：service-{{timestamp}}-######
export function genServiceId(): string {
  return `service-${tsSeg()}-${randomCode(6)}`
}
// 优惠号格式：discount-{{timestamp}}-######
export function genDiscountId(): string {
  return `discount-${tsSeg()}-${randomCode(6)}`
}
export function now(): string {
  return new Date().toISOString()
}
export function subtotalOf(items: OrderItem[]): number {
  return items.reduce((s, it) => s + itemAmount(it), 0)
}

/** 生成 6 位随机券码（字符集剔除易混淆的 I/O/0/1） */
export function genCouponCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let s = ''
  for (let i = 0; i < COUPON_CODE_LENGTH; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

/**
 * 汇总一组表格列的最小列宽（width/minWidth），用于 NDataTable 的 scroll-x。
 * 只要总和超过容器宽度，表格就会出现横向滚动条，避免列被无限挤压。
 */
export function tableScrollX(cols: { width?: number; minWidth?: number }[]): number {
  return cols.reduce((sum, c) => sum + (c.width ?? c.minWidth ?? 100), 0)
}
