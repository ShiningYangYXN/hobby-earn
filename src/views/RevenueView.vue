<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NCard, NStatistic, NFlex, NGrid, NGridItem, NH2 } from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { fmt } from '@/stores/types'

const orderStore = useOrderStore()
onMounted(() => orderStore.load())

const today = computed(() => fmt(orderStore.todayIncome))
const month = computed(() => fmt(orderStore.monthIncome))
const total = computed(() => fmt(orderStore.totalIncome))
const done = computed(() => orderStore.completedOrders.length)
const pending = computed(() => orderStore.pendingOrders.length)
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">收益概览</NH2>
    <NGrid cols="s:1 m:2 l:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem><NCard><NStatistic label="今日收入" :value="today" prefix="¥" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="本月收入" :value="month" prefix="¥" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="累计收入" :value="total" prefix="¥" /></NCard></NGridItem>
    </NGrid>
    <NGrid cols="s:1 m:2" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem><NCard><NStatistic label="已完成订单" :value="done" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="待处理订单" :value="pending" /></NCard></NGridItem>
    </NGrid>
  </NFlex>
</template>
