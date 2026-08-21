import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { MemberType } from './types'
import { uid } from './types'

export const useMemberTypeStore = defineStore('memberType', () => {
  const types = ref<MemberType[]>([])

  async function load() {
    const list = await getAll<MemberType>('memberTypes')
    types.value = list.length ? list : defaultTypes()
    if (!list.length) await Promise.all(types.value.map((t) => put('memberTypes', t)))
  }

  async function create(name: string): Promise<void> {
    const trimmed = name.trim()
    if (!trimmed) throw new Error('名称不能为空')
    if (types.value.some((t) => t.name === trimmed)) throw new Error('种类已存在')
    const item: MemberType = { id: uid(), name: trimmed }
    await add('memberTypes', item)
    types.value.push(item)
  }

  async function remove(id: string): Promise<void> {
    types.value = types.value.filter((t) => t.id !== id)
    await del('memberTypes', id)
  }

  return { types, load, create, remove }
})

function defaultTypes(): MemberType[] {
  return ['普通', 'VIP', '学生', '新会员'].map((name) => ({ id: uid(), name }))
}
