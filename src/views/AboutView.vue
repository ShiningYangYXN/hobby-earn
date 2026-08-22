<script setup lang="ts">
import {
  NFlex,
  NIcon,
  NResult,
  NTag,
  NCard,
  NSwitch,
  NText,
  NButton,
  NA,
  useDialog,
  useMessage,
} from 'naive-ui'
import {
  IconMoodDollar,
  IconTag,
  IconCertificate,
  IconBrandGithub,
  IconShieldBolt,
  IconTrash,
} from '@tabler/icons-vue'
import { version, license } from '@/../package.json'
import { useUiStore } from '@/stores/useUiStore'
import { clear } from '@/stores/db'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'

const ui = useUiStore()
const msg = useMessage()
const dialog = useDialog()
const orderStore = useOrderStore()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()
const priceStore = usePriceStore()
const discountStore = useDiscountStore()

function onAdvancedChange(val: boolean) {
  msg.info(val ? '高级模式已开启' : '高级模式已关闭')
}

// 连续点击产品图标 5 下解锁高级设置（相邻两次间隔不超过 0.5s）
const CLICK_TIMES = 5
const CLICK_INTERVAL = 500
let lastClickTime = 0
let clickCount = 0
function onLogoClick() {
  // 已解锁（刷新前）：重复点击提示已解锁
  if (ui.advancedUnlocked) {
    msg.info('你已解锁高级设置')
    return
  }
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

// 调试 / 作弊权限：清空全部数据（仅高级模式）
function clearAllData() {
  dialog.warning({
    title: '调试：清空全部数据',
    content: '将删除所有订单、会员、会员种类、价格与优惠，且不可恢复。确认清空？',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      await clear()
      orderStore.orders.splice(0)
      memberStore.members.splice(0)
      memberTypeStore.types.splice(0)
      priceStore.prices.splice(0)
      discountStore.discounts.splice(0)
      msg.success('调试：全部数据已清空')
    },
  })
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

  <NCard v-if="ui.advancedUnlocked" title="高级设置" class="about-settings">
    <NFlex vertical :size="14">
      <NFlex align="center" justify="space-between">
        <NFlex align="center" :size="10">
          <NIcon size="22px">
            <IconShieldBolt />
          </NIcon>
          <NText>调试 · 作弊权限</NText>
          <NText depth="3">仅限调试使用，会绕过正常业务校验，请谨慎操作</NText>
        </NFlex>
        <NSwitch v-model:value="ui.advancedMode" @update:value="onAdvancedChange" />
      </NFlex>
      <NButton type="error" @click="clearAllData">
        <NIcon>
          <IconTrash />
        </NIcon>
        清空全部数据
      </NButton>
    </NFlex>
  </NCard>
</template>

<style scoped>
.about-settings {
  max-width: 640px;
  margin: 24px auto 0;
}
</style>
