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
  const executableOrders = computed(() =>
    orders.value.filter((o) => o.status === 'confirmed' || o.status === 'in_progress'),
  )

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
    // 工时项目：按 elapsed 计算金额（预订时为预计时长），否则用 unitPrice * quantity
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
      status: 'in_progress',
      createdAt: now(),
      notes: opts.notes,
    }
    await add('orders', order)
    orders.value.push(order)
    return order
  }

  // 开始执行（预订 → 执行中），已处于执行中则保持
  async function beginExecute(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'cancelled') return
    o.status = 'in_progress'
    await put('orders', o)
  }

  // 暂存执行进度（保留已计秒数，不完成）
  async function saveExecution(id: string, items: OrderItem[]): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o) return
    o.items = items
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
    if (o.status !== 'confirmed' && o.status !== 'in_progress')
      throw new Error('order not executable')
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

  async function complete(id: string, method?: PaymentMethod): Promise<Order> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status !== 'confirmed') throw new Error('not confirmed')
    o.status = 'completed'
    o.paymentMethod = method
    o.completedAt = now()
    await put('orders', o)
    return o
  }

  async function cancel(id: string): Promise<void> {
    const o = orders.value.find((x) => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'cancelled') return
    o.status = 'cancelled'
    await put('orders', o)
  }

  async function remove(id: string): Promise<void> {
    const idx = orders.value.findIndex((x) => x.id === id)
    const o = orders.value[idx]
    if (idx < 0 || !o || o.status !== 'cancelled') return
    for (const r of o.discountRecords) await discountStore.rollbackUsage(r.discountId, o.memberId)
    orders.value.splice(idx, 1)
    await del('orders', id)
  }

  return {
    orders,
    pendingOrders,
    completedOrders,
    executableOrders,
    todayIncome,
    monthIncome,
    totalIncome,
    load,
    create,
    beginExecute,
    saveExecution,
    finalize,
    complete,
    cancel,
    remove,
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
