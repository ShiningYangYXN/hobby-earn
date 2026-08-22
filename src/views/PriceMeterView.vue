<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import { NCard, NEmpty, NFlex, NText, NH2, NDataTable } from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { buildMeterColumns } from '@/components/columns/meter-columns'
import PricingModal from '@/components/modals/PricingModal.vue'
import type { Order } from '@/stores/types'

const route = useRoute()
const orderStore = useOrderStore()

const showPricing = ref(false)
const pricingOrderId = ref<string | null>(null)

async function openOrder(o: Order) {
  pricingOrderId.value = o.id
  showPricing.value = true
}

onMounted(async () => {
  await orderStore.load()
  const open = route.query.open
  if (typeof open === 'string') {
    pricingOrderId.value = open
    showPricing.value = true
  }
})
watch(
  () => route.query.open,
  (v) => {
    if (typeof v === 'string') {
      pricingOrderId.value = v
      showPricing.value = true
    }
  },
)

const priceable = computed(() =>
  orderStore.orders.filter((o) => ['pending', 'in_progress'].includes(o.status)),
)
const orderColumns = computed(() => buildMeterColumns({ openOrder }))
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">计价器</NH2>
    <NCard>
      <NFlex vertical :size="8">
        <NText depth="3">打开已有订单进行计价（仅显示待处理 / 执行中订单）</NText>
        <NDataTable
          v-if="priceable.length"
          :columns="orderColumns"
          :data="priceable"
          :pagination="{ pageSize: 10 }"
          size="small"
        />
        <NEmpty v-else description="暂无可计价的订单，请先在「订单管理」新建" />
      </NFlex>
    </NCard>

    <PricingModal v-model:show="showPricing" :order-id="pricingOrderId" />
  </NFlex>
</template>
