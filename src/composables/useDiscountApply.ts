import { computed, ref } from 'vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { itemAmount, type Discount, type DiscountRecord, type OrderItem } from '@/stores/types'

export interface ApplyContext {
  memberId: string | null
  memberName: string
  items: OrderItem[]
}

/**
 * 优惠应用层：
 *  - 自动结算时收集「auto + 作用域命中 + 概率通过 + 无券码」的候选
 *  - 随机优惠在捕获时立即固化数额（写入 DiscountRecord，之后不变）
 *  - 互斥组 / 上限组封顶基于已固化的记录计算
 *
 * ctx 以 getter 形式传入（响应式的 computed），内部统一通过 ctx() 读取，
 * 保证会员 / 订单项变化时候选自动重算。
 */
export function useDiscountApply(ctx: () => ApplyContext) {
  const discountStore = useDiscountStore()
  const limitGroupStore = useLimitGroupStore()
  const priceStore = usePriceStore()
  const memberStore = useMemberStore()
  const memberTypeStore = useMemberTypeStore()

  // 已被历史订单计入用量的优惠 id（hydrate 时填充，commitUsage 时跳过）
  const countedIds = ref<Set<string>>(new Set())

  function categoryIdsOf(priceEntryId: string): string[] {
    return priceStore.prices.find((p) => p.id === priceEntryId)?.categoryIds ?? []
  }

  const memberTypeId = computed(() => {
    const id = ctx().memberId
    if (!id) return null
    const m = memberStore.members.find((x) => x.id === id)
    // 会员类型反查：通过会员名匹配会员类型（当前数据模型会员无 typeId，沿用旧约定）
    return memberTypeStore.types.find((t) => t.name === m?.name)?.id ?? null
  })

  // 已抽取的随机结果：key=discountId -> { captured, decided, triggered }
  //  - captured: 随机数额类捕获到的实际值（amount=分；ratio=0-100 百分比）
  //  - decided: 资格是否已决定（随机触发类在下单时固化，停表抽取时仍为 false）
  //  - triggered: 命中与否（true=生效；false=未触发排除；null=待定）
  interface DrawResult {
    captured: number
    decided: boolean
    triggered: boolean | null
  }
  const drawnRandom = ref<Record<string, DrawResult>>({})

  // 是否为「随机数额」或「随机触发」类优惠（需要抽取/固化）
  function isRandom(d: Discount): boolean {
    return !!(d.random || d.triggerChance != null)
  }

  // 走时 / 未抽取期间展示的范围文案
  function randomRangeLabel(d: Discount): string {
    if (d.random?.kind === 'amount') {
      return `随机立减 ¥${(Math.min(d.random.min, d.random.max) / 100).toFixed(2)}~¥${(
        Math.max(d.random.min, d.random.max) / 100
      ).toFixed(2)}`
    }
    if (d.random?.kind === 'ratio') {
      // ratio 的 min/max 为 0-100「支付比例」（与 percentage.value 同单位）：
      // 85 = 8.5折（支付85%），折数 = 支付比例 / 10；0 = 免单
      const lo = Math.min(d.random.min, d.random.max)
      const hi = Math.max(d.random.min, d.random.max)
      const zhe = (v: number) => {
        const z = v / 10
        return Number.isInteger(z) ? String(z) : z.toFixed(1)
      }
      return `随机 ${zhe(lo)}折~${zhe(hi)}折`
    }
    if (d.triggerChance != null) {
      return `随机生效 ${d.triggerChance}%`
    }
    return '随机优惠'
  }

  // 自动候选，随 ctx 变化自动重算（此处不再掷骰，随机在抽取时一次性决定）
  const drafts = computed<DiscountDraft[]>(() => {
    const c = ctx()
    const cands = discountStore.autoCandidates({
      memberId: c.memberId,
      memberTypeId: memberTypeId.value,
      items: c.items,
      categoryIdsOf: (id) => categoryIdsOf(id),
    })
    return cands.map((d) => buildDraft(d)).filter((x): x is DiscountDraft => x != null)
  })

  function buildDraft(d: Discount): DiscountDraft | null {
    const c = ctx()

    // 非随机普通优惠：直接计算
    if (!isRandom(d)) {
      const base = scopeBaseAmount(d, c.items)
      const units = d.ruleType === 'perItem' ? scopeUnits(d, c.items) : undefined
      const amt = discountStore.calcDiscount(d, base, undefined, units)
      const rec = discountStore.makeRecord(d, amt, undefined)
      return { discount: d, record: rec, capturedRandom: undefined }
    }

    // 随机 / 触发类：依据已抽取结果
    const draw = drawnRandom.value[d.id]
    const decided = draw?.decided ?? false
    const triggered = draw?.triggered ?? null

    // 未抽取或资格待定：显示范围，金额不计入
    if (!decided || triggered === null) {
      const rec = discountStore.makeRecord(d, 0, undefined)
      rec.triggered = triggered ?? undefined
      return {
        discount: d,
        record: rec,
        capturedRandom: draw?.captured,
        pending: true,
        rangeLabel: randomRangeLabel(d),
        triggered,
      }
    }

    // 已决定但未触发：排除
    if (triggered === false) return null

    // 已决定且触发：固化数额
    const captured = d.random ? (draw!.captured ?? 0) : undefined
    const base = scopeBaseAmount(d, c.items)
    const units = d.ruleType === 'perItem' ? scopeUnits(d, c.items) : undefined
    const amt = discountStore.calcDiscount(d, base, captured, units)
    const rec = discountStore.makeRecord(d, amt, captured)
    rec.triggered = true
    return { discount: d, record: rec, capturedRandom: captured }
  }

  // 停表抽取：对所有适用随机优惠一次性抽取数额（随机触发类的资格仍留待下单）
  function drawRandom() {
    const c = ctx()
    const next: Record<string, DrawResult> = {}
    const cands = discountStore.autoCandidates({
      memberId: c.memberId,
      memberTypeId: memberTypeId.value,
      items: c.items,
      categoryIdsOf: (id) => categoryIdsOf(id),
    })
    for (const d of cands) {
      if (!isRandom(d)) continue
      const captured = d.random ? discountStore.captureRandom(d.random) : 0
      const decided = d.triggerChance == null
      next[d.id] = { captured, decided, triggered: decided ? true : null }
    }
    drawnRandom.value = next
  }

  // 走时：清空抽取结果，回到范围展示
  function resetDraw() {
    drawnRandom.value = {}
  }

  // 下单固化：补全抽取结果，并决定随机触发类的资格（固化的是优惠资格，而非金额）
  function finalizeRandom() {
    const c = ctx()
    const cands = discountStore.autoCandidates({
      memberId: c.memberId,
      memberTypeId: memberTypeId.value,
      items: c.items,
      categoryIdsOf: (id) => categoryIdsOf(id),
    })
    const next: Record<string, DrawResult> = { ...drawnRandom.value }
    for (const d of cands) {
      if (!isRandom(d)) continue
      if (!next[d.id]) {
        const captured = d.random ? discountStore.captureRandom(d.random) : 0
        next[d.id] = {
          captured,
          decided: d.triggerChance == null,
          triggered: d.triggerChance == null ? true : null,
        }
      }
    }
    // 决定待定资格（随机触发类在下单时一次性固化）
    for (const d of cands) {
      if (d.triggerChance == null) continue
      const e = next[d.id]
      if (e && e.triggered === null) {
        e.triggered = Math.random() * 100 < d.triggerChance
        e.decided = true
      }
    }
    drawnRandom.value = next
  }

  // 作用域对应 baseAmount：品类/单品优惠只对命中部分计算
  function scopeBaseAmount(d: Discount, items: OrderItem[]): number {
    const scope = d.scope
    if (scope?.categories?.length) {
      return items
        .filter((it) =>
          (scope.categories ?? []).some((c) => categoryIdsOf(it.priceEntryId).includes(c)),
        )
        .reduce((s, it) => s + itemAmount(it), 0)
    }
    if (scope?.items?.length) {
      return items
        .filter((it) => (scope.items ?? []).includes(it.priceEntryId))
        .reduce((s, it) => s + itemAmount(it), 0)
    }
    return items.reduce((s, it) => s + itemAmount(it), 0)
  }

  // 作用域对应件数（仅 perItem 用）：品类/单品范围内订单项 quantity 之和
  function scopeUnits(d: Discount, items: OrderItem[]): number {
    const scope = d.scope
    let hit = items
    if (scope?.categories?.length) {
      hit = items.filter((it) =>
        (scope.categories ?? []).some((c) => categoryIdsOf(it.priceEntryId).includes(c)),
      )
    } else if (scope?.items?.length) {
      hit = items.filter((it) => (scope.items ?? []).includes(it.priceEntryId))
    }
    return hit.reduce((s, it) => s + (it.quantity || 0), 0)
  }

  // 互斥组：同组内保留减免最高的一个
  function pickDiscounts(drafts: DiscountDraft[]): DiscountRecord[] {
    const chosen: DiscountRecord[] = []
    const usedGroups = new Set<string>()
    const sorted = [...drafts].sort((a, b) => b.record.discountAmount - a.record.discountAmount)
    for (const dr of sorted) {
      const gid = dr.discount.exclusiveGroupId
      if (gid) {
        if (usedGroups.has(gid)) continue
        usedGroups.add(gid)
      }
      chosen.push(dr.record)
    }
    return chosen
  }

  // 上限组封顶
  function applyLimitGroups(
    records: DiscountRecord[],
    totalBase: number,
    items: OrderItem[],
  ): DiscountRecord[] {
    const result = records.map((r) => ({ ...r }))
    for (const g of limitGroupStore.groups) {
      const ids = result
        .filter((r) => (r.limitGroups ?? []).includes(g.id))
        .map((r) => r.discountId)
      if (!ids.length) continue
      let scopeAmt = totalBase
      if (g.scope === 'items') {
        scopeAmt = items.reduce((s, it) => s + itemAmount(it), 0)
      } else if (g.scope === 'categories' && g.categoryIds?.length) {
        scopeAmt = items
          .filter((it) => g.categoryIds!.some((c) => categoryIdsOf(it.priceEntryId).includes(c)))
          .reduce((s, it) => s + itemAmount(it), 0)
      }
      const sum = result
        .filter((r) => ids.includes(r.discountId))
        .reduce((s, r) => s + r.discountAmount, 0)
      const cap =
        g.limitType === 'amount' ? g.limitValue : Math.round((scopeAmt * g.limitValue) / 100)
      if (sum > cap) {
        const scale = cap / sum
        for (const r of result) {
          if (ids.includes(r.discountId)) r.discountAmount = Math.round(r.discountAmount * scale)
        }
      }
    }
    return result
  }

  // 给定记录的实际减免（已固化，直接返回；兼容旧逻辑兜底）
  function amountOf(rec: DiscountRecord): number {
    return rec.discountAmount
  }

  function autoRecords(): DiscountRecord[] {
    const c = ctx()
    const picked = pickDiscounts(drafts.value)
    const totalBase = c.items.reduce((s, it) => s + itemAmount(it), 0)
    return applyLimitGroups(picked, totalBase, c.items)
  }

  /**
   * 编辑既有订单时调用：把历史 discountRecords 中仍可识别且可用的优惠，
   * 标记为其用量已计入（避免 commitUsage 重复 +1），并尝试恢复其勾选状态。
   */
  function hydrate(records: DiscountRecord[]): string[] {
    countedIds.value = new Set(records.map((r) => r.discountId))
    // 用历史记录还原抽取结果，避免重开订单时重新掷骰
    const next: Record<string, DrawResult> = {}
    for (const r of records) {
      next[r.discountId] = {
        captured: r.capturedRandom ?? 0,
        decided: true,
        triggered: r.triggered ?? true,
      }
    }
    drawnRandom.value = next
    return records.map((r) => r.discountId)
  }

  /**
   * 完成订单时提交用量：仅对当前生效记录中「尚未计入」的优惠 recordUsage。
   * 返回本次新计入用量的优惠 id 列表（便于上层在失败/取消时回滚）。
   */
  async function commitUsage(recs?: DiscountRecord[]): Promise<string[]> {
    const c = ctx()
    const snapshot = recs ?? recordsSnapshot
    const newly: string[] = []
    for (const rec of snapshot) {
      if (countedIds.value.has(rec.discountId)) continue
      const d = discountStore.discounts.find((x) => x.id === rec.discountId)
      if (!d) continue
      await discountStore.recordUsage(d, c.memberId)
      countedIds.value.add(rec.discountId)
      newly.push(rec.discountId)
    }
    return newly
  }

  // commitUsage 需要读取当前生效记录，由 panel 通过 setRecords 提供
  let recordsSnapshot: DiscountRecord[] = []
  function setRecords(recs: DiscountRecord[]) {
    recordsSnapshot = recs
  }

  // 券码兑换：透传当前 ctx 做准入/作用域校验，并立即抽取随机结果（手动动作）
  function redeem(code: string): Discount | null {
    const c = ctx()
    const d = discountStore.redeemByCode(code, {
      memberId: c.memberId,
      memberTypeId: memberTypeId.value,
      items: c.items,
      categoryIdsOf: (id) => categoryIdsOf(id),
    })
    if (!d) return null
    if (isRandom(d)) {
      const captured = d.random ? discountStore.captureRandom(d.random) : 0
      const triggered = d.triggerChance != null ? Math.random() * 100 < d.triggerChance : true
      drawnRandom.value = {
        ...drawnRandom.value,
        [d.id]: { captured, decided: true, triggered },
      }
    }
    return d
  }

  return {
    drafts,
    pickDiscounts,
    applyLimitGroups,
    amountOf,
    autoRecords,
    scopeBaseAmount,
    buildDraft,
    hydrate,
    commitUsage,
    setRecords,
    redeem,
    drawRandom,
    resetDraw,
    finalizeRandom,
  }
}

export interface DiscountDraft {
  discount: Discount
  record: DiscountRecord
  capturedRandom?: number
  // 随机优惠在抽取前的占位态
  pending?: boolean
  rangeLabel?: string
  triggered?: boolean | null
}
