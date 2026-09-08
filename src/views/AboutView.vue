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
  NTabs,
  NTabPane,
  NScrollbar,
  useDialog,
  useMessage,
  useThemeVars,
} from 'naive-ui'
import { ref, computed } from 'vue'
import { highlight } from 'lite-hl'
import {
  IconMoodDollar,
  IconTag,
  IconCertificate,
  IconBrandGithub,
  IconTrash,
  IconSkull,
  IconDownload,
  IconUpload,
  IconGitMerge,
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

// 手动合并 solver 状态
const manualSolveVisible = ref(false)
const conflictChoice = ref<Record<string, 'builtin' | 'imported' | 'manual'>>({})
const conflictManual = ref<Record<string, string>>({})

function conflictKey(store: string, id: string) {
  return `${store}::${id}`
}

function highlightText(code: string): string {
  return highlight(code, { language: 'json' }).value
}

// 运行时根据 Naive 当前主题动态注入 lite-hl 配色（切换暗色自动跟随）
const themeVars = useThemeVars()
const hlVars = computed(() => ({
  '--lite-hl-bg': 'transparent',
  '--lite-hl-comment': themeVars.value.textColorDisabled,
  '--lite-hl-string': themeVars.value.successColor,
  '--lite-hl-number': themeVars.value.infoColor,
  '--lite-hl-keyword': themeVars.value.primaryColor,
  '--lite-hl-literal': themeVars.value.warningColor,
  '--lite-hl-function': themeVars.value.primaryColorHover,
  '--lite-hl-variable': themeVars.value.errorColor,
  '--lite-hl-attr': themeVars.value.infoColor,
  '--lite-hl-operator': themeVars.value.textColorBase,
  '--lite-hl-punctuation': themeVars.value.textColorDisabled,
  // 无高亮文本/光标色：NModal 内容经 teleport 挂到 body，无法继承
  // .n-config-provider 注入的 --n-text-color-base，故由运行时显式注入；
  // 边框改用 Naive 默认 --n-border-color（见样式）。
  '--hl-plain': themeVars.value.textColorBase,
}))

function highlightJson(val: unknown): string {
  return highlightText(JSON.stringify(val, null, 2))
}

function onEditorScroll(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  const hl = ta.parentElement?.querySelector<HTMLElement>('.json-editor__hl')
  if (hl) {
    hl.scrollTop = ta.scrollTop
    hl.scrollLeft = ta.scrollLeft
  }
}

// 手动编辑器：根据内容自动撑高 / 收缩（超出上限后内部滚动）
const resizeHandlers = new WeakMap<HTMLTextAreaElement, () => void>()
const vAutoResize = {
  mounted(el: HTMLTextAreaElement) {
    const resize = () => {
      el.style.height = 'auto'
      el.style.height = Math.min(el.scrollHeight, 400) + 'px'
    }
    resize()
    el.addEventListener('input', resize)
    resizeHandlers.set(el, resize)
  },
  updated(el: HTMLTextAreaElement) {
    resizeHandlers.get(el)?.()
  },
  unmounted(el: HTMLTextAreaElement) {
    const fn = resizeHandlers.get(el)
    if (fn) {
      el.removeEventListener('input', fn)
      resizeHandlers.delete(el)
    }
  },
}

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

/** 打开手动合并 solver：基于已检测到的冲突列表填充两侧快照与默认选择 */
function openManualSolve() {
  if (!pendingMergeData) return
  const choice: Record<string, 'builtin' | 'imported' | 'manual'> = {}
  const manual: Record<string, string> = {}
  for (const c of conflicts.value) {
    const key = conflictKey(c.store, c.id)
    choice[key] = 'builtin' // 默认保留当前
    manual[key] = JSON.stringify(c.imported, null, 2)
  }
  conflictChoice.value = choice
  conflictManual.value = manual
  mergeConflictVisible.value = false
  manualSolveVisible.value = true
}

/** 执行手动合并：收集每条冲突的选择，调用 mergeManual */
async function applyManualMerge() {
  if (!pendingMergeData) return
  const decisions: Record<string, MergeDecision> = {}
  for (const c of conflicts.value) {
    const key = conflictKey(c.store, c.id)
    const choice = conflictChoice.value[key] ?? 'builtin'
    if (choice === 'builtin') {
      decisions[key] = 'builtin'
    } else if (choice === 'imported') {
      decisions[key] = 'imported'
    } else {
      const text = conflictManual.value[key] ?? ''
      let obj: unknown
      try {
        obj = JSON.parse(text)
      } catch {
        msg.error(`冲突项 ${c.id} 的手动内容不是合法 JSON`)
        return
      }
      if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
        msg.error(`冲突项 ${c.id} 的手动内容必须是 JSON 对象`)
        return
      }
      decisions[key] = obj as Record<string, unknown>
    }
  }
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

  <NCard title="数据导入导出" class="additional-menu">
    <NFlex vertical :size="12">
      <NText depth="3">导出当前全部数据为备份文件；导入将覆盖现有数据，请谨慎操作。</NText>
      <NFlex :size="12">
        <NButton @click="exportData">
          <NIcon>
            <IconDownload />
          </NIcon>
          导出数据
        </NButton>
        <NButton @click="fileInput?.click()">
          <NIcon>
            <IconUpload />
          </NIcon>
          导入数据
        </NButton>
        <NButton @click="mergeInput?.click()">
          <NIcon>
            <IconGitMerge />
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
    style="max-width: 520px"
  >
    <template #default>
      <NText>
        导入数据与当前数据存在
        <b>{{ mergeConflictCount }}</b>
        处冲突（同一对象在两侧均被修改），无法自动合并。请选择处理方式：
      </NText>
      <NRadioGroup v-model:value="mergeBase" style="margin-top: 14px">
        <NFlex vertical>
          <NRadio value="builtin">合并基底：内置（冲突部分保留当前数据，仅并入无冲突部分）</NRadio>
          <NRadio value="imported">合并基底：导入（冲突部分采用导入数据，仅并入无冲突部分）</NRadio>
        </NFlex>
      </NRadioGroup>
    </template>
    <template #action>
      <NFlex :size="12">
        <NButton @click="mergeConflictVisible = false">取消</NButton>
        <NButton @click="openManualSolve">手动合并</NButton>
        <NButton type="warning" @click="mergeForceOverwrite">强行覆盖</NButton>
        <NButton type="primary" @click="mergePartial">半保留合并</NButton>
      </NFlex>
    </template>
  </NModal>

  <NModal v-model:show="manualSolveVisible" title="手动合并" style="max-width: 880px" preset="card">
    <template #default>
      <NText depth="3">
        共
        {{ conflicts.length }}
        处冲突，逐条选择：保留当前（内置）、采用导入，或切到「手动合并」自行编辑 JSON
        合并结果。未选择默认保留当前数据。
      </NText>
      <NScrollbar style="max-height: 56vh">
        <NFlex vertical :size="16">
          <NFlex
            v-for="c in conflicts"
            :key="conflictKey(c.store, c.id)"
            vertical
            class="conflict-row"
            :size="14"
          >
            <NFlex class="conflict-head">
              <NTag size="small" :bordered="false" type="info">{{ c.store }}</NTag>
              <NText code>{{ c.id }}</NText>
            </NFlex>
            <NTabs
              :value="conflictChoice[conflictKey(c.store, c.id)]"
              size="small"
              type="line"
              @update:value="
                (v) =>
                  (conflictChoice[conflictKey(c.store, c.id)] = v as
                    'builtin' | 'imported' | 'manual')
              "
            >
              <NTabPane name="builtin" tab="保留当前（内置）">
                <NScrollbar style="max-height: 240px">
                  <pre class="json-box" :style="hlVars" v-html="highlightJson(c.builtin)"></pre>
                </NScrollbar>
              </NTabPane>
              <NTabPane name="imported" tab="采用导入">
                <NScrollbar style="max-height: 240px">
                  <pre class="json-box" :style="hlVars" v-html="highlightJson(c.imported)"></pre>
                </NScrollbar>
              </NTabPane>
              <NTabPane name="manual" tab="手动编辑">
                <NFlex class="json-editor">
                  <pre
                    class="json-editor__hl"
                    :style="hlVars"
                    v-html="highlightText(conflictManual[conflictKey(c.store, c.id)] ?? '')"
                  ></pre>
                  <textarea
                    class="json-editor__input"
                    v-model="conflictManual[conflictKey(c.store, c.id)]"
                    v-auto-resize
                    spellcheck="false"
                    placeholder="编辑最终合并结果（JSON 对象）"
                    @scroll="onEditorScroll"
                  ></textarea>
                </NFlex>
              </NTabPane>
            </NTabs>
          </NFlex>
        </NFlex>
      </NScrollbar>
    </template>
    <template #footer>
      <NFlex justify="end" :size="12">
        <NButton @click="manualSolveVisible = false">取消</NButton>
        <NButton type="primary" @click="applyManualMerge">执行手动合并</NButton>
      </NFlex>
    </template>
  </NModal>

  <NCard v-if="ui.labUnlocked" title="实验室" class="additional-menu">
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
.additional-menu {
  max-width: 640px;
  margin: 24px auto 0;
}

.conflict-row {
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 8px;
  padding: 16px;
}

.conflict-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.json-box {
  margin: 0;
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 6px;
  padding: 8px;
  background: transparent;
  color: var(--hl-plain, #333);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
}

/* 手动合并编辑器：高亮层(pre) 叠加在透明 textarea 之上，滚动同步 */
.json-editor {
  position: relative;
  border: 1px solid var(--n-border-color, #e0e0e6);
  border-radius: 6px;
  overflow: hidden;
  transition:
    border-color 0.15s ease,
    box-shadow 0.15s ease;
}

.json-editor__hl,
.json-editor__input {
  margin: 0;
  padding: 8px;
  border: 0;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  box-sizing: border-box;
  tab-size: 2;
}

.json-editor__hl {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  background: var(--lite-hl-bg, transparent);
  color: var(--hl-plain, #333);
}

.json-editor__input {
  position: relative;
  display: block;
  width: 100%;
  min-height: 80px;
  max-height: 400px;
  overflow: auto;
  background: transparent;
  color: transparent;
  caret-color: var(--hl-plain, #333);
  outline: none;
}

/* 语法高亮（lite-hl）：配色变量由 useThemeVars() 在运行时动态注入到
   .json-box / .json-editor__hl 的 :style（见 <script> 中 hlVars），
   因此浅色/暗色切换时自动跟随 Naive 当前主题。高亮 HTML 经 v-html 注入、
   无法被 scoped 命中，故 token 颜色用 :deep() 引用上述变量。 */
.json-box :deep(.hljs-comment),
.json-editor__hl :deep(.hljs-comment) {
  color: var(--lite-hl-comment);
  font-style: italic;
}

.json-box :deep(.hljs-string),
.json-editor__hl :deep(.hljs-string) {
  color: var(--lite-hl-string);
}

.json-box :deep(.hljs-number),
.json-editor__hl :deep(.hljs-number) {
  color: var(--lite-hl-number);
}

.json-box :deep(.hljs-keyword),
.json-editor__hl :deep(.hljs-keyword) {
  color: var(--lite-hl-keyword);
  font-weight: 600;
}

.json-box :deep(.hljs-literal),
.json-editor__hl :deep(.hljs-literal) {
  color: var(--lite-hl-literal);
  font-weight: 600;
}

.json-box :deep(.hljs-title.function_),
.json-editor__hl :deep(.hljs-title.function_) {
  color: var(--lite-hl-function);
}

.json-box :deep(.hljs-variable),
.json-editor__hl :deep(.hljs-variable) {
  color: var(--lite-hl-variable);
}

.json-box :deep(.hljs-attr),
.json-editor__hl :deep(.hljs-attr) {
  color: var(--lite-hl-attr);
}

.json-box :deep(.hljs-operator),
.json-editor__hl :deep(.hljs-operator) {
  color: var(--lite-hl-operator);
}

.json-box :deep(.hljs-punctuation),
.json-editor__hl :deep(.hljs-punctuation) {
  color: var(--lite-hl-punctuation);
}
</style>
