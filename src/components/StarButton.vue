<template>
  <button
    class="star-button"
    :class="{ saved: isSaved }"
    :title="isSaved ? 'Remove from favorites' : 'Save to favorites'"
    @click="$emit('toggle')"
  >{{ isSaved ? '★' : '☆' }}</button>
</template>

<script setup>
defineProps({
  isSaved: { type: Boolean, default: false },
})

defineEmits(['toggle'])
</script>

<style scoped>
.star-button {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 1.4rem;
  line-height: 1;
  color: var(--text-primary);
  opacity: 0.5;
  transition: opacity 0.2s, transform 0.2s;
  padding: 0;
}

.star-button:hover {
  opacity: 1;
  transform: scale(1.15);
}

.star-button.saved {
  opacity: 1;
  color: var(--accent);
}
</style>
