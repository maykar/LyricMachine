<template>
  <svg
    :width="remSize"
    :height="remSize"
    viewBox="0 0 24 24"
    class="mdi-icon"
  >
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  path: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
})

const remSize = computed(() => `${Number(props.size) / 16}rem`)
</script>

<style scoped>
.mdi-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
