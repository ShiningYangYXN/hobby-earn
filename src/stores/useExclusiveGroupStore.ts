import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, del } from './db'
import { uid, type ExclusiveGroup } from './types'

export const useExclusiveGroupStore = defineStore('exclusiveGroup', () => {
  const groups = ref<ExclusiveGroup[]>([])

  async function load() {
    groups.value = (await getAll('exclusiveGroups')) as ExclusiveGroup[]
  }
  async function getAllGroups() {
    if (!groups.value.length) await load()
    return groups.value
  }
  async function create(name: string): Promise<ExclusiveGroup> {
    const item: ExclusiveGroup = { id: uid(), name }
    await put('exclusiveGroups', item)
    groups.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<ExclusiveGroup>): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    groups.value[idx] = { ...groups.value[idx]!, ...patch }
    await put('exclusiveGroups', groups.value[idx]!)
  }
  async function remove(id: string): Promise<void> {
    const idx = groups.value.findIndex((x) => x.id === id)
    if (idx < 0) return
    groups.value.splice(idx, 1)
    await del('exclusiveGroups', id)
  }
  async function clearAll() {
    for (const g of groups.value) await del('exclusiveGroups', g.id)
    groups.value = []
  }

  return { groups, load, getAllGroups, create, update, remove, clearAll }
})
