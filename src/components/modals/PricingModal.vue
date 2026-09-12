<script setup lang="ts">
import { ref, computed, reactive, watch, onUnmounted, nextTick } from 'vue'
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
import { useServiceStore } from '@/stores/useServiceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import {
  fmt,
  fmtElapsed,
  subtotalOf,
  itemAmount,
  addOrMergeItem,
  alignItemsToServices,
  followsServiceConfig,
  isExclusiveService,
  type Order,
  type OrderItem,
  type OrderStatus,
  type PaymentMethod,
  type DiscountRecord,
} from '@/stores/types'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'
import RestrictionAlerts from '@/components/RestrictionAlerts.vue'
import {
  useMemberServiceOptions,
  useServiceRestrictionCheck,
  serviceUsageOf,
  type ServiceOption,
} from '@/composables/useMemberServices'

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
const serviceStore = useServiceStore()
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
// 由优惠面板同步的优惠额，用于实时推导应付金额
const discountAmount = ref(0)

let timer: number | null = null
function ensureTimer() {
  if (timer) return
  timer = window.setInterval(() => {
    items.value.forEach((it, idx) => {
      if (it.pricingMode === 'hourly' && running[idx]) {
        it.elapsed = (it.elapsed ?? 0) + 1
        enforceHourCap(idx) // 走时即拦截：到点自动停表，不等完成收款
      }
    })
  }, 1000)
}
/**
 * 工时型项目触及限购上限：把已计时长钉在上限并自动停表，避免超时长计费。
 * 返回是否触发拦截。
 */
function enforceHourCap(idx: number): boolean {
  const it = items.value[idx]
  if (!it || it.pricingMode !== 'hourly') return false
  const cap = restrictionCheck.capOf(items.value, idx)
  if (cap == null) return false
  if (Math.ceil((it.elapsed ?? 0) / 3600) <= cap) return false
  it.elapsed = Math.max(0, cap) * 3600
  delete running[idx]
  if (!Object.values(running).some(Boolean)) {
    stopTimer()
    discountPanel.value?.drawRandom?.()
  }
  msg.warning(
    cap > 0
      ? `「${it.serviceName}」已达限购上限 ${cap} 小时／单，已自动停表`
      : `「${it.serviceName}」限购额度已被占用，无法计时`,
  )
  return true
}
function stopTimer() {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

async function load() {
  if (!props.show || !props.orderId) return
  // 服务定义始终重新拉取：订单项的计费方式要对齐到最新配置，不能用会话早期的旧值
  await serviceStore.load()
  if (!discountStore.discounts.length) await discountStore.load()
  if (!orderStore.orders.length) await orderStore.load()
  let o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  if (o.status === 'pending') await orderStore.beginExecute(o.id)
  o = orderStore.orders.find((x) => x.id === props.orderId)
  if (!o) return
  order.value = o
  items.value = o.items.map((it) => ({ ...it }))
  // 未完成订单的计费方式跟随服务当前定义：服务改了计价方式后本单立刻按新方式计价；
  // 已完成 / 已关闭订单是历史账目，沿用执行时的计费方式，不进计价器
  if (followsServiceConfig(o.status)) {
    const aligned = alignItemsToServices(items.value, (id) =>
      serviceStore.services.find((s) => s.id === id),
    )
    if (aligned.changed) {
      items.value = aligned.items
      msg.info(`${aligned.changed} 个项目的计费方式已按服务当前配置更新`)
    }
  }
  Object.keys(running).forEach((k) => delete running[Number(k)])
  payMethod.value = o.paymentMethod ?? 'cash'
  newServiceId.value = null
  // 模态内容为懒渲染（display-directive="if" + teleport），必须等一帧让面板挂载，
  // 否则 discountPanel 仍为 null，hydrate / finalizeRandom 静默失效、勾选状态不同步
  await nextTick()
  if (!discountPanel.value) await nextTick()
  discountPanel.value?.hydrate(o.discountRecords ?? [])
  // 初始即为一个计费节点：补全随机优惠的资格与数额，避免展示未计优惠的金额
  discountPanel.value?.finalizeRandom?.()
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
    ensureTimer() // 走时沿用上一计费节点的抽取结果，实时展示优惠后金额
  } else if (!Object.values(running).some(Boolean)) {
    stopTimer()
    discountPanel.value?.drawRandom?.() // 全部停表=计费节点：重算资格与金额
  }
}
function resetItem(idx: number) {
  const it = items.value[idx]
  if (!it) return
  it.elapsed = 0
  if (running[idx]) delete running[idx]
  if (!Object.values(running).some(Boolean)) {
    stopTimer()
    discountPanel.value?.drawRandom?.()
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
// 仅列出该订单会员可添加的服务（专属服务按会员 / 会员类型过滤）
const { options: priceOptions } = useMemberServiceOptions(() => order.value?.memberId ?? null)
const restrictionCheck = useServiceRestrictionCheck()

// 计价项命中的服务为「专属服务」时打标，便于现场确认该项目受限
function isExclusiveItem(it: OrderItem): boolean {
  const p = serviceStore.services.find((s) => s.id === it.priceEntryId)
  return p ? isExclusiveService(p) : false
}
// 数量输入框上限与限购提示（按件型）
function qtyMax(idx: number): number | undefined {
  return restrictionCheck.maxQtyOf(items.value, idx)
}
function limitHint(idx: number): string {
  return restrictionCheck.limitTextOf(items.value, idx)
}
// 改数量即时拦截：超限回退到上限并提示原因
function onQtyChange(idx: number, v: number | null) {
  if (v == null) return
  const problem = restrictionCheck.violationOf(items.value, idx)
  if (!problem) return
  items.value[idx]!.quantity = Math.max(1, restrictionCheck.capOf(items.value, idx) ?? v)
  msg.warning(problem)
}
// 当前计价的违规清单：始终展示，并禁用保存 / 完成收款
const restrictionProblems = computed(() => restrictionCheck.check(items.value))
const blocked = computed(() => restrictionProblems.value.length > 0)
// 追加服务的选择项：会立刻触发限购 / 互斥的服务置灰并附上原因。
// 以「服务构成 + 占用量」为缓存键：秒表每秒刷新时长时不重建选项，避免下拉列表被重置。
let addOptionsCache: { key: string; options: ServiceOption[] } | null = null
const addOptions = computed(() => {
  const key = items.value.map((it) => `${it.priceEntryId}#${serviceUsageOf(it)}`).join('|')
  if (addOptionsCache?.key === key) return addOptionsCache.options
  const options = restrictionCheck.annotateOptions(priceOptions.value, items.value, undefined)
  addOptionsCache = { key, options }
  return options
})
function addService() {
  if (!newServiceId.value) return
  const p = serviceStore.services.find((x) => x.id === newServiceId.value)
  if (!p) return
  const incoming: OrderItem = {
    priceEntryId: p.id,
    serviceName: p.name,
    pricingMode: p.pricingMode,
    quantity: 1,
    unitPrice: p.basePrice,
    elapsed: p.pricingMode === 'hourly' ? 0 : undefined,
    hourlyRate: p.pricingMode === 'hourly' ? p.basePrice : undefined,
  }
  const original = items.value
  const before = new Set(restrictionCheck.check(original))
  // 若已有同服务项则合并（数量 / 时长叠加），否则追加；列表长度不变即并入已有项
  const merged = addOrMergeItem(original, incoming)
  // 追加即拦截：若因此项引入新的互斥 / 限购违规，撤销本次添加
  const added = restrictionCheck.check(merged).find((x) => !before.has(x))
  if (added) {
    items.value = original
    msg.error(added)
    return
  }
  // 列表长度不变＝并入已有项（合并），否则为新增
  const wasMerged = merged.length === original.length
  items.value = merged
  newServiceId.value = null
  // 新增项目可能命中优惠作用域，停表状态下按新计费节点重算
  if (!Object.values(running).some(Boolean)) discountPanel.value?.drawRandom?.()
  if (wasMerged) msg.info(`已将「${p.name}」并入已有项目，数量/时长叠加`)
}

const liveSubtotal = computed(() => subtotalOf(items.value))
// 实时应付金额：小计随秒表跳动，优惠额为上一计费节点算定的结果
const payable = computed(() => Math.max(0, liveSubtotal.value - discountAmount.value))

async function saveProgress() {
  if (!order.value) return
  // 兜底拦截互斥 / 限购 / 分组限购违规（填写阶段已即时拦截）
  if (blocked.value) {
    msg.error(restrictionProblems.value[0]!)
    return
  }
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
  // 兜底拦截互斥 / 限购 / 分组限购违规（正常填写阶段已被即时拦截）
  const problems = restrictionCheck.check(items.value)
  if (problems.length) {
    msg.error(problems[0]!)
    return
  }
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
    :maskClosable="false"
    @update:show="(v: boolean) => emit('update:show', v)"
    content-scrollable
    :segmented="{ content: true, footer: true }"
  >
    <template v-if="order">
      <NFlex vertical :size="10">
        <NFlex align="center" :size="8">
          <NTag type="info" size="small">{{ order.memberName }}</NTag>
          <NTag size="small" class="mono">单号 {{ order.id }}</NTag>
          <NTag size="small" :type="statusType(order.status)">{{ statusLabel(order.status) }}</NTag>
        </NFlex>

        <NEmpty v-if="!items.length" description="该订单无计价项目" />
        <NCard v-for="(it, idx) in items" :key="idx" size="small">
          <NFlex vertical :size="6">
            <NFlex align="center" :size="6">
              <NText strong>{{ it.serviceName }}</NText>
              <NTag v-if="isExclusiveItem(it)" size="tiny" type="warning" :bordered="false"
                >专属</NTag
              >
              <NTag v-if="limitHint(idx)" size="tiny" type="error" :bordered="false">{{
                limitHint(idx)
              }}</NTag>
            </NFlex>
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
                  <NText v-if="!editing[idx]" class="meter-num qty-display" @click="startEdit(idx)"
                    >{{ it.quantity }}
                  </NText>
                  <NInputNumber
                    v-else
                    v-model:value="it.quantity"
                    :min="1"
                    :max="qtyMax(idx)"
                    size="small"
                    style="width: 90px"
                    v-focus
                    @blur="stopEdit(idx)"
                    @keyup.enter="stopEdit(idx)"
                    @update:value="(v: number | null) => onQtyChange(idx, v)"
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
                :options="addOptions"
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

        <RestrictionAlerts :problems="restrictionProblems" />

        <DiscountApplyPanel
          ref="discountPanel"
          :member-id="order?.memberId ?? null"
          :items="items"
          @change="(_recs: DiscountRecord[], amt: number) => (discountAmount = amt)"
        />

        <NCard size="small">
          <NFlex vertical :size="6">
            <NFlex justify="space-between" align="center">
              <NText depth="3">小计</NText>
              <NText>{{ fmt(liveSubtotal) }}</NText>
            </NFlex>
            <NFlex v-if="discountAmount > 0" justify="space-between" align="center">
              <NText depth="3">优惠合计</NText>
              <NText type="error">-{{ fmt(discountAmount) }}</NText>
            </NFlex>
            <NFlex justify="space-between" align="center">
              <NText strong>金额</NText>
              <NText type="warning" class="meter-num" style="font-size: 20px">{{
                fmt(payable)
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
    <template #footer>
      <NFlex justify="end">
        <NButton @click="closePricing">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton :disabled="blocked" @click="saveProgress">
          <NIcon>
            <IconDeviceFloppy />
          </NIcon>
          保存进度
        </NButton>
        <NButton type="primary" :disabled="blocked" @click="finish(payMethod)">
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

/* 计价器大数字 */
.meter-num {
  font-size: 40px;
  font-weight: 700;
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
}

.detail-note {
  font-size: 13px;
}
</style>
