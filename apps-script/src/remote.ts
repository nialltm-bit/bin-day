/**
 * Loads a JSON file from GitHub and keeps it in the script's cache, so the council list can change without redeploying the
 * script. Pure: the network and the cache are passed in, so it can be tested.
 */

export interface Remote {
  /** The text at the address, or null if it couldn't be fetched. Must not throw for ordinary failures. */
  fetchText(url: string): string | null;
  cacheGet(key: string): string | null;
  cachePut(key: string, value: string, seconds: number): void;
}

/** Each cache entry may hold 100 KB, counted in bytes, so cut well below that even for text with accents. */
export const CHUNK_CHARS = 30000;
const MAX_CHUNKS = 30;

function readCache(remote: Remote, key: string): string | null {
  const count = Number(remote.cacheGet(`${key}:n`));
  if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) return null;
  let text = "";
  for (let i = 0; i < count; i++) {
    const part = remote.cacheGet(`${key}:${i}`);
    if (part === null) return null; // one piece expired or went missing: treat the whole thing as missing
    text += part;
  }
  return text;
}

function writeCache(remote: Remote, key: string, text: string, seconds: number): void {
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += CHUNK_CHARS) chunks.push(text.slice(i, i + CHUNK_CHARS));
  if (chunks.length === 0 || chunks.length > MAX_CHUNKS) return;
  chunks.forEach((chunk, i) => remote.cachePut(`${key}:${i}`, chunk, seconds));
  remote.cachePut(`${key}:n`, String(chunks.length), seconds); // last, so a half-written set is never read
}

function tryParse<T>(text: string, parse: (raw: unknown) => T | null): T | null {
  try {
    return parse(JSON.parse(text));
  } catch {
    return null;
  }
}

/**
 * The checked, slimmed file: from the cache if it is there, otherwise fetched from `url`, checked by `parse`, and cached.
 * Null if neither works, in which case the caller keeps what it already has. Only the checked, slimmed result is cached.
 */
export function loadJson<T>(remote: Remote, key: string, url: string, parse: (raw: unknown) => T | null, seconds: number): T | null {
  const cached = readCache(remote, key);
  if (cached !== null) {
    const value = tryParse(cached, (raw) => raw as T);
    if (value !== null) return value;
  }
  const text = remote.fetchText(url);
  if (text === null) return null;
  const value = tryParse(text, parse);
  if (value === null) return null;
  writeCache(remote, key, JSON.stringify(value), seconds);
  return value;
}
