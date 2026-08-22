<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NSelect,
  NInputNumber,
  NInput,
  NButton,
  NFlex,
  NText,
  NCard,
  NEmpty,
  NScrollbar,
  NInputOtp,
  NTag,
  NDivider,
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { type OrderItem } from '@/stores/types'
import { useDiscountApply } from '@/composables/useDiscountApply'

const router = useRouter()
const msg = useMessage()
const orderStore = useOrderStore()
const priceStore = usePriceStore()
const memberStore = useMemberStore()

const newMember = ref<string | null>(null)
const newItems = ref<{ priceId: string; quantity: number }[]>([])
const newNotes = ref('')

const memberOptions = computed(() =>
  memberStore.members.map((m) => ({ label: m.name, value: m.id })),
)
const priceOptions = computed(() =>
  priceStore.prices
    .filter((p) => p.isActive)
    .map((p) => ({
      label: `${p.name}（${p.pricingMode === 'hourly' ? '工时' : '按件'} ¥${(
        p.basePrice / 100
      ).toFixed(2)}${p.pricingMode === 'hourly' ? '/h' : '/件'}）`,
      value: p.id,
    })),
)
function rowPrice(priceId: string) {
  return priceStore.prices.find((p) => p.id === priceId)
}
function currentItems(): OrderItem[] {
  return newItems.value
    .filter((r) => r.priceId)
    .map((r) => {
      const p = rowPrice(r.priceId)!
      return {
        priceEntryId: p.id,
        serviceName: p.name,
        pricingMode: p.pricingMode,
        quantity: p.pricingMode === 'hourly' ? 1 : r.quantity,
        unitPrice: p.basePrice,
        elapsed: p.pricingMode === 'hourly' ? 0 : undefined,
        hourlyRate: p.pricingMode === 'hourly' ? p.basePrice : undefined,
      }
    })
}
function addRow() {
  newItems.value.push({ priceId: '', quantity: 1 })
}
function removeRow(i: number) {
  newItems.value.splice(i, 1)
}
const canCreate = computed(() => !!newMember.value && newItems.value.some((r) => r.priceId))

const {
  applied,
  couponInput,
  couponError,
  subtotal,
  eligibleAuto,
  redeemCoupon,
  toggleAuto,
  dropApplied,
  records,
  discountAmount,
  finalAmount,
  commitUsage,
  reset,
} = useDiscountApply(
  () => newMember.value,
  currentItems,
)

// 切换会员后清空已选优惠（优惠与会员资格相关）
watch(newMember, () => reset())

function resetForm() {
  newMember.value = null
  newItems.value = []
  newNotes.value = ''
  reset()
}

onMounted(async () => {
  resetForm()
  if (!memberStore.members.length) await memberStore.load()
  if (!priceStore.prices.length) await priceStore.load()
  if (!orderStore.orders.length) await orderStore.load()
})

async function doCreate() {
  if (!newMember.value) return
  const member = memberStore.members.find((m) => m.id === newMember.value)
  if (!member) return
  const items = currentItems()
  if (!items.length) {
    msg.warning('请至少添加一个服务项')
    return
  }
  await orderStore.create(member.id, member.name, items, {
    discountRecords: records.value,
    discountAmount: discountAmount.value,
    notes: newNotes.value,
  })
  await commitUsage()
  msg.success('订单已创建')
  router.push('/orders')
}

function close() {
  router.push('/orders')
}
</script>

<template>
  <NModal
    :show="true"
    title="新建订单"
    preset="card"
    class="modal-lg"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar class="modal-scroll">
      <NEmpty v-if="!memberOptions.length" description="请先在「会员」中录入会员" />
      <NForm v-else label-placement="top">
        <NFormItem label="会员">
          <NSelect
            v-model:value="newMember"
            :options="memberOptions"
            placeholder="选择会员"
            filterable
          />
        </NFormItem>

        <NFormItem label="服务项">
          <NFlex vertical :size="8" style="width: 100%">
            <NFlex v-for="(row, i) in newItems" :key="i" align="center" :size="8">
              <NSelect
                v-model:value="row.priceId"
                :options="priceOptions"
                placeholder="选择服务"
                filterable
                style="min-width: 240px"
              />
              <NInputNumber
                v-if="row.priceId && rowPrice(row.priceId)?.pricingMode === 'perPiece'"
                v-model:value="row.quantity"
                :min="1"
                :show-button="false"
                style="width: 100px"
              />
              <NText v-else depth="3">工时计</NText>
              <NButton text type="error" @click="removeRow(i)">删除</NButton>
            </NFlex>
            <NButton dashed block @click="addRow">
              <IconPlus :size="16" />
              添加服务项
            </NButton>
          </NFlex>
        </NFormItem>

        <NFormItem label="备注">
          <NInput
            v-model:value="newNotes"
            type="textarea"
            placeholder="备注（可选）"
            :autosize="{ minRows: 2, maxRows: 4 }"
          />
        </NFormItem>

        <NCard title="优惠" size="small" :bordered="true">
          <NText v-if="!newMember" depth="3">请先选择会员以使用优惠</NText>
          <template v-else>
            <NFlex align="center" :size="8">
              <NInputOtp :length="6" v-model:value="couponInput" placeholder="券码" />
              <NButton @click="redeemCoupon(couponInput.join(''))">兑换</NButton>
            </NFlex>
            <NText v-if="couponError" type="error" depth="3" style="display: block; margin-top: 6px">
              {{ couponError }}
            </NText>

            <NDivider title-placement="left" size="small">可勾选优惠</NDivider>
            <NFlex :size="8">
              <NTag
                v-for="d in eligibleAuto"
                :key="d.id"
                checkable
                :checked="applied.some((a) => a.id === d.id)"
                @update:checked="() => toggleAuto(d)"
              >
                {{ d.name }}（{{
                  d.ruleType === 'percentage' ? d.value + '%' : '¥' + (d.value / 100).toFixed(2)
                }}）
              </NTag>
              <NText v-if="!eligibleAuto.length" depth="3">暂无可自动应用的优惠</NText>
            </NFlex>

            <NDivider title-placement="left" size="small">已应用</NDivider>
            <NFlex :size="8">
              <NTag v-for="d in applied" :key="d.id" closable @close="dropApplied(d.id)">
                {{ d.name }}
              </NTag>
              <NText v-if="!applied.length" depth="3">暂无</NText>
            </NFlex>

            <NDivider title-placement="left" size="small">金额</NDivider>
            <NFlex justify="space-between">
              <NText>小计：¥{{ (subtotal / 100).toFixed(2) }}</NText>
              <NText type="error">优惠：-¥{{ (discountAmount / 100).toFixed(2) }}</NText>
              <NText strong>实收：¥{{ (finalAmount / 100).toFixed(2) }}</NText>
            </NFlex>
          </template>
        </NCard>
      </NForm>
    </NScrollbar>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">取消</NButton>
        <NButton type="primary" :disabled="!canCreate" @click="doCreate">创建</NButton>
      </NFlex>
    </template>
  </NModal>
</template>
