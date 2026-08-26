<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NScrollbar,
  NFlex,
  NButton,
  NIcon,
  NText,
  NInput,
  NInputNumber,
  NSelect,
  NForm,
  NFormItem,
  NSwitch,
  NDatePicker,
  NInputGroup,
  NDivider,
  NGi,
  useMessage,
} from 'naive-ui'
import { IconX, IconDeviceFloppy } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useServiceStore } from '@/stores/useServiceStore'
import CategorySelect from '@/components/CategorySelect.vue'
import ManageModal from '@/components/CategoryManageModal.vue'
import { genCouponCode } from '@/stores/types'
import type {
  Discount,
  DiscountLimitGroup,
  DiscountScope,
  RandomConfig,
  RuleType,
  TimeWindow,
} from '@/stores/types'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const store = useDiscountStore()
const exclusiveStore = useExclusiveGroupStore()
const limitGroupStore = useLimitGroupStore()
const categoryStore = useCategoryStore()
const memberTypeStore = useMemberTypeStore()
const memberStore = useMemberStore()
const serviceStore = useServiceStore()

const editing = computed(() => !!props.id)
const discountIdDisplay = computed(() => {
  if (!props.id) return ''
  return store.discounts.find((x) => x.id === props.id)?.id ?? ''
})

const ruleOptions = [
  { label: '满减（固定金额）', value: 'fixed' as RuleType },
  { label: '打折（百分比）', value: 'percentage' as RuleType },
  { label: '每满减（阶梯立减）', value: 'stepDown' as RuleType },
  { label: '件件减（每件立减）', value: 'perItem' as RuleType },
]
const randomKindOptions = [
  { label: '随机立减（金额随机）', value: 'amount' as const },
  { label: '随机打折（折扣力度随机）', value: 'ratio' as const },
]

const memberTypeOptions = computed(() =>
  memberTypeStore.types.map((t) => ({ label: t.name, value: t.id })),
)
const memberOptions = computed(() =>
  memberStore.members.map((m) => ({ label: m.name, value: m.id })),
)
const itemOptions = computed(() =>
  serviceStore.services.map((p) => ({ label: p.name, value: p.id })),
)
const exclusiveOptions = computed(() =>
  exclusiveStore.groups.map((g) => ({ label: g.name, value: g.id })),
)
const limitGroupOptions = computed(() =>
  limitGroupStore.groups.map((g) => ({ label: g.name, value: g.id })),
)

interface DiscountForm {
  name: string
  isActive: boolean
  ruleType: RuleType
  value: number // percentage: 折扣力度(0-100)；其余: 元
  minAmount: number // 元
  maxDiscount?: number // 元
  maxUnits?: number // 最大执行件数/阶梯数；perItem/stepDown 用
  scope: {
    enabledMemberTypes: boolean
    enabledMembers: boolean
    enabledTime: boolean
    enabledCategories: boolean
    enabledItems: boolean
    memberTypeIds: string[]
    memberIds: string[]
    categoryIds: string[]
    itemIds: string[]
    validFrom?: number
    validUntil?: number
    cron: string
  }
  randomEnabled: boolean
  randomKind: 'amount' | 'ratio'
  randomMin: number
  randomMax: number
  triggerChance?: number // 0-100；不填=100（必触发）
  couponEnabled: boolean
  couponCode: string
  exclusiveGroupId?: string | null
  limitGroups: string[]
}

function emptyForm(): DiscountForm {
  return {
    name: '',
    isActive: true,
    ruleType: 'fixed',
    value: 0,
    minAmount: 0,
    maxDiscount: undefined,
    maxUnits: undefined,
    scope: {
      enabledMemberTypes: false,
      enabledMembers: false,
      enabledTime: false,
      enabledCategories: false,
      enabledItems: false,
      memberTypeIds: [],
      memberIds: [],
      categoryIds: [],
      itemIds: [],
      validFrom: undefined,
      validUntil: undefined,
      cron: '',
    },
    randomEnabled: false,
    randomKind: 'amount',
    randomMin: 0,
    randomMax: 0,
    triggerChance: undefined,
    couponEnabled: false,
    couponCode: '',
    exclusiveGroupId: null,
    limitGroups: [],
  }
}

const form = ref<DiscountForm>(emptyForm())

watch(
  () => props.id,
  async (id) => {
    await Promise.all([
      exclusiveStore.load(),
      limitGroupStore.load(),
      categoryStore.load(),
      memberTypeStore.load(),
      memberStore.load(),
      serviceStore.load(),
    ])
    if (id) {
      const d = store.discounts.find((x) => x.id === id)
      if (d) {
        const s = d.scope
        form.value = {
          name: d.name,
          isActive: d.isActive !== false,
          ruleType: d.ruleType,
          value: d.ruleType === 'percentage' ? d.value : Math.round(d.value / 100),
          minAmount: Math.round(d.minAmount / 100),
          maxDiscount: d.maxDiscount != null ? Math.round(d.maxDiscount / 100) : undefined,
          maxUnits: d.maxUnits ?? undefined,
          scope: {
            enabledMemberTypes: !!s?.memberTypeIds?.length,
            enabledMembers: !!s?.memberIds?.length,
            enabledTime: !!s?.timeWindow,
            enabledCategories: !!s?.categories?.length,
            enabledItems: !!s?.items?.length,
            memberTypeIds: s?.memberTypeIds ?? [],
            memberIds: s?.memberIds ?? [],
            categoryIds: s?.categories ?? [],
            itemIds: s?.items ?? [],
            validFrom: s?.timeWindow?.validFrom ? Date.parse(s.timeWindow.validFrom) : undefined,
            validUntil: s?.timeWindow?.validUntil ? Date.parse(s.timeWindow.validUntil) : undefined,
            cron: s?.timeWindow?.cron ?? '',
          },
          randomEnabled: !!d.random,
          randomKind: d.random?.kind ?? 'amount',
          randomMin: d.random ? Math.round(d.random.min / 100) : 0,
          randomMax: d.random ? Math.round(d.random.max / 100) : 0,
          triggerChance: d.triggerChance,
          couponEnabled: !!d.couponCode,
          couponCode: d.couponCode ?? '',
          exclusiveGroupId: d.exclusiveGroupId ?? null,
          limitGroups: d.limitGroups ?? [],
        }
        return
      }
    }
    form.value = emptyForm()
  },
  { immediate: true },
)

const valueLabel = computed(() =>
  form.value.ruleType === 'percentage'
    ? '折扣力度（%，如 85 = 打 8.5 折）'
    : form.value.ruleType === 'stepDown'
      ? '每满减金额（元）'
      : form.value.ruleType === 'perItem'
        ? '每件立减金额（元）'
        : '优惠金额（元）',
)
const minAmountLabel = computed(() =>
  form.value.ruleType === 'stepDown' ? '每满金额（元）' : '最低消费（元）',
)
// 件件减按件计，无金额门槛
const showMinAmount = computed(() => form.value.ruleType !== 'perItem')

function buildScope(f: DiscountForm): DiscountScope | undefined {
  const s = f.scope
  const scope: DiscountScope = {}
  if (s.enabledMemberTypes && s.memberTypeIds.length) scope.memberTypeIds = [...s.memberTypeIds]
  if (s.enabledMembers && s.memberIds.length) scope.memberIds = [...s.memberIds]
  if (s.enabledCategories && s.categoryIds.length) scope.categories = [...s.categoryIds]
  if (s.enabledItems && s.itemIds.length) scope.items = [...s.itemIds]
  if (s.enabledTime) {
    const tw: TimeWindow = {}
    if (s.validFrom) tw.validFrom = new Date(s.validFrom).toISOString()
    if (s.validUntil) tw.validUntil = new Date(s.validUntil).toISOString()
    if (s.cron.trim()) tw.cron = s.cron.trim()
    scope.timeWindow = tw
  }
  return Object.keys(scope).length ? scope : undefined
}

function buildPayload(f: DiscountForm): Omit<Discount, 'id' | 'createdAt' | 'usedCount'> {
  const cents = (yuan: number) => Math.round(yuan * 100)
  const payload: Omit<Discount, 'id' | 'createdAt' | 'usedCount'> = {
    name: f.name.trim(),
    isActive: f.isActive !== false,
    ruleType: f.ruleType,
    value: f.ruleType === 'percentage' ? f.value : cents(f.value),
    minAmount: cents(f.minAmount),
    maxDiscount:
      f.ruleType !== 'percentage' && f.maxDiscount != null ? cents(f.maxDiscount) : undefined,
    maxUnits:
      (f.ruleType === 'perItem' || f.ruleType === 'stepDown') && f.maxUnits != null
        ? f.maxUnits
        : undefined,
    scope: buildScope(f),
  }
  if (f.randomEnabled) {
    const rnd: RandomConfig = {
      kind: f.randomKind,
      min: f.randomKind === 'amount' ? cents(f.randomMin) : f.randomMin,
      max: f.randomKind === 'amount' ? cents(f.randomMax) : f.randomMax,
    }
    payload.random = rnd
  }
  if (f.triggerChance != null && f.triggerChance < 100) payload.triggerChance = f.triggerChance
  if (f.couponEnabled) {
    payload.couponCode = (f.couponCode.trim() || genCouponCode()).toUpperCase()
  }
  payload.exclusiveGroupId = f.exclusiveGroupId || null
  payload.limitGroups = f.limitGroups.length ? [...f.limitGroups] : []
  return payload
}

function validate(f: DiscountForm): string | null {
  if (!f.name.trim()) return '请输入优惠名称'
  const r = f.ruleType
  if (r === 'percentage') {
    if (f.value < 0 || f.value > 100) return '折扣力度需为 0-100（0 = 免单）'
  } else if (r === 'stepDown') {
    if (f.value <= 0 || f.value > 100) return '折扣力度需为 1-100'
  } else if (f.value <= 0) {
    return '优惠金额需大于 0'
  }
  if (r !== 'percentage' && f.maxDiscount != null && f.maxDiscount > 0 && f.maxDiscount < f.value)
    return '优惠上限不能小于优惠金额'
  if (r === 'stepDown' && (!f.minAmount || f.minAmount <= 0)) return '请填写每满金额（大于 0）'
  if (r === 'perItem' && (!f.value || f.value <= 0)) return '请填写每件立减金额（大于 0）'
  if (f.maxUnits != null && f.maxUnits <= 0) return '最大执行件数/阶梯数需大于 0'
  if (f.scope.enabledTime && (!f.scope.validFrom || !f.scope.validUntil))
    return '请设置有效的起止时间'
  if (f.scope.enabledMemberTypes && f.scope.memberTypeIds.length === 0) return '请选择限定会员种类'
  if (f.scope.enabledMembers && f.scope.memberIds.length === 0) return '请选择限定会员'
  if (f.scope.enabledCategories && f.scope.categoryIds.length === 0) return '请选择参与优惠的分类'
  if (f.scope.enabledItems && f.scope.itemIds.length === 0) return '请选择参与优惠的单品'
  if (f.randomEnabled) {
    if (f.randomMin < 0 || f.randomMax < 0) return '随机范围不能为负'
    if (f.randomMax < f.randomMin) return '随机上限不能小于下限'
  }
  if (
    f.couponEnabled &&
    f.couponCode.trim() &&
    !/^[A-Z0-9]{4,}$/.test(f.couponCode.trim().toUpperCase())
  )
    return '券码需为 4 位以上字母或数字'
  return null
}

async function save() {
  const err = validate(form.value)
  if (err) {
    msg.warning(err)
    return
  }
  try {
    const payload = buildPayload(form.value)
    if (editing.value && props.id) {
      await store.update(props.id, payload)
      msg.success('优惠已更新')
    } else {
      await store.add(payload)
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

function genCode() {
  form.value.couponCode = genCouponCode()
}

// 内嵌上限组 / 互斥组管理，提供「编辑入口」而无需离开优惠编辑框
const showLimitManager = ref(false)
const showExclusiveManager = ref(false)

const limitItemOptions = computed(() =>
  serviceStore.services.map((p) => ({ label: p.name, value: p.id })),
)
const limitScopeOptions = [
  { label: '全部订单金额', value: 'all' },
  { label: '仅指定单品', value: 'items' },
  { label: '仅指定分类', value: 'categories' },
]
const limitTypeOptions = [
  { label: '固定金额（元）', value: 'amount' },
  { label: '比例（%）', value: 'ratio' },
]
const limitScopeText: Record<string, string> = {
  all: '全部订单金额',
  items: '指定单品',
  categories: '指定分类',
}
function limitRowText(g: Record<string, unknown>): string {
  const scope = (g.scope as string) ?? 'all'
  const limit = g.limitType === 'amount' ? `¥${(Number(g.limit) / 100).toFixed(2)}` : `${g.limit}%`
  return `${g.name}（${limitScopeText[scope] ?? scope}，${limit}）`
}
function limitValidate(f: Record<string, unknown>): string | null {
  if (Number(f.limit) <= 0) return '请填写组上限（大于 0）'
  if (f.scope === 'items' && !(f.itemIds as string[])?.length) return '请选择参与计算的具体单品'
  if (f.scope === 'categories' && !(f.categoryIds as string[])?.length)
    return '请选择参与计算的分类'
  return null
}
function limitToForm(g: Record<string, unknown>) {
  return {
    name: g.name,
    limitType: g.limitType,
    limit: g.limitType === 'amount' ? (g.limit as number) / 100 : g.limit,
    scope: g.scope,
    itemIds: (g.itemIds as string[]) ?? [],
    categoryIds: (g.categoryIds as string[]) ?? [],
  }
}
function limitBuildPayload(f: Record<string, unknown>): Omit<DiscountLimitGroup, 'id'> {
  return {
    name: String(f.name).trim(),
    limitType: f.limitType as 'amount' | 'ratio',
    limitValue: Math.round(Number(f.limit) * (f.limitType === 'amount' ? 100 : 1)),
    scope: f.scope as 'all' | 'items' | 'categories',
    itemIds: f.scope === 'items' ? (f.itemIds as string[]) : undefined,
    categoryIds: f.scope === 'categories' ? (f.categoryIds as string[]) : undefined,
    discountIds: [],
  }
}
async function limitCreate(f: Record<string, unknown>) {
  await limitGroupStore.create(limitBuildPayload(f))
}
function limitUpdate(id: string, f: Record<string, unknown>) {
  return limitGroupStore.update(id, limitBuildPayload(f))
}
async function limitRemove(id: string) {
  await limitGroupStore.remove(id)
  form.value.limitGroups = form.value.limitGroups.filter((x) => x !== id)
}

async function exclusiveCreate(f: Record<string, unknown>): Promise<void> {
  await exclusiveStore.create(String(f.name))
}
function exclusiveUpdate(id: string, f: Record<string, unknown>) {
  return exclusiveStore.update(id, { name: String(f.name) })
}
async function exclusiveRemove(id: string) {
  await exclusiveStore.remove(id)
  if (form.value.exclusiveGroupId === id) form.value.exclusiveGroupId = null
}
</script>

<template>
  <NModal :show="true" :title="editing ? '编辑优惠' : '新建优惠'" preset="card" :autoFocus="false" @update:show="close">
    <NScrollbar class="modal-scroll">
      <NForm labelPlacement="top">
        <!-- 基础 -->
        <NFormItem label="优惠号">
          <NText class="mono" :depth="editing ? undefined : 3">{{
            editing ? discountIdDisplay : '保存后自动生成'
            }}</NText>
        </NFormItem>
        <NFormItem label="优惠名称" required>
          <NInput v-model:value="form.name" placeholder="优惠名称" />
        </NFormItem>

        <NFormItem label="启用" label-placement="left">
          <NSwitch v-model:value="form.isActive" />
        </NFormItem>

        <!-- 优惠执行方式 -->
        <NFormItem label="优惠执行方式">
          <NSelect v-model:value="form.ruleType" :options="ruleOptions" />
        </NFormItem>

        <NFormItem :label="valueLabel">
          <NFlex vertical>
            <NInputNumber v-model:value="form.value" :min="0"
              :max="form.ruleType === 'percentage' || form.ruleType === 'stepDown' ? 100 : undefined"
              :precision="form.ruleType === 'percentage' || form.ruleType === 'stepDown' ? 0 : 2" style="width: 100%" />
            <NText v-if="form.ruleType === 'perItem'" depth="3"
              style="font-size: 12px; display: block; margin-top: 4px">
              对优惠范围内的每个计价单元立减固定金额。按件计费项目：单件 = 一件；按工时计费项目：单件
              = 一个工时（按时价计算）。
            </NText>
          </NFlex>
        </NFormItem>

        <NFormItem v-if="form.ruleType === 'perItem' || form.ruleType === 'stepDown'"
          :label="form.ruleType === 'stepDown' ? '最大阶梯数（可选）' : '最大执行件数（可选）'">
          <NFlex vertical>
            <NInputNumber :value="form.maxUnits ?? null"
              @update:value="(v: number | null) => (form.maxUnits = v ?? undefined)" :min="1" :precision="0"
              placeholder="不限制" style="width: 100%" />
            <NText depth="3" style="font-size: 12px; display: block; margin-top: 4px">
              {{
                form.ruleType === 'stepDown'
                  ? '超过该阶梯数的部分不再享受每满减。'
                  : '超过该件数的部分不再享受立减。'
              }}
            </NText>
          </NFlex>
        </NFormItem>

        <NFormItem v-if="showMinAmount" :label="minAmountLabel">
          <NInputNumber v-model:value="form.minAmount" :min="0" :precision="2" placeholder="0 表示不限制"
            style="width: 100%" />
        </NFormItem>

        <NFormItem v-if="form.ruleType !== 'percentage'" label="优惠上限（元，可选）">
          <NInputNumber :value="form.maxDiscount ?? null"
            @update:value="(v: number | null) => (form.maxDiscount = v ?? undefined)" :min="0" :precision="2"
            placeholder="不限制" style="width: 100%" />
          <NText depth="3" style="font-size: 12px; display: block; margin-top: 4px">
            封顶优惠金额；留空表示不限制。
          </NText>
        </NFormItem>

        <!-- 作用域指标 -->
        <NDivider title-placement="left">作用域（可自由组合）</NDivider>

        <NFormItem label="指定会员类型可用" label-placement="left">
          <NFlex vertical :size="4" style="width: 100%">
            <NSwitch v-model:value="form.scope.enabledMemberTypes" />
            <NSelect v-if="form.scope.enabledMemberTypes" v-model:value="form.scope.memberTypeIds"
              :options="memberTypeOptions" multiple filterable placeholder="选择会员种类（命中任一即可）" />
          </NFlex>
        </NFormItem>

        <NFormItem label="指定会员可用" label-placement="left">
          <NFlex vertical :size="4" style="width: 100%">
            <NSwitch v-model:value="form.scope.enabledMembers" />
            <NSelect v-if="form.scope.enabledMembers" v-model:value="form.scope.memberIds" :options="memberOptions"
              multiple filterable placeholder="选择会员" />
          </NFlex>
        </NFormItem>

        <NFormItem label="指定时段可用（含周期）" label-placement="left">
          <NFlex vertical :size="6" style="width: 100%">
            <NSwitch v-model:value="form.scope.enabledTime" />
            <template v-if="form.scope.enabledTime">
              <NFlex :size="8" align="center">
                <NDatePicker :value="form.scope.validFrom ?? null"
                  @update:value="(v: number | null) => (form.scope.validFrom = v ?? undefined)" type="datetime"
                  clearable placeholder="开始时间" style="width: 220px" />
                <NText>~</NText>
                <NDatePicker :value="form.scope.validUntil ?? null"
                  @update:value="(v: number | null) => (form.scope.validUntil = v ?? undefined)" type="datetime"
                  clearable placeholder="结束时间" style="width: 220px" />
              </NFlex>
              <NInput v-model:value="form.scope.cron" placeholder="周期表达式（分 时 日 月 周），如 0 9-18 * * 1-5；留空仅按起止时间" />
              <NText depth="3" style="font-size: 12px">
                周期 cron 与起止时间为「且」关系；支持 * / 逗号列表 /
                区间(9-18)。留空表示仅受起止时间限制。
              </NText>
            </template>
          </NFlex>
        </NFormItem>

        <NFormItem label="指定品类可用" label-placement="left">
          <NFlex vertical :size="4" style="width: 100%">
            <NSwitch v-model:value="form.scope.enabledCategories" />
            <CategorySelect v-if="form.scope.enabledCategories" v-model="form.scope.categoryIds" />
          </NFlex>
        </NFormItem>

        <NFormItem label="指定单品可用" label-placement="left">
          <NFlex vertical :size="4" style="width: 100%">
            <NSwitch v-model:value="form.scope.enabledItems" />
            <NSelect v-if="form.scope.enabledItems" v-model:value="form.scope.itemIds" :options="itemOptions" multiple
              filterable placeholder="选择单品" />
          </NFlex>
        </NFormItem>

        <!-- 随机指标 -->
        <NDivider title-placement="left">随机</NDivider>
        <NFormItem label="启用随机优惠" label-placement="left">
          <NFlex vertical :size="6" style="width: 100%">
            <NSwitch v-model:value="form.randomEnabled" />
            <template v-if="form.randomEnabled">
              <NSelect v-model:value="form.randomKind" :options="randomKindOptions" />
              <NFlex :size="8" align="center">
                <NInputNumber v-model:value="form.randomMin" :min="0" :precision="form.randomKind === 'amount' ? 2 : 0"
                  :max="form.randomKind === 'ratio' ? 100 : undefined" placeholder="最小值" style="width: 160px" />
                <NText>~</NText>
                <NInputNumber v-model:value="form.randomMax" :min="0" :precision="form.randomKind === 'amount' ? 2 : 0"
                  :max="form.randomKind === 'ratio' ? 100 : undefined" placeholder="最大值" style="width: 160px" />
              </NFlex>
              <NText depth="3" style="font-size: 12px">
                随机立减填写金额区间（元）；随机打折填写折扣力度区间（%）。优惠一旦被订单捕获，数额即固化。
              </NText>
            </template>
          </NFlex>
        </NFormItem>

        <!-- 随机触发 -->
        <NFormItem label="随机触发概率（%）">
          <NInputNumber :value="form.triggerChance ?? null"
            @update:value="(v: number | null) => (form.triggerChance = v ?? undefined)" :min="0" :max="100"
            :precision="0" placeholder="100（必触发）" style="width: 100%" />
          <NText depth="3" style="font-size: 12px; display: block; margin-top: 4px">
            留空或 100 表示每次都尝试触发；小于 100
            时按概率触发（仅自动优惠生效，附券码优惠不受影响）。
          </NText>
        </NFormItem>

        <!-- 券码 -->
        <NDivider title-placement="left">券码（附加开关）</NDivider>
        <NFormItem label="附加券码" label-placement="left">
          <NFlex vertical :size="6" style="width: 100%">
            <NSwitch v-model:value="form.couponEnabled" />
            <template v-if="form.couponEnabled">
              <NInputGroup>
                <NInput v-model:value="form.couponCode" placeholder="留空将自动生成" style="text-transform: uppercase" />
                <NButton @click="genCode">生成</NButton>
              </NInputGroup>
              <NText depth="3" style="font-size: 12px">
                附加券码后，该优惠不得自动触发，须兑换成功且符合券面准入条件方可生效。
              </NText>
            </template>
          </NFlex>
        </NFormItem>

        <!-- 互斥组 / 上限组 -->
        <NDivider title-placement="left">分组</NDivider>
        <NFormItem label="互斥组">
          <NFlex vertical :size="6" style="width: 100%">
            <NFlex :size="8" align="center">
              <NSelect v-model:value="form.exclusiveGroupId" :options="exclusiveOptions" placeholder="不加入互斥组" clearable
                style="flex: 1" />
              <NButton size="small" @click="showExclusiveManager = true">管理</NButton>
            </NFlex>
            <NText depth="3" style="font-size: 12px; display: block">
              归属同一互斥组的优惠同时只会生效减免最大者。
            </NText>
          </NFlex>
        </NFormItem>

        <NFormItem label="上限组">
          <NFlex vertical :size="6" style="width: 100%">
            <NFlex :size="8" align="center">
              <NSelect v-model:value="form.limitGroups" :options="limitGroupOptions" multiple filterable
                placeholder="不加入上限组" style="flex: 1" />
              <NButton size="small" @click="showLimitManager = true">管理</NButton>
            </NFlex>
            <NText depth="3" style="font-size: 12px; display: block">
              归属同一上限组的优惠共享该组的减免上限（如全场累计优惠不超过 ¥100）。
            </NText>
          </NFlex>
        </NFormItem>
      </NForm>
    </NScrollbar>
    <template #footer>
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

    <!-- 内嵌上限组管理 -->
    <ManageModal v-if="showLimitManager" title="上限组管理" :items="limitGroupStore.groups"
      :load="() => limitGroupStore.load()" :empty-form="() => ({
        name: '',
        limitType: 'amount',
        limit: 0,
        scope: 'all',
        itemIds: [],
        categoryIds: [],
      })
        " :to-form="limitToForm" :row-text="limitRowText" :validate="limitValidate" :create="limitCreate"
      :update="limitUpdate" :remove="limitRemove" :close="() => (showLimitManager = false)"
      confirm-text="删除后将从所有优惠中移除该上限组归属，确认删除？">
      <template #form-extra="{ form: lf }">
        <NGi>
          <NText depth="3" class="small-label">计算范围</NText>
          <NSelect v-model:value="lf.scope" :options="limitScopeOptions" />
        </NGi>
        <NGi v-if="lf.scope === 'items'">
          <NText depth="3" class="small-label">参与计算的单品</NText>
          <NSelect v-model:value="lf.itemIds" :options="limitItemOptions" multiple filterable placeholder="选择单品" />
        </NGi>
        <NGi v-if="lf.scope === 'categories'">
          <NText depth="3" class="small-label">参与计算的分类</NText>
          <CategorySelect v-model="lf.categoryIds" />
        </NGi>
        <NGi>
          <NText depth="3" class="small-label">组上限类型</NText>
          <NSelect v-model:value="lf.limitType" :options="limitTypeOptions" />
        </NGi>
        <NGi>
          <NText depth="3" class="small-label">
            组上限（{{ lf.limitType === 'amount' ? '元' : '%' }}）
          </NText>
          <NInputNumber v-model:value="lf.limit" :min="0" :precision="lf.limitType === 'amount' ? 2 : 0"
            style="width: 100%" />
        </NGi>
      </template>
    </ManageModal>

    <!-- 内嵌互斥组管理 -->
    <ManageModal v-if="showExclusiveManager" title="互斥组管理" :items="exclusiveStore.groups"
      :load="() => exclusiveStore.load()" :empty-form="() => ({ name: '' })" :create="exclusiveCreate"
      :update="exclusiveUpdate" :remove="exclusiveRemove" :close="() => (showExclusiveManager = false)"
      confirm-text="删除后将从所有优惠中移除该互斥组归属，确认删除？" />
  </NModal>
</template>
