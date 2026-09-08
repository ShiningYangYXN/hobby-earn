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
  NModal,
  NRadioGroup,
  NRadio,
  useDialog,
  useMessage,
} from 'naive-ui'
import { ref } from 'vue'
import {
  IconMoodDollar,
  IconTag,
  IconCertificate,
  IconBrandGithub,
  IconDatabase,
  IconFlask,
  IconTrash,
  IconSkull,
  IconDownload,
  IconUpload,
  IconGitPullRequest,
  IconGitCompare,
  IconGitPullRequestClosed,
  IconGitBranchDeleted,
  IconGitBranch,
} from '@tabler/icons-vue'
import { version, license } from '@/../package.json'
import { useUiStore } from '@/stores/useUiStore'
import {
  clear,
  exportAll,
  importAll,
  detectMergeConflicts,
  mergeAll,
  mergeManual,
  validateBackup,
  type BackupData,
  type MergeConflict,
  type MergeDecision,
} from '@/stores/db'
import { useOrderStore } from '@/stores/useOrderStore'
import { useMemberStore } from '@/stores/useMemberStore'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import MergeConflictSolver from '@/components/modals/MergeConflictSolver.vue'

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

/** 合并/导入后统一刷新所有 store 的内存数据 */
async function refreshAllStores() {
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
}

function pad(n: number) {
  return String(n).padStart(2, '0')
}

function exportData() {
  exportAll()
    .then((data) => {
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      const stamp = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(
        d.getHours(),
      )}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`
      a.href = url
      a.download = `hobby-earn-backup-${stamp}.json`
      a.click()
      URL.revokeObjectURL(url)
      msg.success('数据已导出')
    })
    .catch(() => msg.error('导出失败'))
}

/** 校验失败：弹窗列出错误（前若干条 + 总数） */
function rejectByValidation(errors: string[]) {
  const head = `数据校验未通过，发现 ${errors.length} 处问题：`
  const list = errors
    .slice(0, 8)
    .map((e) => `· ${e}`)
    .join('\n')
  const more = errors.length > 8 ? `\n…等共 ${errors.length} 处` : ''
  dialog.error({
    title: '文件校验失败',
    content: `${head}\n${list}${more}`,
    positiveText: '知道了',
  })
}

function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as BackupData
      const v = validateBackup(data)
      if (!v.valid) {
        rejectByValidation(v.errors)
        return
      }
      dialog.warning({
        title: '导入数据',
        content: '导入将覆盖当前所有数据且不可恢复，确认导入？',
        positiveText: '导入',
        negativeText: '取消',
        onPositiveClick: async () => {
          try {
            await importAll(data)
            await refreshAllStores()
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

// 合并数据：自动模式仅在完全无冲突时合并，否则弹窗让用户选择处理策略
const mergeInput = ref<HTMLInputElement | null>(null)
const mergeConflictVisible = ref(false)
const mergeBase = ref<'builtin' | 'imported'>('builtin')
const mergeConflictCount = ref(0)
const conflicts = ref<MergeConflict[]>([])
let pendingMergeData: BackupData | null = null

// 手动合并 solver（独立组件，仅负责逐条决策与 JSON 校验）
const manualSolveVisible = ref(false)

async function onMergeFile(e: Event) {
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const data = JSON.parse(String(reader.result)) as BackupData
      const v = validateBackup(data)
      if (!v.valid) {
        rejectByValidation(v.errors)
        return
      }
      detectMergeConflicts(data)
        .then((cs) => {
          if (cs.length === 0) {
            // 完全无冲突：自动合并（基底无关，半保留即可）
            doMerge(data, { overwrite: false, base: 'imported' })
              .then(() => msg.success('数据已合并（无冲突）'))
              .catch(() => msg.error('合并失败'))
          } else {
            // 存在冲突：拒绝自动合并，弹窗让用户决策
            pendingMergeData = data
            conflicts.value = cs
            mergeConflictCount.value = cs.length
            mergeBase.value = 'builtin'
            mergeConflictVisible.value = true
          }
        })
        .catch(() => msg.error('文件格式不支持'))
    } catch {
      msg.error('文件解析失败，请检查格式')
    }
    input.value = ''
  }
  reader.readAsText(file)
}

async function doMerge(
  data: BackupData,
  opts: { overwrite: boolean; base: 'builtin' | 'imported' },
) {
  await mergeAll(data, opts)
  await refreshAllStores()
}

function mergeForceOverwrite() {
  if (!pendingMergeData) return
  mergeConflictVisible.value = false
  doMerge(pendingMergeData, { overwrite: true, base: 'builtin' })
    .then(() => {
      pendingMergeData = null
      msg.success('已完成覆盖式合并（导入完全覆盖当前数据）')
    })
    .catch(() => msg.error('合并失败'))
}

function mergePartial() {
  if (!pendingMergeData) return
  const base = mergeBase.value
  mergeConflictVisible.value = false
  doMerge(pendingMergeData, { overwrite: false, base })
    .then(() => {
      pendingMergeData = null
      msg.success(
        base === 'builtin'
          ? '已半保留合并（无冲突部分已并入，冲突部分保留当前数据）'
          : '已半保留合并（无冲突部分已并入，冲突部分采用导入数据）',
      )
    })
    .catch(() => msg.error('合并失败'))
}

/** 打开手动合并 solver（决策与 JSON 校验由组件内部完成） */
function openManualSolve() {
  if (!pendingMergeData) return
  mergeConflictVisible.value = false
  manualSolveVisible.value = true
}

/** 手动合并：组件校验通过后回调决策表，此处只负责落库与刷新 */
async function onManualConfirm(decisions: Record<string, MergeDecision>) {
  if (!pendingMergeData) return
  manualSolveVisible.value = false
  try {
    await mergeManual(pendingMergeData, decisions)
    await refreshAllStores()
    pendingMergeData = null
    conflicts.value = []
    msg.success('已按手动选择完成合并')
  } catch {
    msg.error('合并失败')
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

  <NCard class="additional-menu">
    <template #header>
      <NIcon>
        <IconDatabase />
      </NIcon>
      数据管理
    </template>
    <NFlex vertical :size="12">
      <NText depth="3">导出当前全部数据为备份文件，通过导入覆盖现有数据，或进行数据合并</NText>
      <NFlex :size="12" justify="end">
        <NButton type="success" @click="exportData">
          <NIcon>
            <IconDownload />
          </NIcon>
          导出数据
        </NButton>
        <NButton type="warning" @click="fileInput?.click()">
          <NIcon>
            <IconUpload />
          </NIcon>
          导入数据
        </NButton>
        <NButton type="info" @click="mergeInput?.click()">
          <NIcon>
            <IconGitPullRequest />
          </NIcon>
          合并数据
        </NButton>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          style="display: none"
          @change="onImportFile"
        />
        <input
          ref="mergeInput"
          type="file"
          accept="application/json,.json"
          style="display: none"
          @change="onMergeFile"
        />
      </NFlex>
    </NFlex>
  </NCard>

  <NModal
    v-model:show="mergeConflictVisible"
    preset="dialog"
    title="检测到数据冲突"
    style="width: 720px"
  >
    <template #default>
      <NText>
        导入数据与当前数据存在
        <NText type="warning" strong>{{ mergeConflictCount }}</NText>
        处冲突（同一对象在两侧均被修改），无法自动合并。请选择处理方式：
      </NText>
      <NRadioGroup v-model:value="mergeBase" style="margin-top: 14px">
        <NFlex vertical>
          <NRadio value="builtin"
            >以当前数据作为合并基底（冲突部分保留当前数据，仅并入无冲突部分）</NRadio
          >
          <NRadio value="imported"
            >以导入数据作为合并基底（冲突部分采用导入数据，仅并入无冲突部分）</NRadio
          >
        </NFlex>
      </NRadioGroup>
    </template>
    <template #action>
      <NFlex :size="12">
        <NButton type="error" @click="mergeConflictVisible = false">
          <template #icon>
            <NIcon>
              <IconGitPullRequestClosed />
            </NIcon>
          </template>
          取消
        </NButton>

        <NButton type="warning" @click="mergeForceOverwrite">
          <template #icon>
            <NIcon>
              <IconGitBranchDeleted />
            </NIcon>
          </template>
          强行覆盖
        </NButton>
        <NButton type="info" @click="openManualSolve">
          <template #icon>
            <NIcon>
              <IconGitCompare />
            </NIcon>
          </template>
          手动合并
        </NButton>
        <NButton type="primary" @click="mergePartial">
          <template #icon>
            <NIcon>
              <IconGitBranch />
            </NIcon>
          </template>
          半保留合并
        </NButton>
      </NFlex>
    </template>
  </NModal>

  <MergeConflictSolver
    v-model:show="manualSolveVisible"
    :conflicts="conflicts"
    @confirm="onManualConfirm"
  />

  <NCard v-if="ui.labUnlocked" class="additional-menu">
    <template #header>
      <NIcon>
        <IconFlask />
      </NIcon>
      实验室
    </template>
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
      <NUl>
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
.additional-menu {
  max-width: 640px;
  margin: 24px auto 0;
}
</style>
