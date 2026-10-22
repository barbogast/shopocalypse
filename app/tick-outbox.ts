// Ticks and unticks kept in the browser until the server has them, so ticking
// works with poor reception in the shop. Keyed by list item id; the latest
// tick or untick of an item replaces the earlier one, which is safe because
// both are idempotent.
//
// An entry stays after it's synced, so the row keeps showing it until the next
// load of the list (ticks don't reload the list). That load then drops it.

export type Entry = { bought: boolean; synced: boolean };
export type Entries = Record<number, Entry>;

const STORAGE_KEY = "shopping-outbox";
const EMPTY: Entries = {};

// Cached, so useSyncExternalStore gets the same object until something changes
let cache: Entries | null = null;
const listeners = new Set<() => void>();

function read(): Entries {
  if (cache) return cache;
  try {
    cache = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "{}") as Entries;
  } catch {
    cache = {};
  }
  return cache;
}

function write(entries: Entries) {
  cache = entries;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Without storage the entries last until the page is reloaded
  }
  for (const listener of listeners) listener();
}

export function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const getSnapshot = read;
// Nothing on the server, so hydration matches the server's render
export const getServerSnapshot = () => EMPTY;

export function queue(id: number, bought: boolean) {
  write({ ...read(), [id]: { bought, synced: false } });
}

// Only when the entry is still the one that was sent: a later untick of the
// same item may have replaced it while the tick was on its way
export function markSynced(id: number, bought: boolean) {
  const entries = read();
  if (entries[id]?.bought !== bought || entries[id].synced) return;
  write({ ...entries, [id]: { bought, synced: true } });
}

export function unsynced(entries: Entries) {
  return Object.entries(entries)
    .filter(([, e]) => !e.synced)
    .map(([id, e]) => ({ id: Number(id), bought: e.bought }));
}

// Freshly loaded rows are the truth for everything the server already has
export function settled(entries: Entries, rows: { id: number; bought: boolean }[]): Entries {
  const byId = new Map(rows.map((r) => [r.id, r.bought]));
  return Object.fromEntries(
    Object.entries(entries).filter(([id, e]) => !e.synced && byId.has(Number(id)) && byId.get(Number(id)) !== e.bought),
  );
}

export function settle(rows: { id: number; bought: boolean }[]) {
  const entries = read();
  const next = settled(entries, rows);
  if (Object.keys(next).length !== Object.keys(entries).length) write(next);
}

export function applyEntries<T extends { id: number; bought: boolean }>(rows: T[], entries: Entries): T[] {
  return rows.map((r) => (r.id in entries && entries[r.id].bought !== r.bought ? { ...r, bought: entries[r.id].bought } : r));
}
