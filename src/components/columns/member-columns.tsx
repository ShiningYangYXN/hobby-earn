import { NTag, NFlex, NButton, NText, NEllipsis } from 'naive-ui'
import type { Member, MemberType } from '@/stores/types'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

export interface MemberColumn {
  title: string
  key: string
  width?: number
  render?: (row: Member) => string | import('vue').VNode
}

export function buildMemberColumns(opts: {
  openEdit: (m: Member) => void
  removeMember: (m: Member) => void
}): MemberColumn[] {
  const memberTypeStore = useMemberTypeStore()
  return [
    { title: '姓名', key: 'name' },
    { title: '手机', key: 'phone', width: 140, render: (row: Member) => row.phone || '-' },
    {
      title: '种类',
      key: 'typeId',
      width: 200,
      render: (row: Member) => {
        const t = memberTypeStore.types.find((x: MemberType) => x.id === row.typeId)
        return t ? (
          <NTag size="tiny" type="info">
            {t.name}
          </NTag>
        ) : (
          <NText depth="3">未设置</NText>
        )
      },
    },
    {
      title: '加入时间',
      key: 'joinDate',
      width: 160,
      render: (row: Member) => new Date(row.joinDate).toLocaleString(),
    },
    {
      title: '备注',
      key: 'notes',
      width: 160,
      render: (row: Member) => (
        <NEllipsis line-clamp={1} tooltip>
          {row.notes || '-'}
        </NEllipsis>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 130,
      render: (row: Member) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.openEdit(row)}>
            编辑
          </NButton>
          <NButton size="tiny" type="error" onClick={() => opts.removeMember(row)}>
            删除
          </NButton>
        </NFlex>
      ),
    },
  ]
}
