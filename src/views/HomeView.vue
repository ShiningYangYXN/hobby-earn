<script setup lang="ts">
import { computed, onMounted } from 'vue'
import { NCard, NStatistic, NFlex, NGrid, NGridItem, NDataTable, NH2 } from 'naive-ui'
import { homeViewColumns } from '@/components/columns/home-columns'
import { useMemberStore } from '@/stores/useMemberStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { fmt } from '@/stores/types'

const memberStore = useMemberStore()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const priceStore = usePriceStore()

onMounted(async () => {
  await Promise.all([
    memberStore.load(),
    orderStore.load(),
    discountStore.load(),
    priceStore.load(),
  ])
})

const today = computed(() => fmt(orderStore.todayIncome))
const month = computed(() => fmt(orderStore.monthIncome))
const total = computed(() => fmt(orderStore.totalIncome))
const done = computed(() => orderStore.completedOrders.length)
const members = computed(() => memberStore.members.length)
const activeD = computed(() => discountStore.activeDiscounts.length)
const prices = computed(() => priceStore.activePrices.length)
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">概览</NH2>
    <NGrid cols="s:1 m:2 l:4" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem
        ><NCard><NStatistic label="今日收入" :value="today" prefix="¥" /></NCard
      ></NGridItem>
      <NGridItem
        ><NCard><NStatistic label="本月收入" :value="month" prefix="¥" /></NCard
      ></NGridItem>
      <NGridItem
        ><NCard><NStatistic label="累计收入" :value="total" prefix="¥" /></NCard
      ></NGridItem>
      <NGridItem
        ><NCard><NStatistic label="已完成订单" :value="done" /></NCard
      ></NGridItem>
    </NGrid>
    <NGrid cols="s:1 m:2 l:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem
        ><NCard><NStatistic label="会员总数" :value="members" /></NCard
      ></NGridItem>
      <NGridItem
        ><NCard><NStatistic label="有效优惠" :value="activeD" /></NCard
      ></NGridItem>
      <NGridItem
        ><NCard><NStatistic label="价格条目" :value="prices" /></NCard
      ></NGridItem>
    </NGrid>
    <NCard title="最近订单">
      <template v-if="!orderStore.orders.length" #default>
        <NFlex vertical align="center" style="padding: 16px"
          ><NTag type="info">暂无订单</NTag></NFlex
        >
      </template>
      <template v-else #default>
        <NDataTable
          :columns="homeViewColumns"
          :data="orderStore.orders.slice(0, 8)"
          :pagination="false"
          size="small"
        />
      </template>
    </NCard>
  </NFlex>
</template>
