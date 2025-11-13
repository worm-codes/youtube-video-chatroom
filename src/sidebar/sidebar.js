import createDOMPurify from 'dompurify';
import { initializeSupabase } from '../lib/supabase-client.js';
import {
  signInWithGoogle,
  signOut as supabaseSignOut,
  getCurrentUser
} from '../lib/auth.js';
import {
  getVideoByYoutubeId,
  ensureVideoRecord,
  fetchRecentMessages,
  subscribeToMessages,
  getMembership,
  joinRoom,
  leaveRoom,
  insertMessage,
  getProfile
} from '../shared/chat-service.js';
import {
  MESSAGE_RATE_LIMIT_WINDOW_MS,
  MESSAGE_FETCH_LIMIT
} from '../lib/config.js';

const DOMPurify = createDOMPurify(window);
const EXTENSION_ORIGIN = `chrome-extension://${chrome.runtime.id}`;
const statusBanner = document.getElementById('status-banner');
const authSection = document.getElementById('auth-section');
const membershipSection = document.getElementById('membership-section');
const messagesSection = document.getElementById('messages-section');
const messageForm = document.getElementById('message-form');
const messageInput = document.getElementById('message-input');
const messagesList = document.getElementById('messages-list');
const messageTemplate = document.getElementById('message-template');
const googleSignInBtn = document.getElementById('google-signin');
const joinButton = document.getElementById('join-room');
const leaveButton = document.getElementById('leave-room');
const sendButton = document.getElementById('send-button');
const signOutButton = document.getElementById('signout-button');
const profileAvatar = document.getElementById('profile-avatar');
const profileName = document.getElementById('profile-name');
const profileUsername = document.getElementById('profile-username');
const videoLabel = document.getElementById('video-label');

const timeFormatter = new Intl.DateTimeFormat('tr-TR', {
  hour: '2-digit',
  minute: '2-digit'
});

const state = {
  user: null,
  profile: null,
  videoId: null,
  videoRecord: null,
  membership: null,
  subscription: null,
  messages: [],
  messageIndex: new Map(),
  isJoining: false,
  isSending: false,
  lastMessageAt: 0
};

const profileCache = new Map();

function show(element) {
  if (!element) return;
  element.hidden = false;
}

function hide(element) {
  if (!element) return;
  element.hidden = true;
}

let statusTimeout = null;
function setStatus(message, { variant = 'info', timeout = 4000 } = {}) {
  if (!statusBanner) return;
  if (!message) {
    hide(statusBanner);
    if (statusTimeout) {
      clearTimeout(statusTimeout);
      statusTimeout = null;
    }
    return;
  }
  statusBanner.textContent = message;
  statusBanner.classList.toggle('status--error', variant === 'error');
  statusBanner.classList.toggle('status--success', variant === 'success');
  show(statusBanner);
  if (statusTimeout) {
    clearTimeout(statusTimeout);
  }
  if (timeout) {
    statusTimeout = setTimeout(() => {
      hide(statusBanner);
      statusTimeout = null;
    }, timeout);
  }
}

function resetMessagesUI() {
  state.messages = [];
  state.messageIndex.clear();
  messagesList.innerHTML = '';
}

function ensureMessagesEmptyPlaceholder() {
  if (state.messages.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'messages__empty';
    empty.textContent = 'Bu video için henüz mesaj yok. İlk mesajı sen gönder!';
    messagesList.appendChild(empty);
  }
}

function createMessageElement(message) {
  const fragment = messageTemplate.content.cloneNode(true);
  const avatarEl = fragment.querySelector('.message__avatar');
  const authorEl = fragment.querySelector('.message__author');
  const timeEl = fragment.querySelector('.message__time');
  const textEl = fragment.querySelector('.message__text');

  const profile = message.profile ?? {};
  const displayName =
    profile.displayName ||
    profile.youtubeUsername ||
    message.username ||
    'Anonim';

  if (avatarEl) {
    avatarEl.innerHTML = '';
    if (profile.avatarUrl) {
      const img = document.createElement('img');
      img.src = profile.avatarUrl;
      img.alt = displayName;
      img.width = 36;
      img.height = 36;
      avatarEl.appendChild(img);
    } else {
      avatarEl.textContent = displayName.substring(0, 1).toUpperCase();
    }
  }

  if (authorEl) {
    authorEl.textContent = displayName;
  }

  if (timeEl) {
    const date = new Date(message.createdAt);
    timeEl.textContent = timeFormatter.format(date);
  }

  if (textEl) {
    const sanitized = DOMPurify.sanitize(message.message, {
      ALLOWED_TAGS: [],
      ALLOWED_ATTR: []
    });
    textEl.innerHTML = sanitized.replace(/\n/g, '<br />');
  }

  return fragment;
}

function renderMessages() {
  messagesList.innerHTML = '';
  if (state.messages.length === 0) {
    ensureMessagesEmptyPlaceholder();
    return;
  }
  const sorted = [...state.messages].sort(
    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
  );
  sorted.forEach((message) => {
    const element = createMessageElement(message);
    messagesList.appendChild(element);
  });
  scrollToBottom(true);
}

function appendMessage(message, { scroll = true } = {}) {
  if (state.messageIndex.has(message.id)) return;
  state.messages.push(message);
  state.messageIndex.set(message.id, true);

  const placeholder = messagesList.querySelector('.messages__empty');
  if (placeholder) {
    placeholder.remove();
  }

  const shouldScroll = scroll ? isNearBottom() : false;
  const element = createMessageElement(message);
  messagesList.appendChild(element);
  if (shouldScroll) {
    scrollToBottom();
  }
}

function isNearBottom() {
  const threshold = 160;
  return (
    messagesList.scrollHeight - messagesList.scrollTop - messagesList.clientHeight <
    threshold
  );
}

function scrollToBottom(force = false) {
  if (!force && !isNearBottom()) return;
  messagesList.scrollTop = messagesList.scrollHeight;
}

function updateAuthUI() {
  if (state.user) {
    hide(authSection);
    show(membershipSection);
    show(signOutButton);
  } else {
    show(authSection);
    hide(membershipSection);
    hide(signOutButton);
    hide(messageForm);
  }
}

function updateProfileUI() {
  if (!state.user) {
    profileName.textContent = 'Ziyaretçi';
    profileUsername.textContent = '';
    profileAvatar.style.visibility = 'hidden';
    return;
  }

  const metadata = state.user.user_metadata ?? {};
  const profile = state.profile ?? {};
  const displayName = profile.display_name || metadata.full_name || 'Kullanıcı';
  const avatarUrl = profile.avatar_url || metadata.avatar_url || null;
  const youtubeUsername = profile.youtube_username || '';

  profileName.textContent = displayName;
  if (youtubeUsername) {
    profileUsername.textContent = `@${youtubeUsername}`;
  } else {
    profileUsername.textContent = '';
  }

  if (avatarUrl) {
    profileAvatar.src = avatarUrl;
    profileAvatar.style.visibility = 'visible';
  } else {
    profileAvatar.removeAttribute('src');
    profileAvatar.style.visibility = 'hidden';
  }
}

function updateMembershipUI() {
  const hasMembership = Boolean(state.membership);
  joinButton.hidden = hasMembership;
  leaveButton.hidden = !hasMembership;
  sendButton.disabled = !hasMembership || state.isSending;
  messageInput.disabled = !hasMembership;

  if (state.videoRecord) {
    show(messagesSection);
  } else {
    hide(messagesSection);
  }

  if (hasMembership) {
    show(messageForm);
  } else {
    hide(messageForm);
  }
}

async function hydrateProfile(userId, fallbackProfile) {
  if (!userId) return fallbackProfile ?? null;
  if (profileCache.has(userId)) {
    return profileCache.get(userId);
  }
  if (fallbackProfile) {
    profileCache.set(userId, fallbackProfile);
    return fallbackProfile;
  }
  try {
    const profile = await getProfile(userId);
    if (profile) {
      profileCache.set(userId, profile);
    }
    return profile ?? null;
  } catch (error) {
    console.error('[YTVC] Profil alınamadı', error);
    return fallbackProfile ?? null;
  }
}

async function hydrateMessage(row) {
  const profile = await hydrateProfile(
    row.user_id,
    row.user_profiles
      ? {
          display_name: row.user_profiles.displayName ?? row.user_profiles.display_name,
          avatar_url: row.user_profiles.avatarUrl ?? row.user_profiles.avatar_url,
          youtube_username:
            row.user_profiles.youtubeUsername ?? row.user_profiles.youtube_username
        }
      : null
  );

  let normalizedProfile = null;
  if (profile) {
    normalizedProfile = {
      displayName: profile.display_name ?? profile.displayName ?? null,
      avatarUrl: profile.avatar_url ?? profile.avatarUrl ?? null,
      youtubeUsername: profile.youtube_username ?? profile.youtubeUsername ?? null
    };
  }

  return {
    id: row.id,
    message: row.message,
    createdAt: row.created_at,
    userId: row.user_id,
    profile: normalizedProfile
  };
}

async function refreshMembership() {
  if (!state.user || !state.videoRecord) {
    state.membership = null;
    updateMembershipUI();
    return;
  }
  try {
    state.membership = await getMembership(state.videoRecord.id);
    // Auto-join if user is logged in but not a member
    if (!state.membership && state.user && state.videoRecord) {
      console.log('[YTVC] Auto-joining room for user:', state.user.id);
      try {
        state.membership = await joinRoom(state.videoRecord.id);
        console.log('[YTVC] Auto-joined room successfully');
      } catch (error) {
        console.error('[YTVC] Auto-join failed:', error);
        // Don't show error to user, just leave membership as null
      }
    }
  } catch (error) {
    console.error('[YTVC] membership alınamadı', error);
    state.membership = null;
  }
  updateMembershipUI();
}

async function loadProfile() {
  if (!state.user) {
    state.profile = null;
    updateProfileUI();
    return;
  }
  try {
    state.profile = await getProfile(state.user.id);
  } catch (error) {
    console.error('[YTVC] profil alınamadı', error);
    state.profile = null;
  }
  updateProfileUI();
}

async function loadMessages(videoRecord) {
  if (!videoRecord) {
    resetMessagesUI();
    updateMembershipUI();
    return;
  }
  try {
    const rows = await fetchRecentMessages(videoRecord.id, {
      limit: MESSAGE_FETCH_LIMIT
    });
    resetMessagesUI();
    rows
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
      .forEach((message) => {
        if (!message.profile) {
          profileCache.delete(message.userId);
        }
        appendMessage(message, { scroll: false });
      });
    if (state.messages.length === 0) {
      ensureMessagesEmptyPlaceholder();
    } else {
      scrollToBottom(true);
    }
  } catch (error) {
    console.error('[YTVC] Mesajlar alınamadı', error);
    setStatus('Mesajlar yüklenemedi.', { variant: 'error' });
  }
}

async function subscribe(videoRecord) {
  if (state.subscription) {
    console.log('[YTVC] Unsubscribing from previous channel');
    await state.subscription.unsubscribe();
    state.subscription = null;
  }
  if (!videoRecord) {
    console.log('[YTVC] No video record, skipping subscription');
    return;
  }
  console.log('[YTVC] Subscribing to messages for video:', videoRecord.id);
  try {
    state.subscription = await subscribeToMessages(videoRecord.id, {
      onInsert: async (row) => {
        console.log('[YTVC] New message received via realtime:', row);
        const message = await hydrateMessage(row);
        appendMessage(message);
      },
      onUpdate: async (row) => {
        console.log('[YTVC] Message updated via realtime:', row);
        const message = await hydrateMessage(row);
        if (!state.messageIndex.has(message.id)) {
          appendMessage(message);
          return;
        }
        state.messages = state.messages.map((existing) =>
          existing.id === message.id ? message : existing
        );
        renderMessages();
      },
      onDelete: (row) => {
        console.log('[YTVC] Message deleted via realtime:', row);
        if (!state.messageIndex.has(row.id)) return;
        state.messages = state.messages.filter((message) => message.id !== row.id);
        state.messageIndex.delete(row.id);
        renderMessages();
      }
    });
    console.log('[YTVC] Subscription created successfully');
  } catch (error) {
    console.error('[YTVC] Failed to subscribe to messages:', error);
    setStatus('Gerçek zamanlı mesajlaşma bağlantısı kurulamadı.', { variant: 'error' });
  }
}

async function handleVideoChange(youtubeVideoId) {
  console.log('[YTVC] handleVideoChange called with:', youtubeVideoId, 'current state.videoId:', state.videoId);
  if (youtubeVideoId === state.videoId) {
    console.log('[YTVC] Same video ID, skipping');
    return;
  }

  console.log('[YTVC] Setting new video ID:', youtubeVideoId);
  state.videoId = youtubeVideoId;
  state.videoRecord = null;
  profileCache.clear();
  resetMessagesUI();
  setStatus(null);

  if (!youtubeVideoId) {
    console.log('[YTVC] No video ID provided');
    videoLabel.textContent = 'Video seçilmedi';
    await subscribe(null);
    await refreshMembership();
    return;
  }

  videoLabel.textContent = `Video ID: ${youtubeVideoId}`;
  console.log('[YTVC] Video label updated, loading video record...');

  let record = null;
  try {
    record = await getVideoByYoutubeId(youtubeVideoId);
    if (!record && state.user) {
      record = await ensureVideoRecord(youtubeVideoId);
    }
  } catch (error) {
    console.error('[YTVC] Video kaydı alınamadı', error);
    setStatus('Video bilgileri yüklenemedi.', { variant: 'error' });
  }

  state.videoRecord = record;

  await loadMessages(record);
  await subscribe(record);
  await refreshMembership();
}

async function updateAuthState() {
  await initializeSupabase();
  const user = await getCurrentUser();
  state.user = user;
  await loadProfile();
  updateAuthUI();
  await refreshMembership();
}

async function handleSignIn() {
  googleSignInBtn.disabled = true;
  setStatus('Google ile oturum açılıyor…', { variant: 'info', timeout: null });
  try {
    await signInWithGoogle();
    await updateAuthState();
    setStatus('Giriş başarılı.', { variant: 'success' });
    if (state.videoRecord) {
      await refreshMembership();
    } else if (state.videoId) {
      await handleVideoChange(state.videoId);
    }
  } catch (error) {
    console.error('[YTVC] Giriş başarısız', error);
    setStatus(error.message || 'Giriş başarısız oldu.', { variant: 'error' });
  } finally {
    googleSignInBtn.disabled = false;
  }
}

async function handleSignOut() {
  try {
    await supabaseSignOut();
    state.user = null;
    state.profile = null;
    state.membership = null;
    updateAuthUI();
    updateProfileUI();
    updateMembershipUI();
    setStatus('Çıkış yapıldı.', { variant: 'success' });
  } catch (error) {
    console.error('[YTVC] Çıkış başarısız', error);
    setStatus('Çıkış yapılamadı.', { variant: 'error' });
  }
}

async function handleJoin() {
  console.log('[YTVC] handleJoin called, state:', { user: !!state.user, videoId: state.videoId, videoRecord: !!state.videoRecord });
  if (!state.user) {
    setStatus('Sohbete katılmak için önce giriş yapın.', { variant: 'error' });
    return;
  }
  if (!state.videoId) {
    console.error('[YTVC] handleJoin: state.videoId is null!');
    setStatus('Video bulunamadı.', { variant: 'error' });
    return;
  }
  if (state.isJoining) return;
  state.isJoining = true;
  joinButton.disabled = true;
  setStatus('Odaya katılınıyor…', { variant: 'info', timeout: null });
  try {
    if (!state.videoRecord) {
      console.log('[YTVC] Video kaydı oluşturuluyor:', state.videoId);
      state.videoRecord = await ensureVideoRecord(state.videoId);
      console.log('[YTVC] Video kaydı oluşturuldu:', state.videoRecord);
    }
    state.membership = await joinRoom(state.videoRecord.id);
    updateMembershipUI();
    setStatus('Sohbete katıldınız!', { variant: 'success' });
  } catch (error) {
    console.error('[YTVC] Odaya katılma hatası', error);
    setStatus(error.message || 'Odaya katılamadınız.', { variant: 'error' });
  } finally {
    state.isJoining = false;
    joinButton.disabled = false;
  }
}

async function handleLeave() {
  if (!state.membership || !state.videoRecord) return;
  leaveButton.disabled = true;
  setStatus('Odadan çıkılıyor…', { variant: 'info', timeout: null });
  try {
    await leaveRoom(state.videoRecord.id);
    state.membership = null;
    updateMembershipUI();
    setStatus('Sohbetten ayrıldınız.', { variant: 'success' });
  } catch (error) {
    console.error('[YTVC] Odadan çıkma hatası', error);
    setStatus('Odadan çıkarken hata oluştu.', { variant: 'error' });
  } finally {
    leaveButton.disabled = false;
  }
}

async function handleSendMessage(event) {
  event.preventDefault();
  if (!state.membership || !state.videoRecord) {
    setStatus('Önce sohbete katılın.', { variant: 'error' });
    return;
  }
  const raw = messageInput.value.trim();
  if (!raw) {
    setStatus('Boş mesaj gönderemezsiniz.', { variant: 'error' });
    return;
  }
  const now = Date.now();
  if (now - state.lastMessageAt < MESSAGE_RATE_LIMIT_WINDOW_MS) {
    setStatus('Biraz yavaş. Lütfen birkaç saniye bekleyin.', { variant: 'error' });
    return;
  }
  state.isSending = true;
  sendButton.disabled = true;
  messageInput.disabled = true;
  const previousValue = messageInput.value;
  messageInput.value = '';
  try {
    const message = await insertMessage(state.videoRecord.id, raw);
    state.lastMessageAt = Date.now();
    appendMessage(message);
    setStatus(null);
  } catch (error) {
    console.error('[YTVC] Mesaj gönderme hatası', error);
    messageInput.value = previousValue;
    setStatus(error.message || 'Mesaj gönderilemedi.', { variant: 'error' });
  } finally {
    state.isSending = false;
    messageInput.disabled = false;
    sendButton.disabled = !state.membership;
    messageInput.focus();
  }
}

function setupEventListeners() {
  googleSignInBtn?.addEventListener('click', handleSignIn);
  joinButton?.addEventListener('click', handleJoin);
  leaveButton?.addEventListener('click', handleLeave);
  signOutButton?.addEventListener('click', handleSignOut);
  messageForm?.addEventListener('submit', handleSendMessage);

  window.addEventListener('message', (event) => {
    console.log('[YTVC] Message received:', event.origin, 'expected:', EXTENSION_ORIGIN, 'data:', event.data);
    // Accept messages from extension origin (popup or content script)
    if (event.origin !== EXTENSION_ORIGIN) {
      console.warn('[YTVC] Origin mismatch:', event.origin, 'expected:', EXTENSION_ORIGIN);
      return;
    }
    if (event.data?.type === 'YTVC_VIDEO_CHANGE') {
      console.log('[YTVC] Video change received:', event.data.videoId);
      handleVideoChange(event.data.videoId);
    } else {
      console.warn('[YTVC] Unknown message type:', event.data?.type);
    }
  });
}

async function init() {
  console.log('[YTVC] Sidebar init started');
  await initializeSupabase();
  console.log('[YTVC] Supabase initialized');
  await updateAuthState();
  console.log('[YTVC] Auth state updated');
  setupEventListeners();
  console.log('[YTVC] Event listeners setup complete, waiting for video ID...');
  setStatus('YouTube videosu bekleniyor…', { timeout: 3000 });
}

init().catch((error) => {
  console.error('[YTVC] Sidebar init hatası', error);
  setStatus('Eklenti başlatılırken hata oluştu.', { variant: 'error' });
});

