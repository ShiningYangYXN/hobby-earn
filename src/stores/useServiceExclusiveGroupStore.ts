import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, del } from './db'
import { uid, type ServiceExclusiveGroup } from './types'
import { useServiceStore } from './useServiceStore'

/** 服务互斥组：同组服务不可在同一笔订单中共存 */
export const useServiceExclusiveGroupStore = defineStore('serviceExclusiveGroup', () => {
  const groups = ref<ServiceExclusiveGroup[]>([])

  async function load() {
    groups.value = await getAll<ServiceExclusiveGroup>('serviceExclusiveGroups')
  }
  async function create(name: string): Promise<ServiceExclusiveGroup> {
    const item: ServiceExclusiveGroup = { id: uid(), name, serviceIds: [] }
    await put('serviceExclusiveGroups', item)
    groups.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<ServiceExclusiveGroup>): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...groups.value[idx]!, ...patch }
    await put('serviceExclusiveGroups', next)
    groups.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) return
    // 级联清理：从引用该组的服务中摘除这一项（可能还归属其它组）
    const serviceStore = useServiceStore()
    for (const s of serviceStore.services.filter((x) => x.exclusiveGroupIds?.includes(id))) {
      await serviceStore.update(s.id, {
        exclusiveGroupIds: (s.exclusiveGroupIds ?? []).filter((g) => g !== id),
      })
    }
    groups.value.splice(idx, 1)
    await del('serviceExclusiveGroups', id)
  }

  return { groups, load, create, update, remove }
})
