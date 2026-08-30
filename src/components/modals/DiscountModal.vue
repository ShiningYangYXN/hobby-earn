<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NScrollbar,
  NFlex,
  NButton,
  NIcon,
  NText,
  NInput,
  NInputOtp,
  NInputNumber,
  NSelect,
  NForm,
  NFormItem,
  NFormItemGi,
  NGrid,
  NSwitch,
  NDatePicker,
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
import { useUiStore } from '@/stores/useUiStore'
import TypeSelect from '@/components/TypeSelect.vue'
import { useCategoryManage, useMemberTypeManage, type TypeManageSource } from '@/composables/useTypeManage'
import {
  genCouponCode,
  normalizeCouponCode,
  isValidCouponCode,
  COUPON_CODE_LENGTH,
} from '@/stores/types'
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
const ui = useUiStore()

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

// 「类型选择」统一走 TypeSelect：选择器 + 就地管理，新增类型无需离开当前表单
const memberTypeManage = useMemberTypeManage()
const categoryManage = useCategoryManage()

const memberOptions = computed(() =>
  memberStore.members.map((m) => ({ label: m.name, value: m.id })),
)
const itemOptions = computed(() =>
  serviceStore.services.map((p) => ({ label: p.name, value: p.id })),
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
  usageLimit?: number // 总可用次数（所有会员共享）；空=不限
  memberLimit?: number // 每会员限用次数；空=不限
  remark: string
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
    usageLimit: undefined,
    memberLimit: undefined,
    remark: '',
    exclusiveGroupId: null,
    limitGroups: [],
  }
}

const form = ref<DiscountForm>(emptyForm())
// 已用次数为统计字段，只读展示（编辑时回填 existing 值）
const usedCount = ref(0)

/**
 * 执行方式决定随机的取值类型：打折→折扣力度，其余→金额。
 * 切换执行方式时同步类型并清空区间，避免把「元」当「百分比」存下去。
 */
let loading = false
watch(
  () => form.value.ruleType,
  (r) => {
    if (loading) return
    form.value.randomKind = r === 'percentage' ? 'ratio' : 'amount'
    form.value.randomMin = 0
    form.value.randomMax = 0
  },
)

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
        loading = true
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
          // 元↔分换算仅适用于金额类；ratio 的 min/max 本就是 0-100 的支付比例，不换算
          randomMin: d.random
            ? d.random.kind === 'amount'
              ? Math.round(d.random.min / 100)
              : d.random.min
            : 0,
          randomMax: d.random
            ? d.random.kind === 'amount'
              ? Math.round(d.random.max / 100)
              : d.random.max
            : 0,
          triggerChance: d.triggerChance,
          couponEnabled: !!d.couponCode,
          couponCode: d.couponCode ?? '',
          usageLimit: d.usageLimit ?? undefined,
          memberLimit: d.memberLimit ?? undefined,
          remark: d.remark ?? '',
          exclusiveGroupId: d.exclusiveGroupId ?? null,
          limitGroups: d.limitGroups ?? [],
        }
        usedCount.value = d.usedCount
        // 等 watcher 冲刷完毕再解除屏蔽，避免回填的数据被「切换执行方式」的联动清空
        await nextTick()
        loading = false
        return
      }
    }
    loading = true
    form.value = emptyForm()
    usedCount.value = 0
    await nextTick()
    loading = false
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
const showMaxUnits = computed(
  () => form.value.ruleType === 'perItem' || form.value.ruleType === 'stepDown',
)

// 各执行方式的计算口径说明，合并为一行，避免每个字段下重复堆提示
const ruleHint = computed(() => {
  const r = form.value.ruleType
  if (r === 'perItem')
    return '对范围内的每个计价单元立减：按件计费项目单件 = 一件；按工时计费项目单件 = 一个工时（按时价计算）。超出最大件数的部分不再立减。'
  if (r === 'stepDown')
    return '每满一个「每满金额」即减免一个该金额，如每满 100 减 20。超出最大阶梯数的部分不再享受。'
  if (r === 'percentage') return '0 = 免单，100 = 不打折。'
  return null
})

// 只有打折的 value 是 0-100 的比例；其余执行方式的 value 都是金额（元）
const valueIsPercent = computed(() => form.value.ruleType === 'percentage')
const valueStep = computed(() => (valueIsPercent.value ? 0 : 2))

/**
 * 随机类型与执行方式的对应关系取自 calcDiscount 的实际分支：
 *   fixed + amount        → 随机立减额（替代固定减免金额）
 *   percentage + ratio    → 随机折扣力度（替代固定折扣）
 * 其余组合下随机减免额不参与计算，随机值只在封顶环节起作用。
 */
const derivedRandomKind = computed<'amount' | 'ratio'>(() =>
  form.value.ruleType === 'percentage' ? 'ratio' : 'amount',
)
// 历史数据可能存在不匹配的组合，此时该随机配置不生效
const randomKindMismatch = computed(
  () => form.value.randomEnabled && form.value.randomKind !== derivedRandomKind.value,
)
const randomIsAmount = computed(() => form.value.randomKind === 'amount')
const randomEffectText = computed(() => {
  const r = form.value.ruleType
  if (r === 'fixed')
    return '开启后在范围内随机取一个金额作为立减额，上方固定金额作废，但仍需满足最低消费。'
  if (r === 'percentage')
    return '开启后在范围内随机取一个折扣力度作为实际折扣，上方固定折扣作废，如 85 表示打 8.5 折。'
  return '每满减 / 件件减不支持随机减免额：固定额度仍照常生效，随机金额仅作为减免上限参与封顶。'
})

// calcDiscount 对所有执行方式都应用 maxDiscount 封顶；
// 但随机立减时封顶由捕获到的随机值取代，此时再设上限无效
const maxDiscountDisabled = computed(
  () => form.value.randomEnabled && form.value.randomKind === 'amount',
)

// 带券码的优惠只能兑换，不参与自动触发，随机触发概率对其无意义
const triggerDisabled = computed(() => form.value.couponEnabled)

/**
 * 随机额度是否顶掉固定额度（二者互斥）。
 * 依据 calcDiscount：仅满减+随机金额、打折+随机力度这两种组合会完全取代 value；
 * 每满减/件件减仍按 value 计算，随机值只参与封顶，故此时不冲突。
 */
const randomOverridesValue = computed(
  () =>
    form.value.randomEnabled &&
    !randomKindMismatch.value &&
    (form.value.ruleType === 'fixed' || form.value.ruleType === 'percentage'),
)
const valueDisabled = computed(() => randomOverridesValue.value)
const valueHint = computed(() => {
  if (!randomOverridesValue.value) return null
  return form.value.ruleType === 'percentage'
    ? '已开启随机折扣力度，此处固定折扣作废，实际力度由随机范围抽取。'
    : '已开启随机立减，此处固定金额作废，实际立减额由随机范围抽取。'
})

// 剩余可用次数（编辑既有优惠时展示）
const usageLeft = computed(() =>
  form.value.usageLimit != null ? Math.max(0, form.value.usageLimit - usedCount.value) : null,
)

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
  // 带券码的优惠走兑换路径，不参与自动触发，随机触发概率对其无意义
  if (!f.couponEnabled && f.triggerChance != null && f.triggerChance < 100)
    payload.triggerChance = f.triggerChance
  if (f.couponEnabled) {
    payload.couponCode = normalizeCouponCode(f.couponCode.trim() || genCouponCode())
  }
  // 留空=不限；配额调小时需不小于已用次数
  payload.usageLimit = f.usageLimit ?? undefined
  payload.memberLimit = f.memberLimit ?? undefined
  payload.remark = f.remark.trim() || undefined
  payload.exclusiveGroupId = f.exclusiveGroupId || null
  payload.limitGroups = f.limitGroups.length ? [...f.limitGroups] : []
  return payload
}

function validate(f: DiscountForm): string | null {
  if (!f.name.trim()) return '请输入优惠名称'
  const r = f.ruleType
  // 随机额度已顶掉固定额度时，value 不参与计算，无需校验
  if (!randomOverridesValue.value) {
    if (r === 'percentage') {
      // percentage 的 value 是「支付比例」0-100，0 表示免单
      if (f.value < 0 || f.value > 100) return '折扣力度需为 0-100（0 = 免单）'
    } else if (r === 'stepDown') {
      if (f.value <= 0) return '每阶梯减免金额需大于 0'
    } else if (f.value <= 0) {
      return '优惠金额需大于 0'
    }
  }
  // 仅当 value 与 maxDiscount 同为金额时才可比较（percentage 的 value 是比例；随机顶掉 value 时不可比）
  if (
    r !== 'percentage' &&
    !randomOverridesValue.value &&
    f.maxDiscount != null &&
    f.maxDiscount > 0 &&
    f.maxDiscount < f.value
  )
    return '优惠上限不能小于优惠金额'
  if (r === 'stepDown' && (!f.minAmount || f.minAmount <= 0)) return '请填写每满金额（大于 0）'
  if (f.maxUnits != null && f.maxUnits <= 0) return '最大执行件数/阶梯数需大于 0'
  // TimeWindow 各字段均可选：起止时间可以只填其一，也可以只配周期
  if (
    f.scope.enabledTime &&
    !f.scope.validFrom &&
    !f.scope.validUntil &&
    !f.scope.cron.trim()
  )
    return '请设置起止时间或周期表达式'
  if (f.scope.enabledMemberTypes && f.scope.memberTypeIds.length === 0) return '请选择限定会员种类'
  if (f.scope.enabledMembers && f.scope.memberIds.length === 0) return '请选择限定会员'
  if (f.scope.enabledCategories && f.scope.categoryIds.length === 0) return '请选择参与优惠的分类'
  if (f.scope.enabledItems && f.scope.itemIds.length === 0) return '请选择参与优惠的单品'
  if (f.randomEnabled) {
    if (f.randomMin < 0 || f.randomMax < 0) return '随机范围不能为负'
    if (f.randomMax < f.randomMin) return '随机上限不能小于下限'
    // 随机的取值类型必须与实际生效的分支一致，否则数值会被当成另一种单位解释
    if (f.randomKind !== (r === 'percentage' ? 'ratio' : 'amount'))
      return `随机类型（${f.randomKind === 'ratio' ? '折扣力度' : '金额'}）与当前执行方式不匹配，请重新填写随机范围`
  }
  if (f.couponEnabled && f.couponCode.trim() && !isValidCouponCode(f.couponCode))
    return `券码需为 ${COUPON_CODE_LENGTH} 位字母或数字`
  if (f.usageLimit != null && f.usageLimit <= 0) return '总可用次数需大于 0'
  if (f.usageLimit != null && usedCount.value > f.usageLimit)
    return `总可用次数不能小于已用次数（${usedCount.value}）`
  if (f.memberLimit != null && f.memberLimit <= 0) return '每会员限用次数需大于 0'
  if (f.memberLimit != null && f.usageLimit != null && f.memberLimit > f.usageLimit)
    return '每会员限用次数不能大于总可用次数'
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
      // 已用次数为统计字段，仅作弊模式可改写
      if (ui.advancedMode) {
        await store.update(props.id, { usedCount: Math.max(0, Math.round(usedCount.value)) })
      }
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

// OTP 逐格输入的桥接：内部为字符数组，表单仍存字符串（空位被压实，保证券码连续）
const COUPON_LENGTH = COUPON_CODE_LENGTH
const couponSlots = computed<string[]>({
  get: () => (form.value.couponCode || '').split(''),
  set: (v) => (form.value.couponCode = normalizeCouponCode(v.join(''))),
})
function couponAllowInput(char: string): boolean {
  return /[a-zA-Z0-9]/.test(char)
}

// 上限组 / 互斥组同属「类型选择」，与品类、会员种类共用 TypeSelect，样式与交互保持一致
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
  const limitValue = Number(g.limitValue)
  const limit = g.limitType === 'amount' ? `¥${(limitValue / 100).toFixed(2)}` : `${limitValue}%`
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
    limit: g.limitType === 'amount' ? (g.limitValue as number) / 100 : g.limitValue,
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

const exclusiveManage = computed<TypeManageSource>(() => ({
  title: '互斥组管理',
  items: exclusiveStore.groups,
  load: () => exclusiveStore.load(),
  create: exclusiveCreate,
  update: exclusiveUpdate,
  remove: exclusiveRemove,
  confirmText: '删除后将从所有优惠中移除该互斥组归属，确认删除？',
}))
const limitGroupManage = computed<TypeManageSource>(() => ({
  title: '上限组管理',
  items: limitGroupStore.groups,
  load: () => limitGroupStore.load(),
  emptyForm: () => ({
    name: '',
    limitType: 'amount',
    limit: 0,
    scope: 'all',
    itemIds: [],
    categoryIds: [],
  }),
  toForm: limitToForm,
  rowText: limitRowText,
  validate: limitValidate,
  create: limitCreate,
  update: limitUpdate,
  remove: limitRemove,
  confirmText: '删除后将从所有优惠中移除该上限组归属，确认删除？',
}))

// 互斥组至多归属一个，单选模式；模型值统一为数组，取首个元素
const exclusiveGroupIds = computed<string[]>({
  get: () => (form.value.exclusiveGroupId ? [form.value.exclusiveGroupId] : []),
  set: (v) => (form.value.exclusiveGroupId = v[0] ?? null),
})
</script>

<template>
  <NModal :show="true" :title="editing ? '编辑优惠' : '新建优惠'" preset="card" :autoFocus="false" style="width: 760px"
    @update:show="close">
    <NScrollbar class="modal-scroll">
      <NForm labelPlacement="top">
        <!-- 基础 -->
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="2" label="优惠名称" required>
            <NInput v-model:value="form.name" placeholder="如：新客首单立减 20" />
          </NFormItemGi>

          <NFormItemGi :span="1" label="启用">
            <NFlex align="center" :size="8">
              <NSwitch v-model:value="form.isActive" />
              <NText depth="3" style="font-size: 12px">{{ form.isActive ? '启用中' : '已停用' }}</NText>
            </NFlex>
          </NFormItemGi>

          <NFormItemGi :span="1" label="优惠执行方式">
            <NSelect v-model:value="form.ruleType" :options="ruleOptions" />
          </NFormItemGi>

          <NFormItemGi :span="2" label="优惠号">
            <NText class="mono" :depth="editing ? undefined : 3">{{
              editing ? discountIdDisplay : '保存后自动生成'
            }}</NText>
          </NFormItemGi>
        </NGrid>

        <!-- 规则 -->
        <NDivider title-placement="left">规则</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="1" :label="valueDisabled ? `${valueLabel}（随机额度生效时作废）` : valueLabel"
            :required="!valueDisabled">
            <NInputNumber v-model:value="form.value" :disabled="valueDisabled" :min="0"
              :max="valueIsPercent ? 100 : undefined" :precision="valueStep"
              :placeholder="valueDisabled ? '已被随机额度取代' : undefined" style="width: 100%" />
          </NFormItemGi>

          <NGi v-if="valueHint" :span="2">
            <NText type="warning" style="font-size: 12px">{{ valueHint }}</NText>
          </NGi>

          <NFormItemGi v-if="showMinAmount" :span="1" :label="minAmountLabel">
            <NInputNumber v-model:value="form.minAmount" :min="0" :precision="2" placeholder="0 表示不限制"
              style="width: 100%" />
          </NFormItemGi>

          <NFormItemGi v-if="showMaxUnits" :span="1" :label="form.ruleType === 'stepDown' ? '最大阶梯数（可选）' : '最大执行件数（可选）'">
            <NInputNumber :value="form.maxUnits ?? null"
              @update:value="(v: number | null) => (form.maxUnits = v ?? undefined)" :min="1" :precision="0"
              placeholder="不限制" style="width: 100%" />
          </NFormItemGi>

          <NFormItemGi :span="1" label="优惠上限（元，可选）">
            <NInputNumber :value="form.maxDiscount ?? null" :disabled="maxDiscountDisabled"
              @update:value="(v: number | null) => (form.maxDiscount = v ?? undefined)" :min="0" :precision="2"
              placeholder="不限制" style="width: 100%" />
          </NFormItemGi>

          <NGi v-if="ruleHint" :span="2">
            <NText depth="3" style="font-size: 12px">{{ ruleHint }}</NText>
          </NGi>
          <NGi v-if="maxDiscountDisabled" :span="2">
            <NText depth="3" style="font-size: 12px">随机立减时减免额已被随机值封顶，优惠上限设置无效。</NText>
          </NGi>
        </NGrid>

        <!-- 作用域指标 -->
        <NDivider title-placement="left">作用域（可自由组合）</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="2" label="指定会员类型可用">
            <NFlex align="center" :size="10" style="width: 100%">
              <NSwitch v-model:value="form.scope.enabledMemberTypes" />
              <TypeSelect v-if="form.scope.enabledMemberTypes" v-model="form.scope.memberTypeIds"
                :manage="memberTypeManage" placeholder="选择会员种类（命中任一即可）" style="flex: 1" />
              <NText v-else depth="3" style="font-size: 12px">不限制</NText>
            </NFlex>
          </NFormItemGi>

          <NFormItemGi :span="2" label="指定会员可用">
            <NFlex align="center" :size="10" style="width: 100%">
              <NSwitch v-model:value="form.scope.enabledMembers" />
              <NSelect v-if="form.scope.enabledMembers" v-model:value="form.scope.memberIds" :options="memberOptions"
                multiple filterable placeholder="选择会员" style="flex: 1" />
              <NText v-else depth="3" style="font-size: 12px">不限制</NText>
            </NFlex>
          </NFormItemGi>

          <NGi :span="2">
            <NFormItem label="指定时段可用（含周期）">
              <NFlex vertical :size="6" style="width: 100%">
                <NFlex align="center" :size="10">
                  <NSwitch v-model:value="form.scope.enabledTime" />
                  <NText v-if="!form.scope.enabledTime" depth="3" style="font-size: 12px">不限制</NText>
                </NFlex>
                <template v-if="form.scope.enabledTime">
                  <NFlex :size="8" align="center">
                    <NDatePicker :value="form.scope.validFrom ?? null"
                      @update:value="(v: number | null) => (form.scope.validFrom = v ?? undefined)" type="datetime"
                      clearable placeholder="开始时间" style="flex: 1" />
                    <NText>~</NText>
                    <NDatePicker :value="form.scope.validUntil ?? null"
                      @update:value="(v: number | null) => (form.scope.validUntil = v ?? undefined)" type="datetime"
                      clearable placeholder="结束时间" style="flex: 1" />
                  </NFlex>
                  <NInput v-model:value="form.scope.cron" placeholder="周期表达式（分 时 日 月 周），如 0 9-18 * * 1-5" />
                  <NText depth="3" style="font-size: 12px">
                    支持 * / 逗号列表 / 区间(9-18)。起止时间与周期为「且」关系，留空则仅按起止时间限制。
                  </NText>
                </template>
              </NFlex>
            </NFormItem>
          </NGi>

          <NFormItemGi :span="2" label="指定品类可用">
            <NFlex align="center" :size="10" style="width: 100%">
              <NSwitch v-model:value="form.scope.enabledCategories" />
              <TypeSelect v-if="form.scope.enabledCategories" v-model="form.scope.categoryIds"
                :manage="categoryManage" placeholder="选择品类（命中任一品类下的服务即可）" style="flex: 1" />
              <NText v-else depth="3" style="font-size: 12px">不限制</NText>
            </NFlex>
          </NFormItemGi>

          <NFormItemGi :span="2" label="指定单品可用">
            <NFlex align="center" :size="10" style="width: 100%">
              <NSwitch v-model:value="form.scope.enabledItems" />
              <NSelect v-if="form.scope.enabledItems" v-model:value="form.scope.itemIds" :options="itemOptions" multiple
                filterable placeholder="选择单品" style="flex: 1" />
              <NText v-else depth="3" style="font-size: 12px">不限制</NText>
            </NFlex>
          </NFormItemGi>
        </NGrid>

        <!-- 随机指标 -->
        <NDivider title-placement="left">随机</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="2" label="随机减免额">
            <NFlex align="center" :size="10" style="width: 100%">
              <NSwitch v-model:value="form.randomEnabled" />
              <NText depth="3" style="font-size: 12px">{{
                form.randomEnabled ? randomEffectText : '关闭 · 按上方固定数值计算'
                }}</NText>
            </NFlex>
          </NFormItemGi>

          <NFormItemGi v-if="form.randomEnabled" :span="1" :label="`随机下限（${randomIsAmount ? '元' : '力度%'}）`">
            <NInputNumber v-model:value="form.randomMin" :min="0" :precision="randomIsAmount ? 2 : 0"
              :max="randomIsAmount ? undefined : 100" placeholder="最小值" style="width: 100%" />
          </NFormItemGi>

          <NFormItemGi v-if="form.randomEnabled" :span="1" :label="`随机上限（${randomIsAmount ? '元' : '力度%'}）`">
            <NInputNumber v-model:value="form.randomMax" :min="0" :precision="randomIsAmount ? 2 : 0"
              :max="randomIsAmount ? undefined : 100" placeholder="最大值" style="width: 100%" />
          </NFormItemGi>

          <NGi v-if="form.randomEnabled" :span="2">
            <NFlex vertical :size="2">
              <NText v-if="randomKindMismatch" type="warning" style="font-size: 12px">
                该随机类型与当前执行方式不匹配（不会生效），请按上方单位重新填写范围。
              </NText>
              <NText depth="3" style="font-size: 12px">优惠一旦被订单捕获，随机数额即固化，之后不再变化。</NText>
            </NFlex>
          </NGi>

          <NFormItemGi :span="2" label="随机触发概率（%）">
            <NFlex vertical :size="2" style="width: 100%">
              <NInputNumber :value="form.triggerChance ?? null" :disabled="triggerDisabled"
                @update:value="(v: number | null) => (form.triggerChance = v ?? undefined)" :min="0" :max="100"
                :precision="0" placeholder="100（必触发）" style="width: 100%" />
              <NText depth="3" style="font-size: 12px">
                {{
                  triggerDisabled
                    ? '已附加券码的优惠只能凭券兑换，不参与自动触发。'
                    : '留空或 100 表示每次都尝试触发；小于 100 时按概率触发。'
                }}
              </NText>
            </NFlex>
          </NFormItemGi>
        </NGrid>

        <!-- 券码 -->
        <NDivider title-placement="left">券码</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="2" label="附加券码">
            <NFlex vertical :size="6" style="width: 100%">
              <NFlex align="center" :size="10">
                <NSwitch v-model:value="form.couponEnabled" />
                <NText v-if="!form.couponEnabled" depth="3" style="font-size: 12px">
                  不附加 · 满足作用域即自动生效
                </NText>
              </NFlex>
              <template v-if="form.couponEnabled">
                <NFlex :size="8" align="center" wrap>
                  <NInputOtp v-model:value="couponSlots" :length="COUPON_LENGTH" :allow-input="couponAllowInput"
                    placeholder="-" class="coupon-otp" />
                  <NButton size="small" @click="genCode">生成</NButton>
                  <NButton v-if="form.couponCode" size="small" quaternary @click="form.couponCode = ''">清空</NButton>
                </NFlex>
                <NText depth="3" style="font-size: 12px">
                  {{ COUPON_LENGTH }} 位字母或数字，留空将自动生成。附加券码后该优惠不得自动触发，须兑换成功且符合券面准入条件方可生效。
                </NText>
              </template>
            </NFlex>
          </NFormItemGi>
        </NGrid>

        <!-- 用量控制 -->
        <NDivider title-placement="left">用量控制</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="1" label="总可用次数（可选）">
            <NInputNumber :value="form.usageLimit ?? null"
              @update:value="(v: number | null) => (form.usageLimit = v ?? undefined)" :min="1" :precision="0"
              placeholder="不限（所有会员共享）" style="width: 100%" />
          </NFormItemGi>

          <NFormItemGi :span="1" label="每会员限用次数（可选）">
            <NInputNumber :value="form.memberLimit ?? null"
              @update:value="(v: number | null) => (form.memberLimit = v ?? undefined)" :min="1" :precision="0"
              placeholder="不限" style="width: 100%" />
          </NFormItemGi>

          <!-- 已用次数：统计字段，仅作弊模式可改写 -->
          <NFormItemGi v-if="editing && ui.advancedMode" :span="2" label="已用次数（作弊模式）">
            <NInputNumber v-model:value="usedCount" :min="0" :precision="0" style="width: 100%" />
          </NFormItemGi>

          <NGi :span="2">
            <NText depth="3" style="font-size: 12px">
              <template v-if="editing && usageLeft != null">
                已用 {{ usedCount }} 次，剩余 {{ usageLeft }} 次；余量不足 10 次时结算面板会标出「仅剩 N 张」。
              </template>
              <template v-else>
                总可用次数为所有会员共享的额度，用尽后自动失效；每会员限用控制单个会员的使用上限。
              </template>
            </NText>
          </NGi>
        </NGrid>

        <!-- 互斥组 / 上限组 -->
        <NDivider title-placement="left">分组</NDivider>
        <NGrid :cols="2" :x-gap="12">
          <NFormItemGi :span="1" label="互斥组">
            <TypeSelect v-model="exclusiveGroupIds" :manage="exclusiveManage" :multiple="false"
              placeholder="不加入" />
          </NFormItemGi>

          <NFormItemGi :span="1" label="上限组">
            <TypeSelect v-model="form.limitGroups" :manage="limitGroupManage" placeholder="不加入">
              <template #form-extra="{ form: lf }">
                <NGi>
                  <NText depth="3" class="small-label">计算范围</NText>
                  <NSelect v-model:value="lf.scope" :options="limitScopeOptions" />
                </NGi>
                <NGi v-if="lf.scope === 'items'">
                  <NText depth="3" class="small-label">参与计算的单品</NText>
                  <NSelect v-model:value="lf.itemIds" :options="limitItemOptions" multiple filterable
                    placeholder="选择单品" />
                </NGi>
                <NGi v-if="lf.scope === 'categories'">
                  <NText depth="3" class="small-label">参与计算的分类</NText>
                  <TypeSelect v-model="lf.categoryIds" :manage="categoryManage" />
                </NGi>
                <NGi>
                  <NText depth="3" class="small-label">组上限类型</NText>
                  <NSelect v-model:value="lf.limitType" :options="limitTypeOptions" />
                </NGi>
                <NGi>
                  <NText depth="3" class="small-label">
                    组上限（{{ lf.limitType === 'amount' ? '元' : '%' }}）
                  </NText>
                  <NInputNumber v-model:value="lf.limit" :min="0"
                    :precision="lf.limitType === 'amount' ? 2 : 0" style="width: 100%" />
                </NGi>
              </template>
            </TypeSelect>
          </NFormItemGi>

          <NGi :span="2">
            <NText depth="3" style="font-size: 12px">
              互斥组：同组的优惠同时只会生效减免最大者。上限组：同组的优惠共享该组减免上限（如全场累计优惠不超过 ¥100）。
            </NText>
          </NGi>

          <NFormItemGi :span="2" label="备注（可选）">
            <NInput v-model:value="form.remark" type="textarea" :rows="2" placeholder="内部说明，不对外展示" />
          </NFormItemGi>
        </NGrid>
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

  </NModal>
</template>

<style scoped>
/* 券码逐格输入：统一显示为大写，与存储的券码一致 */
.coupon-otp :deep(.n-input__input-el) {
  text-transform: uppercase;
}
</style>
