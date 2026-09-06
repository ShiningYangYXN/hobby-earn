import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  // 高级模式：开启后可删除已完成订单、修改受保护数据
  // 刷新不保留激活状态（内存 ref，不持久化）
  const labMode = ref(false)

  // 高级设置面板是否解锁显示：刷新即重置（纯内存，不持久化）
  const labUnlocked = ref(false)
  function unlockLab() {
    labUnlocked.value = true
  }

  return { labMode, labUnlocked, unlockLab }
})
