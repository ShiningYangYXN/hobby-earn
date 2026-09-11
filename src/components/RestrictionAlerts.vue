<script setup lang="ts">
import { NFlex, NText } from 'naive-ui'

// 互斥 / 限购 / 分组限购的违规提示：下单、计价、订单编辑三处共用同一呈现
defineProps<{ problems: string[] }>()
</script>

<template>
  <NFlex v-if="problems.length" vertical :size="2">
    <NText v-for="(p, i) in problems" :key="i" type="error" class="restriction-alert">
      {{ p }}
    </NText>
  </NFlex>
</template>

<style scoped>
.restriction-alert {
  font-size: 12px;
}
</style>
