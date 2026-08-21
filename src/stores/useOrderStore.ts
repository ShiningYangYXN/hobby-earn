import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import { getAll, put, add, del } from './db'
import type { Order, PaymentMethod, DiscountRecord } from './types'
import { uid, now } from './types'

export const useOrderStore = defineStore('order', () => {
  const orders = ref<Order[]>([])

  const pendingOrders   = computed(() => orders.value.filter(o => o.status === 'pending'))
  const completedOrders = computed(() => orders.value.filter(o => o.status === 'completed'))

  const todayIncome = computed(() =>
    orders.value.filter(o => o.status === 'completed' && isToday(o.completedAt ?? o.createdAt))
      .reduce((s, o) => s + o.finalAmount, 0))

  const monthIncome = computed(() => {
    const n = new Date()
    return orders.value.filter(o => {
      if (o.status !== 'completed') return false
      const d = new Date(o.completedAt ?? o.createdAt)
      return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth()
    }).reduce((s, o) => s + o.finalAmount, 0)
  })

  const totalIncome = computed(() =>
    orders.value.filter(o => o.status === 'completed').reduce((s, o) => s + o.finalAmount, 0))

  async function load() {
    orders.value = (await getAll<Order>('orders')).sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async function create(
    memberId: string, memberName: string, items: Order['items'],
    opts: { discountRecords?: DiscountRecord[]; discountAmount?: number; notes?: string } = {},
  ): Promise<Order> {
    // 工时项目：按 elapsed 计算实际金额，否则用 unitPrice * quantity
    const subtotal = items.reduce((s, i) => {
      if (i.pricingMode === 'hourly' && i.elapsed) {
        return s + Math.round(i.hourlyRate! / 3600 * i.elapsed)
      }
      return s + i.unitPrice * i.quantity
    }, 0)
    const discountAmount = Math.min(opts.discountAmount ?? 0, subtotal)
    const order: Order = {
      id: uid(), memberId, memberName, items,
      subtotal, discountRecords: opts.discountRecords ?? [], discountAmount,
      finalAmount: Math.max(0, subtotal - discountAmount),
      status: 'pending', createdAt: now(), notes: opts.notes,
    }
    await add('orders', order); orders.value.push(order)
    return order
  }

  async function confirm(id: string): Promise<void> {
    const o = orders.value.find(x => x.id === id)
    if (!o || o.status !== 'pending') return
    o.status = 'confirmed'; await put('orders', o)
  }

  async function complete(id: string, method?: PaymentMethod): Promise<Order> {
    const o = orders.value.find(x => x.id === id)
    if (!o || o.status !== 'confirmed') throw new Error('not confirmed')
    o.status = 'completed'; o.paymentMethod = method; o.completedAt = now()
    await put('orders', o); return o
  }

  async function cancel(id: string): Promise<void> {
    const o = orders.value.find(x => x.id === id)
    if (!o || o.status === 'completed' || o.status === 'cancelled') return
    o.status = 'cancelled'; await put('orders', o)
  }

  async function remove(id: string): Promise<void> {
    const idx = orders.value.findIndex(x => x.id === id)
    if (idx < 0 || orders.value[idx]!.status !== 'cancelled') return
    orders.value.splice(idx, 1); await del('orders', id)
  }

  return { orders, pendingOrders, completedOrders, todayIncome, monthIncome, totalIncome, load, create, confirm, complete, cancel, remove }
})

function isToday(s: string): boolean {
  const d = new Date(s), n = new Date()
  return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth() && d.getDate() === n.getDate()
}
