import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Category } from './types'
import { uid } from './types'
import { useServiceStore } from './useServiceStore'
import { useDiscountStore } from './useDiscountStore'
import { useLimitGroupStore } from './useLimitGroupStore'

export const useCategoryStore = defineStore('category', () => {
  const categories = ref<Category[]>([])

  async function load() {
    categories.value = await getAll<Category>('categories')
  }
  async function create(name: string): Promise<Category> {
    const item: Category = { id: uid(), name: name.trim() }
    await add('categories', item)
    categories.value.push(item)
    return item
  }
  async function update(id: string, name: string): Promise<void> {
    const idx = categories.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...categories.value[idx]!, name: name.trim() }
    await put('categories', next)
    categories.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    // 级联清理：从服务项、优惠、上限组中移除该分类引用
    const serviceStore = useServiceStore()
    const discountStore = useDiscountStore()
    const limitGroupStore = useLimitGroupStore()
    if (
      serviceStore.services.length &&
      serviceStore.services.some((p) => p.categoryIds.includes(id))
    ) {
      for (const p of serviceStore.services.filter((x) => x.categoryIds.includes(id))) {
        await serviceStore.update(p.id, {
          categoryIds: p.categoryIds.filter((c) => c !== id),
        })
      }
    }
    for (const d of discountStore.discounts.filter((x) => x.scope?.categories?.includes(id))) {
      const sc = d.scope!
      await discountStore.update(d.id, {
        scope: { ...sc, categories: (sc.categories ?? []).filter((c) => c !== id) },
      })
    }
    for (const g of limitGroupStore.groups.filter((x) => x.categoryIds?.includes(id))) {
      await limitGroupStore.update(g.id, {
        categoryIds: g.categoryIds!.filter((c) => c !== id),
      })
    }
    await del('categories', id)
    categories.value = categories.value.filter((x) => x.id !== id)
  }
  // 名称 → id（用于转换旧数据或批量添加）
  function idByName(name: string): string | undefined {
    return categories.value.find((c) => c.name === name)?.id
  }

  return { categories, load, create, update, remove, idByName }
})
