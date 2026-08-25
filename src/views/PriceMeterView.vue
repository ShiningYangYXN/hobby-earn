<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { NCard, NEmpty, NFlex, NText, NH2, NDataTable } from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { buildMeterColumns } from '@/components/columns/meter-columns'
import { tableScrollX } from '@/stores/types'
import PricingModal from '@/components/modals/PricingModal.vue'
import type { Order } from '@/stores/types'

const route = useRoute()
const router = useRouter()
const orderStore = useOrderStore()

const showPricing = ref(false)
const pricingOrderId = ref<string | null>(null)

function syncFromRoute() {
  const id = route.params.id
  pricingOrderId.value = typeof id === 'string' ? id : null
  showPricing.value = !!pricingOrderId.value
}

async function openOrder(o: Order) {
  router.push(`/price-meter/${o.id}`)
}

function closePricing() {
  router.push('/price-meter')
}

onMounted(async () => {
  await orderStore.load()
  syncFromRoute()
})
watch(
  () => route.params.id,
  () => syncFromRoute(),
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
          :scroll-x="tableScrollX(orderColumns)"
          size="small"
        />
        <NEmpty v-else description="暂无可计价的订单，请先在「订单管理」新建" />
      </NFlex>
    </NCard>

    <PricingModal
      :show="showPricing"
      :order-id="pricingOrderId"
      @update:show="
        (v: boolean) => {
          if (!v) closePricing()
        }
      "
    />
  </NFlex>
</template>
