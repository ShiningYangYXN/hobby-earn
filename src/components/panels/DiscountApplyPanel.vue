<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { NFlex, NScrollbar, NCheckbox, NText, NInputGroup, NInput, NButton, NEmpty, NTag, useMessage } from 'naive-ui'
import { IconTicket } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { fmt, ruleTypeLabelOf, itemAmount, type Discount, type DiscountRecord, type OrderItem } from '@/stores/types'
import { useDiscountApply, type DiscountDraft } from '@/composables/useDiscountApply'

const props = defineProps<{
  memberId: string | null
  items: OrderItem[]
}>()
const emit = defineEmits<{
  (e: 'change', records: DiscountRecord[], total: number): void
}>()

const msg = useMessage()
const discountStore = useDiscountStore()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()
const priceStore = usePriceStore()

const memberName = computed(
  () => memberStore.members.find((m) => m.id === props.memberId)?.name ?? '',
)

const ctx = computed(() => ({
  memberId: props.memberId,
  memberName: memberName.value,
  items: props.items,
}))

const apply = useDiscountApply(ctx.value)

const categoryIdsOf = (priceEntryId: string) =>
  priceStore.prices.find((p) => p.id === priceEntryId)?.categoryIds ?? []

const memberTypeId = computed(() => {
  if (!props.memberId) return null
  const m = memberStore.members.find((x) => x.id === props.memberId)
  return memberTypeStore.types.find((t) => t.name === m?.name)?.id ?? null
})

// 自动候选（无券码，作用域命中，概率通过）
const autoDrafts = computed<DiscountDraft[]>(() =>
  discountStore
    .autoCandidates({
      memberId: props.memberId,
      memberTypeId: memberTypeId.value,
      items: props.items,
      categoryIdsOf,
    })
    .map((d) => apply.buildDraft(d)),
)

// 已兑换的券码优惠
const redeemed = ref<{ d: Discount; draft: DiscountDraft } | null>(null)
const couponInput = ref('')

function redeem() {
  if (!couponInput.value.trim()) return
  const d = discountStore.redeemByCode(couponInput.value, {
    memberId: props.memberId,
    memberTypeId: memberTypeId.value,
    items: props.items,
    categoryIdsOf,
  })
  if (!d) {
    msg.warning('券码无效，或不符合使用条件')
    return
  }
  redeemed.value = { d, draft: apply.buildDraft(d) }
  couponInput.value = ''
  msg.success(`已兑换：${d.name}`)
}

// 选中集合：auto 候选默认全部选，券码兑换后加入
const checked = ref<Record<string, boolean>>({})

watch(
  autoDrafts,
  (list) => {
    const next: Record<string, boolean> = {}
    for (const dr of list) next[dr.discount.id] = checked.value[dr.discount.id] ?? true
    if (redeemed.value) next[redeemed.value.d.id] = checked.value[redeemed.value.d.id] ?? true
    checked.value = next
    recompute()
  },
  { immediate: true },
)

watch(
  () => redeemed.value,
  (r) => {
    if (r) {
      checked.value = { ...checked.value, [r.d.id]: true }
      recompute()
    }
  },
)

function allDrafts(): DiscountDraft[] {
  const list = [...autoDrafts.value]
  if (redeemed.value) list.push(redeemed.value.draft)
  return list
}

function recompute() {
  const drafts = allDrafts().filter((dr) => checked.value[dr.discount.id])
  const picked = apply.pickDiscounts(drafts)
  const totalBase = props.items.reduce((s, it) => s + itemAmount(it), 0)
  const recs = apply.applyLimitGroups(picked, totalBase, props.items)
  records.value = recs
  emit('change', recs, recs.reduce((s, r) => s + r.discountAmount, 0))
}

function toggle(id: string, val: boolean) {
  checked.value = { ...checked.value, [id]: val }
  recompute()
}

function labelOf(dr: DiscountDraft): string {
  const d = dr.discount
  const base = []
  base.push(ruleTypeLabelOf(d.ruleType))
  if (d.random) base.push(d.random.kind === 'amount' ? '随机立减' : '随机打折')
  if (d.couponCode) base.push(`券码${d.couponCode}`)
  return base.join(' · ')
}

const subtotal = computed(() => props.items.reduce((s, it) => s + itemAmount(it), 0))

// 暴露给父组件（PricingModal / OrderDetailModal 直接读取）
const records = ref<DiscountRecord[]>([])
const discountAmount = computed(() => records.value.reduce((s, r) => s + r.discountAmount, 0))
const finalAmount = computed(() => Math.max(0, subtotal.value - discountAmount.value))

watch(
  () => props.items,
  () => recompute(),
  { deep: true },
)
watch(
  () => props.memberId,
  () => recompute(),
)

defineExpose({ discountAmount, finalAmount, records })
</script>

<template>
  <div class="discount-apply-panel">
    <!-- 券码兑换 -->
    <NInputGroup style="margin-bottom: 10px">
      <NInput
        v-model:value="couponInput"
        placeholder="输入券码兑换（留空可自动叠加）"
        @keyup.enter="redeem"
      />
      <NButton @click="redeem">
        <template #icon><IconTicket /></template>
        兑换
      </NButton>
    </NInputGroup>

    <NScrollbar style="max-height: 260px">
      <NEmpty v-if="!autoDrafts.length && !redeemed" description="暂无可用优惠" />

      <NFlex v-else vertical :size="8">
        <div
          v-for="dr in allDrafts()"
          :key="dr.discount.id"
          class="disc-row"
          :class="{ on: checked[dr.discount.id] }"
        >
          <NCheckbox
            :checked="!!checked[dr.discount.id]"
            @update:checked="(v: boolean) => toggle(dr.discount.id, v)"
          >
            <div class="disc-info">
              <div class="disc-name">
                <NTag size="small" :bordered="false" type="info">{{ labelOf(dr) }}</NTag>
                {{ dr.discount.name }}
              </div>
              <NText depth="3" style="font-size: 12px">
                预计减免 {{ fmt(dr.record.discountAmount) }}
              </NText>
            </div>
          </NCheckbox>
        </div>
      </NFlex>
    </NScrollbar>

    <div class="disc-total">
      <NText>小计（优惠前）：{{ fmt(subtotal) }}</NText>
    </div>
  </div>
</template>

<style scoped>
.disc-row {
  border: 1px solid var(--n-border-color);
  border-radius: 8px;
  padding: 8px 10px;
  transition: all 0.15s;
}
.disc-row.on {
  border-color: var(--n-color-target);
  background: var(--n-color-target-hover);
}
.disc-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.disc-name {
  display: flex;
  align-items: center;
  gap: 6px;
  font-weight: 500;
}
.disc-total {
  margin-top: 10px;
  text-align: right;
  font-weight: 600;
}
</style>
