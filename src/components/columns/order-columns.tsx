import { NTag, NFlex, NButton, NText, NEllipsis } from 'naive-ui'
import {
  fmt,
  orderItemsByServiceRule,
  itemMeasureLabel,
  isExclusiveService,
  type Order,
  type OrderItem,
  type OrderStatus,
} from '@/stores/types'
import { useServiceStore } from '@/stores/useServiceStore'

export type OrderCellRenderer = (row: Order) => string | import('vue').VNode

export interface OrderColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  render?: OrderCellRenderer
}

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'warning' | 'info' | 'success' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '执行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  closed: { label: '已关闭', type: 'default' },
}

export interface OrderColumnsOpts {
  openDetail: (o: Order) => void
  goMeter: (o: Order) => void
  doCancel: (o: Order) => void
  doReopen: (o: Order) => void
  doDelete: (o: Order) => void
  labMode: boolean
}

export function buildOrderColumns(opts: OrderColumnsOpts): OrderColumn[] {
  const serviceStore = useServiceStore()
  const findService = (id: string) => serviceStore.services.find((s) => s.id === id)
  const isExclusive = (id: string) => {
    const p = findService(id)
    return p ? isExclusiveService(p) : false
  }
  // 展示用订单项：未完成订单跟随服务当前计价方式，已完成 / 已关闭沿用落库快照
  const shown = (row: Order) => orderItemsByServiceRule(row, findService)
  return [
    {
      title: '订单号',
      key: 'id',
      width: 220,
      render: (row: Order) => <NText class="mono">{row.id}</NText>,
    },
    { title: '会员', key: 'memberName', width: 100 },
    {
      title: '项目',
      key: 'items',
      width: 240,
      render: (row: Order) => {
        const { items, changed } = shown(row)
        return (
          <NFlex size={6} vertical>
            {items.map((i: OrderItem, idx: number) => (
              <NFlex key={idx} size={4} align="center" wrap>
                <NText>
                  {i.serviceName} {itemMeasureLabel(i)}
                </NText>
                {isExclusive(i.priceEntryId) && (
                  <NTag size="tiny" type="warning" bordered={false}>
                    专属
                  </NTag>
                )}
              </NFlex>
            ))}
            {changed > 0 && (
              <NTag size="tiny" type="info" bordered={false}>
                计费方式已随服务更新，保存后金额生效
              </NTag>
            )}
          </NFlex>
        )
      },
    },
    { title: '小计', key: 'subtotal', width: 90, render: (row: Order) => fmt(row.subtotal) },
    {
      title: '优惠',
      key: 'discountAmount',
      width: 90,
      render: (row: Order) => (row.discountAmount > 0 ? `-${fmt(row.discountAmount)}` : '—'),
    },
    {
      title: '金额',
      key: 'finalAmount',
      width: 100,
      render: (row: Order) => (
        <NText type="success" strong>
          {fmt(row.finalAmount)}
        </NText>
      ),
    },
    {
      title: '状态',
      key: 'status',
      width: 80,
      render: (row: Order) => (
        <NTag type={statusCfg[row.status].type} size="tiny">
          {statusCfg[row.status].label}
        </NTag>
      ),
    },
    {
      title: '时间',
      key: 'createdAt',
      width: 170,
      render: (row: Order) => new Date(row.createdAt).toLocaleString(),
    },
    {
      title: '备注',
      key: 'notes',
      width: 180,
      render: (row: Order) => (
        <NEllipsis line-clamp={1} tooltip>
          {row.notes || '-'}
        </NEllipsis>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 200,
      fixed: 'right',
      render: (row: Order) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.openDetail(row)}>
            详情
          </NButton>
          {(row.status === 'pending' || row.status === 'in_progress') && (
            <NButton size="tiny" type="primary" onClick={() => opts.goMeter(row)}>
              去计价
            </NButton>
          )}
          {row.status !== 'completed' && row.status !== 'closed' && (
            <NButton size="tiny" type="warning" onClick={() => opts.doCancel(row)}>
              关闭订单
            </NButton>
          )}
          {row.status === 'closed' && (
            <NButton size="tiny" type="primary" onClick={() => opts.doReopen(row)}>
              重新打开
            </NButton>
          )}
          {(row.status === 'closed' || (row.status === 'completed' && opts.labMode)) && (
            <NButton size="tiny" type="error" onClick={() => opts.doDelete(row)}>
              删除
            </NButton>
          )}
        </NFlex>
      ),
    },
  ]
}
