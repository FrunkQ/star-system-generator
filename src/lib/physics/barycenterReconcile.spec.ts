import { describe, it, expect } from 'vitest';
import { reconcileBarycenters } from './barycenterReconcile';
import { G } from '../constants';
import type { System } from '../types';

// A planet shrunk far below its own moon's mass should flip hierarchy (the heavy moon becomes the
// primary, the planet its satellite) — AND flip back when the planet is grown large again, returning
// to its original orbit around the star. The mass edits jump past the comparable-mass barycentre
// band, so this exercises swapDominantChild, not the barycentre promote/demote path.
describe('reconcileBarycenters — dominant child swap is reversible', () => {
  const moonMass = 7e22; // Luna-like — far below an Earth-mass planet (ratio well under the bary band)
  const build = (planetMass: number): System => ({
    seed: 's', nodes: [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'Sol', parentId: null, massKg: 2e30 },
      { id: 'planet', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'star', massKg: planetMass,
        orbit: { hostId: 'star', hostMu: G * 2e30, t0: 0, elements: { a_AU: 3, e: 0.02, i_deg: 1, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      { id: 'moon', kind: 'body', roleHint: 'moon', name: 'M', parentId: 'planet', massKg: moonMass,
        orbit: { hostId: 'planet', hostMu: G * planetMass, t0: 0, elements: { a_AU: 0.002, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 1 } } }
    ]
  } as unknown as System);

  it('a planet made much lighter than its moon becomes the moon of its moon', () => {
    const sys = build(1e21); // ~70x lighter than the moon — ratio well below the barycentre band
    reconcileBarycenters(sys);
    const planet = sys.nodes.find((n) => n.id === 'planet') as any;
    const moon = sys.nodes.find((n) => n.id === 'moon') as any;
    expect(moon.parentId).toBe('star');          // the heavy moon took the planet's place around the star
    expect(moon.orbit.elements.a_AU).toBeCloseTo(3); // …at the planet's former orbit
    expect(planet.parentId).toBe('moon');         // the planet now orbits its former moon
  });

  it('grown large again, the planet reclaims its original orbit and the moon returns to it', () => {
    // First flip it (planet tiny), then grow the planet back big in one jump (past the bary band).
    const sys = build(1e21);
    reconcileBarycenters(sys);
    (sys.nodes.find((n) => n.id === 'planet') as any).massKg = 6e24; // Earth-mass again, ≫ the moon
    reconcileBarycenters(sys);

    const planet = sys.nodes.find((n) => n.id === 'planet') as any;
    const moon = sys.nodes.find((n) => n.id === 'moon') as any;
    expect(planet.parentId).toBe('star');            // planet is the primary again
    expect(planet.orbit.elements.a_AU).toBeCloseTo(3); // back in its original orbit
    expect(planet.orbit.elements.e).toBeCloseTo(0.02); // and original shape (host-track preserved)
    expect(moon.parentId).toBe('planet');            // the moon orbits the planet once more
    expect(sys.nodes.some((n) => n.kind === 'barycenter')).toBe(false);
  });
});

// A ghost barycentre: nothing actually orbits it (its "members" point elsewhere / it has a dangling
// parent). It should be removed so it doesn't render at the system centre and drag things in.
describe('reconcileBarycenters — ghost cleanup', () => {
  it('removes a barycentre that nothing orbits, leaving the real bodies untouched', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'star', kind: 'body', roleHint: 'star', name: 'A', parentId: null, massKg: 2e30 },
        // a real planet that (correctly) orbits the star directly
        { id: 'hades', kind: 'body', roleHint: 'planet', name: 'Hades', parentId: 'star', massKg: 6e24,
          orbit: { hostId: 'star', hostMu: 1e20, t0: 0, elements: { a_AU: 5.5, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        // a GHOST barycentre: its parent is missing, and its listed members point elsewhere / are gone
        { id: 'ghost-bary', kind: 'barycenter', name: 'Ghost', parentId: 'missing-bary',
          memberIds: ['hades', 'gone'], effectiveMassKg: 1e25,
          orbit: { hostId: 'missing-bary', hostMu: 1e15, t0: 0, elements: { a_AU: 0.0003, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
      ]
    } as unknown as System;

    reconcileBarycenters(sys);

    expect(sys.nodes.some((n) => n.id === 'ghost-bary')).toBe(false);   // ghost removed
    const hades = sys.nodes.find((n) => n.id === 'hades') as any;
    expect(hades).toBeTruthy();                                          // real planet kept
    expect(hades.parentId).toBe('star');                                // still orbits the star, unmoved
    expect(hades.orbit.elements.a_AU).toBeCloseTo(5.5);
  });

  it('keeps a real star barycentre that its stars orbit', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'bary', kind: 'barycenter', name: 'AB', parentId: null, memberIds: ['a', 'b'], effectiveMassKg: 4e30 },
        { id: 'a', kind: 'body', roleHint: 'star', name: 'A', parentId: 'bary', massKg: 2e30,
          orbit: { hostId: 'bary', hostMu: 2e20, t0: 0, elements: { a_AU: 10, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        { id: 'b', kind: 'body', roleHint: 'star', name: 'B', parentId: 'bary', massKg: 2e30,
          orbit: { hostId: 'bary', hostMu: 2e20, t0: 0, elements: { a_AU: 10, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 3.14 } } }
      ]
    } as unknown as System;

    reconcileBarycenters(sys);
    expect(sys.nodes.some((n) => n.id === 'bary')).toBe(true);   // real barycentre survives
  });

  // A hand-edited file that DROPPED the auto barycentre two stars orbited: both stars have a dangling
  // parent and no node has a null parent, so there is no valid root and the system won't lay out.
  // The reconciler must treat a dangling-parent node as a root, re-home the orphans, and rebuild the bary.
  it('rebuilds a missing barycentre that two orphaned stars orbited', () => {
    const orbit = (host: string, a: number, M0 = 0) => ({ hostId: host, hostMu: 1e20, t0: 0, elements: { a_AU: a, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: M0 } });
    const sys = {
      seed: 's', nodes: [
        { id: 'star-a', kind: 'body', roleHint: 'star', name: 'A', parentId: 'gone-bary', massKg: 2.5e30, orbit: orbit('gone-bary', 36) },
        { id: 'star-b', kind: 'body', roleHint: 'star', name: 'B', parentId: 'gone-bary', massKg: 9e29, orbit: orbit('gone-bary', 101, 3.14) },
        { id: 'p1', kind: 'body', roleHint: 'planet', name: 'P1', parentId: 'star-a', massKg: 3e24, orbit: orbit('star-a', 0.8) },
        { id: 'p2', kind: 'body', roleHint: 'planet', name: 'P2', parentId: 'star-b', massKg: 2e24, orbit: orbit('star-b', 0.1) },
      ]
    } as unknown as System;

    reconcileBarycenters(sys);

    const roots = sys.nodes.filter((n) => !n.parentId);
    expect(roots.length).toBe(1);                          // exactly one root now
    expect(roots[0].kind).toBe('barycenter');              // the barycentre was rebuilt
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    expect((byId.get('star-a') as any).parentId).toBe(roots[0].id);
    expect((byId.get('star-b') as any).parentId).toBe(roots[0].id);
    // no dangling parents remain, and each planet stayed with its star
    const ids = new Set(sys.nodes.map((n) => n.id));
    expect(sys.nodes.every((n) => !n.parentId || ids.has(n.parentId as string))).toBe(true);
    expect((byId.get('p1') as any).parentId).toBe('star-a');
    expect((byId.get('p2') as any).parentId).toBe('star-b');
  });
});

// Deleting one half of a binary must dissolve the pair: the survivor returns to its original orbit around
// the star, NOT keep orbiting the now one-body barycentre.
describe('reconcileBarycenters — dissolve a binary that lost a member', () => {
  it('a binary PLANET whose partner is deleted returns to the star at the barycentre\'s orbit', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'star', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: 2e30 },
        { id: 'pair', kind: 'barycenter', name: 'A-B', parentId: 'star', memberIds: ['a', 'b'], effectiveMassKg: 9e24,
          orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 3, e: 0.1, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        { id: 'a', kind: 'body', roleHint: 'planet', name: 'A', parentId: 'pair', massKg: 6e24,
          orbit: { hostId: 'pair', hostMu: 6e14, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
        // 'b' has been DELETED (gone from nodes; still listed in memberIds)
      ]
    } as unknown as System;

    reconcileBarycenters(sys);

    expect(sys.nodes.some((n) => n.kind === 'barycenter')).toBe(false);   // pair dissolved
    const a = sys.nodes.find((n) => n.id === 'a') as any;
    expect(a.parentId).toBe('star');                                       // back on the star
    expect(a.orbit.hostId).toBe('star');
    expect(a.orbit.elements.a_AU).toBeCloseTo(3);                          // at the barycentre's old orbit
    expect(a.orbit.elements.e).toBeCloseTo(0.1);
  });

  it('a binary STAR whose partner is deleted: survivor becomes the centre, circumbinary planet re-homes to it', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'bary', kind: 'barycenter', name: 'AB', parentId: null, memberIds: ['sa', 'sb'], effectiveMassKg: 4e30 },
        { id: 'sa', kind: 'body', roleHint: 'star', name: 'A', parentId: 'bary', massKg: 2e30,
          orbit: { hostId: 'bary', hostMu: 2e20, t0: 0, elements: { a_AU: 10, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        // 'sb' deleted
        { id: 'p', kind: 'body', roleHint: 'planet', name: 'P', parentId: 'bary', massKg: 6e24,
          orbit: { hostId: 'bary', hostMu: 2.6e20, t0: 0, elements: { a_AU: 40, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } }
      ]
    } as unknown as System;

    reconcileBarycenters(sys);
    expect(sys.nodes.some((n) => n.kind === 'barycenter')).toBe(false);
    const sa = sys.nodes.find((n) => n.id === 'sa') as any;
    const p = sys.nodes.find((n) => n.id === 'p') as any;
    expect(sa.parentId).toBeNull();          // surviving star is the centre
    expect(p.parentId).toBe('sa');           // planet now orbits the surviving star
    expect(p.orbit.hostId).toBe('sa');
  });
});

// A binary pair whose barycentre has a VALID parent (the star) but a broken own-orbit would render dead
// centre "no matter where the members orbit" — because editing a member only sets the pair separation,
// never the pair's distance from the star. These heals un-stick that.
describe('reconcileBarycenters — centred binary pair recovery', () => {
  it('repairs a barycentre with a parent but a degenerate orbit so it leaves the centre', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'star', kind: 'body', roleHint: 'star', name: 'Khalil', parentId: null, massKg: 2e30 },
        // barycentre correctly parented to the star, but its orbit is gone -> sits on the star (0,0)
        { id: 'pair', kind: 'barycenter', name: 'Khalil A-B', parentId: 'star', memberIds: ['a', 'b'],
          effectiveMassKg: 9e24, tags: [{ key: 'barycenter/auto' }] },
        { id: 'a', kind: 'body', roleHint: 'planet', name: 'Khalil A', parentId: 'pair', massKg: 6e24,
          orbit: { hostId: 'pair', hostMu: 6e14, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
        { id: 'b', kind: 'body', roleHint: 'planet', name: 'Khalil B', parentId: 'pair', massKg: 3e24,
          orbit: { hostId: 'pair', hostMu: 6e14, t0: 0, elements: { a_AU: 0.001, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 3.14 } } },
      ]
    } as unknown as System;

    reconcileBarycenters(sys);
    const pair = sys.nodes.find((n) => n.id === 'pair') as any;
    expect(pair).toBeTruthy();                       // kept (it has real members)
    expect(pair.orbit).toBeTruthy();                 // orbit restored
    expect(pair.orbit.elements.a_AU).toBeGreaterThan(0);
    expect(pair.orbit.hostMu).toBeGreaterThan(0);    // can now propagate off-centre
    expect(pair.orbit.hostId).toBe('star');
  });

  it('re-homes a node whose parent no longer exists, restoring a real distance', () => {
    const sys = {
      seed: 's', nodes: [
        { id: 'star', kind: 'body', roleHint: 'star', name: 'Khalil', parentId: null, massKg: 2e30 },
        // planet pointing at a parent that was deleted -> would collapse to (0,0)
        { id: 'p', kind: 'body', roleHint: 'planet', name: 'Wanderer', parentId: 'gone', massKg: 6e24,
          orbit: { hostId: 'gone', hostMu: 1e14, t0: 0, elements: { a_AU: 4.2, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      ]
    } as unknown as System;

    reconcileBarycenters(sys);
    const p = sys.nodes.find((n) => n.id === 'p') as any;
    expect(p.parentId).toBe('star');                 // re-homed to the root
    expect(p.orbit.hostId).toBe('star');
    expect(p.orbit.hostMu).toBeGreaterThan(0);
    expect(p.orbit.elements.a_AU).toBeCloseTo(4.2);  // its real distance preserved
  });
});

// Adding a companion massive enough to form a stellar barycentre must re-home the star's OTHER
// children by orbit size: orbits ENCLOSING the pair become circumbinary (orbit the barycentre);
// orbits inside the pair separation stay on their star (circumstellar). And it must be reversible —
// deleting the companion (dissolve) or shrinking it (demote) puts everything back on the star.
describe('reconcileBarycenters — stellar promotion re-homes enclosing children', () => {
  const makeSystem = () => ({
    seed: 's', nodes: [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'Sun', parentId: null, massKg: 2e30 },
      // the massive companion at 5 AU (ratio 0.1 > promote threshold)
      { id: 'biggie', kind: 'body', roleHint: 'planet', name: 'Biggie', parentId: 'star', massKg: 2e29,
        orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 5, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      { id: 'inner', kind: 'body', roleHint: 'planet', name: 'Inner', parentId: 'star', massKg: 6e24,
        orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 1, e: 0.02, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      { id: 'outer', kind: 'body', roleHint: 'planet', name: 'Outer', parentId: 'star', massKg: 1e26,
        orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 30, e: 0.01, i_deg: 1, omega_deg: 2, Omega_deg: 3, M0_rad: 0.5 } } },
      { id: 'belt', kind: 'body', roleHint: 'belt', name: 'Belt', parentId: 'star', massKg: 3e21,
        orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 45, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } },
        radiusInnerKm: 6e9, radiusOuterKm: 7e9 },
      // a nested planet-pair barycentre out past the companion (Pluto-Charon style)
      { id: 'pairbary', kind: 'barycenter', name: 'P-C', parentId: 'star', memberIds: ['pl', 'ch'], effectiveMassKg: 1.4e22,
        orbit: { hostId: 'star', hostMu: 1.33e20, t0: 0, elements: { a_AU: 39.5, e: 0.25, i_deg: 17, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      { id: 'pl', kind: 'body', roleHint: 'planet', name: 'Pl', parentId: 'pairbary', massKg: 1.3e22,
        orbit: { hostId: 'pairbary', hostMu: 9.5e11, t0: 0, elements: { a_AU: 0.00002, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
      { id: 'ch', kind: 'body', roleHint: 'planet', name: 'Ch', parentId: 'pairbary', massKg: 1.6e21,
        orbit: { hostId: 'pairbary', hostMu: 9.5e11, t0: 0, elements: { a_AU: 0.00013, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 3.14 } } },
      // the companion's own moon: inside the separation, must STAY with the companion
      { id: 'bmoon', kind: 'body', roleHint: 'moon', name: 'BMoon', parentId: 'biggie', massKg: 7e22,
        orbit: { hostId: 'biggie', hostMu: 1.33e19, t0: 0, elements: { a_AU: 0.01, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } } },
    ]
  }) as unknown as System;

  it('outer planets, belts and nested pairs become circumbinary; inner ones stay on their star', () => {
    const sys = makeSystem();
    reconcileBarycenters(sys);

    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    const stellarBary = sys.nodes.find((n) => n.kind === 'barycenter' && (n as any).memberIds?.includes('star')) as any;
    expect(stellarBary).toBeTruthy();                              // the pair formed
    expect(stellarBary.parentId).toBeNull();                       // star was the root → so is the pair

    const inner = byId.get('inner') as any;
    expect(inner.parentId).toBe('star');                           // 1 AU < 5 AU separation: circumstellar
    expect(inner.orbit.elements.a_AU).toBeCloseTo(1);

    for (const id of ['outer', 'belt', 'pairbary']) {
      const n = byId.get(id) as any;
      expect(n.parentId).toBe(stellarBary.id);                     // encloses the pair: circumbinary
      expect(n.orbit.hostId).toBe(stellarBary.id);
      expect(n.orbit.hostMu / (G * stellarBary.effectiveMassKg)).toBeCloseTo(1, 6); // µ of the PAIR mass
    }
    expect((byId.get('outer') as any).orbit.elements.a_AU).toBeCloseTo(30);   // distance preserved
    expect((byId.get('outer') as any).orbit.elements.i_deg).toBeCloseTo(1);   // elements preserved
    expect((byId.get('pl') as any).parentId).toBe('pairbary');     // nested pair kept intact
    expect((byId.get('bmoon') as any).parentId).toBe('biggie');    // companion keeps its moon
  });

  it('DELETING the companion dissolves the pair and puts everything back on the star', () => {
    const sys = makeSystem();
    reconcileBarycenters(sys);
    sys.nodes = sys.nodes.filter((n) => n.id !== 'biggie' && n.id !== 'bmoon');
    reconcileBarycenters(sys);

    expect(sys.nodes.some((n) => n.kind === 'barycenter' && (n as any).memberIds?.includes('star'))).toBe(false);
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    expect((byId.get('star') as any).parentId).toBeNull();         // star is the centre again
    for (const id of ['inner', 'outer', 'belt', 'pairbary']) {
      const n = byId.get(id) as any;
      expect(n.parentId).toBe('star');                             // everything back on the star
      expect(n.orbit.hostId).toBe('star');
    }
    expect((byId.get('outer') as any).orbit.elements.a_AU).toBeCloseTo(30);   // distances survive the round trip
    expect((byId.get('pairbary') as any).orbit.elements.a_AU).toBeCloseTo(39.5);
  });

  it('SHRINKING the companion demotes the pair and puts everything back on the star', () => {
    const sys = makeSystem();
    reconcileBarycenters(sys);
    const biggie = sys.nodes.find((n) => n.id === 'biggie') as any;
    biggie.massKg = 5e28;                                          // ratio 0.025 < demote threshold
    reconcileBarycenters(sys);

    expect(sys.nodes.some((n) => n.kind === 'barycenter' && (n as any).memberIds?.includes('star'))).toBe(false);
    const byId = new Map(sys.nodes.map((n) => [n.id, n]));
    expect((byId.get('biggie') as any).parentId).toBe('star');     // back to an ordinary planet
    for (const id of ['inner', 'outer', 'belt', 'pairbary']) {
      const n = byId.get(id) as any;
      expect(n.parentId).toBe('star');
      expect(n.orbit.hostId).toBe('star');
    }
    expect((byId.get('outer') as any).orbit.elements.a_AU).toBeCloseTo(30);
  });
});

