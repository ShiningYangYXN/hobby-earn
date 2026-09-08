<script setup lang="ts">
import { computed, ref, watch, h, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
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
  NDatePicker,
  NCard,
  NIcon,
  useDialog,
  useMessage,
} from 'naive-ui'
import { IconTrash, IconX, IconPlus, IconStopwatch } from '@tabler/icons-vue'
import {
  fmt,
  fmtElapsed,
  itemAmount,
  ruleTypeLabel,
  formatZhe,
  isExclusiveService,
  type Order,
  type OrderItem,
  type OrderStatus,
  type DiscountRecord,
} from '@/stores/types'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useUiStore } from '@/stores/useUiStore'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'
import { useMemberServiceOptions } from '@/composables/useMemberServices'

const props = defineProps<{ id: string }>()
const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()
const memberTypeStore = useMemberTypeStore()
const memberStore = useMemberStore()
const ui = useUiStore()
const discountPanel = ref<InstanceType<typeof DiscountApplyPanel> | null>(null)

const order = computed<Order | null>(() => orderStore.orders.find((o) => o.id === props.id) ?? null)

const statusCfg: Record<
  OrderStatus,
  { label: string; type: 'success' | 'info' | 'warning' | 'default' }
> = {
  pending: { label: '待处理', type: 'warning' },
  in_progress: { label: '执行中', type: 'info' },
  completed: { label: '已完成', type: 'success' },
  closed: { label: '已关闭', type: 'default' },
}

// —— 未执行（待处理）订单：可编辑草稿 ——
const editable = computed(() => order.value?.status === 'pending')
const editNotes = ref('')
const editItems = ref<OrderItem[]>([])
const editDiscountRecords = ref<DiscountRecord[]>([])
const editDiscountAmount = ref(0)
const editFinalAmount = ref(0)

async function loadDraft() {
  const o = order.value
  if (!o) return
  editNotes.value = o.notes ?? ''
  editItems.value = o.items.map((it) => ({ ...it }))
  editDiscountRecords.value = o.discountRecords.map((r) => ({ ...r }))
  editDiscountAmount.value = o.discountAmount
  editFinalAmount.value = o.finalAmount
  // 首次打开时（watcher immediate）面板尚未挂载，需等一帧才能拿到 ref，
  // 否则 hydrate 静默失效、原有优惠的勾选状态不会被还原
  if (!discountPanel.value) await nextTick()
  discountPanel.value?.hydrate(o.discountRecords ?? [])
}
function itemsEqual(a: OrderItem[], b: OrderItem[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!,
      y = b[i]!
    if (
      x.priceEntryId !== y.priceEntryId ||
      x.pricingMode !== y.pricingMode ||
      x.quantity !== y.quantity ||
      x.unitPrice !== y.unitPrice ||
      x.elapsed !== y.elapsed ||
      x.hourlyRate !== y.hourlyRate ||
      x.serviceName !== y.serviceName
    )
      return false
  }
  return true
}
function recordsEqual(a: DiscountRecord[], b: DiscountRecord[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    const x = a[i]!,
      y = b[i]!
    if (
      x.discountId !== y.discountId ||
      x.ruleType !== y.ruleType ||
      x.discountAmount !== y.discountAmount
    )
      return false
  }
  return true
}
const draftDirty = computed(() => {
  const o = order.value
  if (!o) return false
  return (
    editNotes.value !== (o.notes ?? '') ||
    !itemsEqual(editItems.value, o.items) ||
    !recordsEqual(editDiscountRecords.value, o.discountRecords)
  )
})
// 仅列出该订单会员可添加的服务（专属服务按会员 / 会员类型过滤）
const { options: priceOptions } = useMemberServiceOptions(() => order.value?.memberId ?? null)
function rowPrice(priceId: string) {
  return serviceStore.services.find((p) => p.id === priceId)
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
const memberId = computed(() => order.value?.memberId ?? null)

// 只读态订单项：命中的服务为专属服务时打标
function isExclusiveItem(it: OrderItem): boolean {
  const p = serviceStore.services.find((s) => s.id === it.priceEntryId)
  return p ? isExclusiveService(p) : false
}
const readColumns = [
  {
    title: '服务',
    key: 'serviceName',
    render: (row: OrderItem) =>
      h(
        NFlex,
        { size: 4, align: 'center' },
        {
          default: () => [
            h(NText, null, { default: () => row.serviceName }),
            isExclusiveItem(row)
              ? h(
                  NTag,
                  { size: 'tiny', type: 'warning', bordered: false },
                  { default: () => '专属' },
                )
              : null,
          ],
        },
      ),
  },
  { title: '单价', key: 'unitPrice', render: (row: OrderItem) => fmt(row.unitPrice) },
  {
    title: '数量',
    key: 'qty',
    render: (row: OrderItem) =>
      row.pricingMode === 'hourly' ? fmtElapsed(row.elapsed ?? 0) : row.quantity + ' 件',
  },
  { title: '小计', key: 'amount', render: (row: OrderItem) => fmt(itemAmount(row)) },
]

const payOptions = [
  { label: '现金', value: 'cash' },
  { label: '数字人民币', value: 'ecny' },
  { label: '云闪付', value: 'unionpay' },
  { label: '微信', value: 'wechat' },
  { label: '支付宝', value: 'alipay' },
]

// 优惠记录详情弹窗
const showDiscountDetail = ref(false)
const selectedDiscountId = ref<string | null>(null)
const selectedDiscount = computed(() =>
  selectedDiscountId.value
    ? (discountStore.discounts.find((d) => d.id === selectedDiscountId.value) ?? null)
    : null,
)

const selectedRecord = computed<DiscountRecord | null>(() => {
  const id = selectedDiscountId.value
  if (!id || !order.value) return null
  return order.value.discountRecords.find((r) => r.discountId === id) ?? null
})
function openDiscountDetail(id: string) {
  selectedDiscountId.value = id
  showDiscountDetail.value = true
}
// 反查优惠名称：优先用记录中固化的名称
function discountNameOf(rec: DiscountRecord): string {
  return rec.name || '优惠'
}
// 将会员类型 id 列表转换为名称串
function loadMemberTypes(ids: string[]): string {
  return ids.map((id) => memberTypeStore.types.find((t) => t.id === id)?.name ?? id).join('、')
}
// 将分类 id 列表转换为名称串
function loadCategories(ids: string[]): string {
  const names = new Set<string>()
  for (const id of ids) {
    const hit = categoryStore.categories.find((c) => c.id === id)?.name
    if (hit) names.add(hit)
  }
  return [...names].join('、') || ids.join('、')
}
// 日期格式化（Discount.validFrom/validUntil 为 ISO 字符串或空串）
function formatDate(ts?: string | number): string {
  if (!ts) return ''
  const d = new Date(ts)
  if (Number.isNaN(d.getTime())) return String(ts)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function close() {
  router.push('/orders')
}
watch(
  () => props.id,
  async () => {
    if (!discountStore.discounts.length) await discountStore.load()
    if (editable.value) await loadDraft()
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
    content: '关闭后订单将变为「已关闭」，并退还已用优惠用量；确认关闭？',
    positiveText: '关闭',
    negativeText: '取消',
    onPositiveClick: async () => {
      await orderStore.cancel(o.id, { rollbackDiscounts: true })
      msg.success('订单已关闭')
      close()
    },
  })
}

// 已关闭订单若关联优惠已不可用（过期/停用/超兑），则禁止重新打开
const reopenBlockedReason = computed(() => {
  const o = order.value
  if (!o || o.status !== 'closed') return null
  for (const rec of o.discountRecords) {
    const d = discountStore.discounts.find((x) => x.id === rec.discountId)
    if (!d || !discountStore.isUsable(d, o.memberId)) {
      const st = d ? discountStore.discountStatus(d, o.memberId) : 'disabled'
      return st === 'expired'
        ? '优惠已过期'
        : st === 'disabled'
          ? '优惠已停用'
          : st === 'exhausted'
            ? '优惠已达使用上限'
            : '优惠不存在'
    }
  }
  return null
})

function doReopen() {
  const o = order.value
  if (!o) return
  dialog.info({
    title: '重新使用优惠',
    content:
      '将恢复订单为「待处理」状态，并重新占用该订单关联的优惠（重新使用优惠）。若优惠已过期或已达上限将无法重新打开。确认继续？',
    positiveText: '重新打开',
    negativeText: '取消',
    onPositiveClick: async () => {
      const res = await orderStore.reopen(o.id)
      if (res.ok) {
        msg.success('订单已重新打开，优惠已重新使用')
      } else {
        msg.error(res.reason ?? '无法重新打开')
      }
      close()
    },
  })
}

function doDelete() {
  const o = order.value
  if (!o) return
  if (o.status === 'completed' && !ui.labMode) {
    msg.warning('已完成订单需开启「高级模式」（关于页）后才能删除')
    return
  }
  dialog.warning({
    title: '删除订单',
    content: '删除后不可恢复，确认删除？',
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await orderStore.remove(o.id)
      msg.success('订单已删除')
      close()
    },
  })
}

// —— 调试 / 作弊权限（仅高级模式） ——
const debugEditing = ref(false)
const debugAmount = ref(0)
function startEditAmount() {
  if (!order.value) return
  debugAmount.value = order.value.finalAmount / 100
  debugEditing.value = true
}
async function confirmEditAmount() {
  if (!order.value) return
  await orderStore.setFinalAmount(order.value.id, Math.round(debugAmount.value * 100))
  debugEditing.value = false
  msg.success('实验室：订单金额已改写')
}
async function forceReopenOrder() {
  if (!order.value) return
  await orderStore.forceReopen(order.value.id)
  msg.success('实验室：已强制重新打开订单')
  close()
}

// 调试面板：直接改写订单的只读字段（状态 / 归属会员 / 小计 / 时间）
const debugOpen = ref(false)
const debugForm = ref({
  status: 'pending' as OrderStatus,
  memberId: '',
  subtotalYuan: 0,
  createdAt: null as number | null,
  completedAt: null as number | null,
})
const debugStatusOptions = (Object.keys(statusCfg) as OrderStatus[]).map((s) => ({
  label: statusCfg[s].label,
  value: s,
}))
const debugMemberOptions = computed(() => [
  { label: '（散客，无会员）', value: '' },
  ...memberStore.members.map((m) => ({ label: `${m.name}（${m.id}）`, value: m.id })),
])
function openDebugPanel() {
  const o = order.value
  if (!o) return
  debugForm.value = {
    status: o.status,
    memberId: o.memberId ?? '',
    subtotalYuan: Number((o.subtotal / 100).toFixed(2)),
    createdAt: Date.parse(o.createdAt) || null,
    completedAt: o.completedAt ? Date.parse(o.completedAt) || null : null,
  }
  debugOpen.value = true
}
async function saveDebug() {
  const o = order.value
  if (!o) return
  const mid = debugForm.value.memberId
  const m = mid ? memberStore.members.find((x) => x.id === mid) : null
  if (mid && !m) {
    msg.error('会员不存在')
    return
  }
  try {
    await orderStore.debugPatch(o.id, {
      status: debugForm.value.status,
      memberId: mid || null,
      memberName: m?.name ?? '散客',
      subtotal: Math.round(debugForm.value.subtotalYuan * 100),
      createdAt: debugForm.value.createdAt
        ? new Date(debugForm.value.createdAt).toISOString()
        : o.createdAt,
      completedAt: debugForm.value.completedAt
        ? new Date(debugForm.value.completedAt).toISOString()
        : undefined,
    })
    debugOpen.value = false
    msg.success('实验室：订单只读字段已改写')
  } catch (e) {
    msg.error('改写失败：' + (e as Error).message)
  }
}
</script>

<template>
  <NModal
    :show="!!order"
    title="订单详情"
    preset="card"
    :autoFocus="false"
    @update:show="close"
    content-scrollable
    :segmented="{ content: true, footer: true }"
  >
    <template v-if="order">
      <NDescriptions :column="2" bordered size="small">
        <NDescriptionsItem label="订单号">{{ order.id }}</NDescriptionsItem>
        <NDescriptionsItem label="状态">
          <NTag :type="statusCfg[order.status as OrderStatus].type" size="small">
            {{ statusCfg[order.status as OrderStatus].label }}
          </NTag>
        </NDescriptionsItem>
        <NDescriptionsItem label="会员">{{ order.memberName }}</NDescriptionsItem>
        <NDescriptionsItem label="会员号">{{ order.memberId ?? '-' }}</NDescriptionsItem>
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
                style="width: 90px"
              />
              <NText v-else depth="3">待计费</NText>
              <NButton text type="error" @click="editItems.splice(i, 1)">
                <NIcon> <IconTrash /> </NIcon>删除
              </NButton>
            </NFlex>
            <NButton dashed block @click="addItemRow">
              <NIcon :size="16">
                <IconPlus />
              </NIcon>
              添加服务项
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
            ref="discountPanel"
            :member-id="memberId"
            :items="editItems"
            @change="
              (r: DiscountRecord[], t: number) => {
                editDiscountRecords = r
                editDiscountAmount = t
              }
            "
          />
        </NCard>

        <NFlex justify="space-between" style="margin-top: 12px">
          <NText>小计：{{ fmt(order.subtotal) }}</NText>
          <NText type="error" v-if="editDiscountAmount">优惠：-{{ fmt(editDiscountAmount) }}</NText>
          <NText strong>应收：{{ fmt(editFinalAmount) }}</NText>
        </NFlex>
        <NCard
          v-if="editDiscountRecords.length"
          size="small"
          title="优惠明细"
          style="margin-top: 12px"
        >
          <NFlex vertical :size="8">
            <NFlex
              v-for="(rec, i) in editDiscountRecords"
              :key="i"
              align="center"
              justify="space-between"
              style="width: 100%"
            >
              <NButton text type="primary" @click="openDiscountDetail(rec.discountId)">
                <NFlex align="center" :size="6">
                  <NTag size="tiny">{{ ruleTypeLabel[rec.ruleType] ?? rec.ruleType }}</NTag>
                  {{ discountNameOf(rec) }}
                </NFlex>
              </NButton>
              <NText type="error">- {{ fmt(rec.discountAmount) }}</NText>
            </NFlex>
          </NFlex>
        </NCard>
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
          <NText strong type="warning">应收：{{ fmt(order.finalAmount) }}</NText>
        </NFlex>
        <NCard
          v-if="order.discountRecords.length"
          size="small"
          title="优惠明细"
          style="margin-top: 12px"
        >
          <NFlex vertical :size="8">
            <NFlex
              v-for="(rec, i) in order.discountRecords"
              :key="i"
              align="center"
              justify="space-between"
              style="width: 100%"
            >
              <NButton text type="primary" @click="openDiscountDetail(rec.discountId)">
                <NFlex align="center" :size="6">
                  <NTag size="tiny">{{ ruleTypeLabel[rec.ruleType] ?? rec.ruleType }}</NTag>
                  {{ discountNameOf(rec) }}
                </NFlex>
              </NButton>
              <NText type="error">- {{ fmt(rec.discountAmount) }}</NText>
            </NFlex>
          </NFlex>
        </NCard>
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

      <!-- 调试面板（仅作弊模式）：改写订单只读字段 -->
      <NCard
        v-if="ui.labMode && debugOpen"
        size="small"
        title="实验室：改写只读字段"
        style="margin-top: 12px"
      >
        <NFlex vertical :size="8">
          <NFormItem label="订单状态">
            <NSelect
              v-model:value="debugForm.status"
              :options="debugStatusOptions"
              style="width: 180px"
            />
          </NFormItem>
          <NFormItem label="归属会员">
            <NSelect
              v-model:value="debugForm.memberId"
              :options="debugMemberOptions"
              filterable
              style="width: 100%"
            />
          </NFormItem>
          <NFormItem label="小计（元）">
            <NInputNumber
              v-model:value="debugForm.subtotalYuan"
              :min="0"
              :precision="2"
              style="width: 180px"
            />
          </NFormItem>
          <NFormItem label="创建时间">
            <NDatePicker
              v-model:value="debugForm.createdAt"
              type="datetime"
              clearable
              style="width: 220px"
            />
          </NFormItem>
          <NFormItem label="完成时间">
            <NDatePicker
              v-model:value="debugForm.completedAt"
              type="datetime"
              clearable
              style="width: 220px"
            />
          </NFormItem>
          <NFlex :size="8">
            <NButton type="primary" size="small" @click="saveDebug">保存调试修改</NButton>
            <NButton size="small" text @click="debugOpen = false">取消</NButton>
          </NFlex>
          <NText depth="3" style="font-size: 12px">
            直接落库，不做计价与状态机校验；完成时间留空表示未完成（不计入收入统计）。
          </NText>
        </NFlex>
      </NCard>
    </template>

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
            <NIcon :size="16">
              <IconX />
            </NIcon>
            关闭订单
          </NButton>
          <NButton
            v-if="order && (order.status === 'pending' || order.status === 'in_progress')"
            type="primary"
            @click="goMeter"
          >
            <NIcon :size="16">
              <IconStopwatch />
            </NIcon>
            去计价
          </NButton>
          <NButton
            v-if="order && order.status === 'closed'"
            type="primary"
            :disabled="!!reopenBlockedReason"
            :title="reopenBlockedReason || ''"
            @click="doReopen"
          >
            <NIcon :size="16">
              <IconPlus />
            </NIcon>
            重新打开
          </NButton>
          <NButton v-if="order && order.status === 'closed'" type="error" @click="doDelete">
            <NIcon :size="16">
              <IconTrash />
            </NIcon>
            删除
          </NButton>
          <NButton
            v-if="order && order.status === 'completed' && ui.labMode"
            type="error"
            @click="doDelete"
          >
            <NIcon :size="16">
              <IconTrash />
            </NIcon>
            删除
          </NButton>
          <template v-if="ui.labMode">
            <NButton type="warning" @click="forceReopenOrder">实验室：强制重开</NButton>
            <NButton @click="startEditAmount">实验室：改金额</NButton>
            <NButton @click="openDebugPanel">实验室：更多</NButton>
            <template v-if="debugEditing">
              <NInputNumber v-model:value="debugAmount" :min="0" :precision="2" />
              <NButton type="primary" @click="confirmEditAmount">确认</NButton>
              <NButton text @click="debugEditing = false">取消</NButton>
            </template>
          </template>
        </template>
      </NFlex>
    </template>
  </NModal>

  <!-- 优惠（券）详情弹窗 -->
  <NModal
    v-model:show="showDiscountDetail"
    preset="card"
    title="优惠详情"
    class="modal-md"
    :bordered="false"
  >
    <NDescriptions v-if="selectedRecord" labelPlacement="left" bordered :column="1" size="small">
      <NDescriptionsItem label="优惠名称">{{ discountNameOf(selectedRecord) }}</NDescriptionsItem>
      <NDescriptionsItem label="优惠类型">
        {{ ruleTypeLabel[selectedRecord.ruleType] ?? selectedRecord.ruleType }}
      </NDescriptionsItem>
      <NDescriptionsItem label="实扣金额"
        >减 {{ fmt(selectedRecord.discountAmount) }}</NDescriptionsItem
      >
      <template v-if="selectedDiscount">
        <NDescriptionsItem label="优惠规则">
          {{
            selectedDiscount.ruleType === 'percentage'
              ? '打折（按比例）'
              : selectedDiscount.ruleType === 'stepDown'
                ? '每满减（阶梯减免）'
                : selectedDiscount.ruleType === 'perItem'
                  ? '件件减（每件立减）'
                  : '满减（固定金额）'
          }}
        </NDescriptionsItem>
        <NDescriptionsItem label="优惠力度">
          <template v-if="selectedDiscount.ruleType === 'percentage'">
            {{ selectedDiscount.value }}%（打 {{ formatZhe(selectedDiscount.value) }}）
          </template>
          <template v-else-if="selectedDiscount.ruleType === 'stepDown'">
            <template v-if="selectedDiscount.minAmount > 0"
              >满 {{ (selectedDiscount.minAmount / 100).toFixed(2) }} 元可用 · </template
            >每满 {{ ((selectedDiscount.stepAmount ?? 0) / 100).toFixed(2) }} 元减
            {{ (selectedDiscount.value / 100).toFixed(2) }} 元
            <span v-if="selectedDiscount.maxUnits"
              >（最多 {{ selectedDiscount.maxUnits }} 阶）</span
            >
          </template>
          <template v-else-if="selectedDiscount.ruleType === 'perItem'">
            <template v-if="selectedDiscount.minAmount > 0"
              >满 {{ (selectedDiscount.minAmount / 100).toFixed(2) }} 元可用 · </template
            >每件立减 {{ (selectedDiscount.value / 100).toFixed(2) }} 元
            <span v-if="selectedDiscount.maxUnits"
              >（最多 {{ selectedDiscount.maxUnits }} 件）</span
            >
          </template>
          <template v-else>
            满 {{ (selectedDiscount.minAmount / 100).toFixed(2) }} 元减
            {{ (selectedDiscount.value / 100).toFixed(2) }} 元
          </template>
        </NDescriptionsItem>
        <NDescriptionsItem label="触发方式">
          {{ selectedDiscount.couponCode ? `券码兑换（${selectedDiscount.couponCode}）` : '自动' }}
          <span
            v-if="selectedDiscount.triggerChance != null && selectedDiscount.triggerChance < 100"
          >
            · {{ selectedDiscount.triggerChance }}% 概率
          </span>
        </NDescriptionsItem>
        <NDescriptionsItem label="随机" v-if="selectedDiscount.random">
          {{ selectedDiscount.random.kind === 'amount' ? '随机立减' : '随机打折' }}
          {{ (selectedDiscount.random.min / 100).toFixed(2) }} ~
          {{ (selectedDiscount.random.max / 100).toFixed(2) }}
          {{ selectedDiscount.random.kind === 'amount' ? '元' : '%' }}
        </NDescriptionsItem>
        <NDescriptionsItem label="保底消费" v-if="selectedDiscount.ruleType !== 'perItem'">
          {{
            selectedDiscount.minAmount
              ? `¥${(selectedDiscount.minAmount / 100).toFixed(2)}`
              : '不限'
          }}
        </NDescriptionsItem>
        <NDescriptionsItem
          label="最大减免"
          v-if="selectedDiscount.ruleType !== 'fixed' && selectedDiscount.ruleType !== 'perItem'"
        >
          {{
            selectedDiscount.maxDiscount
              ? `¥${(selectedDiscount.maxDiscount / 100).toFixed(2)}`
              : '不限'
          }}
        </NDescriptionsItem>
        <NDescriptionsItem label="有效期">
          <template v-if="selectedDiscount.scope?.timeWindow">
            <template
              v-if="
                selectedDiscount.scope.timeWindow.validFrom ||
                selectedDiscount.scope.timeWindow.validUntil
              "
            >
              {{ formatDate(selectedDiscount.scope.timeWindow.validFrom) || '不限' }} ~
              {{ formatDate(selectedDiscount.scope.timeWindow.validUntil) || '不限' }}
            </template>
            <template v-else>永久有效</template>
            <span v-if="selectedDiscount.scope.timeWindow.cron">
              · 周期 {{ selectedDiscount.scope.timeWindow.cron }}
            </span>
          </template>
          <template v-else>永久有效</template>
        </NDescriptionsItem>
        <NDescriptionsItem label="可用次数">
          {{ selectedDiscount.usageLimit ? `${selectedDiscount.usageLimit} 次` : '不限' }}
        </NDescriptionsItem>
        <NDescriptionsItem label="每会员限用">
          {{ selectedDiscount.memberLimit ? `${selectedDiscount.memberLimit} 次` : '不限' }}
        </NDescriptionsItem>
        <NDescriptionsItem
          label="限定会员类型"
          v-if="selectedDiscount.scope?.memberTypeIds?.length"
        >
          {{ loadMemberTypes(selectedDiscount.scope.memberTypeIds) }}
        </NDescriptionsItem>
        <NDescriptionsItem label="限定会员" v-if="selectedDiscount.scope?.memberIds?.length">
          {{
            selectedDiscount.scope.memberIds
              .map((id) => memberStore.members.find((m) => m.id === id)?.name ?? id)
              .join('、')
          }}
        </NDescriptionsItem>
        <NDescriptionsItem label="限定商品分类" v-if="selectedDiscount.scope?.categories?.length">
          {{ loadCategories(selectedDiscount.scope.categories) }}
        </NDescriptionsItem>
        <NDescriptionsItem label="限定单品" v-if="selectedDiscount.scope?.items?.length">
          {{
            selectedDiscount.scope.items
              .map((id) => serviceStore.services.find((p) => p.id === id)?.name ?? id)
              .join('、')
          }}
        </NDescriptionsItem>
        <NDescriptionsItem label="状态">
          <NTag :type="selectedDiscount.isActive ? 'success' : 'default'" size="small">
            {{ selectedDiscount.isActive ? '启用中' : '已停用' }}
          </NTag>
        </NDescriptionsItem>
      </template>
    </NDescriptions>
    <NEmpty v-else description="未找到该优惠" />
  </NModal>
</template>
