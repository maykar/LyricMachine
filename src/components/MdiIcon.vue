<template>
  <svg
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    class="mdi-icon"
  >
    <path :d="path" fill="currentColor" />
  </svg>
</template>

<script setup>
defineProps({
  path: { type: String, required: true },
  size: { type: [Number, String], default: 20 },
})
</script>

<style scoped>
.mdi-icon {
  display: inline-block;
  vertical-align: middle;
  flex-shrink: 0;
}
</style>
