<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NCard,
  NCheckbox,
  NInputOtp,
  NFlex,
  NButton,
  NEmpty,
  NText,
  NIcon,
  NTag,
  NScrollbar,
  useMessage,
} from 'naive-ui'
import { IconTicket } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import {
  useDiscountApply,
  randomRangeLabel,
  type DiscountDraft,
} from '@/composables/useDiscountApply'
import {
  subtotalOf,
  fmt,
  discountRuleText,
  normalizeCouponCode,
  isValidCouponCode,
  COUPON_CODE_LENGTH,
  type OrderItem,
  type Discount,
  type DiscountRecord,
} from '@/stores/types'

const props = defineProps<{
  memberId: string | null
  items: OrderItem[]
}>()

const emit = defineEmits<{
  change: [records: DiscountRecord[], discountAmount: number]
}>()

const discountStore = useDiscountStore()
const message = useMessage()

// 响应式 ctx：随 props.memberId / props.items 变化自动重算候选
const ctx = computed(() => ({
  memberId: props.memberId,
  memberName: '',
  items: props.items ?? [],
}))

const apply = useDiscountApply(() => ctx.value)

const checked = ref<Set<string>>(new Set())
const redeemed = ref<DiscountDraft[]>([])
const expanded = ref(false)

// 券码逐格输入：OTP 以字符数组为单位，兑换时再拼成字符串
const COUPON_LENGTH = COUPON_CODE_LENGTH
const couponSlots = ref<string[]>([])
const couponCode = computed(() => normalizeCouponCode(couponSlots.value.join('')))
// 券码固定 6 位，未填满不参与兑换
const couponReady = computed(() => isValidCouponCode(couponCode.value))
function couponAllowInput(char: string): boolean {
  return /[a-zA-Z0-9]/.test(char)
}

const autoDrafts = computed(() => apply.drafts.value)

const allDrafts = computed<DiscountDraft[]>(() => [...autoDrafts.value, ...redeemed.value])

const subtotal = computed(() => subtotalOf(props.items ?? []))

// 最优用券方案：互斥组择一 + 上限组封顶后实算，优先级为「优惠额最大 > 用券最少 > 消耗稀缺/临期券」
const best = computed(() => apply.bestPlan(allDrafts.value, props.items ?? []))
const bestIds = computed(() => new Set(best.value.ids))

// 用户手动改过勾选后就不再自动干预，除非点「使用推荐优惠」回到最优
const manual = ref(false)
watch(
  best,
  (b) => {
    if (manual.value) return
    checked.value = new Set(b.ids)
  },
  { immediate: true },
)
function applyBest() {
  manual.value = false
  checked.value = new Set(best.value.ids)
}

// 每行右侧的规则简述：已抽取的随机优惠展示实际力度，未抽取的展示范围
function ruleTextOf(d: DiscountDraft): string {
  return discountRuleText(d.discount, d.capturedRandom)
}

// —— 稀有 / 临期标记 ——
const EXPIRING_SOON_DAYS = 7

function daysToExpire(d: Discount): number | null {
  const until = d.scope?.timeWindow?.validUntil
  if (!until) return null
  const t = new Date(until).getTime()
  if (Number.isNaN(t)) return null
  return Math.floor((t - Date.now()) / 86400000)
}
/** 即将到期（含今天） */
function isExpiring(d: Discount): boolean {
  const days = daysToExpire(d)
  return days != null && days <= EXPIRING_SOON_DAYS
}
function expireTitle(d: Discount): string {
  const days = daysToExpire(d)
  if (days == null) return ''
  const date = d.scope?.timeWindow?.validUntil?.slice(0, 10) ?? ''
  if (days < 0) return `已于 ${date} 过期`
  if (days === 0) return `今天到期（${date}）`
  return `${days} 天后到期（${date}）`
}
/** 带用量上限（总用量或每会员限用）＝会消耗掉的稀缺券 */
function isLimited(d: Discount): boolean {
  return !!(d.usageLimit || d.memberLimit)
}
function limitTitle(d: Discount): string {
  const parts: string[] = []
  if (d.usageLimit) parts.push(`总剩余 ${Math.max(0, d.usageLimit - d.usedCount)} 次`)
  if (d.memberLimit) parts.push(`每会员限 ${d.memberLimit} 次`)
  return parts.join('，')
}
/** 随机数额类：立减/打折的数额在范围内随机 */
function isRandomAmount(d: Discount): boolean {
  return !!d.random
}
/** 随机触发类：按概率决定是否生效 */
function isRandomTrigger(d: Discount): boolean {
  return d.triggerChance != null && d.triggerChance < 100
}
function randomTitle(d: Discount): string {
  const base = randomRangeLabel(d)
  if (!isRandomTrigger(d)) return base
  return `${base}，本次已抽中`
}

// 随机优惠不再是「待定排除」态：任何新出现的随机候选立即补算资格与数额（幂等，不重掷已有结果）
watch(
  () => allDrafts.value.some((d) => d.pending),
  (pending) => {
    if (pending) apply.finalizeRandom()
  },
  { immediate: true },
)

// 勾选变化时按规则重算（上限组封顶会随入选集合变化，故每次都实算而非取缓存值）
const discountedRecords = computed<DiscountRecord[]>(() => {
  const chosen = apply.pickDiscounts(
    allDrafts.value.filter((d) => checked.value.has(d.discount.id)),
  )
  return apply.applyLimitGroups(chosen, subtotal.value, props.items ?? [])
})

const discountAmount = computed(() =>
  discountedRecords.value.reduce((s, r) => s + r.discountAmount, 0),
)

const finalAmount = computed(() => Math.max(0, subtotal.value - discountAmount.value))

// 每行展示「当前选中集合下实算得到的减免」，而非该券单算的缓存值
const effectiveAmounts = computed(() => {
  const m = new Map<string, number>()
  for (const r of discountedRecords.value) m.set(r.discountId, r.discountAmount)
  return m
})
function amountOf(d: DiscountDraft): number {
  return effectiveAmounts.value.get(d.discount.id) ?? d.record.discountAmount
}
// 受上限组压缩：实际减免少于单算
function isCapped(d: DiscountDraft): boolean {
  return checked.value.has(d.discount.id) && amountOf(d) < d.record.discountAmount
}

// 当前方案与推荐方案的差额（超额部分不计，故与小计取 min）
const currentTotal = computed(() => Math.min(discountAmount.value, subtotal.value))
const recommendExtra = computed(() => Math.max(0, best.value.total - currentTotal.value))

/** 带货币单位的减免额：正数前加负号，零值不显示符号 */
function amountText(cents: number): string {
  return cents > 0 ? `-${fmt(cents)}` : fmt(cents)
}

const records = computed<DiscountRecord[]>(() => discountedRecords.value)

// 把当前生效记录交给应用层，供 commitUsage 读取，并向上同步
watch(
  records,
  (v) => {
    apply.setRecords(v)
    emit('change', v, discountAmount.value)
  },
  { immediate: true },
)

function toggle(id: string, val: boolean) {
  manual.value = true // 手动改动后尊重用户选择，不再自动套用最优方案
  if (val) checked.value.add(id)
  else checked.value.delete(id)
  if (val && checked.value.size) expanded.value = true
}

function redeem() {
  const code = couponCode.value
  if (!code) return
  if (!isValidCouponCode(code)) {
    message.error(`券码需为 ${COUPON_LENGTH} 位字母或数字`)
    return
  }
  const d = apply.redeem(code)
  if (!d) {
    message.error('券码无效或不可用')
    return
  }
  couponSlots.value = []
  if (redeemed.value.some((r) => r.discount.id === d.id)) return
  const draft = apply.buildDraft(d)
  if (!draft) return
  redeemed.value.push(draft)
  checked.value.add(d.id)
}

function reset() {
  checked.value = new Set()
  redeemed.value = []
  couponSlots.value = []
  expanded.value = false
  manual.value = true // 主动清空即为用户选择，不自动回填
}

defineExpose({
  getDiscountAmount: () => discountAmount.value,
  getFinalAmount: () => finalAmount.value,
  getRecords: () => records.value,
  // 计费节点（全部停表）：重算随机优惠的资格与数额
  drawRandom: () => apply.drawRandom(),
  // 走时：清空抽取结果，回到范围展示
  resetDraw: () => apply.resetDraw(),
  // 固化：补全尚未抽取的随机优惠并决定其资格
  finalizeRandom: () => apply.finalizeRandom(),
  hydrate: (rs: DiscountRecord[]) => {
    const ids = apply.hydrate(rs)
    // 能识别的优惠默认恢复勾选；有历史选择即视为用户选择，不再自动套用最优方案
    let restored = 0
    for (const id of ids) {
      if (discountStore.discounts.some((d) => d.id === id)) {
        checked.value.add(id)
        restored++
      }
    }
    if (restored) manual.value = true
    return ids
  },
  commitUsage: (recs?: DiscountRecord[]) => apply.commitUsage(recs),
  reset,
})
</script>

<template>
  <NScrollbar class="modal-scroll">
    <NFlex vertical :size="12">
      <NFlex align="center" :size="8">
        <NInputOtp v-model:value="couponSlots" :length="COUPON_LENGTH" :allow-input="couponAllowInput" placeholder="-"
          class="coupon-otp" @finish="redeem" />
        <NButton :disabled="!couponReady" @click="redeem">
          <NIcon>
            <IconTicket />
          </NIcon>
          兑换
        </NButton>
      </NFlex>

      <NCard v-if="allDrafts.length" size="small" :title="`可用优惠（${allDrafts.length}）`" :segmented="{ content: true }">
        <NFlex vertical :size="8">
          <NCheckbox v-for="d in allDrafts" :key="d.discount.id" class="draft-checkbox"
            :checked="checked.has(d.discount.id)"
            @update:checked="(v: boolean) => toggle(d.discount.id, v)">
            <NFlex justify="space-between" class="draft-row">
              <NFlex align="center" :size="6" class="draft-name">
                <NText class="name-text">{{ d.discount.name }}</NText>
                <NTag v-if="d.discount.couponCode" size="tiny" type="info" :bordered="false">券码</NTag>
                <NTag v-if="isLimited(d.discount)" size="tiny" type="warning" :bordered="false"
                  :title="limitTitle(d.discount)">限量</NTag>
                <NTag v-if="isExpiring(d.discount)" size="tiny" type="error" :bordered="false"
                  :title="expireTitle(d.discount)">临期</NTag>
                <NTag v-if="isRandomAmount(d.discount)" size="tiny" type="primary" :bordered="false"
                  :title="randomTitle(d.discount)">随机</NTag>
                <NTag v-if="isRandomTrigger(d.discount)" size="tiny" type="primary" :bordered="false"
                  :title="randomTitle(d.discount)">{{ d.discount.triggerChance }}%触发</NTag>
                <NTag v-if="bestIds.has(d.discount.id)" size="tiny" type="success" :bordered="false">推荐</NTag>
              </NFlex>
              <NFlex align="center" :size="8" class="draft-meta">
                <NText depth="3" class="rule-text">{{ ruleTextOf(d) }}</NText>
                <NText class="amount-cell" :type="checked.has(d.discount.id) ? 'error' : 'default'" depth="3"
                  :title="isCapped(d) ? '受上限组限制，实际减免少于单算' : undefined">{{ amountText(amountOf(d)) }}</NText>
              </NFlex>
            </NFlex>
          </NCheckbox>

          <NButton v-if="allDrafts.length > 3" text size="tiny" @click="expanded = !expanded">
            {{ expanded ? '收起' : '展开全部' }}
          </NButton>
        </NFlex>
      </NCard>

      <NEmpty v-else description="暂无可用优惠" size="small" />

      <NFlex align="center" justify="space-between" :size="8">
        <NFlex align="center" :size="8" style="min-width: 0">
          <NText depth="3">
            优惠 {{ amountText(discountAmount) }} ｜ 应付
            <NText type="warning" strong>{{ fmt(finalAmount) }}</NText>
          </NText>
          <NText v-if="recommendExtra > 0" depth="3" style="font-size: 12px">
            推荐多减 {{ fmt(recommendExtra) }}
          </NText>
        </NFlex>
        <NFlex align="center" :size="4" style="flex-shrink: 0">
          <NButton text size="tiny" type="primary" @click="applyBest">使用推荐优惠</NButton>
          <NButton text size="tiny" type="primary" @click="reset">清空</NButton>
        </NFlex>
      </NFlex>
    </NFlex>
  </NScrollbar>
</template>

<style scoped>
/* 勾选框整体占满一行，label 吃掉剩余宽度，行内元素才谈得上两端对齐 */
.draft-checkbox {
  width: 100%;
}
.draft-checkbox :deep(.n-checkbox__label) {
  flex: 1;
  min-width: 0;
}

.draft-row {
  width: 100%;
  min-width: 0;
}

/* 名称区可收缩：名称过长时省略，避免把右侧金额列挤出容器 */
.draft-name {
  flex-shrink: 1;
  min-width: 0;
}
.name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 右侧区占满剩余宽度并靠右，使各行金额右边缘严格对齐同一条线 */
.draft-meta {
  flex: 1;
  min-width: 0;
  justify-content: flex-end;
}

.rule-text {
  font-size: 12px;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 减免额：普通字体 + 固定列宽右对齐（纵向对齐成列，便于比较） */
.amount-cell {
  flex-shrink: 0;
  min-width: 84px;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

/* 券码逐格输入：统一显示为大写，与存储的券码一致 */
.coupon-otp :deep(.n-input__input-el) {
  text-transform: uppercase;
}
</style>
