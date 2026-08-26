import { NTag, NFlex, NButton, NEllipsis, NText } from 'naive-ui'
import { fmt, type ServiceEntry } from '@/stores/types'
import { useCategoryStore } from '@/stores/useCategoryStore'

export interface ServiceColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  render?: (row: ServiceEntry) => string | import('vue').VNode
}

export function buildServiceColumns(opts: {
  openEdit: (row: ServiceEntry) => void
  toggle: (row: ServiceEntry) => Promise<void>
  remove: (row: ServiceEntry) => void
}): ServiceColumn[] {
  const categoryStore = useCategoryStore()
  const catName = (id: string) => categoryStore.categories.find((c) => c.id === id)?.name ?? id
  return [
    {
      title: '服务号',
      key: 'id',
      width: 220,
      render: (row: ServiceEntry) => <NText class="mono">{row.id}</NText>,
    },
    { title: '名称', key: 'name', minWidth: 180 },
    {
      title: '分类',
      key: 'categoryIds',
      width: 160,
      render: (row: ServiceEntry) =>
        row.categoryIds && row.categoryIds.length ? row.categoryIds.map(catName).join('、') : '-',
    },
    {
      title: '计价',
      key: 'pricingMode',
      width: 80,
      render: (row: ServiceEntry) => (row.pricingMode === 'hourly' ? '工时' : '按件'),
    },
    {
      title: '价格',
      key: 'basePrice',
      width: 120,
      render: (row: ServiceEntry) =>
        `${fmt(row.basePrice)}${row.pricingMode === 'hourly' ? '/小时' : '/件'}`,
    },
    {
      title: '备注',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (row: ServiceEntry) => (
        <NEllipsis lineClamp={1} tooltip>
          {row.description || '-'}
        </NEllipsis>
      ),
    },
    {
      title: '状态',
      key: 'isActive',
      width: 80,
      render: (row: ServiceEntry) => (
        <NTag type={row.isActive ? 'success' : 'default'} size="tiny">
          {row.isActive ? '启用' : '禁用'}
        </NTag>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 190,
      fixed: 'right',
      render: (row: ServiceEntry) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.openEdit(row)}>
            编辑
          </NButton>
          <NButton
            size="tiny"
            type={row.isActive ? 'warning' : 'success'}
            onClick={async () => {
              await opts.toggle(row)
            }}
          >
            {row.isActive ? '停用' : '启用'}
          </NButton>
          <NButton size="tiny" type="error" onClick={() => opts.remove(row)}>
            删除
          </NButton>
        </NFlex>
      ),
    },
  ]
}
