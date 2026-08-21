// The store-miss bridge for construct models (G3, design §4): a viewer that finds a hash absent
// from the local store calls requestModel(); whatever transport the surface wired (the catalogue's
// broadcast REQUEST_MODEL, or nothing on a GM machine, where the store is the source of truth)
// fetches it, and modelArrived() wakes every waiting viewer to retry its load. Decoupled so
// ConstructModelGraphic needs no knowledge of the broadcast layer.
type Waiter = () => void;

let fetcher: ((hash: string) => void) | null = null;
const waiting = new Map<string, Set<Waiter>>();
const inFlight = new Set<string>();

/** Wired once per surface (the catalogue sets a broadcast requester). Null tears it down. */
export function setModelFetcher(f: ((hash: string) => void) | null): void {
  fetcher = f;
  if (f) for (const hash of waiting.keys()) if (!inFlight.has(hash)) { inFlight.add(hash); f(hash); }
}

/** Ask for a model by hash; onArrive fires when it lands in the store. Returns an unsubscribe. */
export function requestModel(hash: string, onArrive: Waiter): () => void {
  let set = waiting.get(hash);
  if (!set) { set = new Set(); waiting.set(hash, set); }
  set.add(onArrive);
  if (fetcher && !inFlight.has(hash)) { inFlight.add(hash); fetcher(hash); }
  return () => {
    const s = waiting.get(hash);
    if (s) { s.delete(onArrive); if (!s.size) { waiting.delete(hash); inFlight.delete(hash); } }
  };
}

/** Called by the transport when the binary has been stored locally. */
export function modelArrived(hash: string): void {
  inFlight.delete(hash);
  const set = waiting.get(hash);
  if (!set) return;
  waiting.delete(hash);
  for (const w of [...set]) { try { w(); } catch { /* one bad waiter must not sink the rest */ } }
}
