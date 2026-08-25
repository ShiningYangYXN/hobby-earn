import { NTag, NText, NEllipsis } from 'naive-ui'
import { fmt, tableScrollX } from '@/stores/types'
import type { Order } from '@/stores/types'

export interface HomeViewColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  render?: (row: Order) => string | import('vue').VNode
}

const statusLabel: Record<string, string> = {
  pending: '待处理',
  in_progress: '执行中',
  completed: '已完成',
  closed: '已关闭',
}
const statusType: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  pending: 'warning',
  in_progress: 'info',
  completed: 'success',
  closed: 'default',
}

export const homeViewColumns: HomeViewColumn[] = [
  { title: '会员', key: 'memberName', minWidth: 120 },
  {
    title: '金额',
    key: 'finalAmount',
    width: 100,
    render: (row: Order) => <NText type="success">{fmt(row.finalAmount)}</NText>,
  },
  {
    title: '状态',
    key: 'status',
    width: 90,
    render: (row: Order) => (
      <NTag type={statusType[row.status]!} size="tiny">
        {statusLabel[row.status]}
      </NTag>
    ),
  },
  {
    title: '时间',
    key: 'createdAt',
    width: 180,
    render: (row: Order) => new Date(row.createdAt).toLocaleString(),
  },
  {
    title: '备注',
    key: 'notes',
    width: 200,
    ellipsis: true,
    render: (row: Order) => (
      <NEllipsis lineClamp={1} tooltip>
        {row.notes || '—'}
      </NEllipsis>
    ),
  },
]

export const homeScrollX = tableScrollX(homeViewColumns)
