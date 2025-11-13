const STORAGE_KEY = 'ytvc_supabase_session';

function promisify(method, ...args) {
  return new Promise((resolve, reject) => {
    try {
      method.call(chrome.storage.local, ...args, (result) => {
        const err = chrome.runtime.lastError;
        if (err) {
          reject(err);
        } else {
          resolve(result);
        }
      });
    } catch (error) {
      reject(error);
    }
  });
}

export async function getSessionFromStorage() {
  if (!chrome?.storage?.local) return null;
  const data = await promisify(chrome.storage.local.get, STORAGE_KEY);
  return data?.[STORAGE_KEY] ?? null;
}

export async function setSessionInStorage(session) {
  if (!chrome?.storage?.local) return;
  await promisify(chrome.storage.local.set, {
    [STORAGE_KEY]: session
  });
}

export async function clearSessionInStorage() {
  if (!chrome?.storage?.local) return;
  await promisify(chrome.storage.local.remove, STORAGE_KEY);
}

