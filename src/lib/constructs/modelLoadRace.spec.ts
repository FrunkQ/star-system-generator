// The transit regression, pinned as ARITHMETIC rather than as a claim about the scene.
//
// A construct IN TRANSIT changes the broadcast snapshot continuously, so a player's scene calls
// setSystem (bumping a build generation) roughly twice a second. The model loader was fully async
// - two awaits - and re-checked the generation after each, so a rebuild that landed mid-flight
// discarded the load. A parked ship's snapshot does not change, so ITS model attached fine: that
// asymmetry is exactly what "models show on orbiting ships and never on moving ones" was.
//
// These reproduce both loaders against a fake store: the old one starves under rebuilds, the new
// one (cache filled before the staleness check) attaches on the very next rebuild.
import { describe, it, expect } from 'vitest';

const tick = () => new Promise<void>((r) => setTimeout(r, 0));

function makeHarness() {
  let gen = 0;
  let attached = 0;
  const cache = new Map<string, object>();
  const store = async (_hash: string) => { await tick(); return { bytes: {} }; };
  const parse = async (_bytes: unknown) => { await tick(); return { object: {} }; };
  return { get gen() { return gen; }, rebuild: () => { gen++; }, get attached() { return attached; },
           cache, store, parse, attach: () => { attached++; } };
}

/** How it behaved before: every await is followed by a staleness check, nothing is cached. */
async function loadOld(h: ReturnType<typeof makeHarness>, myGen: number) {
  const stored = await h.store('x');
  if (myGen !== h.gen) return;
  const parsed = await h.parse(stored.bytes);
  if (myGen !== h.gen) return;
  h.attach();
  return parsed;
}

/** How it behaves now: a cache hit is synchronous, and the cache is filled even when stale. */
async function loadNew(h: ReturnType<typeof makeHarness>, myGen: number) {
  if (h.cache.has('x')) { h.attach(); return; }        // synchronous: no window to be stale in
  const stored = await h.store('x');
  const parsed = await h.parse(stored.bytes);
  h.cache.set('x', parsed.object);                      // filled BEFORE the staleness check
  if (myGen !== h.gen) return;
  h.attach();
}

describe('ship-model loading under a rebuild storm (the transit case)', () => {
  it('OLD: never attaches while rebuilds keep landing mid-flight', async () => {
    const h = makeHarness();
    for (let i = 0; i < 5; i++) {
      loadOld(h, h.gen);   // start a load for this build
      await tick();        // ...and let a rebuild land before it finishes
      h.rebuild();
    }
    await tick(); await tick();
    expect(h.attached).toBe(0); // the reported symptom: a moving ship never gets its hull
  });

  it('NEW: the first load fills the cache, and the next rebuild attaches at once', async () => {
    const h = makeHarness();
    for (let i = 0; i < 5; i++) {
      loadNew(h, h.gen);
      await tick();
      h.rebuild();
    }
    await tick(); await tick();
    expect(h.cache.has('x')).toBe(true);
    expect(h.attached).toBeGreaterThan(0);
  });

  it('NEW: a cache hit needs no microtask at all - it attaches within the same rebuild', () => {
    const h = makeHarness();
    h.cache.set('x', {});
    loadNew(h, h.gen);       // not awaited on purpose: the sync path must have run already
    expect(h.attached).toBe(1);
  });
});
