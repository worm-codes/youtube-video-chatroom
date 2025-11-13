const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
const SIDEBAR_CONTAINER_ID = 'ytvc-sidebar-root';
const SIDEBAR_IFRAME_ID = 'ytvc-sidebar-iframe';
const SIDEBAR_WIDTH = 360;

let currentVideoId = null;
let sidebarIframe = null;
let sidebarContainer = null;
let styleElement = null;

function injectStyles() {
  if (styleElement) return;
  styleElement = document.createElement('style');
  styleElement.id = 'ytvc-sidebar-styles';
  styleElement.textContent = `
    body.ytvc-sidebar-open {
      margin-right: ${SIDEBAR_WIDTH}px !important;
    }

    #${SIDEBAR_CONTAINER_ID} {
      position: fixed;
      top: 0;
      right: 0;
      width: ${SIDEBAR_WIDTH}px;
      height: 100vh;
      background: #0f0f0f;
      border-left: 1px solid rgba(255, 255, 255, 0.08);
      box-shadow: rgba(0, 0, 0, 0.45) 0 0 24px;
      z-index: 2147483646;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    #${SIDEBAR_IFRAME_ID} {
      width: 100%;
      height: 100%;
      border: none;
      background: transparent;
    }

    body.ytvc-sidebar-open #movie_player {
      max-width: calc(100% - ${SIDEBAR_WIDTH}px);
    }
  `;
  document.head.appendChild(styleElement);
}

function createSidebar() {
  if (sidebarContainer && sidebarIframe) {
    return;
  }

  injectStyles();

  sidebarContainer = document.getElementById(SIDEBAR_CONTAINER_ID);
  if (!sidebarContainer) {
    sidebarContainer = document.createElement('div');
    sidebarContainer.id = SIDEBAR_CONTAINER_ID;
    document.body.appendChild(sidebarContainer);
  }

  sidebarIframe = document.getElementById(SIDEBAR_IFRAME_ID);
  if (!sidebarIframe) {
    sidebarIframe = document.createElement('iframe');
    sidebarIframe.id = SIDEBAR_IFRAME_ID;
    sidebarIframe.src = chrome.runtime.getURL('sidebar/sidebar.html');
    sidebarIframe.addEventListener('load', () => {
      if (currentVideoId) {
        postVideoIdToSidebar(currentVideoId);
      }
    });
    sidebarContainer.appendChild(sidebarIframe);
  }

  document.body.classList.add('ytvc-sidebar-open');
}

function destroySidebar() {
  document.body.classList.remove('ytvc-sidebar-open');
  if (sidebarIframe) {
    sidebarIframe.remove();
    sidebarIframe = null;
  }
  if (sidebarContainer) {
    sidebarContainer.remove();
    sidebarContainer = null;
  }
  if (styleElement) {
    styleElement.remove();
    styleElement = null;
  }
}

function postVideoIdToSidebar(videoId) {
  console.log('[YTVC Content] postVideoIdToSidebar:', videoId, 'iframe:', !!sidebarIframe, 'contentWindow:', !!sidebarIframe?.contentWindow);
  if (!sidebarIframe?.contentWindow) {
    console.warn('[YTVC Content] Sidebar iframe or contentWindow not ready');
    return;
  }
  console.log('[YTVC Content] Sending video ID to sidebar');
  sidebarIframe.contentWindow.postMessage(
    {
      type: 'YTVC_VIDEO_CHANGE',
      videoId
    },
    '*'
  );
}

function notifyBackground(videoId) {
  chrome.runtime.sendMessage({
    type: 'VIDEO_UPDATE',
    videoId
  });
}

function extractVideoId(url) {
  try {
    const currentUrl = new URL(url ?? window.location.href, window.location.origin);

    if (currentUrl.searchParams.has('v')) {
      return currentUrl.searchParams.get('v');
    }

    const pathParts = currentUrl.pathname.split('/').filter(Boolean);

    if (pathParts[0] === 'shorts' || pathParts[0] === 'live') {
      return pathParts[1] ?? null;
    }

    if (currentUrl.pathname.startsWith('/embed/')) {
      return pathParts[1] ?? null;
    }

    return null;
  } catch (error) {
    console.warn('[YTVC] Failed to parse video id', error);
    return null;
  }
}

function handleVideoChange() {
  const videoId = extractVideoId();
  console.log('[YTVC Content] handleVideoChange:', videoId);

  if (!videoId) {
    console.log('[YTVC Content] No video ID found, destroying sidebar');
    currentVideoId = null;
    notifyBackground(null);
    // destroySidebar(); // TODO: Sidebar disabled for now, using popup instead
    return;
  }

  if (videoId === currentVideoId) {
    console.log('[YTVC Content] Same video ID, skipping');
    return;
  }

  console.log('[YTVC Content] New video detected:', videoId);
  currentVideoId = videoId;
  // createSidebar(); // TODO: Sidebar disabled for now, using popup instead
  // postVideoIdToSidebar(videoId); // TODO: Sidebar disabled for now, using popup instead
  notifyBackground(videoId);
}

function observeNavigation() {
  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = function (...args) {
    originalPushState.apply(this, args);
    setTimeout(handleVideoChange, 250);
  };
  history.replaceState = function (...args) {
    originalReplaceState.apply(this, args);
    setTimeout(handleVideoChange, 250);
  };

  window.addEventListener('popstate', () => {
    setTimeout(handleVideoChange, 250);
  });
  window.addEventListener('yt-navigate-finish', () => {
    setTimeout(handleVideoChange, 250);
  });
}

function initialize() {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', handleVideoChange);
  } else {
    handleVideoChange();
  }
  observeNavigation();
}

initialize();

