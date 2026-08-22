<script setup lang="ts">
import { watch } from 'vue'
import {
  NCard,
  NFlex,
  NText,
  NButton,
  NInputOtp,
  NTag,
} from 'naive-ui'
import { useDiscountApply } from '@/composables/useDiscountApply'
import { fmt, type Discount, type DiscountType, type OrderItem, type DiscountRecord } from '@/stores/types'

const props = defineProps<{
  memberId: string | null
  memberName?: string
  items: OrderItem[]
}>()

const emit = defineEmits<{
  'update:records': [records: DiscountRecord[]]
  'update:discountAmount': [amount: number]
  'update:finalAmount': [amount: number]
  change: []
}>()

const {
  applied,
  eligibleAuto,
  couponInput,
  couponError,
  redeemCoupon,
  toggleAuto,
  dropApplied,
  records,
  discountAmount,
  finalAmount,
  commitUsage,
  hydrate,
} = useDiscountApply(
  () => props.memberId,
  () => props.items,
)

// 实时把所选优惠同步给父级（新建订单用）
watch(
  [records, discountAmount, finalAmount],
  () => {
    emit('update:records', records.value)
    emit('update:discountAmount', discountAmount.value)
    emit('update:finalAmount', finalAmount.value)
    emit('change')
  },
  { deep: true },
)

const discountTypeLabel = (t: DiscountType | string): string =>
  ({
    coupon: '优惠券',
    timeLimited: '限时优惠',
    member: '会员折扣',
    firstOrder: '首单优惠',
    repeatOrder: '复购优惠',
    referral: '推荐有礼',
  })[t as DiscountType] ?? t

// 券码实时大写：已选优惠券码用 NInputOtp 直接转大写
function onOtp(v: string[]) {
  couponInput.value = [v.join('').toUpperCase()]
}
function applyCoupon() {
  redeemCoupon(couponInput.value[0] ?? '')
}
function onToggle(d: Discount) {
  toggleAuto(d)
}
function onDrop(id: string) {
  dropApplied(id)
}

defineExpose({
  hydrate,
  commitUsage,
  records,
  discountAmount,
  finalAmount,
})
</script>

<template>
  <NCard size="small">
    <NFlex vertical :size="8">
      <NText depth="3">优惠</NText>
      <NText v-if="memberId" depth="3" style="font-size: 12px">当前会员：{{ memberName }}</NText>

      <template v-if="eligibleAuto.length">
        <NText depth="3" style="font-size: 12px">可选优惠（点击添加）</NText>
        <NFlex>
          <NTag
            v-for="d in eligibleAuto"
            :key="d.id"
            checkable
            :checked="applied.some((a) => a.id === d.id)"
            @update:checked="() => onToggle(d)"
          >
            {{ d.name }}（{{
              d.ruleType === 'percentage' ? d.value + '%' : '¥' + fmt(d.value)
            }}）
          </NTag>
        </NFlex>
      </template>

      <NText depth="3" style="font-size: 12px">优惠券码（6 位，自动大写）</NText>
      <NFlex align="center" :size="8">
        <NInputOtp
          :length="6"
          :value="(couponInput[0] || '').split('')"
          @update:value="onOtp"
        />
        <NButton
          type="primary"
          :disabled="!couponInput[0]"
          @click="applyCoupon"
          >应用</NButton
        >
      </NFlex>
      <NText v-if="couponError" type="error" style="font-size: 12px">{{ couponError }}</NText>

      <template v-if="applied.length">
        <NText depth="3" style="font-size: 12px">已应用</NText>
        <NFlex>
          <NTag
            v-for="d in applied"
            :key="d.id"
            closable
            type="success"
            size="small"
            @close="onDrop(d.id)"
          >
            {{ discountTypeLabel(d.discountType) }}：{{ d.name }}
          </NTag>
        </NFlex>
      </template>

      <NFlex v-if="discountAmount > 0" justify="space-between" align="center">
        <NText depth="3">优惠合计</NText>
        <span class="meter-num" style="color: #d03050">-¥{{ fmt(discountAmount) }}</span>
      </NFlex>
    </NFlex>
  </NCard>
</template>
