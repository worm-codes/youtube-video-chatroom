import { createClient } from '@supabase/supabase-js';
import {
  SUPABASE_URL,
  SUPABASE_ANON_KEY
} from './config.js';
import {
  getSessionFromStorage,
  setSessionInStorage,
  clearSessionInStorage
} from './storage.js';

console.log('[YTVC Supabase] URL:', SUPABASE_URL);
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    autoRefreshToken: true,
    persistSession: false,
    detectSessionInUrl: false
  }
});

let initialized = false;

async function synchronizeSession(session) {
  if (!session) {
    await clearSessionInStorage();
    return;
  }
  const serialized = {
    ...session,
    expires_at: session.expires_at ?? null
  };
  await setSessionInStorage(serialized);
}

export async function initializeSupabase() {
  if (initialized) return supabase;

  try {
    const storedSession = await getSessionFromStorage();
    if (storedSession) {
      const { data, error } = await supabase.auth.setSession(storedSession);
      if (error && error.message?.includes('JWSError')) {
        await clearSessionInStorage();
      } else if (data?.session) {
        await synchronizeSession(data.session);
      }
    } else {
      const { data } = await supabase.auth.getSession();
      if (data?.session) {
        await synchronizeSession(data.session);
      }
    }
  } catch (error) {
    console.warn('Supabase session restore failed', error);
  }

  supabase.auth.onAuthStateChange(async (_event, session) => {
    await synchronizeSession(session ?? null);
  });

  initialized = true;
  return supabase;
}

export function getSupabaseClient() {
  return supabase;
}

export async function signOut() {
  await supabase.auth.signOut();
  await clearSessionInStorage();
}

