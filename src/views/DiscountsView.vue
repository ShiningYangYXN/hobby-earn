<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import {
  NButton,
  NFlex,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NSelect,
  NInputNumber,
  NSwitch,
  NDatePicker,
  NInputOtp,
  NH2,
  useMessage,
  useDialog,
  NIcon,
  type FormRules,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { genCode, type Discount, type MemberType } from '@/stores/types'
import { buildDiscountColumns } from '@/components/columns/discount-columns'

const msg = useMessage()
const dialog = useDialog()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()
const formRef = ref<InstanceType<typeof NForm> | null>(null)
onMounted(() => {
  discountStore.load()
  memberTypeStore.load()
})

const modal = ref(false)
const editing = ref<string | null>(null)
type DiscountForm = Omit<
  Discount,
  'id' | 'usedCount' | 'memberUsedCount' | 'validFrom' | 'validUntil'
> & { validFrom: number | null; validUntil: number | null }
const emptyForm = (): DiscountForm => ({
  name: '',
  discountType: 'coupon',
  ruleType: 'fixed',
  value: 0,
  minAmount: 0,
  maxDiscount: 0,
  code: '',
  repeatThreshold: 1,
  memberTypeIds: [],
  exclusiveGroup: '',
  validFrom: null,
  validUntil: null,
  usageLimit: null,
  memberLimit: null,
  isActive: true,
})
const form = ref<DiscountForm>(emptyForm())

const rules: FormRules = {
  name: { required: true, message: '请输入名称', trigger: 'blur' },
  value: [
    { required: true, type: 'number', message: '请输入优惠值', trigger: 'change' },
    {
      validator: (_r, v: number) => {
        if (form.value.ruleType === 'percentage')
          return v > 0 && v <= 100 ? true : new Error('折扣力度需为 1-100（如 20 表示打 8 折）')
        return v >= 0 ? true : new Error('金额不能为负')
      },
      trigger: 'change',
    },
  ],
  minAmount: { required: true, type: 'number', message: '请输入最低消费', trigger: 'change' },
  memberTypeIds: {
    validator: () => {
      if (
        form.value.discountType === 'member' &&
        (!form.value.memberTypeIds || !form.value.memberTypeIds.length)
      )
        return new Error('会员优惠必须选择可用的会员种类')
      return true
    },
    trigger: ['change', 'blur'],
  },
  code: {
    validator: (_r, v: string) => {
      if (form.value.discountType !== 'coupon') return true
      const code = (v ?? '').trim().toUpperCase()
      if (!code) return true // 留空自动生成
      if (!/^[A-Z0-9]{6}$/.test(code)) return new Error('券码须为 6 位字母或数字（自动转大写）')
      return true
    },
    trigger: ['change', 'blur'],
  },
}

const typeOpts = [
  { label: '券码优惠', value: 'coupon' },
  { label: '限时优惠', value: 'timeLimited' },
  { label: '会员优惠', value: 'member' },
  { label: '首单优惠', value: 'firstOrder' },
  { label: '累次优惠', value: 'repeatOrder' },
  { label: '推广优惠', value: 'referral' },
]
const ruleOpts = [
  { label: '满减（元）', value: 'fixed' },
  { label: '打折（%）', value: 'percentage' },
]
const memberTypeOptions = computed(() =>
  memberTypeStore.types.map((t: MemberType) => ({ label: t.name, value: t.id })),
)

const isPct = computed(() => form.value.ruleType === 'percentage')

function openCreate() {
  editing.value = null
  form.value = emptyForm()
  modal.value = true
}
function openEdit(d: Discount) {
  editing.value = d.id
  form.value = {
    name: d.name,
    discountType: d.discountType,
    ruleType: d.ruleType,
    value: d.ruleType === 'percentage' ? d.value : d.value / 100,
    minAmount: d.minAmount / 100,
    maxDiscount: (d.maxDiscount ?? 0) / 100,
    code: d.code ?? '',
    repeatThreshold: d.repeatThreshold ?? 1,
    memberTypeIds: d.memberTypeIds ?? [],
    exclusiveGroup: d.exclusiveGroup ?? '',
    validFrom: d.validFrom ? Date.parse(d.validFrom) : null,
    validUntil: d.validUntil ? Date.parse(d.validUntil) : null,
    usageLimit: d.usageLimit,
    memberLimit: d.memberLimit,
    isActive: d.isActive,
  }
  modal.value = true
}

// 券码类型且未填写时自动生成，便于即时查看与复制
watch(
  () => form.value.discountType,
  (t) => {
    if (t === 'coupon' && !(form.value.code ?? '').trim()) form.value.code = genCode()
  },
)

function toPayload(): Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'> {
  const f = form.value
  return {
    ...f,
    value: isPct.value ? f.value : Math.round(f.value * 100),
    minAmount: Math.round(f.minAmount * 100),
    maxDiscount: Math.round((f.maxDiscount ?? 0) * 100),
    code:
      f.discountType === 'coupon'
        ? f.code && f.code.trim()
          ? f.code.toUpperCase()
          : genCode()
        : '',
    exclusiveGroup: (f.exclusiveGroup ?? '').trim(),
    validFrom: f.validFrom ? new Date(f.validFrom).toISOString() : '',
    validUntil: f.validUntil ? new Date(f.validUntil).toISOString() : '',
  }
}

async function save() {
  try {
    await formRef.value?.validate()
  } catch {
    return // 校验失败：仅显示字段级错误，不向上层抛出/不弹通用错误
  }
  try {
    const payload = toPayload()
    if (editing.value) await discountStore.update(editing.value, payload)
    else await discountStore.create(payload)
    msg.success('保存成功')
    modal.value = false
  } catch (e: unknown) {
    msg.error(String(e))
  }
}

function remove(d: Discount) {
  dialog.warning({
    title: '确认删除',
    content: `删除「${d.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await discountStore.remove(d.id)
      msg.success('已删除')
    },
  })
}
const discountColumns = computed(() => buildDiscountColumns({ copyCode, openEdit, toggle, remove }))

async function toggle(d: Discount) {
  await discountStore.update(d.id, { isActive: !d.isActive })
}

async function copyCode(code: string) {
  try {
    await navigator.clipboard.writeText(code)
    msg.success('券码已复制')
  } catch {
    msg.error('复制失败，请手动选择')
  }
}

const showCode = computed(() => form.value.discountType === 'coupon')
const showTime = computed(
  () => form.value.discountType === 'timeLimited' || form.value.discountType === 'coupon',
)
const showMemberType = computed(() => form.value.discountType === 'member')
</script>

<template>
  <NFlex vertical :size="16">
  <NFlex justify="space-between" align="center">
    <NH2 prefix="bar">优惠管理</NH2>
      <NButton type="primary" @click="openCreate">
        <template #icon>
          <NIcon>
            <IconPlus />
          </NIcon>
        </template>
        新建优惠
      </NButton>
    </NFlex>
    <NDataTable :columns="discountColumns" :data="discountStore.discounts" :pagination="{ pageSize: 15 }"
      size="small" />
    <NModal v-model:show="modal" :title="editing ? '编辑优惠' : '新建优惠'" preset="card" class="modal-lg">
      <NForm ref="formRef" :model="form" :rules="rules" label-width="92">
        <NFormItem label="名称" path="name">
          <NInput v-model:value="form.name" placeholder="如：新客立减" />
        </NFormItem>
        <NFormItem label="类型" path="discountType">
          <NSelect v-model:value="form.discountType" :options="typeOpts" />
        </NFormItem>
        <NFormItem label="规则" path="ruleType">
          <NSelect v-model:value="form.ruleType" :options="ruleOpts" />
        </NFormItem>
        <NFormItem :label="isPct ? '折扣力度（%）' : '减免金额（元）'" path="value">
          <NInputNumber v-model:value="form.value" :min="0" :max="isPct ? 100 : undefined" :precision="isPct ? 0 : 2"
            :placeholder="isPct ? '如 20 表示打 8 折' : '如 10 表示减 10 元'" style="width: 100%" />
        </NFormItem>
        <NFormItem label="最低消费（元）" path="minAmount">
          <NInputNumber v-model:value="form.minAmount" :min="0" :precision="2" placeholder="如 50 表示满 50 元可用"
            style="width: 100%" />
        </NFormItem>
        <NFormItem v-if="isPct" label="优惠上限（元）">
          <NInputNumber v-model:value="form.maxDiscount" :min="0" :precision="2" placeholder="最大减免金额，0 表示不限"
            style="width: 100%" />
        </NFormItem>
        <NFormItem v-if="form.discountType === 'repeatOrder'" label="累次阈值">
          <NInputNumber v-model:value="form.repeatThreshold" :min="1" placeholder="累计完成订单数达到此值可享" style="width: 100%" />
        </NFormItem>
        <NFormItem v-if="showMemberType" label="适用会员种类" path="memberTypeIds">
          <NSelect multiple v-model:value="form.memberTypeIds" :options="memberTypeOptions"
            placeholder="选择可享此优惠的会员种类（必选）" />
        </NFormItem>
        <NFormItem v-if="showCode" label="券码" path="code">
          <NInputOtp :length="6" :value="(form.code || '').split('')"
            @update:value="(v) => (form.code = v.join('').toUpperCase())" placeholder="留空自动生成6位" />
        </NFormItem>
        <template v-if="showTime">
          <NFormItem label="开始">
            <NDatePicker v-model:value="form.validFrom" type="datetime" clearable style="width: 100%" />
          </NFormItem>
          <NFormItem label="结束">
            <NDatePicker v-model:value="form.validUntil" type="datetime" clearable style="width: 100%" />
          </NFormItem>
        </template>
        <NFormItem label="每人上限">
          <NInputNumber v-model:value="form.memberLimit" :min="0" placeholder="null=不限" style="width: 100%" />
        </NFormItem>
        <NFormItem label="总次数">
          <NInputNumber v-model:value="form.usageLimit" :min="0" placeholder="null=不限" style="width: 100%" />
        </NFormItem>
        <NFormItem label="互斥分组">
          <NInput v-model:value="form.exclusiveGroup" placeholder="同组优惠不可叠加，留空不限制" />
        </NFormItem>
        <NFormItem label="启用">
          <NSwitch v-model:value="form.isActive" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="modal = false">取消</NButton>
          <NButton type="primary" @click="save">保存</NButton>
        </NFlex>
      </template>
    </NModal>
  </NFlex>
</template>

