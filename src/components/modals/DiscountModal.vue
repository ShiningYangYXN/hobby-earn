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
  NGrid,
  NGi,
  NIcon,
  useMessage,
} from 'naive-ui'
import { IconDeviceFloppy, IconX } from '@tabler/icons-vue'
import { type Discount, type DiscountType, type RuleType, CODE_LENGTH } from '@/stores/types'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()
const priceStore = usePriceStore()
const exclusiveGroupStore = useExclusiveGroupStore()

const editing = computed(() => !!props.id)

const typeOptions = [
  { label: '限时', value: 'timeLimited' },
  { label: '会员', value: 'member' },
  { label: '首单', value: 'firstOrder' },
  { label: '累次', value: 'repeatOrder' },
  { label: '品类', value: 'category' },
  { label: '券码', value: 'coupon' },
]
const ruleOptions = [
  { label: '百分比（折）', value: 'percentage' },
  { label: '固定金额（元）', value: 'fixed' },
]
const memberTypeOptions = computed(() =>
  memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
)
// 商品分类选项：从价格项去重收集
const categoryOptions = computed(() => {
  const set = new Set<string>()
  for (const p of priceStore.prices) if (p.category) set.add(p.category)
  return [...set].map((c) => ({ label: c, value: c }))
})
// 互斥组选项（多选）
const exclusiveGroupOptions = computed(() =>
  exclusiveGroupStore.groups.map((g) => ({ label: g.name, value: g.id })),
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
  categoryIds: [] as string[],
  exclusiveGroups: [] as string[],
  isActive: true,
})

watch(
  () => props.id,
  async (id) => {
    if (!memberTypeStore.types.length) await memberTypeStore.load()
    if (!priceStore.prices.length) await priceStore.load()
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
          categoryIds: d.categoryIds ?? [],
          exclusiveGroups: d.exclusiveGroups ?? [],
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
    categoryIds: [],
    exclusiveGroups: [],
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
    categoryIds: f.discountType === 'category' ? f.categoryIds : undefined,
    exclusiveGroups: f.exclusiveGroups.length ? f.exclusiveGroups : undefined,
    isActive: f.isActive,
  }
}

async function save() {
  if (!form.value.name) {
    msg.warning('请填写优惠名称')
    return
  }
  if (form.value.discountType === 'coupon' && form.value.code.trim()) {
    if (!/^[A-Za-z0-9]*$/.test(form.value.code.trim())) {
      msg.warning('券码只能包含字母和数字')
      return
    }
    if (form.value.code.trim().length !== CODE_LENGTH) {
      msg.warning(`券码必须为 ${CODE_LENGTH} 位`)
      return
    }
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
    class="modal-xl"
    :autoFocus="false"
    @update:show="close"
  >
    <NScrollbar class="modal-scroll">
      <NForm labelPlacement="top" class="discount-form">
        <NFormItem label="优惠名称">
          <NInput v-model:value="form.name" placeholder="如：新客首单9折" />
        </NFormItem>

        <NGrid cols="2" xGap="16" responsive="screen" itemResponsive>
          <NGi>
            <NFormItem label="优惠类型">
              <NSelect v-model:value="form.discountType" :options="typeOptions" />
            </NFormItem>
          </NGi>
          <NGi>
            <NFormItem label="优惠规则">
              <NSelect v-model:value="form.ruleType" :options="ruleOptions" />
            </NFormItem>
          </NGi>
        </NGrid>

        <NGrid cols="3" xGap="16" responsive="screen" itemResponsive>
          <NGi>
            <NFormItem v-if="form.ruleType === 'percentage'" label="折扣力度（90 = 打 9 折）">
              <NInputNumber v-model:value="form.pct" :min="0" :max="100" style="width: 100%" />
            </NFormItem>
            <NFormItem v-else label="减免金额（元）">
              <NInputNumber
                v-model:value="form.fixedYuan"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
          <NGi>
            <NFormItem label="保底消费（元，0 = 不限）">
              <NInputNumber
                v-model:value="form.minYuan"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
          <NGi>
            <NFormItem label="最大减免（元，留空不限）">
              <NInputNumber
                v-model:value="form.maxYuan"
                :min="0"
                :precision="2"
                clearable
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
        </NGrid>

        <NFormItem
          v-if="form.discountType === 'coupon'"
          :label="`券码（${CODE_LENGTH} 位字母或数字，自动大写；留空则保存时自动生成）`"
        >
          <NFlex justify="center" style="width: 100%">
            <NInputOtp
              :length="CODE_LENGTH"
              :value="(form.code || '').split('')"
              @update:value="(v: string[]) => (form.code = v.join('').toUpperCase())"
              placeholder="#"
            />
          </NFlex>
        </NFormItem>

        <NFormItem label="有效期（留空为永久有效）">
          <NDatePicker
            type="datetimerange"
            clearable
            :value="form.dateRange"
            @update:value="(v: number[] | null) => (form.dateRange = v as [number, number] | null)"
            placeholder="开始 - 结束"
            style="width: 100%"
          />
        </NFormItem>

        <NGrid cols="2" xGap="16" responsive="screen" itemResponsive>
          <NGi>
            <NFormItem label="总可用次数（0/空 = 不限）">
              <NInputNumber
                v-model:value="form.usageLimit"
                :min="0"
                clearable
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
          <NGi>
            <NFormItem label="每会员限用次数（0/空 = 不限）">
              <NInputNumber
                v-model:value="form.memberLimit"
                :min="0"
                clearable
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
        </NGrid>

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

        <NFormItem
          v-if="form.discountType === 'category'"
          label="限定商品分类（可多选，仅对命中分类的订单项生效）"
        >
          <NSelect
            v-model:value="form.categoryIds"
            :options="categoryOptions"
            multiple
            filterable
            placeholder="选择分类"
          />
        </NFormItem>

        <NFormItem v-if="form.discountType === 'repeatOrder'" label="每几单生效（如 5 = 每 5 单）">
          <NInputNumber v-model:value="form.repeatThreshold" :min="1" />
        </NFormItem>

        <NFormItem label="互斥分组（可多选，同组只生效减免最大者，留空不互斥）">
          <NSelect
            v-model:value="form.exclusiveGroups"
            :options="exclusiveGroupOptions"
            multiple
            filterable
            placeholder="选择互斥组"
          />
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
        <NButton @click="close">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton type="primary" @click="save">
          <NIcon>
            <IconDeviceFloppy />
          </NIcon>
          保存
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<style scoped></style>
