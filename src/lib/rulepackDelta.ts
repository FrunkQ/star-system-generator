// SAVE WHAT THE GM CHANGED, NOT WHAT THEY DIDN'T.
//
// A rule-pack list a GM can edit — morphologies, pigments, and in time liquids and gases — is mostly
// the shipped default. Storing the whole edited list in a campaign has three costs, and only the
// first is obvious:
//
//   1. Size. Seven pigments with their absorption bands is a few kilobytes of mostly-unchanged data
//      in every save, every export and every broadcast snapshot.
//   2. It FREEZES the defaults at the moment of the edit. Change one morphology's opacity and the
//      campaign silently pins its own private copy of all five; every later improvement to the
//      shipped set stops reaching that campaign, and nobody is told.
//   3. A diff of two campaigns cannot show what the GM actually did.
//
// So an override is a DELTA: the keys whose records differ, and within those only the fields that
// differ. Everything untouched keeps tracking the pack.
//
// ORDER IS PART OF THE DELTA, because for morphologies the order IS the hierarchy, and because it is
// also how a DELETION is expressed — a key absent from the order list is a key the GM removed. It is
// stored only when it differs from the base order, so an ordinary field edit does not drag it along.

export interface PackListDelta<T> {
  /** The full ordered key list. Present only when it differs from the base — added, removed or moved. */
  order?: string[];
  /** Per key: only the fields that differ from the base, or the whole record when the key is new. */
  entries?: Record<string, Partial<T>>;
}

/** Shallow field-level difference. Values are compared by their JSON, which is right for the nested
 *  bands, tint arrays and light ranges these records carry. */
function fieldDiff<T extends object>(base: T, edited: T): Partial<T> {
  const out: Partial<T> = {};
  for (const k of Object.keys(edited) as (keyof T)[]) {
    if (JSON.stringify(edited[k]) !== JSON.stringify(base[k])) out[k] = edited[k];
  }
  // A field the GM DELETED from a record is a difference too, and it has to be recorded explicitly
  // or the merge below would restore it from the base.
  for (const k of Object.keys(base) as (keyof T)[]) {
    if (!(k in (edited as object))) out[k] = undefined as T[keyof T];
  }
  return out;
}

/**
 * What changed, and nothing else. Returns undefined when the edited list is identical to the base,
 * so a caller can drop the override entirely rather than storing an empty object.
 */
export function makeListDelta<T extends object>(
  base: T[], edited: T[], keyOf: (item: T) => string
): PackListDelta<T> | undefined {
  const baseByKey = new Map(base.map((b) => [keyOf(b), b]));
  const baseOrder = base.map(keyOf);
  const editedOrder = edited.map(keyOf);

  const entries: Record<string, Partial<T>> = {};
  for (const item of edited) {
    const key = keyOf(item);
    const b = baseByKey.get(key);
    if (!b) { entries[key] = item; continue; }          // wholly new — store all of it
    const d = fieldDiff(b, item);
    if (Object.keys(d).length) entries[key] = d;
  }

  const orderChanged = JSON.stringify(baseOrder) !== JSON.stringify(editedOrder);
  if (!orderChanged && !Object.keys(entries).length) return undefined;
  const delta: PackListDelta<T> = {};
  if (orderChanged) delta.order = editedOrder;
  if (Object.keys(entries).length) delta.entries = entries;
  return delta;
}

/**
 * Rebuild the effective list: the pack's own, with the GM's changes laid over it.
 *
 * Anything the GM did not touch comes from the base every time, so a later improvement to the
 * shipped pack reaches the campaign — which is the whole reason for storing a delta rather than a
 * copy. A key in `order` with no base and no entry is dropped rather than guessed at.
 */
export function applyListDelta<T extends object>(
  base: T[], delta: PackListDelta<T> | T[] | undefined | null, keyOf: (item: T) => string
): T[] {
  if (!delta) return base;
  // BACK-COMPAT: an override saved before this existed is a whole list. Take it as it stands — it is
  // a complete answer, just a wasteful one, and it will be rewritten as a delta the next time the
  // GM saves that editor.
  if (Array.isArray(delta)) return delta.length ? delta : base;

  const baseByKey = new Map(base.map((b) => [keyOf(b), b]));
  const order = delta.order ?? base.map(keyOf);
  // A brand-new key that is not in an explicit order still has to appear, or adding one and changing
  // nothing else would silently do nothing.
  for (const k of Object.keys(delta.entries ?? {})) if (!order.includes(k)) order.push(k);

  const out: T[] = [];
  for (const key of order) {
    const b = baseByKey.get(key);
    const e = delta.entries?.[key];
    if (!b && !e) continue;                              // a key that no longer exists anywhere
    const merged = { ...(b ?? {}), ...(e ?? {}) } as T;
    // An explicitly-undefined field is a field the GM removed.
    for (const [k, v] of Object.entries(e ?? {})) if (v === undefined) delete (merged as any)[k];
    out.push(merged);
  }
  return out;
}
