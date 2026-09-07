/* eslint-disable @typescript-eslint/no-explicit-any --
   通用管理壳：条目与表单值的具体类型随数据源变化（如上限组带 limitType/scope），此处只能放宽 */
import { computed, type ComputedRef } from 'vue'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useServiceExclusiveGroupStore } from '@/stores/useServiceExclusiveGroupStore'
import { useServiceLimitGroupStore } from '@/stores/useServiceLimitGroupStore'

/**
 * TypeSelect 的就地管理数据源。
 * 类型表统一为 { id, name } 形态；带附加字段的类型（如上限组的限额与计算范围）
 * 通过 emptyForm / toForm / rowText / validate 扩展，由调用方在 #form-extra 中渲染附加控件。
 */
export interface TypeManageSource {
  title: string
  items: any[]
  load: () => void | Promise<void>
  emptyForm?: () => Record<string, any>
  toForm?: (item: any) => Record<string, any>
  rowText?: (item: any) => string
  validate?: (form: Record<string, any>) => string | null
  create: (form: Record<string, any>) => void | Promise<void>
  update: (id: string, form: Record<string, any>) => void | Promise<void>
  remove: (id: string) => void | Promise<void>
  confirmText?: string
}

/** 服务分类（类型选择，非单品个体） */
export function useCategoryManage(): ComputedRef<TypeManageSource> {
  const categoryStore = useCategoryStore()
  return computed(() => ({
    title: '服务分类管理',
    items: categoryStore.categories,
    load: () => categoryStore.load(),
    create: (f: Record<string, any>) => {
      void categoryStore.create(String(f.name ?? '').trim())
    },
    update: (id: string, f: Record<string, any>) =>
      categoryStore.update(id, String(f.name ?? '').trim()),
    remove: (id: string) => categoryStore.remove(id),
    confirmText: '删除后引用该分类的服务项、优惠、上限组将同步移除该分类，确认删除？',
  }))
}

/** 会员种类（类型选择，非会员个体） */
export function useMemberTypeManage(): ComputedRef<TypeManageSource> {
  const memberTypeStore = useMemberTypeStore()
  return computed(() => ({
    title: '会员种类管理',
    items: memberTypeStore.types,
    load: () => memberTypeStore.load(),
    create: (f: Record<string, any>) => memberTypeStore.create(String(f.name ?? '').trim()),
    update: (id: string, f: Record<string, any>) =>
      memberTypeStore.update(id, { name: String(f.name ?? '').trim() }),
    remove: (id: string) => memberTypeStore.remove(id),
    confirmText: '删除后关联的会员将清空种类，优惠中的种类限制也将移除，确认删除？',
  }))
}

/** 服务互斥组（同组服务不可在同一订单中共存） */
export function useServiceExclusiveGroupManage(): ComputedRef<TypeManageSource> {
  const store = useServiceExclusiveGroupStore()
  return computed(() => ({
    title: '服务互斥组管理',
    items: store.groups,
    load: () => store.load(),
    create: (f: Record<string, any>) => {
      void store.create(String(f.name ?? '').trim())
    },
    update: (id: string, f: Record<string, any>) =>
      store.update(id, { name: String(f.name ?? '').trim() }),
    remove: (id: string) => store.remove(id),
    confirmText: '删除后归属该组的服务将自动解除互斥关系，确认删除？',
  }))
}

/** 服务限购组（附加字段：组内合计限购数量，由调用方在 #form-extra 渲染） */
export function useServiceLimitGroupManage(): ComputedRef<TypeManageSource> {
  const store = useServiceLimitGroupStore()
  return computed(() => ({
    title: '服务限购组管理',
    items: store.groups,
    load: () => store.load(),
    emptyForm: () => ({ name: '', limitValue: 1 }),
    toForm: (item: any) => ({ name: item.name ?? '', limitValue: item.limitValue ?? 1 }),
    rowText: (item: any) => `${item.name}（合计限 ${item.limitValue}）`,
    validate: (f: Record<string, any>) => {
      if (!String(f.name ?? '').trim()) return '请填写名称'
      const v = Number(f.limitValue)
      if (!Number.isFinite(v) || v <= 0) return '限购数量需大于 0'
      return null
    },
    create: (f: Record<string, any>) => {
      void store.create({
        name: String(f.name ?? '').trim(),
        limitValue: Number(f.limitValue) || 1,
        serviceIds: [],
      })
    },
    update: (id: string, f: Record<string, any>) =>
      store.update(id, {
        name: String(f.name ?? '').trim(),
        limitValue: Number(f.limitValue) || 1,
      }),
    remove: (id: string) => store.remove(id),
    confirmText: '删除后归属该组的服务将自动解除分组限购，确认删除？',
  }))
}
