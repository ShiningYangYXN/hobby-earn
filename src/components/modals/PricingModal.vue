<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted } from 'vue'
import {
  NModal,
  NCard,
  NEmpty,
  NFlex,
  NText,
  NButton,
  NRadioGroup,
  NRadioButton,
  NTag,
  NFormItem,
  NScrollbar,
  NSelect,
  NInputNumber,
  NIcon,
  useMessage,
} from 'naive-ui'
import {
  IconPlayerPlay,
  IconPlayerPause,
  IconReload,
  IconTrash,
  IconX,
  IconDeviceFloppy,
  IconCoinYen,
} from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import {
  fmt,
  fmtElapsed,
  subtotalOf,
  itemAmount,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
} from '@/stores/types'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'

const props = defineProps<{ show: boolean; orderId: string | null }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  saved: []
  completed: []
}>()

const msg = useMessage()

// 局部指令：元素挂载后自动聚焦内部 input（用于按件数量编辑）
const vFocus = {
  mounted: (el: HTMLElement) => {
    const input = el.querySelector('input')
    if (input) input.focus()
  },
}
const orderStore = useOrderStore()
const priceStore = usePriceStore()
const discountStore = useDiscountStore()

const payOpts: { label: string; value: PaymentMethod }[] = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

const statusLabel = (s: OrderStatus) =>
  ({ pending: '待处理', in_progress: '执行中', completed: '已完成', closed: '已关闭' })[s]
const statusType = (s: OrderStatus) =>
  ({ pending: 'warning', in_progress: 'info', completed: 'success', closed: 'default' })[s] as
    | 'warning'
    | 'info'
    | 'success'
    | 'default'

const order = ref<Order | null>(null)
const items = ref<OrderItem[]>([])
const running = reactive<Record<number, boolean>>({})
const editing = reactive<Record<number, boolean>>({})
const payMethod = ref<PaymentMethod>('cash')
const newServiceId = ref<string | null>(null)
const discountPanel = ref<InstanceType<typeof DiscountApplyPanel> | null>(null)

let timer: number | null = null
function ensureTimer() {
  if (timer) return
  timer = window.setInterval(() => {
    items.value.forEach((it, idx) => {
      if (it.pricingMode === 'hourly' && running[idx]) it.elapsed = (it.elapsed ?? 0) + 1
    })
  }, 1000)
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function load() {
  if (!props.show || !props.orderId) return
  if (!priceStore.prices.length) await priceStore.load()
  if (!discountStore.discounts.length) await discountStore.load()
  let o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  if (o.status === 'pending') await orderStore.beginExecute(o.id)
  o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  order.value = o
  items.value = o.items.map((it) => ({ ...it }))
  Object.keys(running).forEach((k) => delete running[Number(k)])
  payMethod.value = o.paymentMethod ?? 'cash'
  newServiceId.value = null
  discountPanel.value?.hydrate(o.discountRecords)
}

watch(
  () => [props.show, props.orderId],
  () => load(),
  { immediate: true },
)
watch(
  () => props.show,
  (v) => {
    if (!v) stopTimer()
  },
)
onUnmounted(stopTimer)

function toggle(idx: number) {
  running[idx] = !(running[idx] ?? false)
  if (running[idx]) {
    ensureTimer()
    discountPanel.value?.resetDraw?.() // 走时：恢复到范围展示
  } else if (!Object.values(running).some(Boolean)) {
    stopTimer()
    discountPanel.value?.drawRandom?.() // 全部停表：抽取
  }
}
function resetItem(idx: number) {
  const it = items.value[idx]
  if (!it) return
  it.elapsed = 0
  if (running[idx]) {
    delete running[idx]
    if (!Object.values(running).some(Boolean)) {
      stopTimer()
      discountPanel.value?.drawRandom?.()
    }
  }
}
// 删除已有计费项目，并同步重排 running/editing 的下标（删除点之后的项前移一位）
function removeItem(idx: number) {
  if (idx < 0 || idx >= items.value.length) return
  items.value.splice(idx, 1)
  const r: Record<number, boolean> = {}
  const e: Record<number, boolean> = {}
  Object.keys(running).forEach((k) => {
    const j = Number(k)
    if (j < idx) r[j] = running[j] ?? false
    else if (j > idx) r[j - 1] = running[j] ?? false
  })
  Object.keys(editing).forEach((k) => {
    const j = Number(k)
    if (j < idx) e[j] = editing[j] ?? false
    else if (j > idx) e[j - 1] = editing[j] ?? false
  })
  Object.keys(running).forEach((k) => delete running[Number(k)])
  Object.keys(editing).forEach((k) => delete editing[Number(k)])
  Object.assign(running, r)
  Object.assign(editing, e)
  if (!Object.values(running).some(Boolean)) {
    stopTimer()
    discountPanel.value?.drawRandom?.() // 删除后若全部停表则抽取
  }
}
function startEdit(idx: number) {
  editing[idx] = true
}
function stopEdit(idx: number) {
  editing[idx] = false
}
const priceOptions = computed(() =>
  priceStore.prices.map((p) => ({
    label: `${p.name}（${p.pricingMode === 'hourly' ? '工时' : '按件'} ¥${(
      p.basePrice / 100
    ).toFixed(2)}${p.pricingMode === 'hourly' ? '/小时' : '/件'}）`,
    value: p.id,
  })),
)
function addService() {
  if (!newServiceId.value) return
  const p = priceStore.prices.find((x) => x.id === newServiceId.value)
  if (!p) return
  items.value.push({
    priceEntryId: p.id,
    serviceName: p.name,
    pricingMode: p.pricingMode,
    quantity: p.pricingMode === 'hourly' ? 1 : 1,
    unitPrice: p.basePrice,
    elapsed: p.pricingMode === 'hourly' ? 0 : undefined,
    hourlyRate: p.pricingMode === 'hourly' ? p.basePrice : undefined,
  })
  newServiceId.value = null
}

const liveSubtotal = computed(() => subtotalOf(items.value))

async function saveProgress() {
  if (!order.value) return
  stopTimer()
  await orderStore.saveExecution(
    order.value.id,
    items.value.map((it) => ({ ...it })),
    undefined,
    payMethod.value,
  )
  msg.success('进度已保存')
  emit('saved')
}
async function finish(m: PaymentMethod) {
  if (!order.value) return
  stopTimer()
  discountPanel.value?.finalizeRandom?.() // 固化随机触发资格
  const recs = discountPanel.value?.getRecords?.() ?? []
  try {
    await discountPanel.value?.commitUsage(recs)
    await orderStore.finalize(
      order.value.id,
      items.value.map((it) => ({ ...it })),
      recs,
      m,
    )
  } catch (e) {
    msg.error('完成失败：' + (e as Error).message)
    return
  }
  msg.success('已完成并收款')
  emit('completed')
  emit('update:show', false)
}
function closePricing() {
  stopTimer()
  emit('update:show', false)
}
</script>

<template>
  <NModal
    :show="show"
    title="计价"
    preset="card"
    class="modal-xl"
    :maskClosable="false"
    @update:show="(v: boolean) => emit('update:show', v)"
  >
    <NScrollbar class="modal-scroll">
      <template v-if="order">
        <NFlex vertical :size="10">
          <NFlex align="center" :size="8">
            <NTag type="info" size="small">{{ order.memberName }}</NTag>
            <NTag size="small" class="mono">单号 {{ order.id }}</NTag>
            <NTag size="small" :type="statusType(order.status)">{{
              statusLabel(order.status)
            }}</NTag>
          </NFlex>

          <NEmpty v-if="!items.length" description="该订单无计价项目" />
          <NCard v-for="(it, idx) in items" :key="idx" size="small">
            <NFlex vertical :size="6">
              <NText strong>{{ it.serviceName }}</NText>
              <NText class="meter-num" style="font-size: 18px">{{ fmt(itemAmount(it)) }}</NText>
              <NFlex align="center" justify="space-between">
                <NText depth="3">{{ it.pricingMode === 'hourly' ? '已计时长' : '数量' }}</NText>
                <NFlex align="center" :size="10">
                  <NText v-if="it.pricingMode === 'hourly'" class="meter-num">{{
                    fmtElapsed(it.elapsed ?? 0)
                  }}</NText>
                  <template v-if="it.pricingMode === 'hourly'">
                    <NButton
                      size="small"
                      circle
                      :type="running[idx] ? 'warning' : 'primary'"
                      @click="toggle(idx)"
                    >
                      <NIcon v-if="!running[idx]">
                        <IconPlayerPlay />
                      </NIcon>
                      <NIcon v-else>
                        <IconPlayerPause />
                      </NIcon>
                    </NButton>
                    <NButton size="small" circle @click="resetItem(idx)">
                      <NIcon>
                        <IconReload />
                      </NIcon>
                    </NButton>
                  </template>
                  <template v-else>
                    <NText
                      v-if="!editing[idx]"
                      class="meter-num qty-display"
                      @click="startEdit(idx)"
                      >{{ it.quantity }}
                    </NText>
                    <NInputNumber
                      v-else
                      v-model:value="it.quantity"
                      :min="1"
                      size="small"
                      style="width: 90px"
                      v-focus
                      @blur="stopEdit(idx)"
                      @keyup.enter="stopEdit(idx)"
                    />
                  </template>
                  <NButton size="small" circle quaternary type="error" @click="removeItem(idx)">
                    <NIcon>
                      <IconTrash />
                    </NIcon>
                  </NButton>
                </NFlex>
              </NFlex>
            </NFlex>
          </NCard>

          <NCard size="small">
            <NFlex justify="space-between" align="center">
              <NText depth="3">补充服务项目</NText>
              <NFlex align="center" :size="8" style="flex: 1; min-width: 0">
                <NSelect
                  v-model:value="newServiceId"
                  :options="priceOptions"
                  placeholder="选择要追加的服务"
                  clearable
                  filterable
                  style="flex: 1; min-width: 0"
                />
                <NButton size="small" type="primary" :disabled="!newServiceId" @click="addService"
                  >添加</NButton
                >
              </NFlex>
            </NFlex>
          </NCard>

          <DiscountApplyPanel
            ref="discountPanel"
            :member-id="order?.memberId ?? null"
            :items="items"
          />

          <NCard size="small">
            <NFlex vertical :size="6">
              <NFlex justify="space-between" align="center">
                <NText depth="3">小计</NText>
                <NText>{{ fmt(liveSubtotal) }}</NText>
              </NFlex>
              <NFlex
                v-if="(discountPanel?.getDiscountAmount?.() ?? 0) > 0"
                justify="space-between"
                align="center"
              >
                <NText depth="3">优惠</NText>
                <NText type="error">-{{ fmt(discountPanel?.getDiscountAmount?.() ?? 0) }}</NText>
              </NFlex>
              <NFlex justify="space-between" align="center">
                <NFlex align="center" :size="6">
                  <NText strong>金额</NText>
                  <NTag v-if="discountPanel?.hasRandomPending?.()" size="tiny" type="warning"
                    >随机优惠待定</NTag
                  >
                </NFlex>
                <NText type="warning" class="meter-num qty-display" style="font-size: 20px">{{
                  fmt(discountPanel?.getFinalAmount?.() ?? liveSubtotal)
                }}</NText>
              </NFlex>
            </NFlex>
          </NCard>

          <NFormItem label="支付方式">
            <NRadioGroup v-model:value="payMethod">
              <NRadioButton v-for="p in payOpts" :key="p.value" :value="p.value">{{
                p.label
              }}</NRadioButton>
            </NRadioGroup>
          </NFormItem>

          <NText v-if="order.notes" depth="3" class="detail-note">备注：{{ order.notes }}</NText>
        </NFlex>
      </template>
    </NScrollbar>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="closePricing">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton @click="saveProgress">
          <NIcon>
            <IconDeviceFloppy />
          </NIcon>
          保存进度
        </NButton>
        <NButton type="primary" @click="finish(payMethod)">
          <NIcon> <IconCoinYen /> </NIcon>完成并收款
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<style scoped>
.qty-display {
  cursor: pointer;
  padding: 2px 4px;
  border-radius: 4px;
  transition: background-color 0.15s ease;
}

.qty-display:hover {
  background-color: rgba(128, 128, 128, 0.15);
}
</style>
