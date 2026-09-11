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
  NIcon,
  useMessage,
} from 'naive-ui'
import { IconCheck, IconPlus, IconTrash, IconX } from '@tabler/icons-vue'
import { useOrderStore } from '@/stores/useOrderStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { type OrderItem, type DiscountRecord } from '@/stores/types'
import DiscountApplyPanel from '@/components/panels/DiscountApplyPanel.vue'
import RestrictionAlerts from '@/components/RestrictionAlerts.vue'
import {
  useMemberServiceOptions,
  useServiceRestrictionCheck,
} from '@/composables/useMemberServices'

const router = useRouter()
const msg = useMessage()
const orderStore = useOrderStore()
const serviceStore = useServiceStore()
const memberStore = useMemberStore()
const discountStore = useDiscountStore()
const discountPanel = ref<InstanceType<typeof DiscountApplyPanel> | null>(null)

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
// 仅列出该会员可添加的服务（专属服务按会员 / 会员类型过滤）
const { options: priceOptions } = useMemberServiceOptions(() => newMember.value)
const restrictionCheck = useServiceRestrictionCheck()
function rowPrice(priceId: string) {
  return serviceStore.services.find((p) => p.id === priceId)
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
function addRow() {
  newItems.value.push({ priceId: '', quantity: 1 })
}
function removeRow(i: number) {
  newItems.value.splice(i, 1)
}
// currentItems 过滤掉了未选服务的行，行下标需换算后才能用于校验；
// 本行未选服务时返回 -1（＝不是「替换」而是「追加」，交由调用方按追加试探）
function itemsIndex(i: number): number {
  if (!newItems.value[i]?.priceId) return -1
  let n = -1
  for (let k = 0; k <= i; k++) if (newItems.value[k]?.priceId) n++
  return n
}
function qtyMax(i: number): number | undefined {
  const idx = itemsIndex(i)
  return idx < 0 ? undefined : restrictionCheck.maxQtyOf(currentItems.value, idx)
}
function qtyHint(i: number): string {
  const idx = itemsIndex(i)
  return idx < 0 ? '' : restrictionCheck.limitTextOf(currentItems.value, idx)
}
// 行内服务选项：会立刻触发限购 / 互斥的服务置灰并附上原因，从选择阶段就拦下
function rowOptions(i: number) {
  const idx = itemsIndex(i)
  return restrictionCheck.annotateOptions(
    priceOptions.value,
    currentItems.value,
    idx < 0 ? undefined : idx,
  )
}
// 选中服务即时判定：已达限购 / 互斥则回退选择，不等到提交
function onServiceChange(i: number) {
  const row = newItems.value[i]
  if (!row?.priceId) return
  const idx = itemsIndex(i)
  if (idx < 0) return
  const problem = restrictionCheck.violationOf(currentItems.value, idx)
  if (!problem) return
  row.priceId = ''
  msg.error(problem)
}
// 填写数量即时判定：超限则回退到上限
function onQtyChange(i: number, v: number | null) {
  const row = newItems.value[i]
  const idx = itemsIndex(i)
  if (!row || idx < 0 || v == null) return
  const problem = restrictionCheck.violationOf(currentItems.value, idx)
  if (!problem) return
  row.quantity = Math.max(1, restrictionCheck.capOf(currentItems.value, idx) ?? v)
  msg.warning(problem)
}
// 存量/边界情况兜底：仍有违规时不允许创建
const restrictionProblems = computed(() => restrictionCheck.check(currentItems.value))
const canCreate = computed(
  () =>
    !!newMember.value &&
    newItems.value.some((r) => r.priceId) &&
    restrictionProblems.value.length === 0,
)

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
  // 服务定义（计费方式 / 单价 / 限制）始终重新拉取：避免使用会话早期或其他标签页写入前的旧配置
  await serviceStore.load()
  if (!orderStore.orders.length) await orderStore.load()
  // 优惠面板不会自行加载：直接进新建订单页时须在此补齐，否则可享优惠为空
  if (!discountStore.discounts.length) await discountStore.load()
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
  // 提交前拦截互斥 / 限购 / 分组限购违规
  const problems = restrictionCheck.check(items)
  if (problems.length) {
    msg.error(problems[0]!)
    return
  }
  // 下单时固化随机触发资格与数额（无计价器，此处一次性抽取）
  discountPanel.value?.finalizeRandom?.()
  const records = discountPanel.value?.getRecords?.() ?? discountRecords.value
  const dAmount = discountPanel.value?.getDiscountAmount?.() ?? discountAmount.value
  await orderStore.create(member.id, member.name, items, {
    discountRecords: records,
    discountAmount: dAmount,
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
    :autoFocus="false"
    @update:show="close"
    content-scrollable
    :segmented="{ content: true, footer: true }"
  >
    <NEmpty v-if="!memberOptions.length" description="请先在「会员」中录入会员" />
    <NForm v-else labelPlacement="top">
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
          <NFlex
            v-for="(row, i) in newItems"
            :key="i"
            align="center"
            :size="8"
            justify="space-between"
          >
            <NSelect
              v-model:value="row.priceId"
              :options="rowOptions(i)"
              placeholder="选择服务"
              filterable
              style="min-width: 240px"
              @update:value="() => onServiceChange(i)"
            />
            <NFlex align="center" :size="4">
              <NInputNumber
                v-if="row.priceId && rowPrice(row.priceId)?.pricingMode === 'perPiece'"
                v-model:value="row.quantity"
                :min="1"
                :max="qtyMax(i)"
                style="width: 100px"
                @update:value="(v: number | null) => onQtyChange(i, v)"
              />
              <NText v-else depth="3">待计费</NText>
              <NText v-if="qtyHint(i)" depth="3" style="font-size: 12px">{{ qtyHint(i) }}</NText>
            </NFlex>
            <NButton text type="error" @click="removeRow(i)">
              <NIcon>
                <IconTrash />
              </NIcon>
              删除
            </NButton>
          </NFlex>
          <NButton dashed block @click="addRow">
            <NIcon :size="16">
              <IconPlus />
            </NIcon>
            添加服务项
          </NButton>
          <RestrictionAlerts :problems="restrictionProblems" />
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
          ref="discountPanel"
          :member-id="newMember"
          :items="currentItems"
          @change="
            (r: DiscountRecord[], t: number) => {
              discountRecords = r
              discountAmount = t
            }
          "
        />
      </NCard>
    </NForm>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton type="primary" :disabled="!canCreate" @click="doCreate">
          <NIcon>
            <IconCheck />
          </NIcon>
          创建
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>
