<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NScrollbar,
  NFlex,
  NText,
  NTag,
  NButton,
  NDataTable,
  NDescriptions,
  NDescriptionsItem,
  NInput,
  NInputNumber,
  NSelect,
  NFormItem,
  NCard,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconShare, IconTrash, IconX, IconPlus } from '@tabler/icons-vue'
import { fmt, itemAmount, type Order, type OrderItem, type OrderStatus, type DiscountRecord } from '@/stores/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useUiStore } from '@/stores/useUiStore'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'

const props = defineProps<{ id: string }>()
const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const priceStore = usePriceStore()
const ui = useUiStore()

const order = computed<Order | null>(() => orderStore.orders.find((o) => o.id === props.id) ?? null)

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'success' | 'info' | 'warning' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '执行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  cancelled: { label: '已取消', type: 'default' },
}

// —— 未执行（待处理）订单：可编辑草稿 ——
const editable = computed(() => order.value?.status === 'pending')
const editNotes = ref('')
const editItems = ref<OrderItem[]>([])
const editDiscountRecords = ref<DiscountRecord[]>([])
const editDiscountAmount = ref(0)
const editFinalAmount = ref(0)

function loadDraft() {
  const o = order.value
  if (!o) return
  editNotes.value = o.notes ?? ''
  editItems.value = o.items.map((it) => ({ ...it }))
  editDiscountRecords.value = o.discountRecords.map((r) => ({ ...r }))
  editDiscountAmount.value = o.discountAmount
  editFinalAmount.value = o.finalAmount
}
const draftDirty = computed(() => {
  const o = order.value
  if (!o) return false
  return (
    editNotes.value !== (o.notes ?? '') ||
    editItems.value.length !== o.items.length ||
    editDiscountRecords.value.length !== o.discountRecords.length
  )
})
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
function addItemRow() {
  editItems.value.push({
    priceEntryId: '',
    serviceName: '',
    pricingMode: 'perPiece',
    quantity: 1,
    unitPrice: 0,
  })
}
function onItemPriceChange(i: number) {
  const it = editItems.value[i]
  if (!it || !it.priceEntryId) return
  const p = rowPrice(it.priceEntryId)
  if (!p) return
  it.serviceName = p.name
  it.pricingMode = p.pricingMode
  it.unitPrice = p.basePrice
  it.hourlyRate = p.pricingMode === 'hourly' ? p.basePrice : undefined
  it.elapsed = p.pricingMode === 'hourly' ? 0 : undefined
  it.quantity = p.pricingMode === 'hourly' ? 1 : it.quantity
}
const memberName = computed(() => order.value?.memberName)
const memberId = computed(() => order.value?.memberId ?? null)

const readColumns = [
  { title: '服务', key: 'serviceName' },
  { title: '单价', key: 'unitPrice', render: (row: OrderItem) => fmt(row.unitPrice) },
  {
    title: '数量',
    key: 'qty',
    render: (row: OrderItem) =>
      row.pricingMode === 'hourly'
        ? fmt(Math.round((row.elapsed ?? 0) * (row.hourlyRate ?? 0)))
        : row.quantity + ' 件',
  },
  { title: '小计', key: 'amount', render: (row: OrderItem) => fmt(itemAmount(row)) },
]

const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
  { label: '其他', value: 'ecny' },
]

function close() {
  router.push('/orders')
}
watch(
  () => props.id,
  () => {
    if (editable.value) loadDraft()
  },
  { immediate: true },
)
function goMeter() {
  router.push('/price-meter/' + props.id)
}
async function saveDraft() {
  if (!order.value) return
  await orderStore.updateDraft(order.value.id, {
    notes: editNotes.value,
    items: editItems.value.filter((it) => it.priceEntryId),
    discountRecords: editDiscountRecords.value,
  })
  msg.success('已保存修改')
}

function doCancel() {
  const o = order.value
  if (!o) return
  dialog.warning({
    title: '关闭订单',
    content: '关闭后订单将变为「已取消」，可退还已用优惠；确认关闭？',
    positiveText: '关闭',
    negativeText: '取消',
    onPositiveClick: async () => {
      for (const rec of o.discountRecords) {
        await discountStore.rollbackUsage(rec.discountId, o.memberId)
      }
      await orderStore.cancel(o.id)
      msg.success('订单已关闭')
      close()
    },
  })
}

function doDelete() {
  const o = order.value
  if (!o) return
  if (o.status === 'completed' && !ui.advancedMode) {
    msg.warning('已完成订单需开启「高级模式」（关于页）后才能删除')
    return
  }
  dialog.warning({
    title: '删除订单',
    content: '删除后不可恢复，确认删除？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      for (const rec of o.discountRecords) {
        await discountStore.rollbackUsage(rec.discountId, o.memberId)
      }
      await orderStore.remove(o.id)
      msg.success('订单已删除')
      close()
    },
  })
}
</script>

<template>
  <NModal
    :show="!!order"
    title="订单详情"
    preset="card"
    class="modal-lg"
    :auto-focus="false"
    @update:show="close"
  >
    <NScrollbar v-if="order" class="modal-scroll">
      <NDescriptions :column="2" bordered size="small">
        <NDescriptionsItem label="订单号">{{ order.id }}</NDescriptionsItem>
        <NDescriptionsItem label="状态">
          <NTag :type="statusCfg[order.status as OrderStatus].type" size="small">
            {{ statusCfg[order.status as OrderStatus].label }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="会员">{{ order.memberName }}</NDescriptionsItem>
        <NDescriptionsItem label="创建时间">{{
          new Date(order.createdAt).toLocaleString()
        }}</NDescriptionsItem>
      </NDescriptions>

      <!-- 未执行订单：可编辑 -->
      <template v-if="editable">
        <NCard size="small" title="服务项" style="margin-top: 12px">
          <NFlex vertical :size="8">
            <NFlex
              v-for="(it, i) in editItems"
              :key="i"
              align="center"
              :size="8"
              style="width: 100%"
            >
              <NSelect
                v-model:value="it.priceEntryId"
                :options="priceOptions"
                placeholder="选择服务"
                filterable
                style="min-width: 220px"
                @update:value="() => onItemPriceChange(i)"
              />
              <NInputNumber
                v-if="it.pricingMode === 'perPiece'"
                v-model:value="it.quantity"
                :min="1"
                :show-button="false"
                style="width: 90px"
              />
              <NText v-else depth="3">工时计</NText>
              <NButton text type="error" @click="editItems.splice(i, 1)">删除</NButton>
            </NFlex>
            <NButton dashed block @click="addItemRow">
              <IconPlus :size="16" /> 添加服务项
            </NButton>
          </NFlex>
        </NCard>

        <NFormItem label="备注" style="margin-top: 12px">
          <NInput
            v-model:value="editNotes"
            type="textarea"
            placeholder="备注（可选）"
            :autosize="{ minRows: 2, maxRows: 4 }"
          />
        </NFormItem>

        <NCard size="small" title="优惠" style="margin-top: 4px">
          <DiscountApplyPanel
            :member-id="memberId"
            :member-name="memberName"
            :items="editItems"
            @update:records="(r: DiscountRecord[]) => (editDiscountRecords = r)"
            @update:discountAmount="(v: number) => (editDiscountAmount = v)"
            @update:finalAmount="(v: number) => (editFinalAmount = v)"
          />
        </NCard>

        <NFlex justify="space-between" style="margin-top: 12px">
          <NText>小计：{{ fmt(order.subtotal) }}</NText>
          <NText type="error" v-if="editDiscountAmount">优惠：-{{ fmt(editDiscountAmount) }}</NText>
          <NText strong>应收：{{ fmt(editFinalAmount) }}</NText>
        </NFlex>
      </template>

      <!-- 其他状态：只读 -->
      <template v-else>
        <NDataTable
          :columns="readColumns"
          :data="order.items"
          :pagination="false"
          size="small"
          style="margin-top: 12px"
        />

        <NFlex justify="space-between" style="margin-top: 12px">
          <NText>小计：{{ fmt(order.subtotal) }}</NText>
          <NText type="error" v-if="order.discountAmount"
            >优惠：-{{ fmt(order.discountAmount) }}</NText
          >
          <NText strong>应收：{{ fmt(order.finalAmount) }}</NText>
        </NFlex>
        <NText depth="3" v-if="order.paymentMethod" style="display: block; margin-top: 6px">
          收款方式：
          <NTag v-if="order.paymentMethod" size="small">
            {{ payOptions.find((p) => p.value === order?.paymentMethod)?.label }}
          </NTag>
        </NText>
        <NText depth="3" v-if="order.notes" style="display: block; margin-top: 6px">
          备注：{{ order.notes }}
        </NText>
      </template>
    </NScrollbar>

    <template #footer>
      <NFlex justify="end">
        <template v-if="editable">
          <NButton :disabled="!draftDirty" @click="saveDraft">保存修改</NButton>
        </template>
        <template v-else>
          <NButton
            v-if="order && (order.status === 'pending' || order.status === 'in_progress')"
            @click="doCancel"
          >
            <IconX :size="16" /> 关闭订单
          </NButton>
          <NButton
            v-if="order && (order.status === 'pending' || order.status === 'in_progress')"
            type="primary"
            @click="goMeter"
          >
            <IconShare :size="16" /> 去计价
          </NButton>
          <NButton v-if="order && order.status === 'cancelled'" type="error" @click="doDelete">
            <IconTrash :size="16" /> 删除
          </NButton>
          <NButton
            v-if="order && order.status === 'completed' && ui.advancedMode"
            type="error"
            @click="doDelete"
          >
            <IconTrash :size="16" /> 删除
          </NButton>
        </template>
      </NFlex>
    </template>
  </NModal>
</template>
