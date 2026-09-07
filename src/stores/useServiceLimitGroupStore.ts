import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, del } from './db'
import { uid, type ServiceLimitGroup } from './types'
import { useServiceStore } from './useServiceStore'

/** 服务限购组：组内服务合计可购数量受同一额度约束 */
export const useServiceLimitGroupStore = defineStore('serviceLimitGroup', () => {
  const groups = ref<ServiceLimitGroup[]>([])

  async function load() {
    groups.value = await getAll<ServiceLimitGroup>('serviceLimitGroups')
  }
  async function create(g: Omit<ServiceLimitGroup, 'id'>): Promise<ServiceLimitGroup> {
    const item: ServiceLimitGroup = { ...g, id: uid() }
    await put('serviceLimitGroups', item)
    groups.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<ServiceLimitGroup>): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    const next = { ...groups.value[idx]!, ...patch }
    await put('serviceLimitGroups', next)
    groups.value[idx] = next
  }
  async function remove(id: string): Promise<void> {
    // 级联清理：解除服务对该组的归属
    const serviceStore = useServiceStore()
    for (const s of serviceStore.services.filter((x) => x.limitGroupIds?.includes(id))) {
      await serviceStore.update(s.id, {
        limitGroupIds: (s.limitGroupIds ?? []).filter((g) => g !== id),
      })
    }
    await del('serviceLimitGroups', id)
    groups.value = groups.value.filter((x) => x.id !== id)
  }

  return { groups, load, create, update, remove }
})
