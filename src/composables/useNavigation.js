import { storeToRefs } from 'pinia'
import { useNavigationStore } from '../stores/navigation.js'

/**
 * Thin wrapper around the Pinia navigation store.
 * Preserves the original composable API so consumers don't need to change.
 */
export function useNavigation() {
  const store = useNavigationStore()
  const { page, modalStack, topModal, hasModal } = storeToRefs(store)
  return {
    page,
    modalStack,
    topModal,
    hasModal,
    goToPage: store.goToPage,
    goBack: store.goBack,
    pushModal: store.pushModal,
    closeModal: store.closeModal,
    popModal: store.popModal,
    isModalOpen: store.isModalOpen,
    dismissTop: store.dismissTop,
  }
}
