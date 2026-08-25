import { ref } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { MemberType } from './types'
import { uid } from './types'
import { useMemberStore } from './useMemberStore'
import { useDiscountStore } from './useDiscountStore'

export const useMemberTypeStore = defineStore('memberType', () => {
  const types = ref<MemberType[]>([])
  const memberStore = useMemberStore()
  const discountStore = useDiscountStore()

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

  async function update(id: string, patch: Partial<MemberType>): Promise<void> {
    const t = types.value.find((x) => x.id === id)
    if (!t) throw new Error('种类不存在')
    if (patch.name !== undefined) {
      const name = patch.name.trim()
      if (types.value.some((x) => x.name === name && x.id !== id)) throw new Error('种类已存在')
    }
    if (patch.name !== undefined) t.name = patch.name.trim()
    await put('memberTypes', t)
  }

  async function remove(id: string): Promise<void> {
    // 先清理 DB：从所有会员和优惠中移除对该类型的引用
    for (const m of memberStore.members) {
      if (m.typeIds?.includes(id)) {
        const next = { ...m, typeIds: (m.typeIds ?? []).filter((t) => t !== id) }
        await put('members', next)
        memberStore.members[memberStore.members.indexOf(m)] = next
      }
    }
    for (const d of discountStore.discounts) {
      if (d.scope?.memberTypeIds?.includes(id)) {
        const next = {
          ...d,
          scope: {
            ...d.scope,
            memberTypeIds: (d.scope.memberTypeIds ?? []).filter((t) => t !== id),
          },
        }
        await put('discounts', next)
        const idx = discountStore.discounts.findIndex((x) => x.id === d.id)
        if (idx >= 0) discountStore.discounts[idx] = next
      }
    }
    await del('memberTypes', id)
    types.value = types.value.filter((t) => t.id !== id)
  }

  return { types, load, create, update, remove }
})

function defaultTypes(): MemberType[] {
  return [].map((name) => ({ id: uid(), name }))
}
