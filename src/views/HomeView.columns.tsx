import { NTag } from 'naive-ui'
import { fmt } from '@/stores/types'
import type { Order } from '@/stores/types'

export interface HomeViewColumn {
  title: string
  key: string
  width?: number
  render?: (row: Order) => string | import('vue').VNode
}

const statusLabel: Record<string, string> = {
  pending: '待处理',
  confirmed: '进行中',
  completed: '已完成',
  cancelled: '已取消',
}
const statusType: Record<string, 'warning' | 'info' | 'success' | 'default'> = {
  pending: 'warning',
  confirmed: 'info',
  completed: 'success',
  cancelled: 'default',
}

export const homeViewColumns: HomeViewColumn[] = [
  { title: '会员', key: 'memberName' },
  {
    title: '实收',
    key: 'finalAmount',
    width: 90,
    render: (row: Order) => (
      <span style={{ color: 'var(--n-success-color)' }}>¥{fmt(row.finalAmount)}</span>
    ),
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
]
