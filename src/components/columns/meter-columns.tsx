import { NTag, NButton } from 'naive-ui'
import {
  fmt,
  orderItemsByServiceRule,
  itemMeasureLabel,
  type Order,
  type OrderStatus,
} from '@/stores/types'
import { useServiceStore } from '@/stores/useServiceStore'

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
  const serviceStore = useServiceStore()
  const findService = (id: string) => serviceStore.services.find((s) => s.id === id)
  // 未完成订单跟随服务当前计价方式；已完成 / 已关闭沿用落库快照（历史账目不变）
  const shown = (o: Order) => orderItemsByServiceRule(o, findService)
  return [
    {
      title: '订单号',
      key: 'id',
      width: 220,
      render: (o: Order) => <span class="mono">{o.id}</span>,
    },
    { title: '会员', key: 'memberName', width: 100 },
    {
      title: '项目',
      key: 'items',
      width: 280,
      render: (o: Order) => {
        const { items, changed } = shown(o)
        const text = items.map((i) => `${i.serviceName} ${itemMeasureLabel(i)}`).join(', ')
        return changed ? `${text}（计费方式已更新，计价后生效）` : text
      },
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
