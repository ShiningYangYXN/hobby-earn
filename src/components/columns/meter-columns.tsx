import { NTag, NButton } from 'naive-ui'
import { fmt, fmtElapsed, type Order, type OrderStatus } from '@/stores/types'

export interface MeterColumnsOpts {
  openOrder: (o: Order) => void
}

export interface MeterColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  render?: (o: Order) => string | import('vue').VNode
}

const statusLabel = (s: OrderStatus) =>
  ({ pending: '待处理', in_progress: '执行中', completed: '已完成', closed: '已关闭' })[s]
const statusType = (s: OrderStatus) =>
  ({ pending: 'warning', in_progress: 'info', completed: 'success', closed: 'default' })[s] as
    | 'warning'
    | 'info'
    | 'success'
    | 'default'

export function buildMeterColumns(opts: MeterColumnsOpts): MeterColumn[] {
  return [
    {
      title: '订单号',
      key: 'id',
      width: 200,
      render: (o: Order) => <span class="mono">{o.id}</span>,
    },
    { title: '会员', key: 'memberName', width: 100 },
    {
      title: '项目',
      key: 'items',
      width: 280,
      render: (o: Order) =>
        o.items
          .map((i) => {
            if (i.pricingMode === 'hourly' && i.elapsed) {
              return `${i.serviceName} ${fmtElapsed(i.elapsed)}`
            }
            return `${i.serviceName}×${i.quantity}`
          })
          .join(', '),
    },
    {
      title: '金额',
      key: 'finalAmount',
      width: 100,
      render: (o: Order) => fmt(o.finalAmount),
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
      fixed: 'right',
      render: (o: Order) => (
        <NButton size="tiny" type="primary" onClick={() => opts.openOrder(o)}>
          打开计价
        </NButton>
      ),
    },
  ]
}
