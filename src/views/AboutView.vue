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
  NUl,
  NLi,
  useDialog,
  useMessage,
} from 'naive-ui'
import { ref } from 'vue'
import {
  IconMoodDollar,
  IconTag,
  IconCertificate,
  IconBrandGithub,
  IconTrash,
  IconSkull,
  IconDownload,
  IconUpload,
} from '@tabler/icons-vue'
import { version, license } from '@/../package.json'
import { useUiStore } from '@/stores/useUiStore'
import { clear, exportAll, importAll } from '@/stores/db'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'

const ui = useUiStore()
const msg = useMessage()
const dialog = useDialog()
const orderStore = useOrderStore()
const memberStore = useMemberStore()
const memberTypeStore = useMemberTypeStore()
const serviceStore = useServiceStore()
const discountStore = useDiscountStore()
const categoryStore = useCategoryStore()
const exclusiveGroupStore = useExclusiveGroupStore()
const limitGroupStore = useLimitGroupStore()

function onLabChange(val: boolean) {
  msg.info(val ? '作弊模式已开启' : '作弊模式已关闭')
}

// 连续点击产品图标 5 下解锁高级设置（相邻两次间隔不超过 0.5s）
const CLICK_TIMES = 5
const CLICK_INTERVAL = 500
let lastClickTime = 0
let clickCount = 0
function onLogoClick() {
  // 已解锁（刷新前）：重复点击提示已解锁
  if (ui.labUnlocked) {
    msg.warning('实验室早就解锁了，你还点个锤子！')
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
    ui.unlockLab()
    clickCount = 0
    msg.success('实验室已解锁，操作不当后果自负！')
  } else {
    msg.info(`还需点击 ${CLICK_TIMES - clickCount} 次解锁实验室，我劝你别点了！`)
  }
}

// 调试 / 作弊权限：清空全部数据（仅高级模式）
function clearAllData() {
  dialog.warning({
    title: '实验室：清空全部数据',
    content: '将删除所有订单、会员、会员种类、服务与优惠，且不可恢复。确认清空？',
    positiveText: '清空',
    negativeText: '取消',
    onPositiveClick: async () => {
      await clear()
      orderStore.orders.splice(0)
      memberStore.members.splice(0)
      memberTypeStore.types.splice(0)
      serviceStore.services.splice(0)
      discountStore.discounts.splice(0)
      msg.success('实验室：全部数据已清空')
    },
  })
}

// 数据导入导出（默认显示，无需解锁）
const fileInput = ref<HTMLInputElement | null>(null)

function exportData() {
  exportAll()
    .then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `hobby-earn-backup-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      msg.success('数据已导出')
    })
    .catch(() => msg.error('导出失败'))
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as Parameters<typeof importAll>[0]
      dialog.warning({
        title: '导入数据',
        content: '导入将覆盖当前所有数据且不可恢复，确认导入？',
        positiveText: '导入',
        negativeText: '取消',
        onPositiveClick: async () => {
          try {
            await importAll(data)
            await Promise.all([
              orderStore.load(),
              memberStore.load(),
              memberTypeStore.load(),
              serviceStore.load(),
              discountStore.load(),
              categoryStore.load(),
              exclusiveGroupStore.load(),
              limitGroupStore.load(),
            ])
            msg.success('数据已导入')
          } catch {
            msg.error('导入失败，文件可能已损坏')
          }
        },
      })
    } catch {
      msg.error('文件解析失败，请检查格式')
    }
    input.value = ''
  }
  reader.readAsText(file)
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

  <NCard title="数据导入导出" class="debug-menu">
    <NFlex vertical :size="12">
      <NText depth="3">导出当前全部数据为备份文件；导入将覆盖现有数据，请谨慎操作。</NText>
      <NFlex :size="12">
        <NButton @click="exportData">
          <NIcon><IconDownload /></NIcon>
          导出数据
        </NButton>
        <NButton @click="fileInput?.click()">
          <NIcon><IconUpload /></NIcon>
          导入数据
        </NButton>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          style="display: none"
          @change="onImportFile"
        />
      </NFlex>
    </NFlex>
  </NCard>

  <NCard v-if="ui.labUnlocked" title="实验室" class="debug-menu">
    <NFlex vertical :size="14">
      <NFlex align="center" justify="space-between">
        <NFlex align="center" :size="10">
          <NIcon size="22px">
            <IconSkull />
          </NIcon>
          <NText>作弊模式</NText>
          <NText depth="3">仅限调试使用，会绕过正常业务校验，请谨慎操作</NText>
        </NFlex>
        <NSwitch v-model:value="ui.labMode" @update:value="onLabChange" />
      </NFlex>
      <NText strong>作弊模式权限</NText>
      <NUl class="perm-list">
        <NLi>删除已完成订单、强制重开已关闭订单、直接改写订单应收金额</NLi>
        <NLi>删除已被订单引用的服务 / 优惠（递归删除，连同关联订单一并清除）</NLi>
        <NLi>改写订单只读字段：状态、归属会员、小计、创建时间与完成时间</NLi>
        <NLi>改写优惠已用次数、会员入会时间</NLi>
        <NLi>删除存在关联订单或优惠的会员（递归清理）</NLi>
      </NUl>
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
.debug-menu {
  max-width: 640px;
  margin: 24px auto 0;
}
.perm-list {
  margin: 0;
  padding-left: 20px;
  font-size: 13px;
}
</style>
