<script setup lang="ts">
import { useRouter } from 'vue-router'
import ManageModal from '@/components/CategoryManageModal.vue'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'
import { useDiscountStore } from '@/stores/useDiscountStore'

const router = useRouter()
const store = useExclusiveGroupStore()
const discountStore = useDiscountStore()

function close() {
  router.push('/discounts')
}

async function removeGroup(id: string) {
  await store.remove(id)
  // 级联清理：解除优惠对该互斥组的归属
  await discountStore.removeExclusiveGroupRef(id)
}
</script>

<template>
  <ManageModal
    title="互斥组管理"
    :items="store.groups"
    :load="() => store.load()"
    :empty-form="() => ({ name: '' })"
    :create="(f) => { void store.create(f.name) }"
    :update="(id, f) => store.update(id, { name: f.name })"
    :remove="removeGroup"
    :close="close"
    confirm-text="删除后将从所有优惠中移除该互斥组归属，确认删除？"
  />
</template>
