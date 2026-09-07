import { NTag, NFlex, NButton, NEllipsis, NText } from 'naive-ui'
import { fmt, isExclusiveService, type ServiceEntry, type TimeWindow } from '@/stores/types'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useServiceLimitGroupStore } from '@/stores/useServiceLimitGroupStore'
import { useServiceExclusiveGroupStore } from '@/stores/useServiceExclusiveGroupStore'

/** 时段描述（validFrom/validUntil + cron 组合），与优惠作用域的展示保持一致 */
function timeWindowLabel(tw: TimeWindow): string {
  const f = (s?: string) => (s ? s.slice(0, 10) : '')
  const range = tw.validFrom || tw.validUntil ? `${f(tw.validFrom)} ~ ${f(tw.validUntil)}` : '永久'
  return tw.cron ? `${tw.cron}（${range}）` : range
}

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
  /** 是否展示删除按钮：被订单引用且未开启作弊模式时隐藏 */
  canDelete?: (row: ServiceEntry) => boolean
}): ServiceColumn[] {
  const canDelete = opts.canDelete ?? (() => true)
  const categoryStore = useCategoryStore()
  const memberStore = useMemberStore()
  const memberTypeStore = useMemberTypeStore()
  const limitGroupStore = useServiceLimitGroupStore()
  const exclusiveGroupStore = useServiceExclusiveGroupStore()
  const catName = (id: string) => categoryStore.categories.find((c) => c.id === id)?.name ?? id
  const memberName = (id: string) => memberStore.members.find((m) => m.id === id)?.name ?? id
  const typeName = (id: string) => memberTypeStore.types.find((t) => t.id === id)?.name ?? id
  const limitGroupName = (id: string) => limitGroupStore.groups.find((g) => g.id === id)?.name ?? id
  const exclusiveGroupName = (id: string) =>
    exclusiveGroupStore.groups.find((g) => g.id === id)?.name ?? id
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
      title: '可用限制',
      key: 'restrictions',
      width: 280,
      render: (row: ServiceEntry) => {
        const tags: import('vue').VNode[] = []
        if (row.memberTypeIds?.length)
          tags.push(
            <NTag size="tiny" type="info">
              种类：{row.memberTypeIds.map(typeName).join('、')}
            </NTag>,
          )
        if (row.memberIds?.length)
          tags.push(
            <NTag size="tiny" type="info">
              会员：{row.memberIds.map(memberName).join('、')}
            </NTag>,
          )
        if (row.timeWindow)
          tags.push(
            <NTag size="tiny" type="warning">
              时段：{timeWindowLabel(row.timeWindow)}
            </NTag>,
          )
        if ((row.purchaseLimit ?? 0) > 0)
          tags.push(
            <NTag size="tiny" type="warning">
              限购 {row.purchaseLimit}
              {row.pricingMode === 'hourly' ? '小时' : '件'}
            </NTag>,
          )
        for (const gid of row.limitGroupIds ?? [])
          tags.push(
            <NTag size="tiny" type="error">
              分组限购：{limitGroupName(gid)}
            </NTag>,
          )
        for (const gid of row.exclusiveGroupIds ?? [])
          tags.push(
            <NTag size="tiny" type="default">
              互斥：{exclusiveGroupName(gid)}
            </NTag>,
          )
        if (!tags.length)
          return isExclusiveService(row) ? (
            <NTag size="tiny" type="info">
              专属
            </NTag>
          ) : (
            <NText depth="3">无限制</NText>
          )
        return (
          <NFlex size={4} wrap={true}>
            {tags}
          </NFlex>
        )
      },
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
          {canDelete(row) && (
            <NButton size="tiny" type="error" onClick={() => opts.remove(row)}>
              删除
            </NButton>
          )}
        </NFlex>
      ),
    },
  ]
}
