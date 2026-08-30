import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Order, ServiceEntry } from './types'
import { genServiceId } from './types'
import { useDiscountStore } from './useDiscountStore'
import { useOrderStore } from './useOrderStore'
import { useUiStore } from './useUiStore'

export const useServiceStore = defineStore('service', () => {
  const services = ref<ServiceEntry[]>([])
  const activeServices = computed(() => services.value.filter((p) => p.isActive))
  const discountStore = useDiscountStore()
  const uiStore = useUiStore()

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
  /** 引用了该服务的订单（订单项按 priceEntryId 关联服务） */
  function ordersUsing(id: string): Order[] {
    const orderStore = useOrderStore()
    return orderStore.orders.filter((o) => o.items.some((it) => it.priceEntryId === id))
  }

  // 删除服务：
  // - 已被订单引用时默认禁止删除；开启作弊模式后「递归删除」——连同引用它的订单一并强制删除
  // - 级联清理：从所有优惠的 scope.items（指定单品）中移除该服务
  // - 级联清理：从所有优惠的 scope.categories 中移除该服务项所属的分类
  async function remove(id: string): Promise<void> {
    const p = services.value.find((x) => x.id === id)
    const relatedOrders = ordersUsing(id)
    if (relatedOrders.length && !uiStore.advancedMode) {
      throw new Error(`服务已被 ${relatedOrders.length} 笔订单引用，需开启作弊模式后递归删除`)
    }
    // 递归删除：强制删除引用该服务的订单，并退还这些订单占用的优惠用量
    if (relatedOrders.length) {
      const orderStore = useOrderStore()
      for (const o of relatedOrders) {
        await orderStore.remove(o.id, { force: true, rollbackDiscounts: true })
      }
    }
    // 级联清理：从优惠的「指定单品」中移除该服务
    for (const d of discountStore.discounts) {
      if (!d.scope?.items?.includes(id)) continue
      const next = {
        ...d,
        scope: { ...d.scope, items: (d.scope.items ?? []).filter((i) => i !== id) },
      }
      await put('discounts', next)
      const idx = discountStore.discounts.findIndex((x) => x.id === d.id)
      if (idx >= 0) discountStore.discounts[idx] = next
    }
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

  return { services, activeServices, load, create, update, remove, ordersUsing }
})
