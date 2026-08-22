import { NButton, NFlex, NPopconfirm } from 'naive-ui'
import type { MemberType } from '@/stores/types'

export interface MemberTypeColumn {
  title: string
  key: string
  width?: number
  render?: (row: MemberType) => import('vue').VNode
}

export interface MemberTypeColumnsOpts {
  editType: (id: string) => void
  removeType: (t: MemberType) => void
}

export function buildMemberTypeColumns(opts: MemberTypeColumnsOpts): MemberTypeColumn[] {
  return [
    { title: '种类名称', key: 'name' },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (row: MemberType) => (
        <NFlex size={4}>
          <NButton size="tiny" onClick={() => opts.editType(row.id)}>
            编辑
          </NButton>
          <NPopconfirm onPositiveClick={() => opts.removeType(row)}>
            {{
              trigger: () => <NButton size="tiny" type="error">删除</NButton>,
              default: () => '删除该种类？会员记录不受影响。',
            }}
          </NPopconfirm>
        </NFlex>
      ),
    },
  ]
}
