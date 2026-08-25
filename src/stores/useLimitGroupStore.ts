import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { DiscountLimitGroup } from './types'
import { uid } from './types'
import { useDiscountStore } from './useDiscountStore'

export const useLimitGroupStore = defineStore('limitGroup', () => {
  const groups = ref<DiscountLimitGroup[]>([])

  async function load() {
    groups.value = await getAll<DiscountLimitGroup>('limitGroups')
  }
  async function create(
    g: Omit<DiscountLimitGroup, 'id'>,
  ): Promise<DiscountLimitGroup> {
    const item: DiscountLimitGroup = { ...g, id: uid() }
    await add('limitGroups', item)
    groups.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<DiscountLimitGroup>): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...groups.value[idx]!, ...patch }
    await put('limitGroups', next)
    groups.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    // 级联清理：解除优惠对该组的归属
    const discountStore = useDiscountStore()
    for (const d of discountStore.discounts.filter((x) => x.limitGroups?.includes(id))) {
      await discountStore.update(d.id, {
        limitGroups: (d.limitGroups ?? []).filter((x) => x !== id),
      })
    }
    await del('limitGroups', id)
    groups.value = groups.value.filter((x) => x.id !== id)
  }

  return { groups, load, create, update, remove }
})
