<script setup lang="ts">
import { NFlex, NIcon, NResult, NTag, NCard, NSwitch, NText, NA, useMessage } from 'naive-ui'
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

// 连续点击产品图标 5 下解锁高级设置（相邻两次间隔不超过 0.5s）
const CLICK_TIMES = 5
const CLICK_INTERVAL = 500
let lastClickTime = 0
let clickCount = 0
function onLogoClick() {
  const now = Date.now()
  if (now - lastClickTime <= CLICK_INTERVAL) {
    clickCount += 1
  } else {
    clickCount = 1
  }
  lastClickTime = now
  if (clickCount >= CLICK_TIMES) {
    ui.unlockAdvanced()
    clickCount = 0
    msg.success('高级设置已解锁')
  } else {
    msg.info(`还需点击 ${CLICK_TIMES - clickCount} 次解锁高级设置`)
  }
}
</script>

<template>
  <NResult title="HobbyEarn" description="一起玩赚零花钱" size="huge">
    <template #icon>
      <NIcon size="256px" style="cursor: pointer" @click="onLogoClick">
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
        <NA href="https://github.com/ShiningYangYXN/hobby-earn">
          <NTag :bordered="false">
            <NIcon>
              <IconBrandGithub />
            </NIcon>
            ShiningYangYXN / <b>hobby-earn</b>
          </NTag>
        </NA>
      </NFlex>
    </template>
  </NResult>

  <NCard v-if="ui.advancedUnlocked" title="设置" class="about-settings">
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
  </NCard>
</template>

<style scoped>
.about-settings {
  max-width: 640px;
  margin: 24px auto 0;
}
</style>
