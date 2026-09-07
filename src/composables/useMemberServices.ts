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

/**
 * 服务的互斥 / 限购 / 分组限购校验。
 * 返回问题描述数组，空数组＝通过。供下单与计价在提交前拦截违规组合。
 */
export function useServiceRestrictionCheck() {
  const serviceStore = useServiceStore()
  const limitStore = useServiceLimitGroupStore()
  const exclStore = useServiceExclusiveGroupStore()

  function check(items: OrderItem[]): string[] {
    const problems: string[] = []
    const svc = (id: string) => serviceStore.services.find((s) => s.id === id)

    // 互斥：同一互斥组内不得共存多项服务
    const groupHits = new Map<string, string[]>()
    for (const it of items) {
      for (const gid of svc(it.priceEntryId)?.exclusiveGroupIds ?? []) {
        const arr = groupHits.get(gid) ?? []
        arr.push(it.serviceName)
        groupHits.set(gid, arr)
      }
    }
    for (const [gid, names] of groupHits) {
      if (names.length > 1) {
        const gname = exclStore.groups.find((g) => g.id === gid)?.name ?? gid
        problems.push(`「${names.join('、')}」同属互斥组「${gname}」，不可同时添加`)
      }
    }

    // 限购：单个服务的单笔订单数量上限
    const used = new Map<string, number>()
    for (const it of items) {
      used.set(it.priceEntryId, (used.get(it.priceEntryId) ?? 0) + serviceUsageOf(it))
    }
    for (const [sid, n] of used) {
      const s = svc(sid)
      if (!s) continue
      const cap = s.purchaseLimit ?? 0
      if (cap > 0 && n > cap)
        problems.push(
          `「${s.name}」限购 ${cap}${s.pricingMode === 'hourly' ? '小时' : '件'}／单，当前 ${n}`,
        )
    }

    // 分组限购：组内服务合计占用不得超限
    for (const g of limitStore.groups) {
      let sum = 0
      for (const it of items) {
        if (!(svc(it.priceEntryId)?.limitGroupIds ?? []).includes(g.id)) continue
        sum += serviceUsageOf(it)
      }
      if (sum > g.limitValue)
        problems.push(`限购组「${g.name}」合计限 ${g.limitValue}，当前 ${sum}`)
    }

    return problems
  }

  return { check }
}
