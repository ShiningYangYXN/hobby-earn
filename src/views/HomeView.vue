<script setup lang="ts">
import { NIcon, NResult } from 'naive-ui';
import { IconMoodDollar } from '@tabler/icons-vue'
</script>

<template>
  <NResult title="欢迎回来" description="从左侧菜单选择一项开始玩赚" size="huge">
    <template #icon>
      <NIcon size="256px">
        <IconMoodDollar />
      </NIcon>
    </template>
  </NResult>
</template>
