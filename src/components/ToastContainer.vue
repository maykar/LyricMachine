<template>
  <Teleport to="body">
    <TransitionGroup name="toast" tag="div" class="toast-container">
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-item"
        :class="'toast--' + toast.type"
        @click="dismissToast(toast.id)"
      >
        {{ toast.message }}
      </div>
    </TransitionGroup>
  </Teleport>
</template>

<script setup>
import { useToast } from '../composables/useToast.js'

const { toasts, dismissToast } = useToast()
</script>

<style scoped>
.toast-container {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  z-index: 9999;
  display: flex;
  flex-direction: column-reverse;
  gap: 0.5rem;
  pointer-events: none;
  max-width: 22.5rem;
}

.toast-item {
  pointer-events: auto;
  padding: 0.6rem 1rem;
  border-radius: var(--radius-sm, 8px);
  font-size: 0.8rem;
  font-family: inherit;
  cursor: pointer;
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  animation: toast-slide-in 0.25s ease-out;
}

.toast--error {
  background: rgba(231, 76, 60, 0.9);
  color: #fff;
  border: 1px solid rgba(231, 76, 60, 0.5);
}

.toast--success {
  background: rgba(46, 204, 113, 0.9);
  color: #fff;
  border: 1px solid rgba(46, 204, 113, 0.5);
}

.toast--info {
  background: rgba(30, 30, 30, 0.92);
  color: var(--text-primary);
  border: 1px solid rgba(255, 255, 255, 0.15);
}

/* Transition group classes */
.toast-enter-active {
  transition: all 0.25s ease-out;
}
.toast-leave-active {
  transition: all 0.2s ease-in;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

@keyframes toast-slide-in {
  from { opacity: 0; transform: translateX(30px); }
  to { opacity: 1; transform: translateX(0); }
}
</style>
