<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NSwitch,
  NButton,
  NDatePicker,
  useMessage,
  NFlex,
  NIcon,
  NText,
  NGi,
} from 'naive-ui'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { type PricingMode } from '@/stores/types'
import TypeSelect from '@/components/TypeSelect.vue'
import {
  useCategoryManage,
  useMemberTypeManage,
  useServiceExclusiveGroupManage,
  useServiceLimitGroupManage,
} from '@/composables/useTypeManage'
import { IconDeviceFloppy, IconX } from '@tabler/icons-vue'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()

const editing = computed(() => !!props.id)
const categoryManage = useCategoryManage()
const memberTypeManage = useMemberTypeManage()
const exclusiveManage = useServiceExclusiveGroupManage()
const limitGroupManage = useServiceLimitGroupManage()
const memberStore = useMemberStore()

// 专属服务：候选会员（停用的会员不参与）
const memberOptions = computed(() =>
  memberStore.members
    .filter((m) => m.isActive !== false)
    .map((m) => ({ label: m.name, value: m.id })),
)
const serviceIdDisplay = computed(() => {
  if (!props.id) return ''
  return serviceStore.services.find((x) => x.id === props.id)?.id ?? ''
})
const modeOptions: { label: string; value: PricingMode }[] = [
  { label: '按工时', value: 'hourly' },
  { label: '按件', value: 'perPiece' },
]

// 空表单工厂：新建、编辑未命中、重置三处共用，避免重复字面量
function emptyForm() {
  return {
    name: '',
    categoryIds: [] as string[],
    pricingMode: 'hourly' as PricingMode,
    basePriceYuan: 0,
    description: '',
    isActive: true,
    memberIds: [] as string[],
    memberTypeIds: [] as string[],
    // 专属开关（仅用于表单展示，不落库）：关闭＝不限制
    enabledMembers: false,
    enabledMemberTypes: false,
    // 时段 / 限购（开关与时间戳均为表单专用，落库时转换）
    enabledTime: false,
    validFrom: null as number | null,
    validUntil: null as number | null,
    cron: '',
    enabledPurchaseLimit: false,
    purchaseLimit: 1,
    limitGroupIds: [] as string[],
    exclusiveGroupIds: [] as string[],
  }
}
const form = ref(emptyForm())

watch(
  () => props.id,
  async (id) => {
    if (!categoryStore.categories.length) await categoryStore.load()
    if (!memberStore.members.length) await memberStore.load()
    const p = id ? serviceStore.services.find((x) => x.id === id) : undefined
    form.value = p
      ? {
          ...emptyForm(),
          name: p.name,
          categoryIds: [...(p.categoryIds ?? [])],
          pricingMode: p.pricingMode,
          basePriceYuan: p.basePrice / 100,
          description: p.description ?? '',
          isActive: p.isActive,
          memberIds: [...(p.memberIds ?? [])],
          memberTypeIds: [...(p.memberTypeIds ?? [])],
          enabledMembers: (p.memberIds?.length ?? 0) > 0,
          enabledMemberTypes: (p.memberTypeIds?.length ?? 0) > 0,
          enabledTime: !!p.timeWindow,
          validFrom: p.timeWindow?.validFrom ? Date.parse(p.timeWindow.validFrom) || null : null,
          validUntil: p.timeWindow?.validUntil ? Date.parse(p.timeWindow.validUntil) || null : null,
          cron: p.timeWindow?.cron ?? '',
          enabledPurchaseLimit: (p.purchaseLimit ?? 0) > 0,
          purchaseLimit: p.purchaseLimit ?? 1,
          limitGroupIds: [...(p.limitGroupIds ?? [])],
          exclusiveGroupIds: [...(p.exclusiveGroupIds ?? [])],
        }
      : emptyForm()
  },
  { immediate: true },
)

async function save() {
  if (!form.value.name) {
    msg.warning('请填写名称')
    return
  }
  try {
    const payload = {
      ...form.value,
      basePrice: Math.round((form.value.basePriceYuan || 0) * 100),
      // 开关关闭＝不限制，落库为空数组
      memberIds: form.value.enabledMembers ? form.value.memberIds : [],
      memberTypeIds: form.value.enabledMemberTypes ? form.value.memberTypeIds : [],
      // 时段：开关关闭＝不限；开启后按时间戳转 ISO，cron 留空即不限周期
      timeWindow: form.value.enabledTime
        ? {
            validFrom: form.value.validFrom
              ? new Date(form.value.validFrom).toISOString()
              : undefined,
            validUntil: form.value.validUntil
              ? new Date(form.value.validUntil).toISOString()
              : undefined,
            cron: form.value.cron.trim() || undefined,
          }
        : undefined,
      purchaseLimit: form.value.enabledPurchaseLimit ? form.value.purchaseLimit : undefined,
    }
    const plain = payload as Record<string, unknown>
    delete plain.basePriceYuan
    delete plain.enabledMembers
    delete plain.enabledMemberTypes
    delete plain.enabledTime
    delete plain.validFrom
    delete plain.validUntil
    delete plain.cron
    delete plain.enabledPurchaseLimit
    if (editing.value && props.id) {
      await serviceStore.update(props.id, payload)
      msg.success('服务已更新')
    } else {
      await serviceStore.create(payload)
      msg.success('服务已创建')
    }
    router.push('/services')
  } catch (e) {
    msg.error('保存失败：' + (e as Error).message)
  }
}

function close() {
  router.push('/services')
}
</script>

<template>
  <NModal
    :show="true"
    :title="editing ? '编辑服务' : '新建服务'"
    preset="card"
    :autoFocus="false"
    @update:show="close"
    content-scrollable
    :segmented="{ content: true, footer: true }"
  >
    <NForm labelPlacement="top">
      <NFormItem label="服务号">
        <NText class="mono" :depth="editing ? undefined : 3">{{
          editing ? serviceIdDisplay : '保存后自动生成'
        }}</NText>
      </NFormItem>
      <NFormItem label="名称" required>
        <NInput v-model:value="form.name" placeholder="如：修电脑" />
      </NFormItem>
      <NFormItem label="分类（可多选）">
        <TypeSelect v-model="form.categoryIds" :manage="categoryManage" />
      </NFormItem>
      <NFormItem label="计价方式">
        <NSelect v-model:value="form.pricingMode" :options="modeOptions" />
      </NFormItem>
      <NFormItem :label="form.pricingMode === 'hourly' ? '工时单价（元/小时）' : '单价（元/件）'">
        <NInputNumber
          v-model:value="form.basePriceYuan"
          :min="0"
          :precision="2"
          style="width: 100%"
        />
      </NFormItem>
      <NFormItem label="备注 / 描述">
        <NInput
          v-model:value="form.description"
          type="textarea"
          placeholder="备注（可选）"
          :autosize="{ minRows: 2, maxRows: 4 }"
        />
      </NFormItem>
      <NFormItem label="专属服务（可组合）">
        <NFlex vertical :size="10" style="width: 100%">
          <NText depth="3" style="font-size: 12px">
            关闭＝所有会员及散客均可添加；开启后仅命中的会员可添加，散客不可添加。
          </NText>
          <NFlex align="center" :size="10" style="width: 100%">
            <NText style="width: 84px">会员种类</NText>
            <NSwitch v-model:value="form.enabledMemberTypes" />
            <TypeSelect
              v-if="form.enabledMemberTypes"
              v-model="form.memberTypeIds"
              :manage="memberTypeManage"
              placeholder="选择会员种类（命中任一即可）"
              style="flex: 1"
            />
            <NText v-else depth="3" style="font-size: 12px">不限制</NText>
          </NFlex>
          <NFlex align="center" :size="10" style="width: 100%">
            <NText style="width: 84px">指定会员</NText>
            <NSwitch v-model:value="form.enabledMembers" />
            <NSelect
              v-if="form.enabledMembers"
              v-model:value="form.memberIds"
              :options="memberOptions"
              multiple
              filterable
              placeholder="选择会员"
              style="flex: 1"
            />
            <NText v-else depth="3" style="font-size: 12px">不限制</NText>
          </NFlex>
        </NFlex>
      </NFormItem>
      <NFormItem label="指定时段可用">
        <NFlex vertical :size="8" style="width: 100%">
          <NFlex align="center" :size="10">
            <NSwitch v-model:value="form.enabledTime" />
            <NText v-if="!form.enabledTime" depth="3" style="font-size: 12px">不限制</NText>
          </NFlex>
          <template v-if="form.enabledTime">
            <NFlex :size="8" align="center">
              <NDatePicker
                :value="form.validFrom"
                @update:value="(v: number | null) => (form.validFrom = v)"
                type="datetime"
                clearable
                placeholder="开始时间"
                style="flex: 1"
              />
              <NText>~</NText>
              <NDatePicker
                :value="form.validUntil"
                @update:value="(v: number | null) => (form.validUntil = v)"
                type="datetime"
                clearable
                placeholder="结束时间"
                style="flex: 1"
              />
            </NFlex>
            <NInput
              v-model:value="form.cron"
              placeholder="周期表达式（分 时 日 月 周），留空＝不限"
            />
          </template>
        </NFlex>
      </NFormItem>

      <NFormItem label="限购">
        <NFlex align="center" :size="10" style="width: 100%">
          <NSwitch v-model:value="form.enabledPurchaseLimit" />
          <NInputNumber
            v-if="form.enabledPurchaseLimit"
            v-model:value="form.purchaseLimit"
            :min="1"
            :precision="0"
            style="width: 140px"
          />
          <NText v-if="form.enabledPurchaseLimit" depth="3" style="font-size: 12px">
            {{ form.pricingMode === 'hourly' ? '小时 / 单' : '件 / 单' }}
          </NText>
          <NText v-else depth="3" style="font-size: 12px">不限制</NText>
        </NFlex>
      </NFormItem>

      <NFormItem label="分组限购">
        <TypeSelect v-model="form.limitGroupIds" :manage="limitGroupManage" placeholder="不加入">
          <template #form-extra="{ form: lf }">
            <NGi>
              <NText depth="3" class="small-label">组内合计限购数量</NText>
              <NInputNumber v-model:value="lf.limitValue" :min="1" :precision="0" />
            </NGi>
          </template>
        </TypeSelect>
      </NFormItem>

      <NFormItem label="互斥组">
        <TypeSelect
          v-model="form.exclusiveGroupIds"
          :manage="exclusiveManage"
          placeholder="不加入"
        />
      </NFormItem>

      <NFormItem label="启用">
        <NSwitch v-model:value="form.isActive" />
      </NFormItem>
    </NForm>
    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">
          <NIcon>
            <IconX />
          </NIcon>
          取消
        </NButton>
        <NButton type="primary" @click="save">
          <NIcon>
            <IconDeviceFloppy />
          </NIcon>
          保存
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>
