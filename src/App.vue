<script setup lang="ts">
import { ref, h } from 'vue'
import type { Component } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import { NLayout, NButton, NLayoutContent, NMenu, NConfigProvider, darkTheme, NLayoutSider, NPageHeader, NIcon, type MenuOption, NMessageProvider, NDialogProvider } from 'naive-ui'
import { IconMoodDollar, IconMoon, IconSun, IconStopwatch, IconReceipt, IconUsers, IconGift, IconPigMoney, IconInfoCircle, IconTags } from '@tabler/icons-vue'

const isDark = useDark()
const toggleDark = useToggle(isDark)
const collapsed = ref(true)

function renderIcon(icon: Component) {
  return () => h(NIcon, null, { default: () => h(icon) })
}

function renderRouterLink(description: string, path: string) {
  return () => h(RouterLink, { to: { path: path } }, { default: description })
}

const menuOptions: MenuOption[] = [
  {
    label: renderRouterLink('计价器', '/price-meter'),
    key: 'price-meter',
    icon: renderIcon(IconStopwatch)
  },
  {
    label: renderRouterLink('订单管理', '/orders'),
    key: 'orders',
    icon: renderIcon(IconReceipt)
  },
  {
    label: renderRouterLink('会员管理', '/members'),
    key: 'members',
    icon: renderIcon(IconUsers)
  },
  {
    label: renderRouterLink('价格管理', '/prices'),
    key: 'prices',
    icon: renderIcon(IconTags)
  },
  {
    label: renderRouterLink('优惠管理', '/discounts'),
    key: 'discounts',
    icon: renderIcon(IconGift)
  },
  {
    label: renderRouterLink('我的收益', '/revenue'),
    key: 'revenue',
    icon: renderIcon(IconPigMoney)
  },
  {
    label: renderRouterLink('关于', '/about'),
    key: 'about',
    icon: renderIcon(IconInfoCircle)
  }
]

</script>

<template>
  <NConfigProvider :theme="isDark ? darkTheme : null">
    <NMessageProvider>
      <NDialogProvider>
    <NLayout style="height: 100dvh;">
      <NLayoutHeader bordered>
        <NPageHeader style="height: 64px; font-size: 32px;">
          <template #avatar>
            <NButton @click="$router.push('/')" text>
              <NIcon size="64px">
                <IconMoodDollar style="height: 48px;" />
              </NIcon>
            </NButton>
          </template>
          <template #title>
            <span style="font-size: 24px;">HobbyEarn</span>
          </template>
          <template #subtitle>
            玩赚·商家端
          </template>
          <template #extra>
            <NButton @click="toggleDark()" text>
              <NIcon size="48px">
                <IconSun v-if="isDark" style="height: 24px;" />
                <IconMoon v-else style="height: 24px;" />
              </NIcon>
            </NButton>
          </template>
        </NPageHeader>
      </NLayoutHeader>
      <NLayout hasSider style="height: calc(100dvh - 64px);">
        <NLayoutSider bordered collapseMode="width" :collapsedWidth="64" :width="240" :collapsed="collapsed" showTrigger
          @collapse="collapsed = true" @expand="collapsed = false">
          <NMenu :collapsed="collapsed" :collapsedWidth="64" :collapsedIconSize="24" :options="menuOptions"
            :value="$route.name?.toString()" />
        </NLayoutSider>
        <NLayoutContent>
          <RouterView />
        </NLayoutContent>
      </NLayout>
    </NLayout>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped></style>
