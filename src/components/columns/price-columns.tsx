import { NTag, NFlex, NButton, NEllipsis } from 'naive-ui'
import { fmt, type PriceEntry } from '@/stores/types'
import { useCategoryStore } from '@/stores/useCategoryStore'

export interface PriceColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  ellipsis?: boolean
  render?: (row: PriceEntry) => string | import('vue').VNode
}

export function buildPriceColumns(opts: {
  openEdit: (row: PriceEntry) => void
  toggle: (row: PriceEntry) => Promise<void>
  remove: (row: PriceEntry) => void
}): PriceColumn[] {
  const categoryStore = useCategoryStore()
  const catName = (id: string) => categoryStore.categories.find((c) => c.id === id)?.name ?? id
  return [
    { title: '名称', key: 'name', minWidth: 180 },
    {
      title: '分类',
      key: 'categoryIds',
      width: 160,
      render: (row: PriceEntry) =>
        row.categoryIds && row.categoryIds.length
          ? row.categoryIds.map(catName).join('、')
          : '-',
    },
    {
      title: '计价',
      key: 'pricingMode',
      width: 80,
      render: (row: PriceEntry) => (row.pricingMode === 'hourly' ? '工时' : '按件'),
    },
    {
      title: '价格',
      key: 'basePrice',
      width: 120,
      render: (row: PriceEntry) =>
        `¥${fmt(row.basePrice)}${row.pricingMode === 'hourly' ? '/h' : '/件'}`,
    },
    {
      title: '备注',
      key: 'description',
      width: 200,
      ellipsis: true,
      render: (row: PriceEntry) => (
        <NEllipsis lineClamp={1} tooltip>
          {row.description || '—'}
        </NEllipsis>
      ),
    },
    {
      title: '状态',
      key: 'isActive',
      width: 80,
      render: (row: PriceEntry) => (
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
      render: (row: PriceEntry) => (
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
