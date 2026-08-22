import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Member } from './types'
import { uid, now } from './types'

export const useMemberStore = defineStore('member', () => {
  const members = ref<Member[]>([])

  async function load() {
    members.value = await getAll<Member>('members')
  }
  async function create(m: Omit<Member, 'id' | 'joinDate'>): Promise<Member> {
    const item: Member = { ...m, id: uid(), joinDate: now(), isActive: m.isActive !== false }
    await add('members', item)
    members.value.push(item)
    return item
  }
  async function update(id: string, patch: Partial<Member>): Promise<void> {
    const idx = members.value.findIndex((x) => x.id === id)
    if (idx < 0) throw new Error('not found')
    members.value[idx] = { ...members.value[idx]!, ...patch }
    await put('members', members.value[idx]!)
  }
  async function remove(id: string): Promise<void> {
    members.value = members.value.filter((x) => x.id !== id)
    await del('members', id)
  }

  return { members, load, create, update, remove }
})
