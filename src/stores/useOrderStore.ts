import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Order, PaymentMethod, DiscountRecord, OrderItem } from './types'
import { genOrderId, now, subtotalOf } from './types'
import { useDiscountStore } from './useDiscountStore'
import { useUiStore } from './useUiStore'

export const useOrderStore = defineStore('order', () => {
  const orders = ref<Order[]>([])
  const discountStore = useDiscountStore()

  const pendingOrders = computed(() => orders.value.filter((o) => o.status === 'pending'))
  const completedOrders = computed(() => orders.value.filter((o) => o.status === 'completed'))

  // 收入计算缓存：避免每次访问都 new Date()，只在日期变化时重算
  const _incomeCache = ref({ key: '' as string, today: 0, month: 0, total: 0 })
  function _incomeKey(): string {
    const n = new Date()
    return `${n.getFullYear()}-${n.getMonth()}-${n.getDate()}`
  }
  const todayIncome = computed(() => {
    const k = _incomeKey()
    if (_incomeCache.value.key !== k) {
      const n = new Date()
      let today = 0,
        month = 0,
        total = 0
      for (const o of orders.value) {
        if (o.status !== 'completed') continue
        total += o.finalAmount
        const d = new Date(o.completedAt ?? o.createdAt)
        if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth())
          month += o.finalAmount
        if (
          d.getFullYear() === n.getFullYear() &&
          d.getMonth() === n.getMonth() &&
          d.getDate() === n.getDate()
        )
          today += o.finalAmount
      }
      _incomeCache.value = { key: k, today, month, total }
    }
    return _incomeCache.value.today
  })

  const monthIncome = computed(() => {
    const k = _incomeKey()
    if (_incomeCache.value.key !== k) {
      const n = new Date()
      let today = 0,
        month = 0,
        total = 0
      for (const o of orders.value) {
        if (o.status !== 'completed') continue
        total += o.finalAmount
        const d = new Date(o.completedAt ?? o.createdAt)
        if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth())
          month += o.finalAmount
        if (
          d.getFullYear() === n.getFullYear() &&
          d.getMonth() === n.getMonth() &&
          d.getDate() === n.getDate()
        )
          today += o.finalAmount
      }
      _incomeCache.value = { key: k, today, month, total }
    }
    return _incomeCache.value.month
  })

  const totalIncome = computed(() => {
    const k = _incomeKey()
    if (_incomeCache.value.key !== k) {
      const n = new Date()
      let today = 0,
        month = 0,
        total = 0
      for (const o of orders.value) {
        if (o.status !== 'completed') continue
        total += o.finalAmount
        const d = new Date(o.completedAt ?? o.createdAt)
        if (d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth())
          month += o.finalAmount
        if (
          d.getFullYear() === n.getFullYear() &&
          d.getMonth() === n.getMonth() &&
          d.getDate() === n.getDate()
        )
          today += o.finalAmount
      }
      _incomeCache.value = { key: k, today, month, total }
    }
    return _incomeCache.value.total
  })

  async function load() {
    orders.value = (await getAll<Order>('orders'))
      .map(normalizeOrder)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  // 归一化历史订单：补齐缺失字段，避免 cancel/reopen/updateDraft 迭代
  // discountRecords / items 时因 undefined 而抛 TypeError（订单无法关闭的根因）
  function normalizeOrder(o: Order): Order {
    return {
      ...o,
      items: Array.isArray(o.items) ? o.items : [],
      discountRecords: Array.isArray(o.discountRecords) ? o.discountRecords : [],
      subtotal: typeof o.subtotal === 'number' ? o.subtotal : 0,
      discountAmount: typeof o.discountAmount === 'number' ? o.discountAmount : 0,
      finalAmount: typeof o.finalAmount === 'number' ? o.finalAmount : 0,
      createdAt: o.createdAt || now(),
      updatedAt: o.updatedAt || o.createdAt || now(),
    }
  }

  async function create(
    memberId: string,
    memberName: string,
    items: Order['items'],
    opts: { discountRecords?: DiscountRecord[]; discountAmount?: number; notes?: string } = {},
  ): Promise<Order> {
    const subtotal = subtotalOf(items)
    const discountAmount = Math.min(opts.discountAmount ?? 0, subtotal)
    const order: Order = {
      id: genOrderId(),
      memberId,
      memberName,
      items,
      subtotal,
      discountRecords: opts.discountRecords ?? [],
      discountAmount,
      finalAmount: Math.max(0, subtotal - discountAmount),
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
      notes: opts.notes,
    }
    await add('orders', order)
    orders.value.push(order)
    return order
  }

  // 开始执行（待处理 → 执行中），已处于执行中则保持
  async function beginExecute(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'closed') return
    o.status = 'in_progress'
    await put('orders', o)
  }

  // 暂存执行进度（保留已计秒数，不完成）
  async function saveExecution(
    id: string,
    items: OrderItem[],
    discountRecords?: DiscountRecord[],
    paymentMethod?: PaymentMethod,
  ): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    o.items = items
    if (discountRecords) {
      o.discountRecords = discountRecords
      o.discountAmount = discountRecords.reduce((s, r) => s + r.discountAmount, 0)
    }
    if (paymentMethod) o.paymentMethod = paymentMethod
    o.subtotal = subtotalOf(items)
    o.finalAmount = Math.max(0, o.subtotal - (o.discountAmount ?? 0))
    await put('orders', o)
  }

  // 实际完成订单：按实时 items 重算金额并记入支付方式
  async function finalize(
    id: string,
    items: OrderItem[],
    discountRecords: DiscountRecord[],
    method?: PaymentMethod,
  ): Promise<Order> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) throw new Error('not found')
    if (o.status !== 'in_progress') throw new Error('order not executable')
    const subtotal = subtotalOf(items)
    const discountAmount = Math.min(
      discountRecords.reduce((s, r) => s + r.discountAmount, 0),
      subtotal,
    )
    o.items = items
    o.subtotal = subtotal
    o.discountRecords = discountRecords
    o.discountAmount = discountAmount
    o.finalAmount = Math.max(0, subtotal - discountAmount)
    o.status = 'completed'
    o.paymentMethod = method
    o.completedAt = now()
    await put('orders', o)
    return o
  }

  async function cancel(id: string, opts: { rollbackDiscounts?: boolean } = {}): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'closed') return
    if (opts.rollbackDiscounts) {
      for (const rec of o.discountRecords) {
        const d = discountStore.discounts.find((x) => x.id === rec.discountId)
        if (d) await discountStore.rollbackUsage(d, o.memberId)
      }
    }
    o.status = 'closed'
    await put('orders', o)
  }

  // 重新打开已关闭的订单：恢复状态为待处理，不重新占用优惠用量
  // （用量在创建订单时已记录，关闭时已退还；此处仅还原订单状态）
  // 若订单关联的任一优惠已过期 / 停用 / 超兑，则禁止重新打开
  async function reopen(id: string): Promise<{ ok: boolean; reason?: string }> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status !== 'closed') return { ok: false, reason: '订单状态不可重开' }
    for (const rec of o.discountRecords) {
      const d = discountStore.discounts.find((x) => x.id === rec.discountId)
      if (!d || !discountStore.isUsable(d, o.memberId)) {
        const st = d ? discountStore.discountStatus(d, o.memberId) : 'disabled'
        const why =
          st === 'expired'
            ? '优惠已过期'
            : st === 'disabled'
              ? '优惠已停用'
              : st === 'exhausted'
                ? '优惠已达使用上限'
                : '优惠不存在'
        return { ok: false, reason: `无法重新打开：${why}` }
      }
    }
    o.status = 'pending'
    await put('orders', o)
    return { ok: true }
  }

  // 修改未执行（待处理）订单的草稿内容：备注、服务项、优惠
  async function updateDraft(
    id: string,
    patch: { notes?: string; items?: OrderItem[]; discountRecords?: DiscountRecord[] },
  ): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status !== 'pending') return
    if (patch.notes !== undefined) o.notes = patch.notes
    if (patch.items) {
      o.items = patch.items
      o.subtotal = subtotalOf(patch.items)
    }
    if (patch.discountRecords !== undefined) {
      const oldIds = new Set(o.discountRecords.map((r) => r.discountId))
      const newIds = new Set(patch.discountRecords.map((r) => r.discountId))
      // 被移除的优惠：回退用量
      for (const rec of o.discountRecords) {
        if (!newIds.has(rec.discountId)) {
          const d = discountStore.discounts.find((x) => x.id === rec.discountId)
          if (d) await discountStore.rollbackUsage(d, o.memberId)
        }
      }
      // 新增的优惠：补计用量
      for (const rec of patch.discountRecords) {
        if (!oldIds.has(rec.discountId)) {
          const d = discountStore.discounts.find((x) => x.id === rec.discountId)
          if (d) await discountStore.recordUsage(d, o.memberId)
        }
      }
      o.discountRecords = patch.discountRecords
      o.discountAmount = patch.discountRecords.reduce((s, r) => s + r.discountAmount, 0)
    }
    o.finalAmount = Math.max(0, o.subtotal - (o.discountAmount ?? 0))
    await put('orders', o)
  }

  async function remove(
    id: string,
    opts: { force?: boolean; rollbackDiscounts?: boolean } = {},
  ): Promise<void> {
    const idx = orders.value.findIndex((x) => x.id === id)
    const o = orders.value[idx]
    // 删除订单默认不回滚优惠（优惠回滚仅发生在「关闭」时）；
    // force 用于级联清理，绕过状态限制；rollbackDiscounts 用于级联清理时退还其他优惠的占用
    if (idx < 0 || !o) return
    if (!opts.force && o.status !== 'closed' && o.status !== 'completed') return
    if (opts.rollbackDiscounts) {
      for (const rec of o.discountRecords) {
        const d = discountStore.discounts.find((x) => x.id === rec.discountId)
        if (d) await discountStore.rollbackUsage(d, o.memberId)
      }
    }
    orders.value.splice(idx, 1)
    await del('orders', id)
  }

  // —— 以下为调试 / 作弊权限（仅高级模式可用） ——

  // 实验室：直接改写订单最终金额（单位：分），绕过计价器与优惠计算
  async function setFinalAmount(id: string, amountCents: number): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    o.finalAmount = Math.max(0, Math.round(amountCents))
    await put('orders', o)
  }

  // 实验室：强制重新打开已关闭订单，绕过优惠过期 / 停用 / 超兑校验（仅恢复状态，不修改优惠用量）
  async function forceReopen(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status !== 'closed') return
    o.status = 'pending'
    await put('orders', o)
  }

  // 实验室：直接改写订单的「只读」字段（状态 / 归属会员 / 小计 / 创建与完成时间等），
  // 绕过计价器与状态机校验。写入后仅保证金额非负，不做任何业务一致性重算。
  async function debugPatch(id: string, patch: Partial<Order>): Promise<void> {
    const uiStore = useUiStore()
    if (!uiStore.labMode) throw new Error('需开启作弊模式才能改写订单只读字段')
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    Object.assign(o, patch)
    o.subtotal = Math.max(0, Math.round(o.subtotal))
    o.discountAmount = Math.max(0, Math.round(o.discountAmount))
    o.finalAmount = Math.max(0, Math.round(o.finalAmount))
    o.updatedAt = now()
    await put('orders', o)
  }

  return {
    orders,
    pendingOrders,
    completedOrders,
    todayIncome,
    monthIncome,
    totalIncome,
    load,
    create,
    beginExecute,
    saveExecution,
    finalize,
    cancel,
    reopen,
    updateDraft,
    remove,
    setFinalAmount,
    forceReopen,
    debugPatch,
  }
})
