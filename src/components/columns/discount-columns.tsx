import { NTag, NFlex, NButton, NText } from 'naive-ui'
import { fmt, type Discount } from '@/stores/types'
import type { MemberType } from '@/stores/types'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'

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
  exclusive: '专属',
  periodic: '周期',
}
function typeLabel(t: string): string {
  return typeLabelMap[t] ?? t
}
function memberTypeNames(ids: string[] = [], types: MemberType[]): string {
  if (!ids.length) return '-'
  return ids.map((id) => types.find((t) => t.id === id)?.name ?? id).join('、')
}
// 周期优惠的生效描述（含 cron）
function periodLabel(d: Discount): string {
  if (d.discountType !== 'periodic') return ''
  const t = d.periodType
  if (t === 'daily') return '每日'
  if (t === 'cron') return `Cron: ${d.cronExpr ?? ''}`.trim()
  if (t === 'weekly') {
    const w = ['日', '一', '二', '三', '四', '五', '六']
    return '每周' + (d.periodValues ?? []).map((v) => '周' + (w[v] ?? v)).join('、')
  }
  if (t === 'monthly') return '每月' + (d.periodValues ?? []).map((v) => `${v}号`).join('、')
  return ''
}

const statusMeta: Record<
  string,
  { label: string; type: 'success' | 'warning' | 'default' | 'error' | 'info' }
> = {
  active: { label: '可用', type: 'success' },
  upcoming: { label: '未开始', type: 'info' },
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
  const memberStore = useMemberStore()
  const discountStore = useDiscountStore()
  const exclusiveGroupStore = useExclusiveGroupStore()
  const categoryStore = useCategoryStore()
  const limitGroupStore = useLimitGroupStore()
  const priceStore = usePriceStore()
  const catName = (id: string) => categoryStore.categories.find((c) => c.id === id)?.name ?? id
  const itemName = (id: string) => priceStore.prices.find((p) => p.id === id)?.name ?? id
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
      render: (row: Discount) =>
        row.ruleType === 'percentage'
          ? '打折'
          : row.ruleType === 'stepDown'
            ? '每满减'
            : '满减',
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
        row.categoryIds && row.categoryIds.length
          ? row.categoryIds.map(catName).join('、')
          : '-',
    },
    {
      title: '参与单品',
      key: 'itemIds',
      width: 150,
      render: (row: Discount) =>
        row.itemIds && row.itemIds.length
          ? row.itemIds.map(itemName).join('、')
          : '-',
    },
    {
      title: '专属会员',
      key: 'memberIds',
      width: 150,
      render: (row: Discount) =>
        row.discountType === 'exclusive' && row.memberIds && row.memberIds.length
          ? row.memberIds
              .map((id) => memberStore.members.find((m) => m.id === id)?.name ?? id)
              .join('、')
          : '-',
    },
    {
      title: '互斥组',
      key: 'exclusiveGroups',
      width: 140,
      render: (row: Discount) => {
        const gs = row.exclusiveGroups ?? []
        if (!gs.length) return '-'
        return (
          <NFlex size={4} wrap={true}>
            {gs.map((g) => (
              <NTag size="tiny" type="error">
                {exclusiveGroupStore.groups.find((x) => x.id === g)?.name ?? g}
              </NTag>
            ))}
          </NFlex>
        )
      },
    },
    {
      title: '上限组',
      key: 'limitGroupId',
      width: 130,
      render: (row: Discount) =>
        row.limitGroupId
          ? (limitGroupStore.groups.find((g) => g.id === row.limitGroupId)?.name ?? row.limitGroupId)
          : '-',
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
        const period = periodLabel(row)
        if (period) {
          const range =
            row.validFrom || row.validUntil ? `（${f(row.validFrom)} ~ ${f(row.validUntil)}）` : '（永久）'
          return `${period}${range}`
        }
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
