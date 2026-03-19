import { nextTick } from 'vue'

/**
 * After a dropdown/popup becomes visible, measure it and adjust
 * so it stays fully inside the viewport.
 *
 * Call this in a watcher or after setting show=true + nextTick.
 *
 * @param {Ref<HTMLElement>|HTMLElement} elOrRef - the popup element
 */
export async function adjustDropdown(elOrRef) {
  await nextTick()
  const el = elOrRef?.value ?? elOrRef?.$el ?? elOrRef
  if (!el) return

  // Reset any previous adjustments so measurements are from the CSS default
  el.style.removeProperty('top')
  el.style.removeProperty('bottom')
  el.style.removeProperty('left')
  el.style.removeProperty('right')

  await nextTick()
  const rect = el.getBoundingClientRect()
  const vw = window.innerWidth
  const vh = window.innerHeight
  const isFixed = getComputedStyle(el).position === 'fixed'

  // --- vertical ---
  if (rect.bottom > vh) {
    if (isFixed) {
      el.style.top = `${Math.max(0, vh - rect.height)}px`
    } else {
      // Flip from below trigger to above trigger
      el.style.top = 'auto'
      el.style.bottom = 'calc(100% + 0.375rem)'
    }
  }
  if (rect.top < 0) {
    if (isFixed) {
      el.style.top = '0px'
    } else {
      el.style.bottom = 'auto'
      el.style.top = 'calc(100% + 0.375rem)'
    }
  }

  // --- horizontal ---
  const rect2 = el.getBoundingClientRect()
  if (rect2.right > vw) {
    if (isFixed) {
      el.style.left = `${Math.max(0, vw - rect2.width)}px`
    } else {
      el.style.left = 'auto'
      el.style.right = '0'
    }
  }
  if (rect2.left < 0) {
    if (isFixed) {
      el.style.left = '0px'
    } else {
      el.style.right = 'auto'
      el.style.left = '0'
    }
  }
}
