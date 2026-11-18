// IndexedDB wrapper. Every call is wrapped: if storage is unavailable
// (private browsing, eviction, a blocked open) the app falls back to an
// in-memory store for the rest of the visit and says so. See SPEC.md §3.3, §13.

const DB_NAME = 'verses';
const DB_VERSION = 1;
export const SCHEMA_VERSION = 1;

const STORES = {
  cards: { keyPath: 'id' },
  verseMeta: { keyPath: 'verseId' },
  sessions: { keyPath: 'id', autoIncrement: true },
  settings: { keyPath: 'key' },
};

let db = null;
let memory = null; // { storeName: Map } when IndexedDB is unavailable
let degradedReason = null;

function newMemory() {
  return Object.fromEntries(Object.keys(STORES).map((name) => [name, new Map()]));
}

function fallBack(reason) {
  console.warn('Storage unavailable, using memory:', reason);
  degradedReason = String(reason?.message ?? reason);
  db = null;
  memory = memory ?? newMemory();
}

function openDb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const d = req.result;
      for (const [name, opts] of Object.entries(STORES)) {
        if (!d.objectStoreNames.contains(name)) d.createObjectStore(name, opts);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('database open blocked'));
  });
}

// Returns { persistent, degraded }. `persistent` is whether the browser
// granted durable storage; `degraded` is a reason string when in memory.
export async function open() {
  try {
    if (!('indexedDB' in globalThis)) throw new Error('IndexedDB not supported');
    db = await openDb();
  } catch (err) {
    fallBack(err);
  }
  let persistent = false;
  try {
    persistent = (await navigator.storage?.persist?.()) ?? false;
  } catch {
    persistent = false;
  }
  return { persistent, degraded: degradedReason };
}

export const isDegraded = () => degradedReason;

function run(storeName, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const result = fn(tx.objectStore(storeName));
    tx.oncomplete = () => resolve(result?.result ?? result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('transaction aborted'));
  });
}

async function withFallback(idbOp, memOp) {
  if (db) {
    try {
      return await idbOp();
    } catch (err) {
      fallBack(err);
    }
  }
  return memOp(memory);
}

const keyOf = (storeName, record) => record[STORES[storeName].keyPath];
let memoryAutoId = 1;

export function getAll(storeName) {
  return withFallback(
    () => run(storeName, 'readonly', (s) => s.getAll()),
    (m) => [...m[storeName].values()].map((r) => structuredClone(r)),
  );
}

export function get(storeName, key) {
  return withFallback(
    () => run(storeName, 'readonly', (s) => s.get(key)),
    (m) => structuredClone(m[storeName].get(key)),
  );
}

export function putAll(storeName, records) {
  return withFallback(
    () => run(storeName, 'readwrite', (s) => { for (const r of records) s.put(r); }),
    (m) => {
      for (const r of records) {
        const rec = structuredClone(r);
        if (STORES[storeName].autoIncrement && rec.id == null) rec.id = memoryAutoId++;
        m[storeName].set(keyOf(storeName, rec), rec);
      }
    },
  );
}

export const put = (storeName, record) => putAll(storeName, [record]);

export function clear(storeName) {
  return withFallback(
    () => run(storeName, 'readwrite', (s) => { s.clear(); }),
    (m) => m[storeName].clear(),
  );
}

// ---------------------------------------------------------------- domain helpers

export const getCards = () => getAll('cards');
export const putCards = (cards) => putAll('cards', cards);
export const getMeta = () => getAll('verseMeta');
export const addSession = (session) => putAll('sessions', [session]);
export const getSessions = () => getAll('sessions');

export async function getSetting(key, fallback = undefined) {
  const rec = await get('settings', key);
  return rec === undefined ? fallback : rec.value;
}

export const setSetting = (key, value) => put('settings', { key, value });

// ---------------------------------------------------------------- export / import

export async function exportAll() {
  const stores = {};
  for (const name of Object.keys(STORES)) stores[name] = await getAll(name);
  return { schema_version: SCHEMA_VERSION, exported_at: new Date().toISOString(), stores };
}

// Replaces all local state. The caller is responsible for the explicit confirm.
export async function importAll(data) {
  if (data?.schema_version !== SCHEMA_VERSION || typeof data.stores !== 'object') {
    throw new Error('Not a recognised export file');
  }
  for (const name of Object.keys(STORES)) {
    await clear(name);
    await putAll(name, data.stores[name] ?? []);
  }
}
