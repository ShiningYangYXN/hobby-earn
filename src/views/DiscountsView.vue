<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import { NDataTable, NButton, NFlex, NText, NCard, useDialog, useMessage } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { buildDiscountColumns } from '@/components/columns/discount-columns'
import { type Discount } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const discountStore = useDiscountStore()

function openCreate() {
  router.push({ name: 'discount-new' })
}
function openEdit(d: Discount) {
  router.push({ name: 'discount-edit', params: { id: d.id } })
}
function copyCode(code?: string) {
  if (!code) {
    msg.warning('该优惠没有券码')
    return
  }
  navigator.clipboard
    .writeText(code)
    .then(() => msg.success('券码已复制'))
    .catch(() => msg.error('复制失败'))
}
function toggle(d: Discount) {
  discountStore.update(d.id, { isActive: !d.isActive })
}

const columns = buildDiscountColumns({ copyCode, openEdit, toggle, remove })

function remove(d: Discount) {
  dialog.warning({
    title: '删除优惠',
    content: `确认删除「${d.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await discountStore.remove(d.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!discountStore.discounts.length) discountStore.load()
})
</script>

<template>
  <NCard title="优惠管理">
    <NFlex justify="end" style="margin-bottom: 12px">
      <NButton type="primary" @click="openCreate"> <IconPlus :size="16" /> 新建优惠 </NButton>
    </NFlex>
    <NDataTable
      :columns="columns"
      :data="discountStore.discounts"
      :pagination="{ pageSize: 10 }"
      size="small"
    />
    <NText v-if="!discountStore.discounts.length" depth="3">暂无优惠，点击右上角新建。</NText>
    <RouterView />
  </NCard>
</template>
