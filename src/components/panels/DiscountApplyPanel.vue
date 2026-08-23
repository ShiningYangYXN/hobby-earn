<script setup lang="ts">
import { watch } from 'vue'
import { NCard, NFlex, NText, NInputOtp, NTag } from 'naive-ui'
import { useDiscountApply } from '@/composables/useDiscountApply'
import {
  fmt,
  CODE_LENGTH,
  discountTypeLabel,
  type Discount,
  type OrderItem,
  type DiscountRecord,
} from '@/stores/types'

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



// 券码实时大写：已选优惠券码用 NInputOtp 直接转大写
function onOtp(v: string[]) {
  const code = v.join('').toUpperCase()
  couponInput.value = code
  // 输满自动兑换
  if (code.length >= CODE_LENGTH) {
    redeemCoupon(code)
  }
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
            {{ d.name }}（{{ d.ruleType === 'percentage' ? d.value + '%' : '¥' + fmt(d.value) }}）
          </NTag>
        </NFlex>
      </template>

      <NText depth="3" style="font-size: 12px"
        >优惠券码（{{ CODE_LENGTH }} 位，自动大写，输满自动兑换）</NText
      >
      <NFlex justify="center" style="width: 100%">
        <NInputOtp
          :length="CODE_LENGTH"
          :value="(couponInput || '').split('')"
          @update:value="onOtp"
          placeholder="#"
        />
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
            {{ discountTypeLabel[d.discountType] ?? d.discountType }}：{{ d.name }}
          </NTag>
        </NFlex>
      </template>

      <NFlex v-if="discountAmount > 0" justify="space-between" align="center">
        <NText depth="3">优惠合计</NText>
        <NText type="error">-¥{{ fmt(discountAmount) }}</NText>
      </NFlex>
    </NFlex>
  </NCard>
</template>
