<script setup lang="ts">
import { h, ref, computed, onMounted } from 'vue'
import { NButton, NSpace, NDataTable, NTag, NModal, NForm, NFormItem, NInput, NSelect, NInputNumber, NSwitch, NDatePicker, useMessage, useDialog } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { fmt, type Discount, type MemberType } from '@/stores/types'

const msg = useMessage()
const dialog = useDialog()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()
onMounted(() => { discountStore.load(); memberTypeStore.load() })

const modal = ref(false)
const editing = ref<string | null>(null)
type DiscountForm = Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount' | 'validFrom' | 'validUntil'> & { validFrom: number | null; validUntil: number | null }
const emptyForm = (): DiscountForm => ({
  name: '', discountType: 'coupon', ruleType: 'fixed',
  value: 0, minAmount: 0, maxDiscount: 0, code: '', repeatThreshold: 1, memberTypeIds: [],
  validFrom: null, validUntil: null, usageLimit: null, memberLimit: null, isActive: true,
})
const form = ref<DiscountForm>(emptyForm())
const rules = { name: { required: true, message: '必填', trigger: 'blur' }, value: { required: true, message: '必填', trigger: 'change' }, minAmount: { required: true, message: '必填', trigger: 'change' } }
const typeOpts = [
  { label: '券码优惠', value: 'coupon' }, { label: '限时优惠', value: 'timeLimited' },
  { label: '会员优惠', value: 'member' }, { label: '首单优惠', value: 'firstOrder' },
  { label: '累次优惠', value: 'repeatOrder' }, { label: '推广优惠', value: 'referral' },
]
const ruleOpts = [{ label: '满减', value: 'fixed' }, { label: '打折', value: 'percentage' }]
const memberTypeOptions = computed(() => memberTypeStore.types.map((t: MemberType) => ({ label: t.name, value: t.id })))

function openCreate() { editing.value = null; form.value = emptyForm(); modal.value = true }
function openEdit(d: Discount) {
  editing.value = d.id
  form.value = {
    name: d.name, discountType: d.discountType, ruleType: d.ruleType, value: d.value,
    minAmount: d.minAmount, maxDiscount: d.maxDiscount ?? 0, code: d.code ?? '', repeatThreshold: d.repeatThreshold ?? 1,
    memberTypeIds: d.memberTypeIds ?? [],
    validFrom: d.validFrom ? Date.parse(d.validFrom) : null,
    validUntil: d.validUntil ? Date.parse(d.validUntil) : null,
    usageLimit: d.usageLimit, memberLimit: d.memberLimit, isActive: d.isActive,
  }
  modal.value = true
}

function toPayload(): Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'> {
  const f = form.value
  return {
    ...f,
    validFrom: f.validFrom ? new Date(f.validFrom).toISOString() : '',
    validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : '',
  }
}

async function save() {
  try {
    const payload = toPayload()
    if (payload.discountType === 'member' && (!payload.memberTypeIds || payload.memberTypeIds.length === 0)) {
      msg.warning('会员优惠必须选择可用的会员种类'); return
    }
    if (editing.value) await discountStore.update(editing.value, payload)
    else await discountStore.create(payload)
    msg.success('保存成功'); modal.value = false
  } catch (e: unknown) { msg.error(String(e)) }
}

function remove(d: Discount) {
  dialog.warning({ title: '确认删除', content: `删除「${d.name}」？`, positiveText: '删除', negativeText: '取消', onPositiveClick: async () => { await discountStore.remove(d.id); msg.success('已删除') } })
}

async function toggle(d: Discount) { await discountStore.update(d.id, { isActive: !d.isActive }) }

async function copyCode(code: string) {
  try { await navigator.clipboard.writeText(code); msg.success('券码已复制') }
  catch { msg.error('复制失败，请手动选择') }
}

const showCode = computed(() => form.value.discountType === 'coupon')
const showTime = computed(() => form.value.discountType === 'timeLimited' || form.value.discountType === 'coupon')
const showMemberType = computed(() => form.value.discountType === 'member')
const isPct = computed(() => form.value.ruleType === 'percentage')
function typeLabel(t: string): string { return ({ coupon: '券码', timeLimited: '限时', member: '会员', firstOrder: '首单', repeatOrder: '累次', referral: '推广' } as Record<string, string>)[t] ?? t }
function memberTypeNames(ids: string[] = []): string {
  if (!ids.length) return '-'
  return ids.map(id => memberTypeStore.types.find(t => t.id === id)?.name ?? id).join('、')
}
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <NSpace justify="space-between" align="center">
      <h2 style="margin:0">优惠管理</h2>
      <NButton type="primary" @click="openCreate">
        <template #icon><NIcon><IconPlus /></NIcon></template>
        新建优惠
      </NButton>
    </NSpace>
    <NDataTable
      :columns="[
        { title: '名称', key: 'name' },
        { title: '类型', key: 'discountType', width: 90, render: (row: Discount) => h(NTag, { size: 'tiny' }, () => typeLabel(row.discountType)) },
        { title: '规则', key: 'ruleType', width: 70, render: (row: Discount) => row.ruleType === 'percentage' ? '打折' : '满减' },
        { title: '值', key: 'value', width: 80, render: (row: Discount) => row.ruleType === 'percentage' ? `${row.value}%` : '¥' + fmt(row.value) },
        { title: '最低', key: 'minAmount', width: 80, render: (row: Discount) => '¥' + fmt(row.minAmount) },
        { title: '会员种类', key: 'memberTypeIds', width: 150, render: (row: Discount) => row.discountType === 'member' ? memberTypeNames(row.memberTypeIds) : '-' },
        { title: '券码', key: 'code', width: 150, render: (row: Discount) => {
          if (row.discountType !== 'coupon' || !row.code) return '-'
          return h(NSpace, { size: 4, align: 'center' }, () => [
            h('span', { style: { fontFamily: 'monospace' } }, row.code),
            h(NButton, { size: 'tiny', quaternary: true, onClick: () => copyCode(row.code!) }, () => '复制'),
          ])
        } },
        { title: '已用', key: 'usedCount', width: 80, render: (row: Discount) => `${row.usedCount}/${row.usageLimit ?? '∞'}` },
        { title: '有效期', key: 'validUntil', width: 150, render: (row: Discount) => {
          if (row.discountType === 'member') return '不限'
          const f = (s: string) => s ? s.slice(0, 10) : '永久'
          return (row.validFrom || row.validUntil) ? `${f(row.validFrom)} ~ ${f(row.validUntil)}` : '永久'
        } },
        { title: '状态', key: 'isActive', width: 70, render: (row: Discount) => h(NTag, { type: row.isActive ? 'success' : 'default', size: 'tiny' }, () => row.isActive ? '启用' : '禁用') },
        { title: '操作', key: 'actions', width: 140, render: (row: Discount) => h(NSpace, { size: 4 }, () => [
          h(NButton, { size: 'tiny', onClick: () => openEdit(row) }, () => '编辑'),
          h(NButton, { size: 'tiny', type: row.isActive ? 'warning' : 'success', onClick: () => toggle(row) }, () => row.isActive ? '停用' : '启用'),
          h(NButton, { size: 'tiny', type: 'error', onClick: () => remove(row) }, () => '删除'),
        ]) },
      ]"
      :data="discountStore.discounts" :pagination="{ pageSize: 15 }" size="small"
    />
    <NModal v-model:show="modal" :title="editing ? '编辑优惠' : '新建优惠'" preset="card" style="width:440px">
      <NForm :model="form" :rules="rules" label-width="90">
        <NFormItem label="名称" path="name"><NInput v-model:value="form.name" /></NFormItem>
        <NFormItem label="类型" path="discountType"><NSelect v-model:value="form.discountType" :options="typeOpts" /></NFormItem>
        <NFormItem label="规则" path="ruleType"><NSelect v-model:value="form.ruleType" :options="ruleOpts" /></NFormItem>
        <NFormItem label="值" path="value">
          <NInputNumber v-model:value="form.value" :min="0" :placeholder="isPct ? '百分比，如20=打8折' : '减免金额（分）'" style="width:100%" />
        </NFormItem>
        <NFormItem label="最低消费" path="minAmount">
          <NInputNumber v-model:value="form.minAmount" :min="0" placeholder="适用最低消费（分）" style="width:100%" />
        </NFormItem>
        <NFormItem v-if="isPct" label="优惠上限"><NInputNumber v-model:value="form.maxDiscount" :min="0" placeholder="最大减免金额（分）" style="width:100%" /></NFormItem>
        <NFormItem v-if="form.discountType === 'repeatOrder'" label="累次阈值"><NInputNumber v-model:value="form.repeatThreshold" :min="1" placeholder="累计完成订单数达到此值可享" style="width:100%" /></NFormItem>
        <NFormItem v-if="showMemberType" label="适用会员种类" :required="true">
          <NSelect multiple v-model:value="form.memberTypeIds" :options="memberTypeOptions" placeholder="选择可享此优惠的会员种类（必选）" />
        </NFormItem>
        <NFormItem v-if="showCode" label="券码">
          <NInput :value="form.code" @update:value="v => form.code = (v || '').toUpperCase()" placeholder="留空自动生成6位" style="font-family:monospace" />
        </NFormItem>
        <template v-if="showTime">
          <NFormItem label="开始"><NDatePicker v-model:value="form.validFrom" type="datetime" clearable style="width:100%" /></NFormItem>
          <NFormItem label="结束"><NDatePicker v-model:value="form.validUntil" type="datetime" clearable style="width:100%" /></NFormItem>
        </template>
        <NFormItem label="每人上限"><NInputNumber v-model:value="form.memberLimit" :min="0" placeholder="null=不限" style="width:100%" /></NFormItem>
        <NFormItem label="总次数"><NInputNumber v-model:value="form.usageLimit" :min="0" placeholder="null=不限" style="width:100%" /></NFormItem>
        <NFormItem label="启用"><NSwitch v-model:value="form.isActive" /></NFormItem>
      </NForm>
      <template #footer><NSpace justify="end"><NButton @click="modal = false">取消</NButton><NButton type="primary" @click="save">保存</NButton></NSpace></template>
    </NModal>
  </NSpace>
</template>
