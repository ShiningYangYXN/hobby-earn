import { NTag, NFlex, NButton, NText } from 'naive-ui'
import { fmt, type Discount } from '@/stores/types'
import type { MemberType } from '@/stores/types'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useDiscountStore } from '@/stores/useDiscountStore'

export interface DiscountColumn {
  title: string
  key: string
  width?: number
  render?: (row: Discount) => string | import('vue').VNode
}

const typeLabelMap: Record<string, string> = {
  coupon: '券码',
  timeLimited: '限时',
  member: '会员',
  firstOrder: '首单',
  repeatOrder: '累次',
  category: '品类',
}
function typeLabel(t: string): string {
  return typeLabelMap[t] ?? t
}
function memberTypeNames(ids: string[] = [], types: MemberType[]): string {
  if (!ids.length) return '-'
  return ids.map((id) => types.find((t) => t.id === id)?.name ?? id).join('、')
}

const statusMeta: Record<string, { label: string; type: 'success' | 'warning' | 'default' | 'error' }> = {
  active: { label: '可用', type: 'success' },
  expired: { label: '已过期', type: 'warning' },
  disabled: { label: '已停用', type: 'default' },
  exhausted: { label: '已兑完', type: 'error' },
}

export function buildDiscountColumns(opts: {
  copyCode: (code: string) => void
  openEdit: (d: Discount) => void
  toggle: (d: Discount) => void
  remove: (d: Discount) => void
}): DiscountColumn[] {
  const memberTypeStore = useMemberTypeStore()
  const discountStore = useDiscountStore()
  return [
    { title: '名称', key: 'name' },
    {
      title: '类型',
      key: 'discountType',
      width: 90,
      render: (row: Discount) => <NTag size="tiny">{typeLabel(row.discountType)}</NTag>,
    },
    {
      title: '规则',
      key: 'ruleType',
      width: 70,
      render: (row: Discount) => (row.ruleType === 'percentage' ? '打折' : '满减'),
    },
    {
      title: '值',
      key: 'value',
      width: 90,
      render: (row: Discount) =>
        row.ruleType === 'percentage' ? `${row.value}%` : `¥${fmt(row.value)}`,
    },
    {
      title: '保底',
      key: 'minAmount',
      width: 90,
      render: (row: Discount) => `¥${fmt(row.minAmount)}`,
    },
    {
      title: '会员种类',
      key: 'memberTypeIds',
      width: 150,
      render: (row: Discount) =>
        row.discountType === 'member'
          ? memberTypeNames(row.memberTypeIds, memberTypeStore.types)
          : '-',
    },
    {
      title: '适用品类',
      key: 'categoryIds',
      width: 150,
      render: (row: Discount) =>
        row.discountType === 'category' && row.categoryIds && row.categoryIds.length
          ? row.categoryIds.join('、')
          : '-',
    },
    {
      title: '互斥组',
      key: 'exclusiveGroup',
      width: 90,
      render: (row: Discount) =>
        row.exclusiveGroup?.trim() ? (
          <NTag size="tiny" type="error">
            {row.exclusiveGroup!.trim()}
          </NTag>
        ) : (
          '-'
        ),
    },
    {
      title: '券码',
      key: 'code',
      width: 150,
      render: (row: Discount) => {
        if (row.discountType !== 'coupon' || !row.code) return '-'
        return (
          <NFlex size={4} align="center">
            <NText class="mono">{row.code}</NText>
            <NButton size="tiny" quaternary onClick={() => opts.copyCode(row.code!)}>
              复制
            </NButton>
          </NFlex>
        )
      },
    },
    {
      title: '已用',
      key: 'usedCount',
      width: 80,
      render: (row: Discount) => `${row.usedCount}/${row.usageLimit ?? '∞'}`,
    },
    {
      title: '有效期',
      key: 'validUntil',
      width: 150,
      render: (row: Discount) => {
        if (row.discountType === 'member') return '不限'
        const f = (s: string) => (s ? s.slice(0, 10) : '永久')
        return row.validFrom || row.validUntil
          ? `${f(row.validFrom)} ~ ${f(row.validUntil)}`
          : '永久'
      },
    },
    {
      title: '状态',
      key: 'status',
      width: 90,
      render: (row: Discount) => {
        const s = discountStore.discountStatus(row)
        const meta = statusMeta[s] ?? { label: '未知', type: 'default' as const }
        return (
          <NTag type={meta.type} size="tiny">
            {meta.label}
          </NTag>
        )
      },
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (row: Discount) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.openEdit(row)}>
            编辑
          </NButton>
          <NButton
            size="tiny"
            type={row.isActive ? 'warning' : 'success'}
            onClick={() => opts.toggle(row)}
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
