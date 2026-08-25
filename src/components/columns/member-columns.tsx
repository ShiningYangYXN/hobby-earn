import { NTag, NFlex, NButton, NText, NEllipsis } from 'naive-ui'
import type { Member, MemberType } from '@/stores/types'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

export interface MemberColumn {
  title: string
  key: string
  width?: number
  minWidth?: number
  fixed?: 'left' | 'right'
  render?: (row: Member) => string | import('vue').VNode
}

export function buildMemberColumns(opts: {
  openEdit: (m: Member) => void
  removeMember: (m: Member) => void
  toggleActive: (m: Member) => void
}): MemberColumn[] {
  const memberTypeStore = useMemberTypeStore()
  return [
    { title: '姓名', key: 'name', minWidth: 130 },
    { title: '手机', key: 'phone', width: 140, render: (row: Member) => row.phone || '-' },
    {
      title: '种类',
      key: 'typeIds',
      width: 200,
      render: (row: Member) => {
        const ids = row.typeIds ?? []
        if (!ids.length) return <NText depth={3}>未设置</NText>
        const tags = memberTypeStore.types
          .filter((x: MemberType) => ids.includes(x.id))
          .map((x: MemberType) => (
            <NTag size="tiny" type="info" style={{ marginRight: '4px' }}>
              {x.name}
            </NTag>
          ))
        return tags.length ? <NFlex size={4}>{tags}</NFlex> : <NText depth={3}>未设置</NText>
      },
    },
    {
      title: '状态',
      key: 'isActive',
      width: 90,
      render: (row: Member) =>
        row.isActive !== false ? (
          <NTag size="tiny" type="success">
            启用
          </NTag>
        ) : (
          <NTag size="tiny" type="default">
            停用
          </NTag>
        ),
    },
    {
      title: '加入时间',
      key: 'joinDate',
      width: 180,
      render: (row: Member) => new Date(row.joinDate).toLocaleString(),
    },
    {
      title: '备注',
      key: 'notes',
      width: 200,
      render: (row: Member) => (
        <NEllipsis line-clamp={1} tooltip>
          {row.notes || '-'}
        </NEllipsis>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 175,
      fixed: 'right',
      render: (row: Member) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.openEdit(row)}>
            编辑
          </NButton>
          <NButton
            size="tiny"
            type={row.isActive !== false ? 'warning' : 'success'}
            onClick={() => opts.toggleActive(row)}
          >
            {row.isActive !== false ? '停用' : '启用'}
          </NButton>
          <NButton size="tiny" type="error" onClick={() => opts.removeMember(row)}>
            删除
          </NButton>
        </NFlex>
      ),
    },
  ]
}
