import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

// B94 — A SHIP MOVING MUST NOT REBUILD THE WORLD, AND EVERYTHING ELSE MUST.
//
// The scene's decision is made by two small pure functions. They live inside createHoloScene's
// closure (it needs `currentSystem`), so this mirrors them EXACTLY rather than importing them —
// which means this file's job is to pin the RULE, and any change to the rule must be made in both
// places. That duplication is deliberate and cheap; the alternative is exporting scene internals
// purely to test them, which the scale-law refactor note in scaleLaw.ts warns against.
//
// Kept honest by the last test: the field list here is asserted against the one in scene.ts.

const FLIGHT_VECTOR_KEYS = new Set(['vector_position_au', 'vector_velocity_ms', 'vector_epoch_ms']);

function sameExcept(a: any, b: any, skip: Set<string> | null): boolean {
  if (a === b) return true;
  if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return a === b;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  if (Array.isArray(a)) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (!sameExcept(a[i], b[i], null)) return false;
    return true;
  }
  const ka = Object.keys(a), kb = Object.keys(b);
  if (ka.length !== kb.length) return false;
  for (const k of ka) {
    if (skip && skip.has(k)) continue;
    if (!(k in b)) return false;
    if (!sameExcept(a[k], b[k], null)) return false;
  }
  return true;
}

function onlyFlightVectorsDiffer(cur: any, next: any): boolean {
  const an: any[] = cur?.nodes ?? [], bn: any[] = next?.nodes ?? [];
  if (an.length !== bn.length) return false;
  if (!sameExcept({ ...cur, nodes: null }, { ...next, nodes: null }, null)) return false;
  let moved = false;
  for (let i = 0; i < an.length; i++) {
    const x = an[i], y = bn[i];
    if (!x || !y || x.id !== y.id) return false;
    const isConstruct = x.kind === 'construct' && y.kind === 'construct';
    if (!sameExcept(x, y, isConstruct ? FLIGHT_VECTOR_KEYS : null)) return false;
    if (isConstruct && !moved) {
      for (const k of FLIGHT_VECTOR_KEYS) if (!sameExcept(x[k], y[k], null)) { moved = true; break; }
    }
  }
  return moved;
}

const sys = () => ({
  id: 'sys', name: 'Sol', epochT0: 0,
  nodes: [
    { id: 'star', kind: 'body', roleHint: 'star', name: 'Sol', massKg: 2e30, tags: [] },
    { id: 'earth', kind: 'body', roleHint: 'planet', name: 'Earth', massKg: 6e24, tags: [{ key: 'life/present' }],
      orbit: { hostId: 'star', elements: { a_AU: 1, e: 0.017 } } },
    { id: 'roci', kind: 'construct', name: 'Rocinante', parentId: 'star', flight_state: 'Transiting',
      vector_position_au: { x: 1.2, y: 0.4 }, vector_velocity_ms: { x: 3100, y: -220 },
      vector_epoch_ms: 1780214088000, driveBurns: [{ t: 1, a: 9.8 }], route: { e: 0.1, p: [[0, 0], [1, 1]] } }
  ]
});

const moveShip = (s: any, dx = 0.0001) => {
  const n = JSON.parse(JSON.stringify(s));
  const r = n.nodes.find((x: any) => x.id === 'roci');
  r.vector_position_au.x += dx;
  r.vector_velocity_ms.x += 1;
  r.vector_epoch_ms += 2000;
  return n;
};

describe('B94 — the motion-only path', () => {
  it('SKIPS the rebuild when only a ship\'s position, velocity and epoch moved', () => {
    expect(onlyFlightVectorsDiffer(sys(), moveShip(sys()))).toBe(true);
  });

  it('does NOT skip when nothing moved at all (let the normal path decide)', () => {
    expect(onlyFlightVectorsDiffer(sys(), JSON.parse(JSON.stringify(sys())))).toBe(false);
  });

  // Every one of these is a rebuild that MUST still happen. Missing one of these is a far worse
  // bug than the churn this fix removes, so they are enumerated rather than sampled.
  const mustRebuild: [string, (n: any) => void][] = [
    ['a body moved', (n) => { n.nodes[1].orbit.elements.a_AU = 1.5; }],
    ['a tag changed', (n) => { n.nodes[1].tags = [{ key: 'life/none' }]; }],
    ['a tag was added', (n) => { n.nodes[1].tags.push({ key: 'new/thing' }); }],
    ['a body was renamed', (n) => { n.nodes[1].name = 'Terra'; }],
    ['a mass changed', (n) => { n.nodes[0].massKg = 3e30; }],
    ['a node was removed', (n) => { n.nodes.splice(1, 1); }],
    ['a node was added', (n) => { n.nodes.push({ id: 'mars', kind: 'body', name: 'Mars', tags: [] }); }],
    ['node order changed', (n) => { n.nodes.reverse(); }],
    ['the system was renamed', (n) => { n.name = 'Alpha'; }],
    ['the ship changed flight_state', (n) => { n.nodes[2].flight_state = 'Parked'; }],
    ['the ship replanned its route', (n) => { n.nodes[2].route.p.push([2, 2]); }],
    ['the ship gained a burn', (n) => { n.nodes[2].driveBurns.push({ t: 9, a: 4 }); }],
    ['the ship changed parent', (n) => { n.nodes[2].parentId = 'earth'; }],
    ['the ship was renamed', (n) => { n.nodes[2].name = 'Razorback'; }]
  ];

  for (const [what, mutate] of mustRebuild) {
    it(`REBUILDS when ${what}`, () => {
      const next = JSON.parse(JSON.stringify(sys()));
      mutate(next);
      expect(onlyFlightVectorsDiffer(sys(), next)).toBe(false);
    });
  }

  it('rebuilds when a ship moved AND something else changed', () => {
    const next = moveShip(sys());
    next.nodes[1].name = 'Terra';
    expect(onlyFlightVectorsDiffer(sys(), next)).toBe(false);
  });

  // Written expecting a SKIP, and the implementation was right to refuse. A vector that disappears
  // is not a ship moving - it is a ship PARKING (worldPositions.ts: "the reconcile tick clears the
  // field when a ship parks"). Its whole representation changes: the route line goes, and it becomes
  // a satellite drawn from orbital elements. That needs the rebuild, so the key-count check that
  // catches it stays, and this pins the behaviour rather than the assumption.
  it('REBUILDS when a ship parks and its vector is cleared', () => {
    const parked = JSON.parse(JSON.stringify(sys()));
    delete parked.nodes[2].vector_position_au;
    expect(onlyFlightVectorsDiffer(sys(), parked)).toBe(false);
  });

  it('REBUILDS when a parked ship gains a vector and starts flying', () => {
    const cur = JSON.parse(JSON.stringify(sys()));
    delete cur.nodes[2].vector_position_au;
    expect(onlyFlightVectorsDiffer(cur, sys())).toBe(false);
  });

  // The rule is duplicated (see the note at the top). This is what stops the two copies drifting:
  // if someone widens the skip list in scene.ts, every REBUILDS test above would still pass against
  // this file's narrower copy and the widening would go unexamined. Fails loudly instead.
  it('uses the SAME field list as the scene does', () => {
    const src = readFileSync('src/lib/holo/scene.ts', 'utf8');
    const m = src.match(/const FLIGHT_VECTOR_KEYS = new Set\(\[([^\]]*)\]\)/);
    expect(m, 'FLIGHT_VECTOR_KEYS not found in scene.ts').toBeTruthy();
    const inScene = m![1].split(',').map((s) => s.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean);
    expect(inScene.sort()).toEqual([...FLIGHT_VECTOR_KEYS].sort());
  });
});
