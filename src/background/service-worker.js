const tabVideoMap = new Map();

chrome.runtime.onInstalled.addListener(() => {
  console.log('[YTVC] Service worker installed');
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message?.type) {
    case 'PING': {
      sendResponse({ type: 'PONG' });
      return false;
    }
    case 'VIDEO_UPDATE': {
      const tabId = sender.tab?.id;
      if (tabId != null) {
        if (message.videoId) {
          console.log('[YTVC BG] VIDEO_UPDATE for tab', tabId, ':', message.videoId);
          tabVideoMap.set(tabId, message.videoId);
        } else {
          console.log('[YTVC BG] VIDEO_UPDATE clear for tab', tabId);
          tabVideoMap.delete(tabId);
        }
      }
      return false;
    }
    case 'GET_VIDEO_FOR_TAB': {
      const tabId = message.tabId ?? sender.tab?.id;
      const videoId = tabId != null ? tabVideoMap.get(tabId) ?? null : null;
      console.log('[YTVC BG] GET_VIDEO_FOR_TAB tab', tabId, '-> videoId:', videoId);
      sendResponse({ videoId });
      return false;
    }
    default:
      break;
  }
  return false;
});

chrome.tabs.onRemoved.addListener((tabId) => {
  tabVideoMap.delete(tabId);
});

