import { ref } from 'vue'
import { defineStore } from 'pinia'

export const useUiStore = defineStore('ui', () => {
  const advancedMode = ref(false)
  return { advancedMode }
})
