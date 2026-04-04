import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api } from '../api.js'

export const useCustomLabelsStore = defineStore('customLabels', () => {
  const labels = ref([])
  const loading = ref(false)

  async function load() {
    loading.value = true
    try {
      const data = await api.getSetting('customLabels')
      labels.value = Array.isArray(data) ? data : []
    } catch (err) {
      console.error('Failed to load custom labels:', err)
    } finally {
      loading.value = false
    }
  }

  async function save() {
    try {
      await api.setSettingRaw('customLabels', labels.value)
    } catch (err) {
      console.error('Failed to save custom labels:', err)
    }
  }

  async function addLabel(name) {
    const trimmed = name.trim()
    if (!trimmed || labels.value.includes(trimmed)) return
    labels.value.push(trimmed)
    labels.value.sort()
    await save()
  }

  async function removeLabel(name) {
    labels.value = labels.value.filter(l => l !== name)
    await save()
  }

  return { labels, loading, load, save, addLabel, removeLabel }
})
