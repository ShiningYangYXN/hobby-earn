<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import {
  NCard,
  NCheckbox,
  NInput,
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
import { useDiscountApply, type DiscountDraft } from '@/composables/useDiscountApply'
import { subtotalOf, type OrderItem, type DiscountRecord } from '@/stores/types'

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
const couponInput = ref('')
const expanded = ref(false)

const autoDrafts = computed(() => apply.drafts.value)

const allDrafts = computed<DiscountDraft[]>(() => [...autoDrafts.value, ...redeemed.value])

// 是否存在「抽取前」的随机优惠（仅显示范围、未计入金额）
const hasRandomPending = computed(() => allDrafts.value.some((d) => d.pending))

const discountedRecords = computed<DiscountRecord[]>(() => {
  const chosen = apply.pickDiscounts(
    allDrafts.value.filter((d) => checked.value.has(d.discount.id)),
  )
  const totalBase = subtotalOf(props.items ?? [])
  return apply.applyLimitGroups(chosen, totalBase, props.items ?? [])
})

const discountAmount = computed(() =>
  discountedRecords.value.reduce((s, r) => s + r.discountAmount, 0),
)

const finalAmount = computed(() => Math.max(0, subtotalOf(props.items ?? []) - discountAmount.value))

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
  if (val) checked.value.add(id)
  else checked.value.delete(id)
  if (val && checked.value.size) expanded.value = true
}

function redeem() {
  const code = couponInput.value.trim().toUpperCase()
  if (!code) return
  const d = apply.redeem(code)
  if (!d) {
    message.error('券码无效或不可用')
    return
  }
  couponInput.value = ''
  if (redeemed.value.some((r) => r.discount.id === d.id)) return
  const draft = apply.buildDraft(d)
  if (!draft) return
  redeemed.value.push(draft)
  checked.value.add(d.id)
}

function reset() {
  checked.value = new Set()
  redeemed.value = []
  couponInput.value = ''
  expanded.value = false
}

defineExpose({
  getDiscountAmount: () => discountAmount.value,
  getFinalAmount: () => finalAmount.value,
  getRecords: () => records.value,
  hasRandomPending: () => hasRandomPending.value,
  // 停表抽取：对所有适用随机优惠一次性抽取数额
  drawRandom: () => apply.drawRandom(),
  // 走时：清空抽取结果，回到范围展示
  resetDraw: () => apply.resetDraw(),
  // 下单固化：决定随机触发类资格并补全抽取结果
  finalizeRandom: () => apply.finalizeRandom(),
  hydrate: (rs: DiscountRecord[]) => {
    const ids = apply.hydrate(rs)
    // 能识别的优惠默认恢复勾选
    for (const id of ids) {
      if (discountStore.discounts.some((d) => d.id === id)) checked.value.add(id)
    }
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
        <NInput
          v-model:value="couponInput"
          placeholder="输入券码兑换优惠"
          style="flex: 1"
          @keyup.enter="redeem"
        />
        <NButton @click="redeem">
          <NIcon><IconTicket /></NIcon>
          兑换
        </NButton>
      </NFlex>

      <NCard
        v-if="allDrafts.length"
        size="small"
        :title="`可用优惠（${allDrafts.length}）`"
        :segmented="{ content: true }"
      >
        <NFlex vertical :size="8">
          <NCheckbox
            v-for="d in allDrafts"
            :key="d.discount.id"
            :checked="checked.has(d.discount.id)"
            @update:checked="(v: boolean) => toggle(d.discount.id, v)"
          >
            <NFlex align="center" :size="6">
              <NText>{{ d.discount.name }}</NText>
              <NTag v-if="d.pending" size="tiny" type="warning">{{ d.rangeLabel }}</NTag>
              <NText v-else type="error" depth="3"
                >-{{ (d.record.discountAmount / 100).toFixed(2) }}</NText
              >
              <NText v-if="d.discount.couponCode" depth="3" style="font-size: 12px">券</NText>
            </NFlex>
          </NCheckbox>

          <NButton
            v-if="allDrafts.length > 3"
            text
            size="tiny"
            @click="expanded = !expanded"
          >
            {{ expanded ? '收起' : '展开全部' }}
          </NButton>
        </NFlex>
      </NCard>

      <NEmpty v-else description="暂无可用优惠" size="small" />

      <NFlex align="center" justify="space-between">
        <NText depth="3">
          优惠 -{{ (discountAmount / 100).toFixed(2) }} ｜ 应付
          <NText type="warning" strong>{{ (finalAmount / 100).toFixed(2) }}</NText>
        </NText>
        <NFlex align="center" :size="6">
          <NTag v-if="hasRandomPending" size="tiny" type="warning">随机优惠待定</NTag>
          <NButton text size="tiny" type="primary" @click="reset">清空</NButton>
        </NFlex>
      </NFlex>
    </NFlex>
  </NScrollbar>
</template>
