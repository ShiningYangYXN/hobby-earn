<script setup lang="ts">
import { NFlex, NIcon, NResult, NTag, NCard, NSwitch, NText, NButton, useMessage } from 'naive-ui'
import {
  IconMoodDollar,
  IconTag,
  IconCertificate,
  IconBrandGithub,
  IconAlertTriangle,
} from '@tabler/icons-vue'
import { version, license } from '@/../package.json'
import { useUiStore } from '@/stores/useUiStore'

const ui = useUiStore()
const msg = useMessage()

function onAdvancedChange(val: boolean) {
  msg.info(val ? '高级模式已开启' : '高级模式已关闭')
}
</script>

<template>
  <NResult title="HobbyEarn" description="一起玩赚零花钱" size="huge">
    <template #icon>
      <NIcon size="256px">
        <IconMoodDollar />
      </NIcon>
    </template>
    <template #footer>
      <NFlex justify="center">
        <NTag :bordered="false" type="info">
          <NIcon>
            <IconTag />
          </NIcon>
          {{ version }}
        </NTag>
        <NTag :bordered="false" type="success">
          <NIcon>
            <IconCertificate />
          </NIcon>
          {{ license }}
        </NTag>
        <a href="https://github.com/ShiningYangYXN/hobby-earn">
          <NTag :bordered="false">
            <NIcon>
              <IconBrandGithub />
            </NIcon>
            ShiningYangYXN / <b>hobby-earn</b>
          </NTag>
        </a>
      </NFlex>
    </template>
  </NResult>

  <NCard title="设置" class="about-settings">
    <NFlex align="center" justify="space-between">
      <NFlex align="center" :size="10">
        <NIcon size="22px">
          <IconAlertTriangle />
        </NIcon>
        <NText>高级模式</NText>
        <NText depth="3">开启后可删除已完成订单、修改受保护数据</NText>
      </NFlex>
      <NSwitch v-model:value="ui.advancedMode" @update:value="onAdvancedChange" />
    </NFlex>
    <NButton quaternary block @click="ui.advancedMode = false" style="margin-top: 12px">
      关闭高级模式
    </NButton>
  </NCard>
</template>

<style scoped>
.about-settings {
  max-width: 640px;
  margin: 24px auto 0;
}
</style>
