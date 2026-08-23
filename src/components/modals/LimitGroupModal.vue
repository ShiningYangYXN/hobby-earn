<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import {
  NModal,
  NInput,
  NInputNumber,
  NSelect,
  NGrid,
  NGi,
  NFlex,
  NButton,
  NIcon,
  NText,
  useMessage,
  NPopconfirm,
} from 'naive-ui'
import { IconPlus, IconDeviceFloppy, IconX, IconTrash, IconPencil } from '@tabler/icons-vue'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { usePriceStore } from '@/stores/usePriceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import { useDiscountStore } from '@/stores/useDiscountStore'
import CategorySelect from '@/components/CategorySelect.vue'

const router = useRouter()
const store = useLimitGroupStore()
const priceStore = usePriceStore()
const categoryStore = useCategoryStore()
const discountStore = useDiscountStore()
const msg = useMessage()

const form = ref({
  name: '',
  limitType: 'amount' as 'amount' | 'ratio',
  limit: 0,
  scope: 'all' as 'all' | 'items' | 'categories',
  itemIds: [] as string[],
  categoryIds: [] as string[],
})
const editingId = ref<string | null>(null)

function close() {
  router.push('/discounts')
}

async function load() {
  await Promise.all([
    store.load(),
    priceStore.load(),
    categoryStore.load(),
  ])
}

onMounted(load)

function reset() {
  form.value = {
    name: '',
    limitType: 'amount',
    limit: 0,
    scope: 'all',
    itemIds: [],
    categoryIds: [],
  }
  editingId.value = null
}

async function save() {
  const n = form.value.name.trim()
  if (!n) {
    msg.warning('请输入上限组名称')
    return
  }
  if (form.value.limit <= 0) {
    msg.warning('请填写组上限（大于 0）')
    return
  }
  if (form.value.scope === 'items' && !form.value.itemIds.length) {
    msg.warning('请选择参与计算的具体单品')
    return
  }
  if (form.value.scope === 'categories' && !form.value.categoryIds.length) {
    msg.warning('请选择参与计算的分类')
    return
  }
  const payload = {
    name: n,
    limitType: form.value.limitType,
    limit: Math.round(form.value.limit * (form.value.limitType === 'amount' ? 100 : 1)),
    scope: form.value.scope,
    itemIds: form.value.scope === 'items' ? form.value.itemIds : undefined,
    categoryIds: form.value.scope === 'categories' ? form.value.categoryIds : undefined,
  }
  if (editingId.value) {
    await store.update(editingId.value, payload)
    msg.success('已更新')
  } else {
    await store.create(payload)
    msg.success('已添加')
  }
  reset()
}

function editRow(id: string) {
  const g = store.groups.find((x) => x.id === id)
  if (!g) return
  editingId.value = id
  form.value = {
    name: g.name,
    limitType: g.limitType,
    limit: g.limitType === 'amount' ? g.limit / 100 : g.limit,
    scope: g.scope,
    itemIds: g.itemIds ?? [],
    categoryIds: g.categoryIds ?? [],
  }
}
function cancelEdit() {
  reset()
}

// 删除上限组时，级联清理优惠里的归属
async function removeRow(id: string) {
  await store.remove(id)
  msg.success('已删除')
}

const itemOptions = computed(() =>
  priceStore.prices.map((p) => ({ label: p.name, value: p.id })),
)
const limitTypeOptions = [
  { label: '固定金额（元）', value: 'amount' },
  { label: '比例（%）', value: 'ratio' },
]
const scopeOptions = [
  { label: '全部订单金额', value: 'all' },
  { label: '仅指定单品', value: 'items' },
  { label: '仅指定分类', value: 'categories' },
]
const scopeText: Record<string, string> = {
  all: '全部订单金额',
  items: '指定单品',
  categories: '指定分类',
}
</script>

<template>
  <NModal
    :show="true"
    preset="card"
    title="上限组管理"
    style="width: 520px"
    :bordered="false"
    @update:show="close"
  >
    <NFlex vertical :size="12">
      <NGrid cols="2" xGap="12" itemResponsive>
        <NGi>
          <NText depth="3" class="small-label">组名称</NText>
          <NInput v-model:value="form.name" placeholder="如：合计优惠封顶" />
        </NGi>
        <NGi>
          <NText depth="3" class="small-label">计算范围</NText>
          <NSelect v-model:value="form.scope" :options="scopeOptions" />
        </NGi>
        <NGi v-if="form.scope === 'items'">
          <NText depth="3" class="small-label">参与计算的单品</NText>
          <NSelect
            v-model:value="form.itemIds"
            :options="itemOptions"
            multiple
            filterable
            placeholder="选择单品"
          />
        </NGi>
        <NGi v-if="form.scope === 'categories'">
          <NText depth="3" class="small-label">参与计算的分类</NText>
          <CategorySelect v-model="form.categoryIds" />
        </NGi>
        <NGi>
          <NText depth="3" class="small-label">组上限类型</NText>
          <NSelect v-model:value="form.limitType" :options="limitTypeOptions" />
        </NGi>
        <NGi>
          <NText depth="3" class="small-label">
            组上限（{{ form.limitType === 'amount' ? '元' : '%' }}）
          </NText>
          <NInputNumber
            v-model:value="form.limit"
            :min="0"
            :precision="form.limitType === 'amount' ? 2 : 0"
            style="width: 100%"
          />
        </NGi>
      </NGrid>
      <NFlex :size="8">
        <NButton type="primary" @click="save">
          <NIcon>
            <IconPlus v-if="!editingId" />
            <IconDeviceFloppy v-else />
          </NIcon>
          {{ editingId ? '保存' : '添加' }}
        </NButton>
        <NButton v-if="editingId" @click="cancelEdit">
          <NIcon><IconX /></NIcon> 取消
        </NButton>
      </NFlex>

      <NText v-if="!store.groups.length" depth="3">暂无上限组，请在上方添加。</NText>
      <NFlex v-else vertical :size="6">
        <NFlex
          v-for="g in store.groups"
          :key="g.id"
          align="center"
          justify="space-between"
          class="eg-row"
        >
          <NText>
            {{ g.name }}（{{ scopeText[g.scope] }}，{{
              g.limitType === 'amount' ? `¥${(g.limit / 100).toFixed(2)}` : `${g.limit}%`
            }}）
          </NText>
          <NFlex :size="4">
            <NButton size="tiny" @click="editRow(g.id)">
              <NIcon><IconPencil /></NIcon> 编辑
            </NButton>
            <NPopconfirm @positive-click="removeRow(g.id)">
              <template #trigger>
                <NButton size="tiny" type="error">
                  <NIcon><IconTrash /></NIcon> 删除
                </NButton>
              </template>
              删除后将从所有优惠中移除该上限组归属，确认？
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
