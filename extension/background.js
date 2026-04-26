// Service worker — relays action clicks to the content script on the active tab

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url || !tab.url.includes('ultimate-guitar.com')) return

  try {
    await chrome.tabs.sendMessage(tab.id, { action: 'import' })
  } catch {
    // Content script not ready (page loaded before install) — inject on demand
    try {
      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      })
      // Small delay to let the listener register, then retry
      setTimeout(() => chrome.tabs.sendMessage(tab.id, { action: 'import' }), 100)
    } catch (e) {
      console.error('[LM Extension] Failed to inject content script:', e)
    }
  }
})
