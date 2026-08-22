import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { PriceEntry } from './types'
import { uid } from './types'

export const usePriceStore = defineStore('price', () => {
  const prices = ref<PriceEntry[]>([])
  const activePrices = computed(() => prices.value.filter((p) => p.isActive))

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
    prices.value[idx] = { ...prices.value[idx]!, ...patch }
    await put('prices', prices.value[idx]!)
  }
  async function remove(id: string): Promise<void> {
    prices.value = prices.value.filter((x) => x.id !== id)
    await del('prices', id)
  }

  return { prices, activePrices, load, create, update, remove }
})
