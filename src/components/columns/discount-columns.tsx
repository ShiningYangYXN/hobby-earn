import { NTag, NFlex, NButton, NText } from 'naive-ui'
import {
  fmt,
  formatZhe,
  ruleTypeLabelOf,
  isCouponRequired,
  type Discount,
} from '@/stores/types'
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
  minWidth?: number
  fixed?: 'left' | 'right'
  render?: (row: Discount) => string | import('vue').VNode
}

function memberTypeNames(ids: string[] = [], types: { id: string; name: string }[]): string {
  if (!ids.length) return '-'
  return ids.map((id) => types.find((t) => t.id === id)?.name ?? id).join('、')
}

// 时段描述（validFrom/validUntil + cron「且」组合）
function timeWindowLabel(d: Discount): string {
  const tw = d.scope?.timeWindow
  if (!tw) return '不限'
  const f = (s?: string) => (s ? s.slice(0, 10) : '')
  const range =
    tw.validFrom || tw.validUntil ? `${f(tw.validFrom)} ~ ${f(tw.validUntil)}` : '永久'
  return tw.cron ? `${tw.cron}（${range}）` : range
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
  const memberName = (id: string) => memberStore.members.find((m) => m.id === id)?.name ?? id

  return [
    { title: '名称', key: 'name', minWidth: 160 },
    {
      title: '执行方式',
      key: 'ruleType',
      width: 90,
      render: (row: Discount) => <NTag size="tiny">{ruleTypeLabelOf(row.ruleType)}</NTag>,
    },
    {
      title: '规则',
      key: 'value',
      width: 200,
      render: (row: Discount) => {
        if (row.ruleType === 'percentage')
          return `${row.value}% (${formatZhe(row.value)})`
        if (row.ruleType === 'perItem')
          return `每件立减 ¥${fmt(row.value)}${row.maxUnits ? `（≤${row.maxUnits}件）` : ''}`
        if (row.ruleType === 'stepDown')
          return `每满¥${fmt(row.minAmount)}减¥${fmt(row.value)}${row.maxUnits ? `（≤${row.maxUnits}阶）` : ''}`
        return `满¥${fmt(row.minAmount)}减¥${fmt(row.value)}`
      },
    },
    {
      title: '作用域',
      key: 'scope',
      width: 220,
      render: (row: Discount) => {
        const s = row.scope
        const tags: import('vue').VNode[] = []
        if (s?.memberTypeIds?.length)
          tags.push(
            <NTag size="tiny" type="info">
              {memberTypeNames(s.memberTypeIds, memberTypeStore.types)}
            </NTag>,
          )
        if (s?.memberIds?.length)
          tags.push(
            <NTag size="tiny" type="info">
              {s.memberIds.map(memberName).join('、')}
            </NTag>,
          )
        if (s?.timeWindow)
          tags.push(
            <NTag size="tiny" type="warning">
              {timeWindowLabel(row)}
            </NTag>,
          )
        if (s?.categories?.length)
          tags.push(
            <NTag size="tiny" type="success">
              {s.categories.map(catName).join('、')}
            </NTag>,
          )
        if (s?.items?.length)
          tags.push(
            <NTag size="tiny" type="success">
              {s.items.map(itemName).join('、')}
            </NTag>,
          )
        if (!tags.length) return <NText depth="3">全部</NText>
        return <NFlex size={4} wrap={true}>{tags}</NFlex>
      },
    },
    {
      title: '随机',
      key: 'random',
      width: 150,
      render: (row: Discount) => {
        if (!row.random) return '-'
        const kind = row.random.kind === 'amount' ? '立减' : '打折'
        const lo =
          row.random.kind === 'amount'
            ? fmt(row.random.min)
            : `${row.random.min}% (${formatZhe(row.random.min)})`
        const hi =
          row.random.kind === 'amount'
            ? fmt(row.random.max)
            : `${row.random.max}% (${formatZhe(row.random.max)})`
        return `${kind} ${lo}~${hi}`
      },
    },
    {
      title: '触发',
      key: 'trigger',
      width: 120,
      render: (row: Discount) => {
        if (isCouponRequired(row))
          return (
            <NTag size="tiny" type="error">
              券码兑换
            </NTag>
          )
        const parts = ['自动']
        if (row.triggerChance != null && row.triggerChance < 100)
          parts.push(`${row.triggerChance}%概率`)
        return parts.join(' · ')
      },
    },
    {
      title: '互斥组',
      key: 'exclusiveGroupId',
      width: 120,
      render: (row: Discount) =>
        row.exclusiveGroupId
          ? exclusiveGroupStore.groups.find((x) => x.id === row.exclusiveGroupId)?.name ??
            row.exclusiveGroupId
          : '-',
    },
    {
      title: '上限组',
      key: 'limitGroups',
      width: 130,
      render: (row: Discount) => {
        const gs = row.limitGroups ?? []
        if (!gs.length) return '-'
        return (
          <NFlex size={4} wrap={true}>
            {gs.map((g) => (
              <NTag size="tiny" type="error">
                {limitGroupStore.groups.find((x) => x.id === g)?.name ?? g}
              </NTag>
            ))}
          </NFlex>
        )
      },
    },
    {
      title: '券码',
      key: 'couponCode',
      width: 110,
      render: (row: Discount) => {
        if (!row.couponCode) return '-'
        return (
          <NFlex size={4} align="center">
            <NText class="mono">{row.couponCode}</NText>
            <NButton size="tiny" quaternary onClick={() => opts.copyCode(row.couponCode!)}>
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
      width: 170,
      render: (row: Discount) => timeWindowLabel(row),
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
      fixed: 'right',
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
