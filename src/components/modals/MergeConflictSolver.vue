<script setup lang="ts">
import {
  NFlex,
  NIcon,
  NText,
  NTag,
  NButton,
  NModal,
  NTabs,
  NTabPane,
  NScrollbar,
  useMessage,
  useThemeVars,
} from 'naive-ui'
import { computed, ref, watch } from 'vue'
import { highlight } from 'lite-hl'
import { IconGitPullRequestClosed, IconGitMerge } from '@tabler/icons-vue'
import type { MergeConflict, MergeDecision } from '@/stores/db'

/** 每条冲突的处置方式：保留当前 / 采用导入 / 手动编辑 */
type Choice = 'builtin' | 'imported' | 'manual'

const props = defineProps<{ show: boolean; conflicts: MergeConflict[] }>()
const emit = defineEmits<{
  'update:show': [value: boolean]
  confirm: [decisions: Record<string, MergeDecision>]
}>()

const msg = useMessage()

/** 与 mergeManual 的 decisions 键保持一致 */
function keyOf(c: MergeConflict) {
  return `${c.store}::${c.id}`
}

const choice = ref<Record<string, Choice>>({})
const manual = ref<Record<string, string>>({})

// 每次打开按最新冲突列表重置：默认保留当前，手动编辑预填导入版本
watch(
  () => (props.show ? props.conflicts : null),
  (list) => {
    if (!list) return
    const nextChoice: Record<string, Choice> = {}
    const nextManual: Record<string, string> = {}
    for (const c of list) {
      nextChoice[keyOf(c)] = 'builtin'
      nextManual[keyOf(c)] = JSON.stringify(c.imported, null, 2)
    }
    choice.value = nextChoice
    manual.value = nextManual
  },
  { immediate: true },
)

function close() {
  emit('update:show', false)
}

/** 收集每条冲突的选择，手动编辑项先校验 JSON，全部合法才提交 */
function confirm() {
  const decisions: Record<string, MergeDecision> = {}
  for (const c of props.conflicts) {
    const key = keyOf(c)
    const pick = choice.value[key] ?? 'builtin'
    if (pick !== 'manual') {
      decisions[key] = pick
      continue
    }
    const text = manual.value[key] ?? ''
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
  emit('confirm', decisions)
}

function highlightText(code: string): string {
  return highlight(code, { language: 'json' }).value
}

function highlightJson(val: unknown): string {
  return highlightText(JSON.stringify(val, null, 2))
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
  // NModal 内容经 teleport 挂到 body，无法继承 .n-config-provider 注入的 --n-* 变量，
  // 故「无高亮文本 / 边框 / 光标」色一律由运行时显式注入，否则暗色下会退回浅色兜底值。
  '--hl-plain': themeVars.value.textColorBase,
  '--hl-border': themeVars.value.borderColor,
}))

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

// 高亮层与输入层滚动同步
function onEditorScroll(e: Event) {
  const ta = e.target as HTMLTextAreaElement
  const hl = ta.parentElement?.querySelector<HTMLElement>('.json-editor__hl')
  if (hl) {
    hl.scrollTop = ta.scrollTop
    hl.scrollLeft = ta.scrollLeft
  }
}
</script>

<template>
  <NModal
    :show="show"
    preset="card"
    title="手动合并"
    @update:show="(v: boolean) => emit('update:show', v)"
    :segmented="{ content: true, footer: true }"
  >
    <template #default>
      <!-- hlVars 绑在内容根节点：CSS 变量只向下继承，.conflict-row / .json-box /
           .json-editor（含 textarea 光标）都必须从同一祖先取色，否则暗色下退回浅色兜底值 -->
      <NFlex vertical :size="12" :style="hlVars">
        <NText depth="3">
          共
          <NText type="warning" strong>{{ conflicts.length }}</NText>
          处冲突，逐条选择：保留当前、采用导入，或切到「手动编辑」自行编辑 JSON
          合并结果。未选择默认保留当前数据。
        </NText>
        <NScrollbar style="max-height: 48vh">
          <NFlex vertical :size="16">
            <NFlex v-for="c in conflicts" :key="keyOf(c)" vertical class="conflict-row" :size="14">
              <NFlex class="conflict-head">
                <NTag size="small" :bordered="false" type="info">{{ c.store }}</NTag>
                <NText code>{{ c.id }}</NText>
              </NFlex>
              <NTabs
                :value="choice[keyOf(c)]"
                size="small"
                type="line"
                @update:value="(v) => (choice[keyOf(c)] = v as Choice)"
              >
                <NTabPane name="builtin" tab="保留当前">
                  <NScrollbar style="max-height: 240px">
                    <pre class="json-box" v-html="highlightJson(c.builtin)"></pre>
                  </NScrollbar>
                </NTabPane>
                <NTabPane name="imported" tab="采用导入">
                  <NScrollbar style="max-height: 240px">
                    <pre class="json-box" v-html="highlightJson(c.imported)"></pre>
                  </NScrollbar>
                </NTabPane>
                <NTabPane name="manual" tab="手动编辑">
                  <NFlex class="json-editor">
                    <pre
                      class="json-editor__hl"
                      v-html="highlightText(manual[keyOf(c)] ?? '')"
                    ></pre>
                    <textarea
                      class="json-editor__input"
                      v-model="manual[keyOf(c)]"
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
      </NFlex>
    </template>
    <template #footer>
      <NFlex justify="end" :size="12">
        <NButton type="error" @click="close">
          <template #icon>
            <NIcon>
              <IconGitPullRequestClosed />
            </NIcon>
          </template>
          取消
        </NButton>
        <NButton type="success" @click="confirm">
          <template #icon>
            <NIcon>
              <IconGitMerge />
            </NIcon>
          </template>
          执行手动合并
        </NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<style scoped>
.conflict-row {
  border: 1px solid var(--hl-border, #e0e0e6);
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
  border: 1px solid var(--hl-border, #e0e0e6);
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
  border: 1px solid var(--hl-border, #e0e0e6);
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

/* 文本透明以露出高亮层；光标色必须来自运行时注入的 --hl-plain，
   否则弹窗 teleport 到 body 后会退回浅色兜底值，暗色下几乎不可见 */
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

/* 输入层文字透明以露出高亮层，占位符需单独着色，否则同样不可见 */
.json-editor__input::placeholder {
  color: var(--lite-hl-comment, #999);
}

/* 语法高亮（lite-hl）：配色变量由 useThemeVars() 在运行时动态注入到
   .json-box / .json-editor 的 :style（见 <script> 中 hlVars），
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
