type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function getStorage(kind: "localStorage" | "sessionStorage"): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window[kind] ?? null;
  } catch {
    return null;
  }
}

function createSafeStorage(kind: "localStorage" | "sessionStorage"): StorageLike {
  return {
    getItem(key: string) {
      try {
        return getStorage(kind)?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    setItem(key: string, value: string) {
      try {
        getStorage(kind)?.setItem(key, value);
      } catch {
        // Android WebView can throw when storage is temporarily unavailable.
      }
    },
    removeItem(key: string) {
      try {
        getStorage(kind)?.removeItem(key);
      } catch {
        // Ignore storage cleanup failures.
      }
    },
  };
}

export const safeLocalStorage = createSafeStorage("localStorage");
export const safeSessionStorage = createSafeStorage("sessionStorage");