import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { PriceEntry } from './types'
import { uid } from './types'
import { useDiscountStore } from './useDiscountStore'

export const usePriceStore = defineStore('price', () => {
  const prices = ref<PriceEntry[]>([])
  const activePrices = computed(() => prices.value.filter((p) => p.isActive))
  const discountStore = useDiscountStore()

  async function load() {
    prices.value = await getAll<PriceEntry>('prices')
  }
  async function create(p: Omit<PriceEntry, 'id'>): Promise<PriceEntry> {
    const item: PriceEntry = { ...p, id: uid() }
    await add('prices', item)
    prices.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<PriceEntry>): Promise<void> {
    const idx = prices.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...prices.value[idx]!, ...patch }
    await put('prices', next)
    prices.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    const p = prices.value.find((x) => x.id === id)
    // 级联清理：从所有优惠的 scope.categories 中移除该价格项所属的分类
    if (p?.categoryIds?.length) {
      for (const d of discountStore.discounts) {
        if (d.scope?.categories?.some((c) => p.categoryIds.includes(c))) {
          const next = {
            ...d,
            scope: {
              ...d.scope,
              categories: (d.scope.categories ?? []).filter((c) => !p.categoryIds!.includes(c)),
            },
          }
          await put('discounts', next)
          const idx = discountStore.discounts.findIndex((x) => x.id === d.id)
          if (idx >= 0) discountStore.discounts[idx] = next
        }
      }
    }
    await del('prices', id)
    prices.value = prices.value.filter((x) => x.id !== id)
  }

  return { prices, activePrices, load, create, update, remove }
})
