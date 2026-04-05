import { storeToRefs } from 'pinia'
import { useToastStore } from '../stores/toast.js'

/**
 * Thin wrapper around the Pinia toast store.
 * Preserves the original composable API so consumers don't need to change.
 */
export function useToast() {
  const store = useToastStore()
  const { toasts } = storeToRefs(store)
  return { toasts, showToast: store.showToast, updateToast: store.updateToast, dismissToast: store.dismissToast }
}
