<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NDatePicker,
  NInputOtp,
  NText,
  NScrollbar,
  NButton,
  NFlex,
  useMessage,
} from 'naive-ui'
import { type Discount, type DiscountType, type RuleType } from '@/stores/types'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()

const editing = computed(() => !!props.id)

const typeOptions = [
  { label: '限时', value: 'timeLimited' },
  { label: '会员', value: 'member' },
  { label: '首单', value: 'firstOrder' },
  { label: '累次', value: 'repeatOrder' },
  { label: '推广', value: 'referral' },
  { label: '券码', value: 'coupon' },
]
const ruleOptions = [
  { label: '百分比（折）', value: 'percentage' },
  { label: '固定金额（元）', value: 'fixed' },
]
const memberTypeOptions = computed(() =>
  memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
)

const form = ref({
  name: '',
  discountType: 'timeLimited' as DiscountType,
  ruleType: 'percentage' as RuleType,
  pct: 0,
  fixedYuan: 0,
  minYuan: 0,
  maxYuan: null as number | null,
  code: '',
  dateRange: null as [number, number] | null,
  usageLimit: null as number | null,
  memberLimit: null as number | null,
  repeatThreshold: 1,
  memberTypeIds: [] as string[],
  exclusiveGroup: '',
  isActive: true,
})

watch(
  () => props.id,
  async (id) => {
    if (!memberTypeStore.types.length) await memberTypeStore.load()
    if (id) {
      const d = discountStore.discounts.find((x) => x.id === id)
      if (d) {
        form.value = {
          name: d.name,
          discountType: d.discountType,
          ruleType: d.ruleType,
          pct: d.ruleType === 'percentage' ? d.value : 0,
          fixedYuan: d.ruleType === 'fixed' ? d.value / 100 : 0,
          minYuan: (d.minAmount ?? 0) / 100,
          maxYuan: d.maxDiscount ? d.maxDiscount / 100 : null,
          code: d.code ?? '',
          dateRange:
            d.validFrom && d.validUntil
              ? ([Date.parse(d.validFrom), Date.parse(d.validUntil)] as [number, number])
              : null,
          usageLimit: d.usageLimit ?? null,
          memberLimit: d.memberLimit ?? null,
          repeatThreshold: d.repeatThreshold ?? 1,
          memberTypeIds: d.memberTypeIds ?? [],
          exclusiveGroup: d.exclusiveGroup ?? '',
          isActive: d.isActive,
        }
      } else {
        resetForm()
      }
    } else {
      resetForm()
    }
  },
  { immediate: true },
)

function resetForm() {
  form.value = {
    name: '',
    discountType: 'timeLimited',
    ruleType: 'percentage',
    pct: 0,
    fixedYuan: 0,
    minYuan: 0,
    maxYuan: null,
    code: '',
    dateRange: null,
    usageLimit: null,
    memberLimit: null,
    repeatThreshold: 1,
    memberTypeIds: [],
    exclusiveGroup: '',
    isActive: true,
  }
}

function buildPayload(): Omit<Discount, 'id' | 'usedCount' | 'memberUsedCount'> {
  const f = form.value
  return {
    name: f.name,
    discountType: f.discountType,
    ruleType: f.ruleType,
    value: f.ruleType === 'percentage' ? f.pct : Math.round((f.fixedYuan || 0) * 100),
    minAmount: Math.round((f.minYuan || 0) * 100),
    maxDiscount: f.maxYuan ? Math.round(f.maxYuan * 100) : undefined,
    code: f.discountType === 'coupon' ? f.code || undefined : undefined,
    validFrom: f.dateRange ? new Date(f.dateRange[0] ?? 0).toISOString() : '',
    validUntil: f.dateRange ? new Date(f.dateRange[1] ?? 0).toISOString() : '',
    usageLimit: f.usageLimit || null,
    memberLimit: f.memberLimit || null,
    repeatThreshold: f.discountType === 'repeatOrder' ? f.repeatThreshold : undefined,
    memberTypeIds: f.discountType === 'member' ? f.memberTypeIds : undefined,
    exclusiveGroup: f.exclusiveGroup || undefined,
    isActive: f.isActive,
  }
}

async function save() {
  if (!form.value.name) {
    msg.warning('请填写优惠名称')
    return
  }
  try {
    if (editing.value && props.id) {
      await discountStore.update(props.id, buildPayload())
      msg.success('优惠已更新')
    } else {
      await discountStore.create(buildPayload())
      msg.success('优惠已创建')
    }
    router.push('/discounts')
  } catch (e) {
    msg.error('保存失败：' + (e as Error).message)
  }
}

function close() {
  router.push('/discounts')
}
</script>

<template>
  <NModal
    :show="true"
    :title="editing ? '编辑优惠' : '新建优惠'"
    preset="card"
    class="modal-lg"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar class="modal-scroll">
      <NForm label-placement="top">
        <NFormItem label="优惠名称">
          <NInput v-model:value="form.name" placeholder="如：新客首单9折" />
        </NFormItem>

        <NFlex :size="12">
          <NFormItem label="优惠类型" style="flex: 1">
            <NSelect v-model:value="form.discountType" :options="typeOptions" />
          </NFormItem>
          <NFormItem label="优惠规则" style="flex: 1">
            <NSelect v-model:value="form.ruleType" :options="ruleOptions" />
          </NFormItem>
        </NFlex>

        <NFlex :size="12">
          <NFormItem
            v-if="form.ruleType === 'percentage'"
            label="折扣（如 10 = 打 9 折 / 减 10%）"
            style="flex: 1"
          >
            <NInputNumber v-model:value="form.pct" :min="0" :max="100" />
          </NFormItem>
          <NFormItem v-else label="减免金额（元）" style="flex: 1">
            <NInputNumber v-model:value="form.fixedYuan" :min="0" />
          </NFormItem>
          <NFormItem label="最低消费（元，0 不限）" style="flex: 1">
            <NInputNumber v-model:value="form.minYuan" :min="0" />
          </NFormItem>
          <NFormItem label="最高减免（元，可选）" style="flex: 1">
            <NInputNumber v-model:value="form.maxYuan" :min="0" clearable />
          </NFormItem>
        </NFlex>

        <NFormItem
          v-if="form.discountType === 'coupon'"
          label="券码（6 位，自动大写，留空自动生成）"
        >
          <NInputOtp
            :length="6"
            :value="(form.code || '').split('')"
            @update:value="(v: string[]) => (form.code = v.join('').toUpperCase())"
          />
        </NFormItem>

        <NFormItem label="有效期（留空为永久有效）">
          <NDatePicker
            type="datetimerange"
            clearable
            :value="form.dateRange"
            @update:value="(v: number[] | null) => (form.dateRange = v as [number, number] | null)"
            placeholder="开始 - 结束"
          />
        </NFormItem>

        <NFlex :size="12">
          <NFormItem label="总可用次数（0/空 = 不限）" style="flex: 1">
            <NInputNumber v-model:value="form.usageLimit" :min="0" clearable />
          </NFormItem>
          <NFormItem label="每会员限用次数（0/空 = 不限）" style="flex: 1">
            <NInputNumber v-model:value="form.memberLimit" :min="0" clearable />
          </NFormItem>
        </NFlex>

        <NFormItem
          v-if="form.discountType === 'member'"
          label="限定会员类型（可多选，不选则不限定）"
        >
          <NSelect
            v-model:value="form.memberTypeIds"
            :options="memberTypeOptions"
            multiple
            filterable
          />
        </NFormItem>

        <NFormItem v-if="form.discountType === 'repeatOrder'" label="每几单生效（如 5 = 每 5 单）">
          <NInputNumber v-model:value="form.repeatThreshold" :min="1" />
        </NFormItem>

        <NFormItem label="互斥分组（同组只生效一个，留空不互斥）">
          <NInput v-model:value="form.exclusiveGroup" placeholder="如：A" />
        </NFormItem>

        <NFormItem label="启用">
          <NSwitch v-model:value="form.isActive" />
        </NFormItem>
      </NForm>
    </NScrollbar>

    <template #footer>
      <NText v-if="form.discountType === 'coupon' && !form.code" type="warning" depth="3">
        券码留空将自动生成
      </NText>
      <NFlex justify="end">
        <NButton @click="close">取消</NButton>
        <NButton type="primary" @click="save">保存</NButton>
      </NFlex>
    </template>
  </NModal>
</template>
