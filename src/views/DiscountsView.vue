<script setup lang="ts">
import { h, ref, computed, onMounted } from 'vue'
import { NButton, NSpace, NDataTable, NTag, NModal, NForm, NFormItem, NInput, NSelect, NInputNumber, NSwitch, NDatePicker, useMessage, useDialog } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { fmt, type Discount } from '@/stores/types'

const msg = useMessage()
const discountStore = useDiscountStore()
onMounted(() => discountStore.load())

const modal = ref(false)
const editing = ref<string | null>(null)
const form = ref<Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'>>({
  name: '', discountType: 'coupon', ruleType: 'fixed',
  value: 0, minAmount: 0, maxDiscount: 0, code: '',
  validFrom: '', validUntil: '', usageLimit: null, memberLimit: null, isActive: true,
})
const rules = { name: { required: true, message: '必填', trigger: 'blur' }, value: { required: true, message: '必填', trigger: 'change' }, minAmount: { required: true, message: '必填', trigger: 'change' } }
const typeOpts = [
  { label: '券码优惠', value: 'coupon' }, { label: '限时优惠', value: 'timeLimited' },
  { label: '会员优惠', value: 'member' }, { label: '首单优惠', value: 'firstOrder' },
  { label: '累次优惠', value: 'repeatOrder' }, { label: '推广优惠', value: 'referral' },
]
const ruleOpts = [{ label: '满减', value: 'fixed' }, { label: '打折', value: 'percentage' }]

function openCreate() { editing.value = null; form.value = { name: '', discountType: 'coupon', ruleType: 'fixed', value: 0, minAmount: 0, maxDiscount: 0, code: '', validFrom: '', validUntil: '', usageLimit: null, memberLimit: null, isActive: true }; modal.value = true }
function openEdit(d: Discount) { editing.value = d.id; form.value = { name: d.name, discountType: d.discountType, ruleType: d.ruleType, value: d.value, minAmount: d.minAmount, maxDiscount: d.maxDiscount ?? 0, code: d.code ?? '', validFrom: d.validFrom, validUntil: d.validUntil, usageLimit: d.usageLimit, memberLimit: d.memberLimit, isActive: d.isActive }; modal.value = true }

async function save() {
  try {
    if (editing.value) await discountStore.update(editing.value, form.value)
    else await discountStore.create(form.value)
    msg.success('保存成功'); modal.value = false
  } catch (e: unknown) { msg.error(String(e)) }
}

function remove(d: Discount) {
  useDialog().warning({ title: '确认删除', content: `删除「${d.name}」？`, positiveText: '删除', negativeText: '取消', onPositiveClick: async () => { await discountStore.remove(d.id); msg.success('已删除') } })
}

async function toggle(d: Discount) { await discountStore.update(d.id, { isActive: !d.isActive }) }

const showCode = computed(() => form.value.discountType === 'coupon')
const showTime = computed(() => form.value.discountType === 'timeLimited' || form.value.discountType === 'coupon')
const isPct = computed(() => form.value.ruleType === 'percentage')
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <NSpace justify="space-between" align="center">
      <h2 style="margin:0">优惠管理</h2>
      <NButton type="primary" @click="openCreate"><IconPlus /> 新建优惠</NButton>
    </NSpace>
    <NDataTable
      :columns="[
        { title: '名称', key: 'name' },
        { title: '类型', key: 'discountType', width: 90, render: (row: Discount) => h(NTag, { size: 'tiny' }, () => ({ coupon:'券码', timeLimited:'限时', member:'会员', firstOrder:'首单', repeatOrder:'累次', referral:'推广' }[row.discountType] ?? row.discountType)) },
        { title: '规则', key: 'ruleType', width: 70, render: (row: Discount) => row.ruleType === 'percentage' ? '打折' : '满减' },
        { title: '值', key: 'value', width: 80, render: (row: Discount) => row.ruleType === 'percentage' ? `${row.value}%` : '¥' + fmt(row.value) },
        { title: '最低', key: 'minAmount', width: 80, render: (row: Discount) => '¥' + fmt(row.minAmount) },
        { title: '已用', key: 'usedCount', width: 80, render: (row: Discount) => `${row.usedCount}/${row.usageLimit ?? '∞'}` },
        { title: '有效期', key: 'validUntil', width: 150, render: (row: Discount) => row.discountType === 'member' ? '不限' : `${row.validFrom.slice(0,10)} ~ ${row.validUntil.slice(0,10)}` },
        { title: '状态', key: 'isActive', width: 70, render: (row: Discount) => h(NTag, { type: row.isActive ? 'success' : 'default', size: 'tiny' }, () => row.isActive ? '启用' : '禁用') },
        { title: '操作', key: 'actions', width: 140, render: (row: Discount) => h(NSpace, { size: 4 }, () => [
          h(NButton, { size: 'tiny', onClick: () => openEdit(row) }, () => '编辑'),
          h(NButton, { size: 'tiny', type: (row.isActive ? 'warning' : 'success') as any, onClick: () => toggle(row) }, () => row.isActive ? '停用' : '启用'),
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
        <NFormItem v-if="showCode" label="券码"><NInput v-model:value="form.code" placeholder="留空自动生成6位" /></NFormItem>
        <template v-if="showTime">
          <NFormItem label="开始"><NDatePicker v-model:formatted-value="form.validFrom" type="datetime" style="width:100%" /></NFormItem>
          <NFormItem label="结束"><NDatePicker v-model:formatted-value="form.validUntil" type="datetime" style="width:100%" /></NFormItem>
        </template>
        <NFormItem label="每人上限"><NInputNumber v-model:value="form.memberLimit" :min="0" placeholder="null=不限" style="width:100%" /></NFormItem>
        <NFormItem label="总次数"><NInputNumber v-model:value="form.usageLimit" :min="0" placeholder="null=不限" style="width:100%" /></NFormItem>
        <NFormItem label="启用"><NSwitch v-model:value="form.isActive" /></NFormItem>
      </NForm>
      <template #footer><NSpace justify="end"><NButton @click="modal = false">取消</NButton><NButton type="primary" @click="save">保存</NButton></NSpace></template>
    </NModal>
  </NSpace>
</template>
