import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Member } from './types'
import { genMemberId, now } from './types'
import { useOrderStore } from './useOrderStore'
import { useDiscountStore } from './useDiscountStore'
import { useUiStore } from './useUiStore'

export const useMemberStore = defineStore('member', () => {
  const members = ref<Member[]>([])
  const orderStore = useOrderStore()
  const discountStore = useDiscountStore()
  const uiStore = useUiStore()

  async function load() {
    members.value = await getAll<Member>('members')
  }
  async function create(m: Omit<Member, 'id' | 'joinDate'>): Promise<Member> {
    const item: Member = {
      ...m,
      id: genMemberId(), // 会员号（与订单号同构，前缀 member-）
      joinDate: now(),
      isActive: m.isActive !== false,
      typeIds: m.typeIds ?? [],
    }
    await add('members', item)
    members.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<Member>): Promise<void> {
    const idx = members.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...members.value[idx]!, ...patch }
    // 兼容旧数据：确保 typeIds 为数组
    next.typeIds = next.typeIds ?? []
    await put('members', next)
    members.value[idx] = next
  }

  // 删除会员：
  // - 递归清理关联订单（强制删除，绕过状态限制）
  // - 递归处理包含该会员的优惠：若该会员专属则直接删除，否则移除其会员引用
  // - 若该会员存在关联订单或优惠，则仅在高级模式（作弊模式）下允许删除；否则抛出错误
  async function remove(id: string): Promise<void> {
    const relatedOrders = orderStore.orders.filter((o) => o.memberId === id)
    const relatedDiscounts = discountStore.discounts.filter((d) => d.scope?.memberIds?.includes(id))
    const hasAssoc = relatedOrders.length > 0 || relatedDiscounts.length > 0
    if (hasAssoc && !uiStore.advancedMode) {
      throw new Error('会员存在关联订单或优惠，需开启高级模式（作弊模式）才能删除')
    }

    // 1. 递归清理关联订单
    for (const o of relatedOrders) {
      await orderStore.remove(o.id, { force: true })
    }

    // 2. 递归处理包含该会员的优惠
    for (const d of relatedDiscounts) {
      const mids = (d.scope?.memberIds ?? []).filter((x) => x !== id)
      if (mids.length === 0) {
        // 该会员专属优惠：直接删除
        await discountStore.remove(d.id)
      } else {
        // 否则仅移除该会员引用
        await discountStore.update(d.id, { scope: { ...d.scope!, memberIds: mids } })
      }
    }

    // 3. 删除会员本身
    await del('members', id)
    members.value = members.value.filter((x) => x.id !== id)
  }

  return { members, load, create, update, remove }
})
