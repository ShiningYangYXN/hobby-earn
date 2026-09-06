import { computed, ref } from 'vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { itemAmount, type Discount, type DiscountRecord, type OrderItem } from '@/stores/types'

export interface ApplyContext {
  memberId: string | null
  memberName: string
  items: OrderItem[]
}

/** 最优用券方案的搜索结果 */
export interface BestPlan {
  ids: string[]
  total: number // 实算总减免（已含上限组封顶，且不超过小计）
}

// 候选数超过此值退化为贪心搜索；节点预算防止极端组合数拖慢界面
const EXHAUSTIVE_LIMIT = 14
const MAX_PLAN_STEPS = 20000

/**
 * 券的稀缺度：越大越稀缺，用于同额同数量方案的取舍（优先消耗稀缺券，把长期有效的通用优惠留着）。
 * 构成：需券码兑换 +2（要手动输入才拿得到）／总或会员用量上限 +1（会被消耗掉）
 *      ／随机触发概率加成 0~2（概率越低越难得，既已抽中就该先用掉）
 */
export function couponScarcity(d: Discount): number {
  let s = 0
  if (d.couponCode) s += 2
  if (d.usageLimit) s += 1
  if (d.memberLimit) s += 1
  return s + triggerRarity(d)
}

/** 随机优惠的范围文案：随机数额显示区间，随机触发显示概率 */
export function randomRangeLabel(d: Discount): string {
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
  if (d.triggerChance != null) return `随机生效 ${d.triggerChance}%`
  return '随机优惠'
}

/**
 * 随机触发类的稀缺加成（0~2）：概率越低，抽中越难得。
 * 既已抽中，就应优先用掉——下次未必还能抽到。
 */
export function triggerRarity(d: Discount): number {
  if (d.triggerChance == null || d.triggerChance >= 100) return 0
  const p = Math.min(100, Math.max(0, d.triggerChance))
  return 1 + (100 - p) / 100
}

/** 临期紧急度：无有效期=0；越接近到期越大（已过期记为 3） */
export function expiryUrgency(d: Discount, now = Date.now()): number {
  const until = d.scope?.timeWindow?.validUntil
  if (!until) return 0
  const t = new Date(until).getTime()
  if (Number.isNaN(t)) return 0
  const days = (t - now) / 86400000
  if (days <= 0) return 3
  return 1 / (1 + days)
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
  const serviceStore = useServiceStore()
  const memberStore = useMemberStore()
  const memberTypeStore = useMemberTypeStore()

  // 已被历史订单计入用量的优惠 id（hydrate 时填充，commitUsage 时跳过）
  const countedIds = ref<Set<string>>(new Set())

  function categoryIdsOf(priceEntryId: string): string[] {
    return serviceStore.services.find((p) => p.id === priceEntryId)?.categoryIds ?? []
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
  //  - decided: 资格是否已决定（每个计费节点即每次停表抽取时一次性决定）
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

  // 计费节点（所有秒表均暂停）抽取：对所有适用随机优惠一次性计算资格与数额
  // 每次停表都会重掷，随机触发类若未命中则从候选中移除
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
      const triggered = d.triggerChance != null ? Math.random() * 100 < d.triggerChance : true
      next[d.id] = { captured, decided: true, triggered }
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

  /**
   * 互斥组裁决：优惠可归属多个组，须同时满足每个所属组的规则——
   * 即在所属的每个组里都得是当前减免最大者，任一组已被更优者占位即淘汰。
   * 按减免降序遍历，保证每组保留的确实是该组最大者。
   */
  function pickDiscounts(drafts: DiscountDraft[]): DiscountRecord[] {
    const chosen: DiscountRecord[] = []
    const usedGroups = new Set<string>()
    const sorted = [...drafts].sort((a, b) => b.record.discountAmount - a.record.discountAmount)
    for (const dr of sorted) {
      const gids = dr.discount.exclusiveGroupIds ?? []
      if (gids.some((g) => usedGroups.has(g))) continue
      for (const g of gids) usedGroups.add(g)
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
    // 第一步：算出每个上限组各自需要的压缩比例
    const groupScale = new Map<string, number>()
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
      if (sum > cap) groupScale.set(g.id, cap / sum)
    }
    // 第二步：每条记录取所属组中最严的比例，一次性应用。
    // 逐组顺序缩放会连乘而过度缩减，取最小值同样满足所有组的上限但更贴合实际约束。
    for (const r of result) {
      let scale = 1
      for (const gid of r.limitGroups ?? []) {
        const s = groupScale.get(gid)
        if (s != null && s < scale) scale = s
      }
      if (scale < 1) r.discountAmount = Math.round(r.discountAmount * scale)
    }
    return result
  }

  // 给定记录的实际减免（已固化，直接返回；兼容旧逻辑兜底）
  function amountOf(rec: DiscountRecord): number {
    return rec.discountAmount
  }

  // —— 最优用券方案 ——
  // 优先级：实际优惠额最大 > 用券数最少 > 优先消耗稀有券 > 优先消耗临期券
  // 互斥组（同组至多一个）在搜索阶段约束，上限组封顶在 planTotal 内计入。
  // 说明：各优惠的减免额互不依赖（均按各自作用域基数独立计算），上限组只做「超额等比压缩」，
  // 因此总额对候选集合单调不减，可用「上界剪枝 + 节点预算」的深度搜索求最优。

  function subtotalOfItems(items: OrderItem[]): number {
    return items.reduce((s, it) => s + itemAmount(it), 0)
  }

  /** 按规则实算一组草稿的总减免：互斥组择一 → 上限组封顶 → 不超过小计 */
  function planTotal(list: DiscountDraft[], items: OrderItem[]): number {
    if (!list.length) return 0
    const base = subtotalOfItems(items)
    const recs = applyLimitGroups(pickDiscounts(list), base, items)
    return Math.min(
      recs.reduce((s, r) => s + r.discountAmount, 0),
      base,
    )
  }

  /** 无贡献的券不参与搜索（占用名额却不增加减免＝浪费券） */
  function planPool(candidates: DiscountDraft[]): DiscountDraft[] {
    return candidates.filter((d) => d.record.discountAmount > 0)
  }

  interface ScoredPlan {
    ids: string[]
    total: number
    scarcity: number
    urgency: number
  }

  function scoreOf(list: DiscountDraft[], total: number): ScoredPlan {
    return {
      ids: list.map((d) => d.discount.id),
      total,
      scarcity: list.reduce((s, d) => s + couponScarcity(d.discount), 0),
      urgency: list.reduce((s, d) => s + expiryUrgency(d.discount), 0),
    }
  }

  /** 同额同数量时：优先消耗更稀缺、更临期的券 */
  function isBetter(a: ScoredPlan, b: ScoredPlan): boolean {
    if (a.total !== b.total) return a.total > b.total
    if (a.ids.length !== b.ids.length) return a.ids.length < b.ids.length
    if (a.scarcity !== b.scarcity) return a.scarcity > b.scarcity
    return a.urgency > b.urgency
  }

  // 候选过多时退化为贪心：按单算减免降序尝试加入，只有能严格增加总额才采纳
  function greedyPlan(pool: DiscountDraft[], items: OrderItem[]): ScoredPlan {
    const sorted = [...pool].sort((a, b) => b.record.discountAmount - a.record.discountAmount)
    const chosen: DiscountDraft[] = []
    const usedGroups = new Set<string>()
    let cur = 0
    for (const d of sorted) {
      const gids = d.discount.exclusiveGroupIds ?? []
      if (gids.some((g) => usedGroups.has(g))) continue
      chosen.push(d)
      const next = planTotal(chosen, items)
      if (next > cur) {
        cur = next
        for (const g of gids) usedGroups.add(g)
      } else {
        chosen.pop() // 加了没用就不浪费这张券
      }
    }
    return scoreOf(chosen, cur)
  }

  /**
   * 求最优用券方案。返回入选优惠的 id 列表与实算总减免。
   * 互斥约束：优惠可归属多个组，入选集合里任意两项不得共享同一组。
   * 总额取 min(减免合计, 小计)，故超额部分不算数。
   */
  function bestPlan(candidates: DiscountDraft[], items: OrderItem[]): BestPlan {
    const pool = planPool(candidates)
    if (!pool.length) return { ids: [], total: 0 }
    if (pool.length > EXHAUSTIVE_LIMIT) return pick(greedyPlan(pool, items))

    // 后缀上界：剩余候选中，无组候选可全取，每个互斥组至多取该组最大值
    const suffixMax: number[] = Array.from({ length: pool.length + 1 }, () => 0)
    let freeSum = 0
    const groupMax = new Map<string, number>()
    for (let i = pool.length - 1; i >= 0; i--) {
      const d = pool[i]!
      const gids = d.discount.exclusiveGroupIds ?? []
      if (!gids.length) {
        freeSum += d.record.discountAmount
      } else {
        for (const g of gids) {
          groupMax.set(g, Math.max(groupMax.get(g) ?? 0, d.record.discountAmount))
        }
      }
      let s = freeSum
      for (const v of groupMax.values()) s += v
      suffixMax[i] = s
    }

    const subtotal = subtotalOfItems(items)
    const cap = (t: number) => Math.min(t, subtotal)
    let best: ScoredPlan = { ids: [], total: 0, scarcity: 0, urgency: 0 }
    const chosen: DiscountDraft[] = []
    const usedGroups = new Set<string>()
    let steps = 0
    let aborted = false

    const dfs = (i: number, running: number) => {
      if (aborted) return
      if (++steps > MAX_PLAN_STEPS) {
        aborted = true
        return
      }
      if (i === pool.length) {
        const candidate = scoreOf(chosen, cap(planTotal(chosen, items)))
        if (isBetter(candidate, best)) best = candidate
        return
      }
      // 即便后续全取最优也追不上当前最优解，剪枝（取等号仍继续，以保留「更少券」的机会）
      if (cap(running + suffixMax[i]!) < best.total) return
      const d = pool[i]!
      const gids = d.discount.exclusiveGroupIds ?? []
      // 取这张券：其所属的每个组都必须还没被占位
      if (!gids.some((g) => usedGroups.has(g))) {
        chosen.push(d)
        for (const g of gids) usedGroups.add(g)
        dfs(i + 1, running + d.record.discountAmount)
        chosen.pop()
        for (const g of gids) usedGroups.delete(g)
        if (aborted) return
      }
      // 不取
      dfs(i + 1, running)
    }
    dfs(0, 0)
    return pick(best)
  }

  function pick(p: ScoredPlan): BestPlan {
    return { ids: p.ids, total: p.total }
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
    planTotal,
    bestPlan,
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
