<script setup lang="ts">
import { useRouter } from 'vue-router'
import ItemManageModal from '@/components/ItemManageModal.vue'
import { useExclusiveGroupStore } from '@/stores/useExclusiveGroupStore'

const router = useRouter()
const store = useExclusiveGroupStore()

function close() {
  router.push('/discounts')
}

async function removeGroup(id: string) {
  await store.remove(id)
}
</script>

<template>
  <ItemManageModal
    title="互斥组管理"
    :items="store.groups"
    :load="() => store.load()"
    :empty-form="() => ({ name: '' })"
    :create="
      (f) => {
        void store.create(f.name)
      }
    "
    :update="(id, f) => store.update(id, { name: f.name })"
    :remove="removeGroup"
    :close="close"
    confirm-text="删除后将从所有优惠中移除该互斥组归属，确认删除？"
  />
</template>
