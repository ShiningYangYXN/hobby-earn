<script setup lang="ts">
/* eslint-disable @typescript-eslint/no-explicit-any -- 通用动态表单壳，form 值类型为动态 */
import { ref, reactive, onMounted } from 'vue'
import {
  NModal,
  NInput,
  NGrid,
  NGi,
  NFlex,
  NButton,
  NIcon,
  NText,
  NDivider,
  useMessage,
  NPopconfirm,
} from 'naive-ui'
import { IconPlus, IconDeviceFloppy, IconX, IconTrash, IconPencil } from '@tabler/icons-vue'

interface RowItem {
  id: string
  name: string
  [k: string]: unknown
}
// 通用动态表单壳：表单值类型为 any，由调用方自行保证字段正确
type FormShape = Record<string, any>

const props = defineProps<{
  title: string
  items: RowItem[]
  // 新建时的空表单工厂
  emptyForm: () => FormShape
  // 编辑时把行数据映射回表单（默认仅回填 name）
  toForm?: (item: RowItem) => FormShape
  // 行的展示文案（默认 name）
  rowText?: (item: RowItem) => string
  // 额外校验：返回错误信息字符串表示不通过，返回 null 表示通过
  validate?: (form: FormShape) => string | null
  load?: () => void | Promise<void>
  create: (form: FormShape) => void | Promise<void>
  update: (id: string, form: FormShape) => void | Promise<void>
  remove: (id: string) => void | Promise<void>
  close: () => void
  width?: number | string
  confirmText?: string
}>()

const msg = useMessage()
const editingId = ref<string | null>(null)
const form = reactive<FormShape>(props.emptyForm())

onMounted(async () => {
  if (props.load) await props.load()
})

function rowLabel(item: RowItem): string {
  return props.rowText ? props.rowText(item) : String(item.name ?? '')
}

function reset() {
  Object.assign(form, props.emptyForm())
  editingId.value = null
}

function editRow(item: RowItem) {
  editingId.value = item.id
  Object.assign(form, props.toForm ? props.toForm(item) : { name: String(item.name ?? '') })
}

async function save() {
  const name = String(form.name ?? '').trim()
  if (!name) {
    msg.warning('请输入名称')
    return
  }
  if (props.validate) {
    const err = props.validate(form)
    if (err) {
      msg.warning(err)
      return
    }
  }
  try {
    if (editingId.value) {
      await props.update(editingId.value, form)
      msg.success('已更新')
    } else {
      await props.create(form)
      msg.success('已添加')
    }
    reset()
  } catch (e) {
    msg.error('保存失败：' + (e as Error).message)
  }
}

async function removeRow(id: string) {
  try {
    await props.remove(id)
    msg.success('已删除')
    if (editingId.value === id) reset()
  } catch (e) {
    msg.error('删除失败：' + (e as Error).message)
  }
}
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    :title="title"
    :style="{ width: width ? (typeof width === 'number' ? width + 'px' : width) : '520px' }"
    :bordered="false"
    @update:show="close"
    content-scrollable
    :segmented="{ content: true, footer: true }"
  >
    <NFlex vertical :size="16">
      <NFlex vertical :size="12">
        <NGrid cols="2" xGap="12" itemResponsive>
          <NGi>
            <NText depth="3" class="small-label">名称</NText>
            <NInput v-model:value="form.name" placeholder="名称" @keyup.enter="save" />
          </NGi>
          <slot name="form-extra" :form="form" />
        </NGrid>
        <NFlex :size="8">
          <NButton type="primary" @click="save">
            <NIcon>
              <IconPlus v-if="!editingId" />
              <IconDeviceFloppy v-else />
            </NIcon>
            {{ editingId ? '保存' : '添加' }}
          </NButton>
          <NButton v-if="editingId" @click="reset">
            <NIcon>
              <IconX />
            </NIcon>
            取消
          </NButton>
        </NFlex>
      </NFlex>

      <NDivider />

      <NText v-if="!items.length" depth="3">暂无数据，请在上方添加。</NText>
      <NFlex v-else vertical :size="6">
        <NFlex
          v-for="item in items"
          :key="item.id"
          align="center"
          justify="space-between"
          class="eg-row"
        >
          <NText>{{ rowLabel(item) }}</NText>
          <NFlex :size="4">
            <NButton size="tiny" @click="editRow(item)">
              <NIcon>
                <IconPencil />
              </NIcon>
              编辑
            </NButton>
            <NPopconfirm @positive-click="removeRow(item.id)">
              <template #trigger>
                <NButton size="tiny" type="error">
                  <NIcon>
                    <IconTrash />
                  </NIcon>
                  删除
                </NButton>
              </template>
              {{ confirmText ?? '确认删除？' }}
            </NPopconfirm>
          </NFlex>
        </NFlex>
      </NFlex>
    </NFlex>

    <template #footer>
      <NFlex justify="end">
        <NButton @click="close">关闭</NButton>
      </NFlex>
    </template>
  </NModal>
</template>

<style scoped>
.eg-row {
  padding: 6px 10px;
  border: 1px solid var(--n-border-color);
  border-radius: 6px;
}

.small-label {
  display: block;
  margin-bottom: 4px;
  font-size: 12px;
}
</style>
