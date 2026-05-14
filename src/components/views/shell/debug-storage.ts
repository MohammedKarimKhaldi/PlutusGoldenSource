import type { DebugDraft } from "@/lib/crm-types";

const DB_NAME = "golden-source-debug";
const STORE_NAME = "drafts";
const RECORD_KEY = "current";
const FALLBACK_KEY = "golden-source-debug-draft";

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === "undefined" || !("indexedDB" in window)) {
      reject(new Error("IndexedDB is not available."));
      return;
    }
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Failed to open IndexedDB."));
  });
}

export async function readDebugDraft() {
  if (typeof window === "undefined") return null;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    try {
      const database = await openDatabase();
      const result = await new Promise<DebugDraft | null>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readonly");
        const store = transaction.objectStore(STORE_NAME);
        const request = store.get(RECORD_KEY);
        request.onsuccess = () => resolve((request.result as DebugDraft | undefined) ?? null);
        request.onerror = () => reject(request.error ?? new Error("Failed to read debug draft."));
        transaction.oncomplete = () => database.close();
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to read debug draft."));
      });
      if (result) return result;
    } catch {
      // Fall back to localStorage.
    }
  }

  const rawDraft = fallbackStorage.getItem(FALLBACK_KEY);
  if (!rawDraft) return null;
  try {
    return JSON.parse(rawDraft) as DebugDraft;
  } catch {
    return null;
  }
}

export async function writeDebugDraft(draft: DebugDraft) {
  if (typeof window === "undefined") return;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    const database = await openDatabase();
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(draft, RECORD_KEY);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => reject(transaction.error ?? new Error("Failed to save debug draft."));
    });
    fallbackStorage.removeItem(FALLBACK_KEY);
    return;
  }

  fallbackStorage.setItem(FALLBACK_KEY, JSON.stringify(draft));
}

export async function clearDebugDraft() {
  if (typeof window === "undefined") return;
  const fallbackStorage = window.localStorage;

  if ("indexedDB" in window) {
    try {
      const database = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const transaction = database.transaction(STORE_NAME, "readwrite");
        const store = transaction.objectStore(STORE_NAME);
        store.delete(RECORD_KEY);
        transaction.oncomplete = () => {
          database.close();
          resolve();
        };
        transaction.onerror = () => reject(transaction.error ?? new Error("Failed to clear debug draft."));
      });
    } catch {
      // Ignore and still clear localStorage.
    }
  }

  fallbackStorage.removeItem(FALLBACK_KEY);
}
