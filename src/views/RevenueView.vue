<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { NCard, NStatistic, NFlex, NGrid, NGridItem, NH2, NNumberAnimation } from 'naive-ui'
import { useOrderStore } from '@/stores/useOrderStore'

const orderStore = useOrderStore()
onMounted(() => orderStore.load())

const todayYuan = computed(() => orderStore.todayIncome / 100)
const monthYuan = computed(() => orderStore.monthIncome / 100)
const totalYuan = computed(() => orderStore.totalIncome / 100)
const done = computed(() => orderStore.completedOrders.length)
const pending = computed(() => orderStore.pendingOrders.length)

let prevToday = todayYuan.value, prevMonth = monthYuan.value, prevTotal = totalYuan.value
let prevDone = done.value, prevPending = pending.value
const todayKey = ref(1)
const monthKey = ref(1)
const totalKey = ref(1)
const doneKey = ref(1)
const pendingKey = ref(1)
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const watchInterval = setInterval(() => {
  const t = todayYuan.value, m = monthYuan.value, tl = totalYuan.value
  const d = done.value, p = pending.value
  if (t !== prevToday)  { todayKey.value++;  prevToday = t }
  if (m !== prevMonth)  { monthKey.value++;  prevMonth = m }
  if (tl !== prevTotal) { totalKey.value++;  prevTotal = tl }
  if (d !== prevDone)   { doneKey.value++;   prevDone = d }
  if (p !== prevPending){ pendingKey.value++; prevPending = p }
}, 1000)
</script>

<template>
  <NFlex vertical :size="16">
    <NH2 prefix="bar">收益概览</NH2>
    <NGrid cols="s:1 m:2 l:3" responsive="screen" :xGap="12" :yGap="12">
      <NGridItem>
        <NCard>
          <NStatistic label="今日收入">
            <template #prefix>¥</template>
            <NNumberAnimation :key="todayKey" :from="prevToday" :to="todayYuan" :precision="2" :show-separator="true" />
          </NStatistic>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard>
          <NStatistic label="本月收入">
            <template #prefix>¥</template>
            <NNumberAnimation :key="monthKey" :from="prevMonth" :to="monthYuan" :precision="2" :show-separator="true" />
          </NStatistic>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard>
          <NStatistic label="累计收入">
            <template #prefix>¥</template>
            <NNumberAnimation :key="totalKey" :from="prevTotal" :to="totalYuan" :precision="2" :show-separator="true" />
          </NStatistic>
        </NCard>
      </NGridItem>
    </NGrid>
    <NGrid cols="s:1 m:2" responsive="screen" :xGap="12" :yGap="12">
      <NGridItem>
        <NCard>
          <NStatistic label="已完成订单">
            <NNumberAnimation :key="doneKey" :from="prevDone" :to="done" :precision="0" :show-separator="true" />
          </NStatistic>
        </NCard>
      </NGridItem>
      <NGridItem>
        <NCard>
          <NStatistic label="待处理订单">
            <NNumberAnimation :key="pendingKey" :from="prevPending" :to="pending" :precision="0" :show-separator="true" />
          </NStatistic>
        </NCard>
      </NGridItem>
    </NGrid>
  </NFlex>
</template>
