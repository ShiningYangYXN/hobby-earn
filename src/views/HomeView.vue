<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import {
  NCard,
  NGrid,
  NGridItem,
  NStatistic,
  NH1,
  NH2,
  NFlex,
  NEmpty,
  NDataTable,
  NNumberAnimation,
} from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'

import { homeViewColumns, homeScrollX } from '@/components/columns/home-columns'

const orderStore = useOrderStore()
const memberStore = useMemberStore()
onMounted(async () => {
  await Promise.all([orderStore.load(), memberStore.load()])
})

const todayYuan = computed(() => orderStore.todayIncome / 100)
const monthYuan = computed(() => orderStore.monthIncome / 100)
const totalYuan = computed(() => orderStore.totalIncome / 100)
const done = computed(() => orderStore.completedOrders.length)
const recent = computed(() => orderStore.orders.slice(0, 8))

let prevToday = todayYuan.value,
  prevMonth = monthYuan.value,
  prevTotal = totalYuan.value
let prevDone = done.value
const todayKey = ref(1)
const monthKey = ref(1)
const totalKey = ref(1)
const doneKey = ref(1)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const watchInterval = setInterval(() => {
  const t = todayYuan.value,
    m = monthYuan.value,
    tl = totalYuan.value
  const d = done.value
  if (t !== prevToday) {
    todayKey.value++
    prevToday = t
  }
  if (m !== prevMonth) {
    monthKey.value++
    prevMonth = m
  }
  if (tl !== prevTotal) {
    totalKey.value++
    prevTotal = tl
  }
  if (d !== prevDone) {
    doneKey.value++
    prevDone = d
  }
}, 1000)
</script>

<template>
  <NFlex vertical :size="16">
    <NH1>HobbyEarn</NH1>
    <NCard title="当前收益">
      <NGrid cols="s:1 m:2 l:4" responsive="screen" :xGap="12" :yGap="12">
        <NGridItem>
          <NStatistic label="今日收入">
            <template #prefix>¥</template>
            <NNumberAnimation
              :key="todayKey"
              :from="prevToday"
              :to="todayYuan"
              :precision="2"
              :show-separator="true"
            />
          </NStatistic>
        </NGridItem>
        <NGridItem>
          <NStatistic label="本月收入">
            <template #prefix>¥</template>
            <NNumberAnimation
              :key="monthKey"
              :from="prevMonth"
              :to="monthYuan"
              :precision="2"
              :show-separator="true"
            />
          </NStatistic>
        </NGridItem>
        <NGridItem>
          <NStatistic label="累计收入">
            <template #prefix>¥</template>
            <NNumberAnimation
              :key="totalKey"
              :from="prevTotal"
              :to="totalYuan"
              :precision="2"
              :show-separator="true"
            />
          </NStatistic>
        </NGridItem>
        <NGridItem>
          <NStatistic label="已完成">
            <NNumberAnimation
              :key="doneKey"
              :from="prevDone"
              :to="done"
              :precision="0"
              :show-separator="true"
            />
          </NStatistic>
        </NGridItem>
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
