import { NTag, NButton } from 'naive-ui'
import { fmt, type Order, type OrderStatus } from '@/stores/types'

export interface MeterColumnsOpts {
  openOrder: (o: Order) => void
}

const statusLabel = (s: OrderStatus) =>
  ({ pending: '待处理', in_progress: '执行中', completed: '已完成', cancelled: '已取消' })[s]
const statusType = (s: OrderStatus) =>
  ({ pending: 'warning', in_progress: 'info', completed: 'success', cancelled: 'default' })[s] as
    | 'warning'
    | 'info'
    | 'success'
    | 'default'

export function buildMeterColumns(opts: MeterColumnsOpts) {
  return [
    { title: '订单号', key: 'id', width: 100, render: (o: Order) => o.id.slice(-8) },
    { title: '会员', key: 'memberName', width: 100 },
    {
      title: '项目',
      key: 'items',
      render: (o: Order) =>
        o.items
          .map((i) => {
            if (i.pricingMode === 'hourly' && i.elapsed) {
              const m = Math.floor(i.elapsed / 60)
              const s = i.elapsed % 60
              return `${i.serviceName} ${m}'${s.toString().padStart(2, '0')}`
            }
            return `${i.serviceName}×${i.quantity}`
          })
          .join(', '),
    },
    {
      title: '实收',
      key: 'finalAmount',
      width: 90,
      render: (o: Order) => `¥${fmt(o.finalAmount)}`,
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (o: Order) => (
        <NTag type={statusType(o.status)} size="tiny">
          {statusLabel(o.status)}
        </NTag>
      ),
    },
    {
      title: '操作',
      key: 'op',
      width: 90,
      render: (o: Order) => (
        <NButton size="tiny" type="primary" onClick={() => opts.openOrder(o)}>
          打开计价
        </NButton>
      ),
    },
  ]
}
