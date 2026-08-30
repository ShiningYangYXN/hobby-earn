<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { NText, NSelect, NGi, NInputNumber } from 'naive-ui'
import ItemManageModal from '@/components/ItemManageModal.vue'
import { useLimitGroupStore } from '@/stores/useLimitGroupStore'
import { useServiceStore } from '@/stores/useServiceStore'
import { useCategoryStore } from '@/stores/useCategoryStore'
import TypeSelect from '@/components/TypeSelect.vue'
import { useCategoryManage } from '@/composables/useTypeManage'
import type { DiscountLimitGroup } from '@/stores/types'
type FormShape = Record<string, unknown>

const router = useRouter()
const store = useLimitGroupStore()
const serviceStore = useServiceStore()
const categoryStore = useCategoryStore()
const categoryManage = useCategoryManage()

function close() {
  router.push('/discounts')
}

async function load() {
  await Promise.all([store.load(), serviceStore.load(), categoryStore.load()])
}

const itemOptions = computed(() =>
  serviceStore.services.map((p) => ({ label: p.name, value: p.id })),
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

interface LimitGroupForm {
  name: string
  limitType: 'amount' | 'ratio'
  limit?: number
  limitValue?: number
  scope: 'all' | 'items' | 'categories'
  itemIds: string[]
  categoryIds: string[]
}

function rowText(f: FormShape): string {
  const g = f as unknown as LimitGroupForm
  const limitValue = Number(g.limitValue)
  const limit = g.limitType === 'amount' ? `¥${(limitValue / 100).toFixed(2)}` : `${limitValue}%`
  return `${g.name}（${scopeText[g.scope] ?? g.scope}，${limit}）`
}

function validate(f: FormShape): string | null {
  const g = f as unknown as LimitGroupForm
  if (Number(g.limit) <= 0) return '请填写组上限（大于 0）'
  if (g.scope === 'items' && (!g.itemIds || !g.itemIds.length)) return '请选择参与计算的具体单品'
  if (g.scope === 'categories' && (!g.categoryIds || !g.categoryIds.length))
    return '请选择参与计算的分类'
  return null
}

function toForm(item: FormShape) {
  const g = item as unknown as LimitGroupForm
  return {
    name: g.name,
    limitType: g.limitType,
    limit: g.limitType === 'amount' ? Number(g.limitValue) / 100 : Number(g.limitValue),
    scope: g.scope,
    itemIds: g.itemIds ?? [],
    categoryIds: g.categoryIds ?? [],
  }
}

function buildPayload(f: FormShape): Omit<DiscountLimitGroup, 'id'> {
  const g = f as unknown as LimitGroupForm
  return {
    name: g.name.trim(),
    limitType: g.limitType,
    limitValue: Math.round(Number(g.limit) * (g.limitType === 'amount' ? 100 : 1)),
    scope: g.scope,
    itemIds: g.scope === 'items' ? g.itemIds : undefined,
    categoryIds: g.scope === 'categories' ? g.categoryIds : undefined,
    discountIds: [],
  }
}

async function createGroup(f: FormShape) {
  await store.create(buildPayload(f))
}
function updateGroup(id: string, f: FormShape) {
  return store.update(id, buildPayload(f))
}
</script>

<template>
  <ItemManageModal title="上限组管理" :items="store.groups" :load="load" :empty-form="() => ({
    name: '',
    limitType: 'amount',
    limit: 0,
    scope: 'all',
    itemIds: [],
    categoryIds: [],
  })
    " :to-form="toForm" :row-text="rowText" :validate="validate" :create="createGroup" :update="updateGroup"
    :remove="(id) => store.remove(id)" :close="close" confirm-text="删除后将从所有优惠中移除该上限组归属，确认删除？">
    <template #form-extra="{ form }">
      <NGi>
        <NText depth="3" class="small-label">计算范围</NText>
        <NSelect v-model:value="form.scope" :options="scopeOptions" />
      </NGi>
      <NGi v-if="form.scope === 'items'">
        <NText depth="3" class="small-label">参与计算的单品</NText>
        <NSelect v-model:value="form.itemIds" :options="itemOptions" multiple filterable placeholder="选择单品" />
      </NGi>
      <NGi v-if="form.scope === 'categories'">
        <NText depth="3" class="small-label">参与计算的分类</NText>
        <TypeSelect v-model="form.categoryIds" :manage="categoryManage" />
      </NGi>
      <NGi>
        <NText depth="3" class="small-label">组上限类型</NText>
        <NSelect v-model:value="form.limitType" :options="limitTypeOptions" />
      </NGi>
      <NGi>
        <NText depth="3" class="small-label">
          组上限（{{ form.limitType === 'amount' ? '元' : '%' }}）
        </NText>
        <NInputNumber v-model:value="form.limit" :min="0" :precision="form.limitType === 'amount' ? 2 : 0"
          style="width: 100%" />
      </NGi>
    </template>
  </ItemManageModal>
</template>
