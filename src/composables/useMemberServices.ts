import { computed } from 'vue'
import { useServiceStore } from '@/stores/useServiceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useServiceLimitGroupStore } from '@/stores/useServiceLimitGroupStore'
import { useServiceExclusiveGroupStore } from '@/stores/useServiceExclusiveGroupStore'
import { inTimeWindow } from '@/stores/useDiscountStore'
import { canMemberUseService, type OrderItem, type ServiceEntry } from '@/stores/types'

// 用 type 而非 interface：naive-ui 的 SelectBaseOption 带 [k: string]: unknown 索引签名，
// interface 不会获得隐式索引签名而无法赋值，type 别名才可以。
export type ServiceOption = {
  label: string
  value: string
  /** 该服务当前不可添加（已达限购 / 互斥冲突）时置灰 */
  disabled?: boolean
}

/** 统一的服务选项文案：名称（计价方式 ¥单价/单位） */
export function serviceOptionLabel(p: ServiceEntry): string {
  const hourly = p.pricingMode === 'hourly'
  const mode = hourly ? '工时' : '按件'
  const unit = hourly ? '/小时' : '/件'
  return `${p.name}（${mode} ¥${(p.basePrice / 100).toFixed(2)}${unit}）`
}

/** 服务当前是否处于可添加时段（未配置时段＝不限） */
export function isServiceAvailableNow(s: ServiceEntry, now = new Date()): boolean {
  if (!s.timeWindow) return true
  return inTimeWindow(s.timeWindow, now)
}

/** 订单项的实际占用量：工时型按小时计（向上取整），按件型按件数计 */
export function serviceUsageOf(it: OrderItem): number {
  return it.pricingMode === 'hourly'
    ? Math.ceil((it.elapsed ?? 0) / 3600)
    : Math.round(it.quantity || 0)
}

/**
 * 会员可见的服务选项：在「启用中的服务」基础上按专属规则与时段过滤——
 * 专属服务须命中会员或其会员类型（散客不可）；配置了时段的服务仅在时段内出现。
 * 下单 / 编辑 / 计价三处入口共用，避免各自重复拼装选项文案与过滤逻辑。
 */
export function useMemberServiceOptions(memberId: () => string | null) {
  const serviceStore = useServiceStore()
  const memberStore = useMemberStore()

  const memberTypeIds = computed(() => {
    const id = memberId()
    if (!id) return []
    return memberStore.members.find((m) => m.id === id)?.typeIds ?? []
  })

  const options = computed<ServiceOption[]>(() => {
    const mid = memberId()
    const types = memberTypeIds.value
    return serviceStore.services
      .filter((p) => p.isActive && canMemberUseService(p, mid, types) && isServiceAvailableNow(p))
      .map((p) => ({ label: serviceOptionLabel(p), value: p.id }))
  })

  return { options, memberTypeIds }
}

/** 限购单位：工时型按小时计，按件型按件计 */
export function limitUnitOf(s: ServiceEntry): string {
  return s.pricingMode === 'hourly' ? '小时' : '件'
}

export type RestrictionKind = 'exclusive' | 'purchaseLimit' | 'groupLimit'

/**
 * 一条违规记录：text 为完整展示文案，brief 为选项内的短提示，
 * indices 指明涉及的订单项下标，kind 便于调用方区分场景。
 */
export type RestrictionProblem = {
  kind: RestrictionKind
  text: string
  brief: string
  indices: number[]
  /** 仅互斥场景：冲突的服务名列表，便于按「本次尝试的服务」生成更贴切的短提示 */
  peers?: string[]
}

/**
 * 服务的互斥 / 限购 / 分组限购校验。
 * check() 返回问题描述数组（空数组＝通过），供提交前兜底；
 * capOf / maxQtyOf / violationOf 供填写数量与计价即时拦截。
 */
export function useServiceRestrictionCheck() {
  const serviceStore = useServiceStore()
  const limitStore = useServiceLimitGroupStore()
  const exclStore = useServiceExclusiveGroupStore()
  const svc = (id: string) => serviceStore.services.find((s) => s.id === id)

  /** 统计除 index 外、命中 hit 的项已占用量 */
  function othersUsage(items: OrderItem[], index: number, hit: (o: OrderItem) => boolean): number {
    return items.reduce((sum, o, i) => (i !== index && hit(o) ? sum + serviceUsageOf(o) : sum), 0)
  }

  function collect(items: OrderItem[]): RestrictionProblem[] {
    const problems: RestrictionProblem[] = []

    // 互斥：同一互斥组内不得共存多项服务
    const groupHits = new Map<string, number[]>()
    items.forEach((it, i) => {
      for (const gid of svc(it.priceEntryId)?.exclusiveGroupIds ?? []) {
        groupHits.set(gid, [...(groupHits.get(gid) ?? []), i])
      }
    })
    for (const [gid, idxs] of groupHits) {
      if (idxs.length > 1) {
        // 同一服务的多份（会合并为一项）不计为互斥；仅当组内存在「不同服务」才冲突
        const distinct = new Set(idxs.map((i) => items[i]!.priceEntryId))
        if (distinct.size <= 1) continue
        const gname = exclStore.groups.find((g) => g.id === gid)?.name ?? gid
        const names = idxs.map((i) => items[i]!.serviceName)
        problems.push({
          kind: 'exclusive',
          text: `「${names.join('、')}」同属互斥组「${gname}」，不可同时添加`,
          brief: `与「${names.join('、')}」互斥`,
          indices: idxs,
          peers: names,
        })
      }
    }

    // 限购：单个服务的单笔订单数量上限（同一服务可能占多行，按服务聚合）
    const bySvc = new Map<string, number[]>()
    items.forEach((it, i) => bySvc.set(it.priceEntryId, [...(bySvc.get(it.priceEntryId) ?? []), i]))
    for (const [sid, idxs] of bySvc) {
      const s = svc(sid)
      if (!s) continue
      const cap = s.purchaseLimit ?? 0
      if (cap <= 0) continue
      const n = idxs.reduce((sum, i) => sum + serviceUsageOf(items[i]!), 0)
      if (n > cap)
        problems.push({
          kind: 'purchaseLimit',
          text: `「${s.name}」限购 ${cap}${limitUnitOf(s)}／单，当前 ${n}`,
          brief: `限购 ${cap}${limitUnitOf(s)}／单`,
          indices: idxs,
        })
    }

    // 分组限购：组内服务合计占用不得超限
    for (const g of limitStore.groups) {
      const idxs: number[] = []
      let sum = 0
      items.forEach((it, i) => {
        if (!(svc(it.priceEntryId)?.limitGroupIds ?? []).includes(g.id)) return
        idxs.push(i)
        sum += serviceUsageOf(it)
      })
      if (idxs.length && sum > g.limitValue)
        problems.push({
          kind: 'groupLimit',
          text: `限购组「${g.name}」合计限 ${g.limitValue}，当前 ${sum}`,
          brief: `限购组「${g.name}」已满`,
          indices: idxs,
        })
    }

    return problems
  }

  function check(items: OrderItem[]): string[] {
    return collect(items).map((p) => p.text)
  }

  /** 指定下标参与的违规描述，无违规返回 null（用于选中服务 / 改数量后即时判定） */
  function violationOf(items: OrderItem[], index: number): string | null {
    return collect(items).find((p) => p.indices.includes(index))?.text ?? null
  }

  /**
   * 指定项允许的最大占用量（件数 / 小时数）：服务自身限购与所属限购组额度取最紧者，
   * 已扣除其余项的占用。无约束返回 undefined；可能为 0 或负数（其余项已占满）。
   */
  function capOf(items: OrderItem[], index: number): number | undefined {
    const it = items[index]
    if (!it) return undefined
    const s = svc(it.priceEntryId)
    if (!s) return undefined
    let cap = Infinity
    const own = s.purchaseLimit ?? 0
    if (own > 0)
      cap = Math.min(
        cap,
        own - othersUsage(items, index, (o) => o.priceEntryId === it.priceEntryId),
      )
    for (const gid of s.limitGroupIds ?? []) {
      const g = limitStore.groups.find((x) => x.id === gid)
      if (!g) continue
      cap = Math.min(
        cap,
        g.limitValue -
          othersUsage(items, index, (o) =>
            (svc(o.priceEntryId)?.limitGroupIds ?? []).includes(gid),
          ),
      )
    }
    return Number.isFinite(cap) ? Math.floor(cap) : undefined
  }

  /** 数量输入框的上限：capOf 兜底到至少 1，避免与 min=1 冲突（存量超限数据仍可修改） */
  function maxQtyOf(items: OrderItem[], index: number): number | undefined {
    const cap = capOf(items, index)
    return cap == null ? undefined : Math.max(1, cap)
  }

  /** 限购提示文案（自身限购 + 分组限购），无约束返回空串 */
  function limitTextOf(items: OrderItem[], index: number): string {
    const it = items[index]
    const s = it ? svc(it.priceEntryId) : undefined
    if (!it || !s) return ''
    const parts: string[] = []
    const own = s.purchaseLimit ?? 0
    if (own > 0) parts.push(`限购 ${own}${limitUnitOf(s)}／单`)
    for (const gid of s.limitGroupIds ?? []) {
      const g = limitStore.groups.find((x) => x.id === gid)
      if (g) parts.push(`限购组「${g.name}」限 ${g.limitValue}${limitUnitOf(s)}`)
    }
    return parts.join('，')
  }

  /** 构造占位订单项，用于「假如添加该服务」的试探校验 */
  function probeItem(serviceId: string): OrderItem | null {
    const s = svc(serviceId)
    if (!s) return null
    const hourly = s.pricingMode === 'hourly'
    return {
      priceEntryId: s.id,
      serviceName: s.name,
      pricingMode: s.pricingMode,
      quantity: 1,
      unitPrice: s.basePrice,
      elapsed: hourly ? 0 : undefined,
      hourlyRate: hourly ? s.basePrice : undefined,
    }
  }

  /**
   * 试探校验：把 serviceId 追加到 items（replaceIndex 给出时＝替换该下标的项）后，
   * 是否引入新的互斥 / 限购违规。返回新出现的违规（含短提示），无则返回 null。
   * 供服务选择器置灰不可添加项并说明原因。
   */
  function insertionProblem(
    items: OrderItem[],
    serviceId: string,
    replaceIndex?: number,
  ): RestrictionProblem | null {
    const probe = probeItem(serviceId)
    if (!probe) return null
    const replaced = replaceIndex != null && replaceIndex >= 0 && replaceIndex < items.length
    const base = replaced ? items.filter((_, i) => i !== replaceIndex) : items
    const next = replaced ? [...base, probe] : [...items, probe]
    const probeIndex = next.length - 1
    // 额度已占满：按件型会被限购数量校验命中；工时型新增占用量为 0 需单独判定
    const cap = capOf(next, probeIndex)
    if (cap != null && cap <= 0) {
      const s = svc(serviceId)!
      return {
        kind: 'purchaseLimit',
        text: `「${s.name}」限购额度已被占用，无法再添加`,
        brief: '已达限购上限',
        indices: [probeIndex],
      }
    }
    const before = new Set(check(base))
    const problem = collect(next).find((p) => !before.has(p.text))
    if (!problem) return null
    // 互斥短提示里去掉本次尝试的服务自身，读起来更自然
    const peers = problem.peers?.filter((n) => n !== probe.serviceName) ?? []
    return peers.length ? { ...problem, brief: `与「${peers.join('、')}」互斥` } : problem
  }

  /**
   * 给服务选项标注可用性：会立刻触发限购 / 互斥的项置灰，
   * 并在标签后附上原因（如「（不可添加：限购 3 件／单）」）。
   * replaceIndex 用于「替换既有行」的场景（编辑该行服务时按替换而非追加试探）。
   */
  function annotateOptions(
    base: ServiceOption[],
    items: OrderItem[],
    replaceIndex?: number,
  ): ServiceOption[] {
    return base.map((o) => {
      const problem = insertionProblem(items, o.value, replaceIndex)
      if (!problem) return o
      return { ...o, label: `${o.label}（不可添加：${problem.brief}）`, disabled: true }
    })
  }

  return { check, violationOf, capOf, maxQtyOf, limitTextOf, insertionProblem, annotateOptions }
}
