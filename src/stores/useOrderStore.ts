import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Order, PaymentMethod, DiscountRecord, OrderItem } from './types'
import { uid, now, subtotalOf } from './types'
import { useDiscountStore } from './useDiscountStore'

export const useOrderStore = defineStore('order', () => {
  const orders = ref<Order[]>([])
  const discountStore = useDiscountStore()

  const pendingOrders = computed(() => orders.value.filter((o) => o.status === 'pending'))
  const completedOrders = computed(() => orders.value.filter((o) => o.status === 'completed'))

  const todayIncome = computed(() =>
    orders.value
      .filter((o) => o.status === 'completed' && isToday(o.completedAt ?? o.createdAt))
      .reduce((s, o) => s + o.finalAmount, 0),
  )

  const monthIncome = computed(() => {
    const n = new Date()
    return orders.value
      .filter((o) => {
        if (o.status !== 'completed') return false
        const d = new Date(o.completedAt ?? o.createdAt)
        return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
      })
      .reduce((s, o) => s + o.finalAmount, 0)
  })

  const totalIncome = computed(() =>
    orders.value.filter((o) => o.status === 'completed').reduce((s, o) => s + o.finalAmount, 0),
  )

  async function load() {
    orders.value = (await getAll<Order>('orders')).sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt),
    )
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
      id: uid(),
      memberId,
      memberName,
      items,
      subtotal,
      discountRecords: opts.discountRecords ?? [],
      discountAmount,
      finalAmount: Math.max(0, subtotal - discountAmount),
      status: 'pending',
      createdAt: now(),
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
  ): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    o.items = items
    if (discountRecords) {
      o.discountRecords = discountRecords
      o.discountAmount = discountRecords.reduce((s, r) => s + r.discountAmount, 0)
    }
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

  async function cancel(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'closed') return
    o.status = 'closed'
    await put('orders', o)
  }

  // 重新打开已关闭的订单：重新使用优惠（重新占用用量而非退还），状态回到待处理
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
    // 重新占用优惠用量（重新使用优惠）
    for (const rec of o.discountRecords) {
      await discountStore.recordUsage(rec.discountId, o.memberId)
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
    if (patch.discountRecords) {
      o.discountRecords = patch.discountRecords
      o.discountAmount = patch.discountRecords.reduce((s, r) => s + r.discountAmount, 0)
    }
    o.finalAmount = Math.max(0, o.subtotal - (o.discountAmount ?? 0))
    await put('orders', o)
  }

  async function remove(id: string): Promise<void> {
    const idx = orders.value.findIndex((x) => x.id === id)
    const o = orders.value[idx]
    // 删除订单不回滚优惠（优惠回滚仅发生在「关闭」时）
    if (idx < 0 || !o || (o.status !== 'closed' && o.status !== 'completed')) return
    orders.value.splice(idx, 1)
    await del('orders', id)
  }

  // —— 以下为调试 / 作弊权限（仅高级模式可用） ——

  // 调试：直接改写订单最终金额（单位：分），绕过计价器与优惠计算
  async function setFinalAmount(id: string, amountCents: number): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    o.finalAmount = Math.max(0, Math.round(amountCents))
    await put('orders', o)
  }

  // 调试：强制重新打开已关闭订单，绕过优惠过期 / 停用 / 超兑校验
  async function forceReopen(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status !== 'closed') return
    for (const rec of o.discountRecords) {
      await discountStore.recordUsage(rec.discountId, o.memberId)
    }
    o.status = 'pending'
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
  }
})

function isToday(s: string): boolean {
  const d = new Date(s),
    n = new Date()
  return (
    d.getFullYear() === n.getFullYear() &&
    d.getMonth() === n.getMonth() &&
    d.getDate() === n.getDate()
  )
}
