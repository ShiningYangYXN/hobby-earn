import { computed } from 'vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import {
  itemAmount,
  type Discount,
  type DiscountRecord,
  type OrderItem,
  type RandomConfig,
} from '@/stores/types'

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
 */
export function useDiscountApply(ctx: ApplyContext) {
  const discountStore = useDiscountStore()
  const limitGroupStore = useLimitGroupStore()
  const priceStore = usePriceStore()
  const memberStore = useMemberStore()
  const memberTypeStore = useMemberTypeStore()

  function categoryIdsOf(priceEntryId: string): string[] {
    return priceStore.prices.find((p) => p.id === priceEntryId)?.categoryIds ?? []
  }

  const memberTypeId = computed(() => {
    if (!ctx.memberId) return null
    const m = memberStore.members.find((x) => x.id === ctx.memberId)
    // 会员类型反查：通过会员名匹配会员类型（当前数据模型会员无 typeId，沿用旧约定）
    return memberTypeStore.types.find((t) => t.name === m?.name)?.id ?? null
  })

  // 自动候选（含随机捕获）
  const drafts = computed<DiscountDraft[]>(() => {
    const cands = discountStore.autoCandidates({
      memberId: ctx.memberId,
      memberTypeId: memberTypeId.value,
      items: ctx.items,
      categoryIdsOf: (id) => categoryIdsOf(id),
    })
    return cands.map((d) => buildDraft(d))
  })

  function buildDraft(d: Discount): DiscountDraft {
    const capturedRandom =
      d.random && d.ruleType === 'percentage' && d.random.kind === 'ratio'
        ? discountStore.captureRandom(d.random as RandomConfig)
        : d.random && d.random.kind === 'amount'
          ? discountStore.captureRandom(d.random as RandomConfig)
          : undefined
    const base = scopeBaseAmount(d, ctx.items)
    const units = d.ruleType === 'perItem' ? scopeUnits(d, ctx.items) : undefined
    const amt = discountStore.calcDiscount(d, base, capturedRandom, units)
    const rec = discountStore.makeRecord(d, amt, capturedRandom)
    return { discount: d, record: rec, capturedRandom }
  }

  // 作用域对应 baseAmount：品类/单品优惠只对命中部分计算
  function scopeBaseAmount(d: Discount, items: OrderItem[]): number {
    const scope = d.scope
    if (scope?.categories?.length) {
      return items
        .filter((it) =>
          (scope.categories ?? []).some((c) =>
            categoryIdsOf(it.priceEntryId).includes(c),
          ),
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
      const ids = result.filter((r) => (r.limitGroups ?? []).includes(g.id)).map((r) => r.discountId)
      if (!ids.length) continue
      let scopeAmt = totalBase
      if (g.scope === 'items') {
        scopeAmt = items.reduce((s, it) => s + itemAmount(it), 0)
      } else if (g.scope === 'categories' && g.categoryIds?.length) {
        scopeAmt = items
          .filter((it) =>
            g.categoryIds!.some((c) => categoryIdsOf(it.priceEntryId).includes(c)),
          )
          .reduce((s, it) => s + itemAmount(it), 0)
      }
      const sum = result
        .filter((r) => ids.includes(r.discountId))
        .reduce((s, r) => s + r.discountAmount, 0)
      const cap = g.limitType === 'amount' ? g.limitValue : Math.round((scopeAmt * g.limitValue) / 100)
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
    const picked = pickDiscounts(drafts.value)
    const totalBase = ctx.items.reduce((s, it) => s + itemAmount(it), 0)
    return applyLimitGroups(picked, totalBase, ctx.items)
  }

  return {
    drafts,
    pickDiscounts,
    applyLimitGroups,
    amountOf,
    autoRecords,
    scopeBaseAmount,
    buildDraft,
  }
}

export interface DiscountDraft {
  discount: Discount
  record: DiscountRecord
  capturedRandom?: number
}
