const PREFIX = "lov-draft:";
const timers = new Map<string, number>();

export function loadDraft<T>(key: string): T | null {
  try {
    const raw = localStorage.getItem(PREFIX + key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

/** Debounced (500ms) localStorage write keyed by `key`. */
export function saveDraft<T>(key: string, value: T): void {
  const fullKey = PREFIX + key;
  const prev = timers.get(fullKey);
  if (prev !== undefined) window.clearTimeout(prev);
  const id = window.setTimeout(() => {
    try {
      localStorage.setItem(fullKey, JSON.stringify(value));
    } catch {
      // quota or serialization — ignore silently
    }
    timers.delete(fullKey);
  }, 500);
  timers.set(fullKey, id);
}

export function clearDraft(key: string): void {
  const fullKey = PREFIX + key;
  const prev = timers.get(fullKey);
  if (prev !== undefined) {
    window.clearTimeout(prev);
    timers.delete(fullKey);
  }
  try {
    localStorage.removeItem(fullKey);
  } catch {
    // ignore
  }
}