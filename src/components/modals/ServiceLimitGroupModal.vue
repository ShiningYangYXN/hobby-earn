<script setup lang="ts">
import { useRouter } from 'vue-router'
import { NInputNumber, NGi, NText } from 'naive-ui'
import ItemManageModal from '@/components/ItemManageModal.vue'
import { useServiceLimitGroupStore } from '@/stores/useServiceLimitGroupStore'

const router = useRouter()
const store = useServiceLimitGroupStore()

function close() {
  router.push('/services')
}
function validate(f: Record<string, unknown>): string | null {
  if (!String(f.name ?? '').trim()) return '请填写名称'
  const v = Number(f.limitValue)
  if (!Number.isFinite(v) || v <= 0) return '限购数量需大于 0'
  return null
}
</script>

<template>
  <ItemManageModal
    title="服务限购组管理"
    :items="store.groups"
    :load="() => store.load()"
    :empty-form="() => ({ name: '', limitValue: 1 })"
    :to-form="(item) => ({ name: item.name ?? '', limitValue: item.limitValue ?? 1 })"
    :row-text="(item) => `${item.name}（合计限 ${item.limitValue}）`"
    :validate="validate"
    :create="
      (f) => {
        void store.create({
          name: String(f.name ?? '').trim(),
          limitValue: Number(f.limitValue) || 1,
          serviceIds: [],
        })
      }
    "
    :update="
      (id, f) =>
        store.update(id, {
          name: String(f.name ?? '').trim(),
          limitValue: Number(f.limitValue) || 1,
        })
    "
    :remove="(id) => store.remove(id)"
    :close="close"
    confirm-text="删除后归属该组的服务将自动解除分组限购，确认删除？"
  >
    <template #form-extra="{ form }">
      <NGi>
        <NText depth="3" class="small-label">组内合计限购数量</NText>
        <NInputNumber v-model:value="form.limitValue" :min="1" :precision="0" />
      </NGi>
    </template>
  </ItemManageModal>
</template>
