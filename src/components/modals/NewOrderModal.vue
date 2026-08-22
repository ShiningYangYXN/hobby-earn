<script setup lang="ts">
import { ref, computed, watch } from 'vue'
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
import { type Order, type OrderItem } from '@/stores/types'

const props = defineProps<{ show: boolean }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  created: [order: Order]
}>()

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
const canCreate = computed(() => !!newMember.value && newItems.value.some((r) => r.priceId))

function reset() {
  newMember.value = null
  newItems.value = []
  newNotes.value = ''
}
watch(
  () => props.show,
  async (v) => {
    if (v) {
      reset()
      if (!memberStore.members.length) await memberStore.load()
      if (!priceStore.prices.length) await priceStore.load()
    }
  },
)

function addItem() {
  newItems.value.push({ priceId: '', quantity: 1 })
}
function removeItem(idx: number) {
  newItems.value.splice(idx, 1)
}
async function doCreate() {
  if (!newMember.value) return
  const member = memberStore.members.find((m) => m.id === newMember.value)
  if (!member) return
  const items: OrderItem[] = newItems.value
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
  if (!items.length) return
  const order = await orderStore.create(member.id, member.name, items, { notes: newNotes.value })
  msg.success('订单已创建')
  emit('created', order)
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="show"
    title="新建订单"
    preset="card"
    class="modal-md"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NScrollbar class="modal-scroll">
      <NForm label-placement="top">
        <NFormItem label="会员" :required="true">
          <NSelect
            v-model:value="newMember"
            :options="memberOptions"
            placeholder="选择会员"
            filterable
            clearable
          />
        </NFormItem>
        <NFlex vertical :size="8">
          <NFlex justify="space-between" align="center">
            <NText strong>服务项</NText>
            <NButton size="small" @click="addItem"><IconPlus /> 添加</NButton>
          </NFlex>
          <NCard v-for="(row, idx) in newItems" :key="idx" size="small">
            <NFlex align="center" :size="8">
              <NSelect
                v-model:value="row.priceId"
                :options="priceOptions"
                placeholder="选择服务"
                style="flex: 1; min-width: 0"
              />
              <template v-if="rowPrice(row.priceId)?.pricingMode === 'perPiece'">
                <NInputNumber v-model:value="row.quantity" :min="1" style="width: 110px" />
              </template>
              <template v-else>
                <NText depth="3" style="white-space: nowrap">计时计价</NText>
              </template>
              <NButton size="small" type="error" text @click="removeItem(idx)">移除</NButton>
            </NFlex>
          </NCard>
          <NEmpty v-if="!newItems.length" description="请添加至少一个服务项" />
        </NFlex>
        <NFormItem label="备注" style="margin-top: 8px">
          <NInput v-model:value="newNotes" type="textarea" :rows="2" placeholder="可填写备注…" />
        </NFormItem>
      </NForm>
    </NScrollbar>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="emit('update:show', false)">取消</NButton>
        <NButton type="primary" :disabled="!canCreate" @click="doCreate">创建订单</NButton>
      </NFlex>
    </template>
  </NModal>
</template>
