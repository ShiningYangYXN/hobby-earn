<script setup lang="ts">
import { useRouter } from 'vue-router'
import ManageModal from '@/components/CategoryManageModal.vue'
import { useMemberTypeStore } from '@/stores/useMemberTypeStore'

const router = useRouter()
const store = useMemberTypeStore()

function close() {
  router.push('/members')
}
</script>

<template>
  <ManageModal
    title="会员种类管理"
    :items="store.types"
    :load="() => store.load()"
    :empty-form="() => ({ name: '' })"
    :create="(f) => store.create(f.name)"
    :update="(id, f) => store.update(id, { name: f.name })"
    :remove="(id) => store.remove(id)"
    :close="close"
    confirm-text="删除后关联的会员将清空种类，优惠中的种类限制也将移除，确认删除？"
  />
</template>
