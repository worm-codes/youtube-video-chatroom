const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
const statusEl = document.getElementById('popup-status');
const contentEl = document.getElementById('popup-content');
const chatFrame = document.getElementById('chat-frame');
const openTabButton = document.getElementById('open-tab');

function setStatus(text, { variant = 'info' } = {}) {
  statusEl.textContent = text;
  statusEl.classList.toggle('status--error', variant === 'error');
}

function showContent() {
  contentEl.hidden = false;
}

function extractVideoId(url) {
  try {
    const currentUrl = new URL(url);
    if (currentUrl.searchParams.has('v')) {
      return currentUrl.searchParams.get('v');
    }
    const parts = currentUrl.pathname.split('/').filter(Boolean);
    if (parts[0] === 'shorts' || parts[0] === 'live') {
      return parts[1] ?? null;
    }
    if (currentUrl.pathname.startsWith('/embed/')) {
      return parts[1] ?? null;
    }
    return null;
  } catch (error) {
    console.warn('[YTVC] URL parse failed', error);
    return null;
  }
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
        return;
      }
      resolve(tabs?.[0] ?? null);
    });
  });
}

async function getVideoForTab(tab) {
  if (!tab) return { videoId: null, tabId: null };
  const parsed = extractVideoId(tab.url ?? '');
  if (parsed) return { videoId: parsed, tabId: tab.id ?? null };

  try {
    const response = await chrome.runtime.sendMessage({
      type: 'GET_VIDEO_FOR_TAB',
      tabId: tab.id
    });
    return { videoId: response?.videoId ?? null, tabId: tab.id ?? null };
  } catch (error) {
    console.warn('[YTVC] Tab video fetch failed', error);
    return { videoId: null, tabId: tab.id ?? null };
  }
}

function postVideoToFrame(videoId) {
  console.log('[YTVC Popup] postVideoToFrame:', videoId, 'iframe:', !!chatFrame, 'contentWindow:', !!chatFrame?.contentWindow, 'extension origin:', EXTENSION_ORIGIN);
  if (!chatFrame?.contentWindow) {
    console.warn('[YTVC Popup] Chat frame or contentWindow not ready');
    return;
  }
  console.log('[YTVC Popup] Sending video ID to sidebar iframe with origin:', EXTENSION_ORIGIN);
  try {
    chatFrame.contentWindow.postMessage(
      {
        type: 'YTVC_VIDEO_CHANGE',
        videoId
      },
      EXTENSION_ORIGIN
    );
    console.log('[YTVC Popup] Message sent successfully');
  } catch (error) {
    console.error('[YTVC Popup] Failed to send message:', error);
  }
}

async function initPopup() {
  openTabButton?.addEventListener('click', () => {
    chrome.tabs.create({ url: 'https://www.youtube.com' });
  });

  const tab = await getActiveTab();
  const { videoId } = await getVideoForTab(tab);

  if (!videoId) {
    setStatus('Aktif sekme YouTube videosu içermiyor.', { variant: 'error' });
    return;
  }

  setStatus(`Video ID: ${videoId}`);
  showContent();

  if (chatFrame) {
    let retryCount = 0;
    const maxRetries = 5;
    
    const sendVideo = () => {
      console.log('[YTVC Popup] Attempting to send video ID (attempt', retryCount + 1, '):', videoId);
      postVideoToFrame(videoId);
      
      // Retry if sidebar might not be ready yet
      retryCount++;
      if (retryCount < maxRetries) {
        setTimeout(sendVideo, 300);
      }
    };
    
    // Wait for iframe to load and sidebar.js to initialize
    if (chatFrame.contentDocument?.readyState === 'complete') {
      // Iframe already loaded, wait for sidebar.js init
      console.log('[YTVC Popup] Iframe already loaded, waiting for sidebar init...');
      setTimeout(sendVideo, 500); // Longer delay to ensure sidebar.js is ready
    } else {
      // Wait for iframe load
      chatFrame.addEventListener('load', () => {
        console.log('[YTVC Popup] Chat frame loaded, waiting for sidebar init...');
        setTimeout(sendVideo, 500); // Longer delay to ensure sidebar.js is ready
      }, { once: true });
    }
  }
}

initPopup().catch((error) => {
  console.error('[YTVC] Popup init error', error);
  setStatus('Popup başlatılırken hata oluştu.', { variant: 'error' });
});

