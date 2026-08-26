import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { ServiceEntry } from './types'
import { genServiceId } from './types'
import { useDiscountStore } from './useDiscountStore'

export const useServiceStore = defineStore('service', () => {
  const services = ref<ServiceEntry[]>([])
  const activeServices = computed(() => services.value.filter((p) => p.isActive))
  const discountStore = useDiscountStore()

  async function load() {
    // 保留底层 IndexedDB 对象存储名 'prices'，以兼容既有数据
    services.value = await getAll<ServiceEntry>('prices')
  }
  async function create(p: Omit<ServiceEntry, 'id'>): Promise<ServiceEntry> {
    const item: ServiceEntry = { ...p, id: genServiceId() }
    await add('prices', item)
    services.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<ServiceEntry>): Promise<void> {
    const idx = services.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...services.value[idx]!, ...patch }
    await put('prices', next)
    services.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    const p = services.value.find((x) => x.id === id)
    // 级联清理：从所有优惠的 scope.categories 中移除该服务项所属的分类
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
    services.value = services.value.filter((x) => x.id !== id)
  }

  return { services, activeServices, load, create, update, remove }
})
