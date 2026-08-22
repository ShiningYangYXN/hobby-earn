<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
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
  useMessage,
} from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { type OrderItem, type DiscountRecord } from '@/stores/types'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'

const router = useRouter()
const msg = useMessage()
const orderStore = useOrderStore()
const priceStore = usePriceStore()
const memberStore = useMemberStore()

const newMember = ref<string | null>(null)
const newItems = ref<{ priceId: string; quantity: number }[]>([])
const newNotes = ref('')

// 优惠结果（来自复用面板）
const discountRecords = ref<DiscountRecord[]>([])
const discountAmount = ref(0)
const finalAmount = ref(0)

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
// 实时映射为 OrderItem 数组，供优惠面板计算
const currentItems = computed<OrderItem[]>(() =>
  newItems.value
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
    }),
)
const memberName = computed(
  () => memberStore.members.find((m) => m.id === newMember.value)?.name,
)
function addRow() {
  newItems.value.push({ priceId: '', quantity: 1 })
}
function removeRow(i: number) {
  newItems.value.splice(i, 1)
}
const canCreate = computed(() => !!newMember.value && newItems.value.some((r) => r.priceId))

function resetForm() {
  newMember.value = null
  newItems.value = []
  newNotes.value = ''
  discountRecords.value = []
  discountAmount.value = 0
  finalAmount.value = 0
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
  const items = currentItems.value
  if (!items.length) {
    msg.warning('请至少添加一个服务项')
    return
  }
  await orderStore.create(member.id, member.name, items, {
    discountRecords: discountRecords.value,
    discountAmount: discountAmount.value,
    notes: newNotes.value,
  })
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
          <DiscountApplyPanel
            v-else
            :member-id="newMember"
            :member-name="memberName"
            :items="currentItems"
            @update:records="(r: DiscountRecord[]) => (discountRecords = r)"
            @update:discountAmount="(v: number) => (discountAmount = v)"
            @update:finalAmount="(v: number) => (finalAmount = v)"
          />
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
