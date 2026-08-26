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
  NScrollbar,
  NButton,
  useMessage,
  NFlex,
  NIcon,
  NText,
} from 'naive-ui'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { type PricingMode } from '@/stores/types'
import CategorySelect from '@/components/CategorySelect.vue'
import { IconDeviceFloppy, IconX } from '@tabler/icons-vue'

const props = defineProps<{ id?: string }>()
const router = useRouter()
const msg = useMessage()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()

const editing = computed(() => !!props.id)
const serviceIdDisplay = computed(() => {
  if (!props.id) return ''
  return serviceStore.services.find((x) => x.id === props.id)?.id ?? ''
})
const modeOptions: { label: string; value: PricingMode }[] = [
  { label: '按工时', value: 'hourly' },
  { label: '按件', value: 'perPiece' },
]

const form = ref({
  name: '',
  categoryIds: [] as string[],
  pricingMode: 'hourly' as PricingMode,
  basePriceYuan: 0,
  description: '',
  isActive: true,
})

watch(
  () => props.id,
  async (id) => {
    if (!categoryStore.categories.length) await categoryStore.load()
    if (id) {
      const p = serviceStore.services.find((x) => x.id === id)
      if (p)
        form.value = {
          name: p.name,
          categoryIds: [...(p.categoryIds ?? [])],
          pricingMode: p.pricingMode,
          basePriceYuan: p.basePrice / 100,
          description: p.description ?? '',
          isActive: p.isActive,
        }
      else
        form.value = {
          name: '',
          categoryIds: [],
          pricingMode: 'hourly',
          basePriceYuan: 0,
          description: '',
          isActive: true,
        }
    } else {
      form.value = {
        name: '',
        categoryIds: [],
        pricingMode: 'hourly',
        basePriceYuan: 0,
        description: '',
        isActive: true,
      }
    }
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
    }
    delete (payload as Record<string, unknown>).basePriceYuan
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
  >
    <NScrollbar class="modal-scroll">
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
          <CategorySelect v-model="form.categoryIds" />
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
        <NFormItem label="启用">
          <NSwitch v-model:value="form.isActive" />
        </NFormItem>
      </NForm>
    </NScrollbar>
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
