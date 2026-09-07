import { computed } from 'vue'
import { useServiceStore } from '@/stores/useServiceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { canMemberUseService, type ServiceEntry } from '@/stores/types'

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

/**
 * 会员可见的服务选项：在「启用中的服务」基础上按专属规则过滤——
 * 仅当会员命中指定会员、或其所属会员类型命中时才出现（散客不可添加专属服务）。
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
      .filter((p) => p.isActive && canMemberUseService(p, mid, types))
      .map((p) => ({ label: serviceOptionLabel(p), value: p.id }))
  })

  return { options, memberTypeIds }
}
