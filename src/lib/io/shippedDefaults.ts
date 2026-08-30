// B112 — THE ONE TEST FOR "DID THE GM MAKE THIS, OR DID WE SHIP IT?"
//
// Every export used to serialise the app's own libraries as though the GM had authored them: the
// four shipped calendars, the nine shipped tag categories, the enabled-state of every category.
// Nothing reading a save could tell "this campaign uses a custom reckoning" from "this campaign was
// saved by Star System Explorer" — a correctness fault in the format, found by the Creator Hub when
// a facet counting custom calendars fired on every map ever made.
//
// The shape chosen is the DELTA: a save carries what is absent from, or differs from, the shipped
// set, so everything present in a file is by definition the GM's and no reader needs a copy of this
// repo's static files to interpret it. The load path already merges the shipped set back in
// (`ensureTemporalState`, `mergeStarmapCoIs`, `applyStarmapReasonsConfig` all fold into a store that
// is already seeded), which is why this is a SERIALISATION change and not a data-model one.
//
// THE CONSCIOUS COST, stated because it is the real trade and not a detail: an unmodified shipped
// entry is no longer in the file, so if a future version CHANGES one, campaigns follow the new
// definition, and if a future version REMOVES one, a campaign that used it unmodified loses it.
// That is the same bargain `unitPrefs` already takes (DATA-R20: sparse record, validated on read,
// defaults filled in) and it is the right one — a GM who edits an entry gets it written in full,
// which is the case that actually matters.

/**
 * A stable string for VALUE comparison: keys sorted at every depth, `undefined` dropped.
 *
 * Plain `JSON.stringify` cannot do this job and the measurement says so. Three of the nine shipped
 * CoI categories fail a naive deep-equal against their own definitions — not because anything was
 * edited, but because a round trip through the store drops `single: false` and emits a tag's keys
 * in a different order. Comparing raw strings would have marked those three as GM-authored and
 * written them to every save, leaving the fix two-thirds effective and silently so.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v === undefined || v === null || typeof v !== 'object' || Array.isArray(v)) return v;
    const src = v as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(src).sort()) if (src[k] !== undefined) out[k] = src[k];
    return out;
  });
}

/** True when `value` is indistinguishable from what the app ships, and so has no place in a save. */
export function sameAsShipped(value: unknown, shipped: unknown): boolean {
  return shipped !== undefined && canonicalJson(value) === canonicalJson(shipped);
}

/**
 * The delta of a record against the shipped one: every key that is new, or whose value differs.
 * Returns undefined when there is nothing to say, so a caller can omit the field entirely rather
 * than write an empty object — `{}` and "absent" should not be two ways of saying nothing.
 */
export function shippedDelta<T>(
  live: Record<string, T> | undefined,
  shipped: Record<string, T>
): Record<string, T> | undefined {
  const out: Record<string, T> = {};
  for (const [key, value] of Object.entries(live ?? {})) {
    if (!sameAsShipped(value, shipped[key])) out[key] = value;
  }
  return Object.keys(out).length ? out : undefined;
}
