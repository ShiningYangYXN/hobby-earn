import { NTag, NText, NEllipsis } from 'naive-ui'
import { fmt } from '@/stores/types'
import type { Order } from '@/stores/types'

export interface HomeViewColumn {
  title: string
  key: string
  width?: number
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
  { title: '会员', key: 'memberName' },
  {
    title: '金额',
    key: 'finalAmount',
    width: 90,
    render: (row: Order) => <NText type="success">¥{fmt(row.finalAmount)}</NText>,
  },
  {
    title: '状态',
    key: 'status',
    width: 80,
    render: (row: Order) => (
      <NTag type={statusType[row.status]!} size="tiny">
        {statusLabel[row.status]}
      </NTag>
    ),
  },
  {
    title: '时间',
    key: 'createdAt',
    width: 140,
    render: (row: Order) => new Date(row.createdAt).toLocaleString(),
  },
  {
    title: '备注',
    key: 'notes',
    ellipsis: true,
    render: (row: Order) => (
      <NEllipsis lineClamp={1} tooltip>
        {row.notes || '—'}
      </NEllipsis>
    ),
  },
]
