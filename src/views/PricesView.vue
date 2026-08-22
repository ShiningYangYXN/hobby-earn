<script setup lang="ts">
import { onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { RouterView } from 'vue-router'
import { NDataTable, NButton, NFlex, NText, NCard, useDialog, useMessage } from 'naive-ui'
import { IconPlus } from '@tabler/icons-vue'
import { usePriceStore } from '@/stores/usePriceStore'
import { buildPriceColumns } from '@/components/columns/price-columns'
import { type PriceEntry } from '@/stores/types'

const router = useRouter()
const dialog = useDialog()
const msg = useMessage()
const priceStore = usePriceStore()

function openCreate() {
  router.push({ name: 'price-new' })
}
function openEdit(p: PriceEntry) {
  router.push({ name: 'price-edit', params: { id: p.id } })
}
async function toggle(p: PriceEntry) {
  await priceStore.update(p.id, { isActive: !p.isActive })
}
const columns = buildPriceColumns({ openEdit, toggle, remove })

function remove(p: PriceEntry) {
  dialog.warning({
    title: '删除价格项',
    content: `确认删除「${p.name}」？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await priceStore.remove(p.id)
      msg.success('已删除')
    },
  })
}

onMounted(() => {
  if (!priceStore.prices.length) priceStore.load()
})
</script>

<template>
  <NCard title="价格管理">
    <NFlex justify="end" style="margin-bottom: 12px">
      <NButton type="primary" @click="openCreate"> <IconPlus :size="16" /> 新建价格项 </NButton>
    </NFlex>
    <NDataTable
      :columns="columns"
      :data="priceStore.prices"
      :pagination="{ pageSize: 10 }"
      size="small"
    />
    <NText v-if="!priceStore.prices.length" depth="3">暂无价格项，点击右上角新建。</NText>
    <RouterView />
  </NCard>
</template>
