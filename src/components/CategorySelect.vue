<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NSelect, NButton, NFlex, NIcon } from 'naive-ui'
import { useRouter } from 'vue-router'
import { IconSettings } from '@tabler/icons-vue'
import { useCategoryStore } from '@/stores/useCategoryStore'

const props = defineProps<{
  modelValue: string[]
  placeholder?: string
}>()
const emit = defineEmits<{
  'update:modelValue': [value: string[]]
}>()

const router = useRouter()
const categoryStore = useCategoryStore()

onMounted(() => {
  if (!categoryStore.categories.length) categoryStore.load()
})

const options = computed(() =>
  categoryStore.categories.map((c) => ({ label: c.name, value: c.id })),
)

function update(v: string[] | null) {
  emit('update:modelValue', v ?? [])
}
</script>

<template>
  <NFlex align="center" :size="8">
    <NSelect
      :value="modelValue"
      :options="options"
      multiple
      filterable
      clearable
      :placeholder="placeholder ?? '选择分类（可多选）'"
      style="flex: 1"
      @update:value="update"
    />
    <NButton size="small" quaternary type="primary" @click="router.push({ name: 'categories' })">
      <NIcon :size="16"><IconSettings /></NIcon> 管理
    </NButton>
  </NFlex>
</template>
