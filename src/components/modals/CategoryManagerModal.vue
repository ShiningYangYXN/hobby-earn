<script setup lang="ts">
import { useRouter } from 'vue-router'
import ItemManageModal from '@/components/ItemManageModal.vue'
import { useCategoryStore } from '@/stores/useCategoryStore'

const router = useRouter()
const store = useCategoryStore()

function close() {
  router.push('/services')
}
</script>

<template>
  <ItemManageModal title="服务分类管理" :items="store.categories" :load="() => store.load()"
    :empty-form="() => ({ name: '' })" :create="(f) => {
      void store.create(f.name)
    }
      " :update="(id, f) => store.update(id, f.name)" :remove="(id) => store.remove(id)" :close="close"
    confirm-text="删除后引用该分类的服务项、优惠、上限组将同步移除该分类，确认删除？" />
</template>
