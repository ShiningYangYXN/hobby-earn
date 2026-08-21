<script setup lang="ts">
import { h, computed, onMounted } from 'vue'
import { NCard, NStatistic, NSpace, NGrid, NGridItem, NTag, NDataTable } from 'naive-ui'
import { useMemberStore } from '@/stores/useMemberStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { fmt, type Order } from '@/stores/types'

const memberStore = useMemberStore()
const orderStore = useOrderStore()
const discountStore = useDiscountStore()
const priceStore = usePriceStore()

onMounted(async () => {
  await Promise.all([memberStore.load(), orderStore.load(), discountStore.load(), priceStore.load()])
})

const today   = computed(() => fmt(orderStore.todayIncome))
const month   = computed(() => fmt(orderStore.monthIncome))
const total   = computed(() => fmt(orderStore.totalIncome))
const done    = computed(() => orderStore.completedOrders.length)
const members = computed(() => memberStore.members.length)
const activeD = computed(() => discountStore.activeDiscounts.length)
const prices  = computed(() => priceStore.activePrices.length)

const statusLabel: Record<string, string> = { pending: '待处理', confirmed: '进行中', completed: '已完成', cancelled: '已取消' }
const statusType: Record<string, 'warning' | 'info' | 'success' | 'default'> = { pending: 'warning', confirmed: 'info', completed: 'success', cancelled: 'default' }
</script>

<template>
  <NSpace vertical :size="16" style="padding: 16px;">
    <h2 style="margin:0">概览</h2>
    <NGrid cols="s:1 m:2 l:4" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem><NCard><NStatistic label="今日收入" :value="today" prefix="¥" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="本月收入" :value="month" prefix="¥" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="累计收入" :value="total" prefix="¥" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="已完成订单" :value="done" /></NCard></NGridItem>
    </NGrid>
    <NGrid cols="s:1 m:2 l:3" responsive="screen" :x-gap="12" :y-gap="12">
      <NGridItem><NCard><NStatistic label="会员总数" :value="members" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="有效优惠" :value="activeD" /></NCard></NGridItem>
      <NGridItem><NCard><NStatistic label="价格条目" :value="prices" /></NCard></NGridItem>
    </NGrid>
    <NCard title="最近订单">
      <template v-if="!orderStore.orders.length" #default>
        <NSpace vertical align="center" style="padding:16px"><NTag type="info">暂无订单</NTag></NSpace>
      </template>
      <template v-else #default>
        <NDataTable
          :columns="[
            { title: '会员', key: 'memberName' },
            { title: '实收', key: 'finalAmount', width: 90, render: (row: Order) => h('span', { style: { color: 'var(--n-success-color)' } }, '¥' + fmt(row.finalAmount)) },
            { title: '状态', key: 'status', width: 80, render: (row: Order) => h(NTag, { type: statusType[row.status], size: 'tiny' }, () => statusLabel[row.status]) },
            { title: '时间', key: 'createdAt', width: 140, render: (row: Order) => new Date(row.createdAt).toLocaleString() },
          ]"
          :data="orderStore.orders.slice(0, 8)"
          :pagination="false" size="small"
        />
      </template>
    </NCard>
  </NSpace>
</template>
