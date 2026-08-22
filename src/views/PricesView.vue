<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import {
  NButton,
  NCard,
  NFlex,
  NDataTable,
  NModal,
  NForm,
  NFormItem,
  NInput,
  NInputNumber,
  NSelect,
  NCheckbox,
  NIcon,
  NH2,
  NText,
  useMessage,
  useDialog,
} from 'naive-ui'
import { buildPriceColumns } from '@/components/columns/price-columns'
import { IconPlus } from '@tabler/icons-vue'
import { usePriceStore } from '@/stores/usePriceStore'
import { type PriceEntry, type PricingMode } from '@/stores/types'

const msg = useMessage()
const dialog = useDialog()
const priceStore = usePriceStore()

onMounted(() => priceStore.load())

const showModal = ref(false)
const editingId = ref<string | null>(null)
const form = ref({
  name: '',
  category: '',
  pricingMode: 'perPiece' as PricingMode,
  basePrice: 0,
  description: '',
  isActive: true,
})

function openCreate() {
  editingId.value = null
  form.value = {
    name: '',
    category: '',
    pricingMode: 'perPiece',
    basePrice: 0,
    description: '',
    isActive: true,
  }
  showModal.value = true
}
function openEdit(row: PriceEntry) {
  editingId.value = row.id
  form.value = {
    name: row.name,
    category: row.category,
    pricingMode: row.pricingMode,
    basePrice: row.basePrice / 100,
    description: row.description ?? '',
    isActive: row.isActive,
  }
  showModal.value = true
}
async function save() {
  if (!form.value.name.trim()) {
    msg.warning('请输入名称')
    return
  }
  try {
    const payload = { ...form.value, basePrice: Math.round((form.value.basePrice || 0) * 100) }
    if (editingId.value) {
      await priceStore.update(editingId.value, payload)
    } else {
      await priceStore.create(payload)
    }
    msg.success('已保存')
    showModal.value = false
  } catch (e: unknown) {
    msg.error(String(e))
  }
}

const columns = computed(() =>
  buildPriceColumns({
    openEdit,
    toggle: async (row: PriceEntry) => {
      await priceStore.update(row.id, { isActive: !row.isActive })
      msg.success('已更新')
    },
    remove: (row: PriceEntry) =>
      dialog.warning({
        title: '确认',
        content: '删除后不可恢复？',
        positiveText: '删除',
        negativeText: '取消',
        onPositiveClick: async () => {
          await priceStore.remove(row.id)
          msg.success('已删除')
        },
      }),
  }),
)
</script>

<template>
  <NFlex vertical :size="16">
    <NFlex justify="space-between" align="center">
      <NH2 prefix="bar">价格管理</NH2>
      <NFlex align="center">
        <NText depth="3">共 {{ priceStore.prices.length }} 条</NText>
        <NButton type="primary" @click="openCreate">
          <template #icon
            ><NIcon><IconPlus /></NIcon
          ></template>
          新增
        </NButton>
      </NFlex>
    </NFlex>

    <NCard>
      <NDataTable :columns="columns" :data="priceStore.prices" :pagination="{ pageSize: 15 }" size="small" />
    </NCard>

    <NModal
      v-model:show="showModal"
      :title="editingId ? '编辑服务' : '新增服务'"
      preset="card"
      class="modal-sm"
    >
      <NForm label-width="80">
        <NFormItem label="名称">
          <NInput v-model:value="form.name" />
        </NFormItem>
        <NFormItem label="分类">
          <NInput v-model:value="form.category" />
        </NFormItem>
        <NFormItem label="计价">
          <NSelect
            v-model:value="form.pricingMode"
            :options="[
              { label: '按件', value: 'perPiece' },
              { label: '工时', value: 'hourly' },
            ]"
          />
        </NFormItem>
        <NFormItem :label="form.pricingMode === 'hourly' ? '时薪（元/小时）' : '单价（元/件）'">
          <NInputNumber
            v-model:value="form.basePrice"
            :min="0"
            :precision="2"
            placeholder="单位：元"
            style="width: 100%"
          />
        </NFormItem>
        <NFormItem label="备注">
          <NInput v-model:value="form.description" type="textarea" :rows="2" />
        </NFormItem>
        <NFormItem label="启用">
          <NCheckbox v-model:checked="form.isActive" />
        </NFormItem>
      </NForm>
      <template #footer>
        <NFlex justify="end">
          <NButton @click="showModal = false">取消</NButton>
          <NButton type="primary" @click="save">保存</NButton>
        </NFlex>
      </template>
    </NModal>
  </NFlex>
</template>
