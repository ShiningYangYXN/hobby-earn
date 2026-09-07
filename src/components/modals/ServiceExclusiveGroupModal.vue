<script setup lang="ts">
import { useRouter } from 'vue-router'
import ItemManageModal from '@/components/ItemManageModal.vue'
import { useServiceExclusiveGroupStore } from '@/stores/useServiceExclusiveGroupStore'

const router = useRouter()
const store = useServiceExclusiveGroupStore()

function close() {
  router.push('/services')
}
</script>

<template>
  <ItemManageModal
    title="服务互斥组管理"
    :items="store.groups"
    :load="() => store.load()"
    :empty-form="() => ({ name: '' })"
    :create="
      (f) => {
        void store.create(String(f.name ?? '').trim())
      }
    "
    :update="(id, f) => store.update(id, { name: String(f.name ?? '').trim() })"
    :remove="(id) => store.remove(id)"
    :close="close"
    confirm-text="删除后归属该组的服务将自动解除互斥关系，确认删除？"
  />
</template>
