/**
 * Per-tab grants.
 *
 * The in-memory map is only a cache. Chrome MV3 service workers are terminated
 * aggressively and Firefox event pages unload too, so the source of truth is
 * extension storage — otherwise a grant silently disappears mid-session and the
 * user gets blocked on a page they legitimately unlocked.
 */

export interface Grant {
  key: string;
  url: string;
  grantedAt: number;
}

const STORAGE_KEY = 'grants';

type GrantMap = Record<number, Grant>;

let cache: GrantMap | null = null;

/**
 * `storage.session` keeps grants out of disk and clears them on browser
 * restart, which is what we want. It is missing on older Firefox for Android
 * builds, so fall back to `local` rather than losing grants entirely.
 */
function area() {
  return browser.storage.session ?? browser.storage.local;
}

async function load(): Promise<GrantMap> {
  if (cache) return cache;
  try {
    const stored = await area().get(STORAGE_KEY);
    cache = (stored?.[STORAGE_KEY] as GrantMap) ?? {};
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(map: GrantMap): Promise<void> {
  cache = map;
  try {
    await area().set({ [STORAGE_KEY]: map });
  } catch {
    // Storage failure degrades to memory-only for this worker lifetime.
  }
}

export async function getGrant(tabId: number): Promise<Grant | null> {
  const map = await load();
  return map[tabId] ?? null;
}

export async function setGrant(tabId: number, key: string, url: string): Promise<void> {
  const map = await load();
  map[tabId] = { key, url, grantedAt: Date.now() };
  await persist(map);
}

export async function clearGrant(tabId: number): Promise<void> {
  const map = await load();
  if (!(tabId in map)) return;
  delete map[tabId];
  await persist(map);
}

/** Test seam — drops the cache so the next read re-hydrates from storage. */
export function resetGrantCache(): void {
  cache = null;
}
