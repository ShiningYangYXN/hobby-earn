<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NCard, NGrid, NGridItem, NStatistic, NH1, NH2, NFlex, NEmpty, NDataTable } from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { fmt } from '@/stores/types'
import { homeViewColumns, homeScrollX } from '@/components/columns/home-columns'

const orderStore = useOrderStore()
const memberStore = useMemberStore()
onMounted(async () => {
  await Promise.all([orderStore.load(), memberStore.load()])
})

const today = computed(() => fmt(orderStore.todayIncome))
const month = computed(() => fmt(orderStore.monthIncome))
const total = computed(() => fmt(orderStore.totalIncome))
const done = computed(() => orderStore.completedOrders.length)
const recent = computed(() => orderStore.orders.slice(0, 8))
</script>

<template>
  <NFlex vertical :size="16">
    <NH1>HobbyEarn</NH1>
    <NCard title="当前收益">
      <NGrid cols="s:1 m:2 l:4" responsive="screen" :xGap="12" :yGap="12">
        <NGridItem><NStatistic label="今日收入" :value="today" prefix="¥" /></NGridItem>
        <NGridItem><NStatistic label="本月收入" :value="month" prefix="¥" /></NGridItem>
        <NGridItem><NStatistic label="累计收入" :value="total" prefix="¥" /></NGridItem>
        <NGridItem><NStatistic label="已完成" :value="done" /></NGridItem>
      </NGrid>
    </NCard>
    <NH2 prefix="bar">最近订单</NH2>
    <NCard>
      <NDataTable
        v-if="recent.length"
        :columns="homeViewColumns"
        :data="recent"
        :pagination="false"
        :scroll-x="homeScrollX"
        size="small"
      />
      <NEmpty v-else description="暂无订单" />
    </NCard>
  </NFlex>
</template>
