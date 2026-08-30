<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any --
   通用管理壳：透传 ItemManageModal 的动态表单回调，具体类型由各数据源决定 */
import { computed, onMounted, ref, watch } from 'vue'
import { NSelect, NButton, NFlex, NIcon } from 'naive-ui'
import { IconSettings } from '@tabler/icons-vue'
import ItemManageModal from '@/components/ItemManageModal.vue'
import type { TypeManageSource } from '@/composables/useTypeManage'

const props = withDefaults(
  defineProps<{
    modelValue: string[]
    manage: TypeManageSource
    placeholder?: string
    /** 单选模式（如互斥组至多归属一个），模型值仍为数组，取首个元素 */
    multiple?: boolean
  }>(),
  { multiple: true },
)
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

// 选择器常在开关打开后才挂载，此处补一次刷新保证拿到最新类型表
onMounted(() => {
  void props.manage.load()
})

const options = computed(() =>
  props.manage.items.map((i: any) => ({ label: i.name, value: i.id })),
)

const selectValue = computed(() =>
  props.multiple ? props.modelValue : (props.modelValue[0] ?? null),
)

function update(v: string[] | string | null) {
  const next = Array.isArray(v) ? v : v == null || v === '' ? [] : [v]
  emit('update:modelValue', props.multiple ? next : next.slice(0, 1))
}

// 类型被删掉后清掉失效的选中项，避免留下看不见的悬空 id。
// 类型表为空时（尚未加载或确实没有数据）不裁剪，防止误清空已有选择。
const validIds = computed(() => new Set(options.value.map((o) => o.value)))
watch(validIds, (ids) => {
  if (!ids.size) return
  const next = props.modelValue.filter((id) => ids.has(id))
  if (next.length !== props.modelValue.length) emit('update:modelValue', next)
})

const managing = ref(false)
function closeManage() {
  managing.value = false
  // 删除类型会级联改动引用方，关闭后重新同步一次
  void props.manage.load()
}
</script>

<template>
  <NFlex align="center" :size="8" style="width: 100%">
    <NSelect :value="selectValue" :options="options" :multiple="multiple" filterable clearable
      :max-tag-count="multiple ? 'responsive' : undefined" :placeholder="placeholder ?? '选择（可多选）'"
      style="flex: 1" @update:value="update" />
    <NButton size="small" quaternary type="primary" @click="managing = true">
      <NIcon :size="16">
        <IconSettings />
      </NIcon> 管理
    </NButton>

    <!-- 就地管理而非跳转路由：避免丢弃外层弹窗里未保存的表单 -->
    <ItemManageModal v-if="managing" :title="manage.title" :items="manage.items" :load="() => manage.load()"
      :empty-form="manage.emptyForm ?? (() => ({ name: '' }))" :to-form="manage.toForm"
      :row-text="manage.rowText" :validate="manage.validate"
      :create="(f) => manage.create(f)" :update="(id, f) => manage.update(id, f)"
      :remove="(id) => manage.remove(id)" :close="closeManage" :confirm-text="manage.confirmText">
      <template #form-extra="slotProps">
        <slot name="form-extra" v-bind="slotProps" />
      </template>
    </ItemManageModal>
  </NFlex>
</template>
