import { initializeSupabase, getSupabaseClient, signOut as supabaseSignOut } from './supabase-client.js';

function getRedirectUrl() {
  if (!chrome?.identity?.getRedirectURL) {
    throw new Error('chrome.identity API is unavailable.');
  }
  return chrome.identity.getRedirectURL('auth/auth.html');
}

async function launchWebAuthFlow(url) {
  return new Promise((resolve, reject) => {
    chrome.identity.launchWebAuthFlow(
      {
        url,
        interactive: true
      },
      (redirectUrl) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        resolve(redirectUrl);
      }
    );
  });
}

export async function signInWithGoogle() {
  await initializeSupabase();
  const supabase = getSupabaseClient();
  const redirectTo = getRedirectUrl();
  
  console.log('[YTVC Auth] Redirect URL:', redirectTo);

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo,
      skipBrowserRedirect: true,
      queryParams: {
        access_type: 'offline',
        prompt: 'consent'
      }
    }
  });

  if (error) {
    console.error('[YTVC Auth] Supabase OAuth error:', error);
    throw error;
  }

  if (!data?.url) {
    throw new Error('OAuth URL alınamadı.');
  }
  
  console.log('[YTVC Auth] OAuth URL:', data.url);

  const finalUrl = await launchWebAuthFlow(data.url);
  if (!finalUrl) {
    throw new Error('OAuth akışı iptal edildi.');
  }

  const url = new URL(finalUrl);
  
  // Check for error in query params
  const errorDescription = url.searchParams.get('error_description');
  if (errorDescription) {
    throw new Error(errorDescription);
  }

  // Parse tokens from URL fragment (Supabase returns tokens directly)
  const fragment = url.hash.substring(1);
  const params = new URLSearchParams(fragment);
  
  const accessToken = params.get('access_token');
  const refreshToken = params.get('refresh_token');
  
  console.log('[YTVC Auth] Received tokens from OAuth');

  if (!accessToken || !refreshToken) {
    console.error('[YTVC Auth] Missing tokens in callback URL');
    throw new Error('OAuth token alınamadı.');
  }

  // Set session with received tokens
  const { data: sessionData, error: sessionError } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken
  });

  if (sessionError) {
    console.error('[YTVC Auth] Session set error:', sessionError);
    throw sessionError;
  }

  console.log('[YTVC Auth] Session set successfully');
  return sessionData.session;
}

export async function signOut() {
  await initializeSupabase();
  await supabaseSignOut();
}

export async function getCurrentUser() {
  await initializeSupabase();
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getUser();
  return data?.user ?? null;
}

export async function getCurrentSession() {
  await initializeSupabase();
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  return data?.session ?? null;
}

