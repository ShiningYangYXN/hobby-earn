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
import {
  type Discount,
  type DiscountType,
  type RuleType,
  type PeriodType,
  CODE_LENGTH,
} from '@/stores/types'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import CategorySelect from '@/components/CategorySelect.vue'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const discountStore = useDiscountStore()
const memberTypeStore = useMemberTypeStore()
const memberStore = useMemberStore()
const priceStore = usePriceStore()
const exclusiveGroupStore = useExclusiveGroupStore()
const categoryStore = useCategoryStore()
const limitGroupStore = useLimitGroupStore()

const editing = computed(() => !!props.id)

const typeOptions = [
  { label: '限时', value: 'timeLimited' },
  { label: '会员', value: 'member' },
  { label: '首单', value: 'firstOrder' },
  { label: '累次', value: 'repeatOrder' },
  { label: '品类', value: 'category' },
  { label: '单品', value: 'item' },
  { label: '专属', value: 'exclusive' },
  { label: '周期', value: 'periodic' },
  { label: '自定义', value: 'custom' },
  { label: '券码', value: 'coupon' },
]
const ruleOptions = [
  { label: '打折（折）', value: 'percentage' },
  { label: '满减（元）', value: 'fixed' },
  { label: '每满减（元/档）', value: 'stepDown' },
]
const memberTypeOptions = computed(() =>
  memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
)
// 专属优惠：可使用的会员
const memberOptions = computed(() =>
  memberStore.members.map((m) => ({ label: m.name, value: m.id })),
)
// 周期优惠维度
const periodTypeOptions = [
  { label: '每日', value: 'daily' },
  { label: '按星期', value: 'weekly' },
  { label: '按日期', value: 'monthly' },
  { label: 'Cron 表达式', value: 'cron' },
]
const weekdayOptions = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
]
const monthdayOptions = Array.from({ length: 31 }, (_, i) => ({
  label: `${i + 1} 号`,
  value: i + 1,
}))
const periodValueOptions = computed(() =>
  form.value.periodType === 'monthly' ? monthdayOptions : weekdayOptions,
)
// 单品优惠：可参与的具体价格项
const itemOptions = computed(() => priceStore.prices.map((p) => ({ label: p.name, value: p.id })))
// 上限组（组内叠加但合计受上限约束）
const limitGroupOptions = computed(() =>
  limitGroupStore.groups.map((g) => ({ label: g.name, value: g.id })),
)
// 门槛标签随规则动态变化：让同一「minAmount」字段在不同规则下语义更灵活
const minAmountLabel = computed(() => {
  if (form.value.ruleType === 'stepDown') return '每档金额（元，每满 ¥X 减 ¥Y）'
  if (form.value.ruleType === 'fixed') return '满减门槛（元，满 ¥X 减 ¥Y）'
  return '最低消费（元，满 ¥X 起打折，0 = 不限）'
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
  itemIds: [] as string[],
  exclusiveGroups: [] as string[],
  memberIds: [] as string[],
  limitGroupId: null as string | null,
  periodType: 'daily' as PeriodType,
  periodValues: [] as number[],
  cronExpr: '',
  isActive: true,
})

watch(
  () => props.id,
  async (id) => {
    if (!memberTypeStore.types.length) await memberTypeStore.load()
    if (!priceStore.prices.length) await priceStore.load()
    if (!memberStore.members.length) await memberStore.load()
    if (!categoryStore.categories.length) await categoryStore.load()
    if (!limitGroupStore.groups.length) await limitGroupStore.load()
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
          itemIds: d.itemIds ?? [],
          exclusiveGroups: d.exclusiveGroups ?? [],
          memberIds: d.memberIds ?? [],
          limitGroupId: d.limitGroupId ?? null,
          periodType: d.periodType ?? 'daily',
          periodValues: d.periodValues ?? [],
          cronExpr: d.cronExpr ?? '',
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
    itemIds: [],
    exclusiveGroups: [],
    memberIds: [],
    limitGroupId: null,
    periodType: 'daily',
    periodValues: [],
    cronExpr: '',
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
    // 满减的优惠上限无意义，仅在打折/每满减时保存
    maxDiscount: f.ruleType !== 'fixed' && f.maxYuan ? Math.round(f.maxYuan * 100) : undefined,
    code: f.discountType === 'coupon' ? f.code || undefined : undefined,
    validFrom: f.dateRange ? new Date(f.dateRange[0] ?? 0).toISOString() : '',
    validUntil: f.dateRange ? new Date(f.dateRange[1] ?? 0).toISOString() : '',
    usageLimit: f.usageLimit || null,
    memberLimit: f.memberLimit || null,
    repeatThreshold: f.discountType === 'repeatOrder' ? f.repeatThreshold : undefined,
    // 会员类型限定：member 与 custom 类型均可使用
    memberTypeIds: f.memberTypeIds.length ? f.memberTypeIds : undefined,
    // 品类/单品：仅对应类型写入
    categoryIds: f.discountType === 'category' ? f.categoryIds : undefined,
    itemIds: f.discountType === 'item' ? f.itemIds : undefined,
    exclusiveGroups: f.exclusiveGroups.length ? f.exclusiveGroups : undefined,
    memberIds: f.discountType === 'exclusive' ? f.memberIds : undefined,
    limitGroupId: f.limitGroupId ?? undefined,
    periodType: f.discountType === 'periodic' ? f.periodType : undefined,
    periodValues: f.discountType === 'periodic' ? f.periodValues : undefined,
    cronExpr: f.discountType === 'periodic' && f.periodType === 'cron' ? f.cronExpr : undefined,
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
  if (form.value.discountType === 'exclusive' && form.value.memberIds.length === 0) {
    msg.warning('专属优惠需至少选择一名会员')
    return
  }
  if (
    form.value.discountType === 'periodic' &&
    form.value.periodType !== 'daily' &&
    form.value.periodType !== 'cron' &&
    form.value.periodValues.length === 0
  ) {
    msg.warning('周期优惠需选择具体的生效日期')
    return
  }
  if (
    form.value.discountType === 'periodic' &&
    form.value.periodType === 'cron' &&
    !form.value.cronExpr.trim()
  ) {
    msg.warning('请输入 Cron 表达式')
    return
  }
  if (form.value.discountType === 'item' && form.value.itemIds.length === 0) {
    msg.warning('单品优惠需至少选择一项商品')
    return
  }
  if (
    (form.value.discountType === 'member' || form.value.discountType === 'custom') &&
    form.value.memberTypeIds.length === 0
  ) {
    msg.warning('请至少选择一个会员类型')
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
            <NFormItem :label="minAmountLabel">
              <NInputNumber
                v-model:value="form.minYuan"
                :min="0"
                :precision="2"
                style="width: 100%"
              />
            </NFormItem>
          </NGi>
          <NGi v-if="form.ruleType !== 'fixed'">
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
          <CategorySelect v-model="form.categoryIds" />
        </NFormItem>

        <NFormItem
          v-if="form.discountType === 'item'"
          label="参与优惠的单品（可多选）"
        >
          <NSelect
            v-model:value="form.itemIds"
            :options="itemOptions"
            multiple
            filterable
            placeholder="选择单品"
          />
        </NFormItem>

        <NFormItem
          v-if="form.discountType === 'exclusive'"
          label="专属会员（仅所选会员可用，可多选）"
        >
          <NSelect
            v-model:value="form.memberIds"
            :options="memberOptions"
            multiple
            filterable
            placeholder="选择会员"
          />
        </NFormItem>

        <NFormItem
          v-if="form.discountType === 'periodic'"
          label="周期设置（仅在指定周期当日生效）"
        >
          <NGrid cols="2" xGap="16" responsive="screen" itemResponsive>
            <NGi>
              <NFormItem label="周期维度" :showLabel="false">
                <NSelect
                  v-model:value="form.periodType"
                  :options="periodTypeOptions"
                  style="width: 100%"
                  @update:value="() => (form.periodValues = [])"
                />
              </NFormItem>
            </NGi>
            <NGi v-if="form.periodType === 'cron'">
              <NFormItem label="Cron 表达式" :showLabel="false">
                <NInput
                  v-model:value="form.cronExpr"
                  placeholder="分 时 日 月 周，如 0 9-18 * * 1-5"
                />
              </NFormItem>
            </NGi>
            <NGi v-else-if="form.periodType !== 'daily'">
              <NFormItem label="生效日期" :showLabel="false">
                <NSelect
                  v-model:value="form.periodValues"
                  :options="periodValueOptions"
                  multiple
                  placeholder="选择具体日期"
                  style="width: 100%"
                />
              </NFormItem>
            </NGi>
          </NGrid>
        </NFormItem>

        <!-- 自定义模板：放开所有资格/范围字段 -->
        <template v-if="form.discountType === 'custom'">
          <NFormItem label="限定会员类型（可多选，不选则不限定）">
            <NSelect
              v-model:value="form.memberTypeIds"
              :options="memberTypeOptions"
              multiple
              filterable
              placeholder="不限"
            />
          </NFormItem>
          <NFormItem label="限定商品分类（可多选，仅对命中分类生效）">
            <CategorySelect v-model="form.categoryIds" />
          </NFormItem>
          <NFormItem label="参与优惠的单品（可多选）">
            <NSelect
              v-model:value="form.itemIds"
              :options="itemOptions"
              multiple
              filterable
              placeholder="不限"
            />
          </NFormItem>
          <NFormItem label="专属会员（仅所选会员可用，可多选）">
            <NSelect
              v-model:value="form.memberIds"
              :options="memberOptions"
              multiple
              filterable
              placeholder="不限"
            />
          </NFormItem>
        </template>

        <NFormItem label="上限组（组内可叠加，但合计不得超过组上限；留空不参与）">
          <NSelect
            v-model:value="form.limitGroupId"
            :options="limitGroupOptions"
            clearable
            placeholder="选择上限组"
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
