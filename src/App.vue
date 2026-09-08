<script setup lang="ts">
import { ref, h } from 'vue'
import type { Component } from 'vue'
import { RouterLink, RouterView } from 'vue-router'
import { useDark, useToggle } from '@vueuse/core'
import {
  zhCN,
  dateZhCN,
  NLayout,
  NButton,
  NLayoutContent,
  NMenu,
  NConfigProvider,
  darkTheme,
  NLayoutSider,
  NPageHeader,
  NScrollbar,
  NIcon,
  NText,
  type MenuOption,
  NMessageProvider,
  NDialogProvider,
} from 'naive-ui'
import {
  IconMoodDollar,
  IconMoon,
  IconSun,
  IconStopwatch,
  IconReceipt,
  IconVip,
  IconGift,
  IconPigMoney,
  IconInfoCircle,
  IconTool,
  IconHome,
} from '@tabler/icons-vue'

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
    label: renderRouterLink('首页', '/'),
    key: 'home',
    icon: renderIcon(IconHome),
  },
  {
    label: renderRouterLink('计价器', '/price-meter'),
    key: 'price-meter',
    icon: renderIcon(IconStopwatch),
  },
  {
    label: renderRouterLink('订单管理', '/orders'),
    key: 'orders',
    icon: renderIcon(IconReceipt),
  },
  {
    label: renderRouterLink('会员管理', '/members'),
    key: 'members',
    icon: renderIcon(IconVip),
  },
  {
    label: renderRouterLink('服务管理', '/services'),
    key: 'services',
    icon: renderIcon(IconTool),
  },
  {
    label: renderRouterLink('优惠管理', '/discounts'),
    key: 'discounts',
    icon: renderIcon(IconGift),
  },
  {
    label: renderRouterLink('我的收益', '/revenue'),
    key: 'revenue',
    icon: renderIcon(IconPigMoney),
  },
  {
    label: renderRouterLink('关于', '/about'),
    key: 'about',
    icon: renderIcon(IconInfoCircle),
  },
]
</script>

<template>
  <NConfigProvider
    :class="{ dark: isDark }"
    :theme="isDark ? darkTheme : null"
    :locale="zhCN"
    :date-locale="dateZhCN"
  >
    <NMessageProvider>
      <NDialogProvider>
        <NLayout style="height: 100dvh">
          <NLayoutHeader bordered class="app-header">
            <NPageHeader class="app-header__bar">
              <template #avatar>
                <NButton
                  quaternary
                  circle
                  class="app-header__btn"
                  title="回到首页"
                  aria-label="回到首页"
                  @click="$router.push('/')"
                >
                  <NIcon :size="28" :component="IconMoodDollar" />
                </NButton>
              </template>
              <template #title>
                <NText class="app-header__title">HobbyEarn</NText>
              </template>
              <template #subtitle>
                <NText depth="3" class="app-header__subtitle">玩赚·商家端</NText>
              </template>
              <template #extra>
                <NButton
                  quaternary
                  circle
                  class="app-header__btn"
                  :title="isDark ? '切换为浅色主题' : '切换为深色主题'"
                  :aria-label="isDark ? '切换为浅色主题' : '切换为深色主题'"
                  @click="toggleDark()"
                >
                  <NIcon :size="22" :component="isDark ? IconSun : IconMoon" />
                </NButton>
              </template>
            </NPageHeader>
          </NLayoutHeader>
          <NLayout hasSider style="height: calc(100dvh - 64px)">
            <NLayoutSider
              bordered
              collapseMode="width"
              :collapsedWidth="64"
              :width="240"
              :collapsed="collapsed"
              showTrigger
              @collapse="collapsed = true"
              @expand="collapsed = false"
            >
              <NMenu
                :collapsed="collapsed"
                :collapsedWidth="64"
                :collapsedIconSize="24"
                :options="menuOptions"
                :value="$route.name?.toString()"
              />
            </NLayoutSider>
            <NLayoutContent>
              <NScrollbar style="height: 100%" class="app-content">
                <RouterView />
              </NScrollbar>
            </NLayoutContent>
          </NLayout>
        </NLayout>
      </NDialogProvider>
    </NMessageProvider>
  </NConfigProvider>
</template>

<style scoped>
/* 头部：NLayoutHeader 自带 0 内边距，这里统一为 20px，与 .app-content 左右留白对齐；
   高度放在 header 上并用 flex 垂直居中，避免 NPageHeader 外层 wrapper 撑满、
   内层 flex 行居顶导致的图标偏上。 */
.app-header {
  display: flex;
  align-items: center;
  height: 64px;
  padding: 0 20px;
}
.app-header__bar {
  flex: 1;
  min-width: 0;
}
/* 固定 40x40 后，NIcon 在按钮内被 flex 双向居中，不再受 svg 基线对齐影响 */
.app-header__btn {
  width: 40px;
  height: 40px;
  padding: 0;
}
.app-header__title {
  font-size: 20px;
  font-weight: 600;
  white-space: nowrap;
}
@media (max-width: 480px) {
  .app-header {
    padding: 0 12px;
  }
  .app-header__subtitle {
    display: none;
  }
}
</style>
