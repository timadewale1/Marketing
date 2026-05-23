"use client";

const memoryCache = new Map<string, string>();

function getStorage() {
  if (typeof window === "undefined") return null;
  try {
    if (typeof window.localStorage !== "undefined") {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access failures and fall back to memory.
  }
  return null;
}

export function readSessionPageCache<T>(key: string): T | null {
  try {
    const storage = getStorage();
    const raw = storage ? storage.getItem(key) : memoryCache.get(key);
    if (!raw) return null;
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeSessionPageCache<T>(key: string, value: T) {
  try {
    const raw = JSON.stringify(value);
    memoryCache.set(key, raw);
    const storage = getStorage();
    if (storage) {
      storage.setItem(key, raw);
    }
  } catch {
    // Ignore cache write failures and continue with live data.
  }
}

export function removeSessionPageCache(key: string) {
  memoryCache.delete(key);
  const storage = getStorage();
  if (storage) {
    storage.removeItem(key);
  }
}

export function clearSessionPageCacheByPrefix(prefix: string) {
  for (const key of Array.from(memoryCache.keys())) {
    if (key.startsWith(prefix)) {
      memoryCache.delete(key);
    }
  }

  const storage = getStorage();
  if (!storage) return;

  const keysToDelete: string[] = [];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (key && key.startsWith(prefix)) {
      keysToDelete.push(key);
    }
  }

  keysToDelete.forEach((key) => storage.removeItem(key));
}
