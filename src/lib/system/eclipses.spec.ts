// G8 validates itself, which is why it was worth building. Three famous eclipse geometries sit in the
// bundled Sol and every one of them is a number anybody can check against reality:
//
//   Luna and the Sun subtend almost exactly the same angle from Earth. That near-equality is WHY
//   totality is possible at all and why it only just covers.
//   Phobos is far too small ever to give totality — its real transits are annular, about a third of
//   the Sun's disc.
//   Deimos is barely more than a moving speck, about one per cent, and must never cost a propagation.
//
// So these are not regression pins on whatever the code happened to print. They are the physics.
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  angularRadius, discObscuration, eclipseKind, nextEclipse, nextEclipseCached,
  clearEclipseCache, ECLIPSE_FLOOR, describeEclipse
} from './eclipses';
import { satelliteTiltRad, toParentEquator } from './satelliteFrame';
import { computeWorldPositions3D } from '$lib/physics/worldPositions';
import { AU_KM } from '$lib/constants';
import type { System } from '$lib/types';

const MAP = JSON.parse(readFileSync('static/example-starmaps/Local_Neighbourhood-Starmap.json', 'utf8'));
const SOL: System = (() => {
  const s = MAP.systems.find((x: any) => x.name === 'Sol');
  return (s.system ?? s) as System;
})();
const T0 = SOL.epochT0;
const DAY = 24 * 3600 * 1000;
const nodeOf = (id: string): any => SOL.nodes.find((n) => n.id === id);

/** Angular radius of `target` seen from the surface of `from`, at time t — the sub-target point. */
function seenFrom(fromId: string, targetId: string, t = T0): number {
  const pos = computeWorldPositions3D(SOL, t);
  const a = pos.get(fromId)!, b = pos.get(targetId)!;
  const dCentres = Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z) * AU_KM;
  return angularRadius(nodeOf(targetId).radiusKm, dCentres - nodeOf(fromId).radiusKm);
}

describe('angular sizes — the three calibration anchors', () => {
  it('Luna and the Sun subtend almost the same angle from Earth (why totality exists)', () => {
    const luna = seenFrom('solar-system-earth', 'solar-system-luna');
    const sun = seenFrom('solar-system-earth', 'solar-system-sun');
    // Real figures: both about 0.26 deg, Luna between 0.245 and 0.28 over its eccentric orbit.
    expect(luna / sun).toBeGreaterThan(0.9);
    expect(luna / sun).toBeLessThan(1.12);
  });

  it('Phobos is far too small for totality — its transits are annular, around a third of the disc', () => {
    const phobos = seenFrom('solar-system-mars', 'solar-system-phobos');
    const sun = seenFrom('solar-system-mars', 'solar-system-sun');
    const k = phobos / sun;
    expect(k).toBeLessThan(1);            // THE POINT: it can never cover the Sun
    expect(k).toBeGreaterThan(0.4);       // but it is far from a speck
    // Centred, it hides k^2 of the disc — the real figure is about a third.
    expect(k * k).toBeGreaterThan(0.25);
    expect(k * k).toBeLessThan(0.55);
  });

  it('Deimos is barely more than a moving speck', () => {
    const deimos = seenFrom('solar-system-mars', 'solar-system-deimos');
    const sun = seenFrom('solar-system-mars', 'solar-system-sun');
    const k = deimos / sun;
    expect(k).toBeLessThan(0.2);
    expect(k * k).toBeLessThan(0.05);     // a couple of per cent at most
  });

  it('Earth completely swamps the Sun as seen from Luna — the other reading of "eclipse"', () => {
    const earth = seenFrom('solar-system-luna', 'solar-system-earth');
    const sun = seenFrom('solar-system-luna', 'solar-system-sun');
    expect(earth / sun).toBeGreaterThan(3);
  });
});

describe('obscuration arithmetic', () => {
  it('is zero once the discs part, whatever their sizes', () => {
    expect(discObscuration(0.02, 0.01, 0.01)).toBe(0);
    expect(discObscuration(0.0201, 0.01, 0.0101)).toBe(0);
  });
  it('is total when a larger occulter is centred', () => {
    expect(discObscuration(0, 0.01, 0.012)).toBe(1);
    expect(eclipseKind(0, 0.01, 0.012)).toBe('total');
  });
  it('is the squared ratio when a smaller occulter is centred — the annular case', () => {
    expect(discObscuration(0, 0.01, 0.005)).toBeCloseTo(0.25, 12);
    expect(eclipseKind(0, 0.01, 0.005)).toBe('annular');
  });
  it('is exactly half when equal discs are offset to touch centres', () => {
    // Two circles of equal radius r with centres r apart overlap on a lens of
    // 2r^2(pi/3 - sqrt(3)/4) — about 0.391 of one disc. A known closed form, not a printed value.
    const r = 0.01;
    const expected = (2 * r * r * (Math.PI / 3 - Math.sqrt(3) / 4)) / (Math.PI * r * r);
    expect(discObscuration(r, r, r)).toBeCloseTo(expected, 10);
    expect(eclipseKind(r, r, r)).toBe('partial');
  });
  it('grows monotonically as the occulter closes in', () => {
    const seq = [0.02, 0.015, 0.01, 0.005, 0].map((s) => discObscuration(s, 0.01, 0.009));
    for (let i = 1; i < seq.length; i++) expect(seq[i]).toBeGreaterThanOrEqual(seq[i - 1]);
  });
  it('uses asin, so a body filling half the sky is handled', () => {
    // Mars from Phobos: 3389.5 km radius at 9366 - 11 km. Small-angle would say 0.362 rad; the
    // truth is 0.370. Not a rounding difference at this scale.
    expect(angularRadius(3389.5, 9355)).toBeCloseTo(Math.asin(3389.5 / 9355), 12);
    expect(angularRadius(3389.5, 9355)).toBeGreaterThan(3389.5 / 9355);
  });
});

describe('the 25% floor is a pre-filter, not a post-filter', () => {
  it('dismisses Deimos on arithmetic alone and keeps Phobos', () => {
    const out = nextEclipse(SOL, 'solar-system-mars', T0, { horizonMs: 30 * DAY });
    const deimos = out.candidates.find((c) => c.id === 'solar-system-deimos')!;
    const phobos = out.candidates.find((c) => c.id === 'solar-system-phobos')!;
    expect(deimos.rejected).toBe('below-floor');
    expect(deimos.maxObscuration).toBeLessThan(ECLIPSE_FLOOR);
    expect(phobos.rejected).toBeUndefined();
    expect(phobos.maxObscuration).toBeGreaterThan(ECLIPSE_FLOOR);
  });
});

describe('the forward search', () => {
  beforeEach(() => clearEclipseCache());

  it('finds Mars a Phobos eclipse, and it is never total', () => {
    // A full martian year of headroom: at the bundled epoch the Sun sits 22.1 deg out of Phobos's
    // orbit plane, so its shadow is missing the planet entirely and the season has to come round.
    const out = nextEclipse(SOL, 'solar-system-mars', T0, { horizonMs: 700 * DAY });
    expect(out.next).not.toBeNull();
    expect(out.next!.occulterId).toBe('solar-system-phobos');
    // IT CAN NEVER BE TOTAL. This is the assertion the item asked for by name.
    expect(out.next!.kind).not.toBe('total');
    expect(out.next!.ratio).toBeLessThan(1);
    expect(out.next!.obscuration).toBeGreaterThanOrEqual(ECLIPSE_FLOOR);
    // ...and once the season opens they come thick and fast, several per martian day.
    const second = nextEclipse(SOL, 'solar-system-mars', out.next!.timeMs! + 60_000, { horizonMs: 30 * DAY });
    expect(second.next).not.toBeNull();
    expect(second.next!.timeMs! - out.next!.timeMs!).toBeLessThan(2 * DAY);
  });

  it('finds Earth a solar eclipse, by Luna, that only just covers', () => {
    const out = nextEclipse(SOL, 'solar-system-earth', T0, { horizonMs: 6 * 365.25 * DAY });
    expect(out.next).not.toBeNull();
    expect(out.next!.occulterId).toBe('solar-system-luna');
    // Elements are fixed here, so seasons do not regress; alignments still recur within a few years.
    expect(out.next!.timeMs! - T0).toBeLessThan(4 * 365.25 * DAY);
    // The famous near-equality: whichever way it falls, it is close to the line.
    expect(out.next!.ratio).toBeGreaterThan(0.9);
    expect(out.next!.ratio).toBeLessThan(1.15);
  });

  it('gives Luna eclipses of the Sun by Earth, and they reach totality — the same rule, seen from a moon', () => {
    const first = nextEclipse(SOL, 'solar-system-luna', T0, { horizonMs: 3 * 365.25 * DAY });
    expect(first.next).not.toBeNull();
    expect(first.next!.occulterId).toBe('solar-system-earth');
    // Earth swamps the Sun from here, so any well-centred event is total. The FIRST one need not be
    // — a grazing pass that still clears the floor is a partial, and calling it total would be a lie.
    expect(first.next!.ratio).toBeGreaterThan(3);
    // Walk forward: with Earth three times the Sun's angular size, totality must turn up quickly.
    let t = first.next!.timeMs!, kinds: string[] = [];
    for (let i = 0; i < 12; i++) {
      const o = nextEclipse(SOL, 'solar-system-luna', t + DAY, { horizonMs: 365.25 * DAY });
      if (!o.next) break;
      kinds.push(o.next.kind);
      t = o.next.timeMs!;
    }
    expect(kinds).toContain('total');
  });

  it('calls Io a cycle, not a date — its shadow can never miss', () => {
    const out = nextEclipse(SOL, 'solar-system-io', T0, { horizonMs: 365.25 * DAY });
    expect(out.next).not.toBeNull();
    expect(out.next!.everyOrbit).toBe(true);
    expect(out.next!.timeMs).toBeNull();          // a date here would be meaningless
    expect(out.next!.occulterId).toBe('solar-system-jupiter');
    expect(out.next!.kind).toBe('total');
    // Every 1.77 days — the orbital period, which is what makes it a day/night cycle.
    expect(out.next!.periodMs / DAY).toBeCloseTo(1.77, 1);
  });

  it('does NOT call Callisto a cycle — it alone among the Galileans escapes the shadow', () => {
    // Miss distance reaches 109,000 km against Jupiter's 69,911, so there are real seasons. This is
    // the case that stops "moon of a giant" being used as the rule instead of the geometry.
    const out = nextEclipse(SOL, 'solar-system-callisto', T0, { horizonMs: 20 * 365.25 * DAY });
    expect(out.next?.everyOrbit ?? false).toBe(false);
  });

  it('does NOT call a POLAR moon a cycle — a polar orbit has fierce seasons instead', () => {
    // Same as Io in every respect but the orbit plane, so only the geometry can tell them apart.
    const polar = {
      ...SOL,
      nodes: SOL.nodes.map((n: any) =>
        n.id === 'solar-system-io'
          ? { ...n, orbit: { ...n.orbit, elements: { ...n.orbit.elements, i_deg: 90 } } }
          : n)
    } as System;
    const out = nextEclipse(polar, 'solar-system-io', T0, { horizonMs: 2 * 365.25 * DAY });
    expect(out.next?.everyOrbit ?? false).toBe(false);
  });

  it('never claims certainty it does not have', () => {
    const out = nextEclipse(SOL, 'solar-system-earth', T0, { horizonMs: 6 * 365.25 * DAY });
    expect(out.next!.approximate).toBe(true);
  });

  it('answers nothing, cheaply, for a body with no possible occulter', () => {
    const out = nextEclipse(SOL, 'solar-system-venus', T0, { horizonMs: 365.25 * DAY });
    expect(out.next).toBeNull();
    expect(out.candidates.filter((c) => !c.rejected)).toHaveLength(0);
  });
});

describe('caching against the clock', () => {
  beforeEach(() => clearEclipseCache());

  it('computes once and reuses until the predicted date passes', () => {
    const a = nextEclipseCached(SOL, 'solar-system-mars', T0)!;
    const b = nextEclipseCached(SOL, 'solar-system-mars', T0 + 1000)!;
    expect(b).toBe(a); // same object — not recomputed
    const c = nextEclipseCached(SOL, 'solar-system-mars', a.next!.timeMs! + 1)!;
    expect(c).not.toBe(a);
    expect(c.next!.timeMs!).toBeGreaterThan(a.next!.timeMs!);
  });

  it('drops the entry when the system object is replaced by an edit', () => {
    const a = nextEclipseCached(SOL, 'solar-system-mars', T0)!;
    const edited = { ...SOL, nodes: [...SOL.nodes] } as System;
    expect(nextEclipseCached(edited, 'solar-system-mars', T0)).not.toBe(a);
  });
});

// C9: the frame is applied by the PROPAGATOR, so these read `computeWorldPositions3D` directly. They
// used to compare it against a `framedWorldPositions3D` wrapper, which is exactly the divergence the
// fix removed — so the control is now the same propagator over a system whose HOST DOES NOT LEAN.
describe('the satellite reference frame reaches the search', () => {
  /** Tilt of `moon`'s orbit normal about `host` from the reference plane, in degrees. */
  const orbitTiltDeg = (sys: System, hostId: string, moonId: string, periodDays: number) => {
    const q = (periodDays * DAY) / 4; // two parent-relative samples a quarter period apart
    const rel = (t: number) => {
      const p = computeWorldPositions3D(sys, t);
      const m = p.get(moonId)!, h = p.get(hostId)!;
      return { x: m.x - h.x, y: m.y - h.y, z: m.z - h.z };
    };
    const r0 = rel(T0), r1 = rel(T0 + q);
    const n = { x: r0.y * r1.z - r0.z * r1.y, y: r0.z * r1.x - r0.x * r1.z, z: r0.x * r1.y - r0.y * r1.x };
    return Math.acos(Math.min(1, Math.abs(n.z / Math.hypot(n.x, n.y, n.z)))) * 180 / Math.PI;
  };
  /** The same system with one body's axial tilt removed — the control for "the frame is the equator". */
  const untilted = (id: string): System => {
    const s = JSON.parse(JSON.stringify(SOL)) as System;
    (s.nodes.find((n) => n.id === id) as any).axial_tilt_deg = 0;
    return s;
  };

  it("puts Phobos in Mars's equator, which is 25 deg out of the system plane", () => {
    // Mars leans 25.19 deg and Phobos sits 1.093 deg off its equator, so the orbit normal is ~25 deg
    // from the reference plane. Flatten Mars and the same moon falls back to its own 1.1 deg — which
    // is what the propagator used to answer while Mars was leaning, and what G8 was searching on.
    expect(orbitTiltDeg(SOL, 'solar-system-mars', 'solar-system-phobos', nodeOf('solar-system-phobos').orbital_period_days)).toBeGreaterThan(23);
    expect(orbitTiltDeg(SOL, 'solar-system-mars', 'solar-system-phobos', nodeOf('solar-system-phobos').orbital_period_days)).toBeLessThan(27);
    expect(orbitTiltDeg(untilted('solar-system-mars'), 'solar-system-mars', 'solar-system-phobos', nodeOf('solar-system-phobos').orbital_period_days)).toBeLessThan(2);
  });

  it('leaves Luna alone, because its elements declare themselves ecliptic-framed', () => {
    // Earth leans 23.44 deg, so a satellite of Earth would move by that much — unless it says it is
    // quoted to the ecliptic, as Luna does at 60 Earth radii. Flattening Earth must change nothing.
    const t = T0 + 3 * DAY;
    const a = computeWorldPositions3D(SOL, t).get('solar-system-luna')!;
    const b = computeWorldPositions3D(untilted('solar-system-earth'), t).get('solar-system-luna')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)).toBeLessThan(1e-12);
  });

  it('is the one spelling of the gate: a planet of the root star is never rotated', () => {
    // The renderer used to make this decision itself, and its test for "satellite" was "not one hop
    // from the root" — which would rotate a planet of a binary's SECONDARY star by that star's tilt.
    const byId = (id: string) => SOL.nodes.find((n) => n.id === id) as any;
    expect(satelliteTiltRad(byId('solar-system-mars'), byId('solar-system-sun'))).toBe(0);
    expect(satelliteTiltRad(byId('solar-system-phobos'), byId('solar-system-mars'))).toBeCloseTo(25.19 * Math.PI / 180, 9);
    expect(satelliteTiltRad(byId('solar-system-luna'), byId('solar-system-earth'))).toBe(0);
    // And the rotation is a rotation: it moves a point, it does not stretch it.
    const r = toParentEquator(0.3, -0.4, 0.5, 1.1, { x: 0, y: 0, z: 0 });
    expect(Math.hypot(r.x, r.y, r.z)).toBeCloseTo(Math.hypot(0.3, -0.4, 0.5), 12);
  });
});

describe('megastructure shadow entries — the special entry beside local eclipses (G58)', () => {
	const el = (a_AU: number, i_deg = 0) => ({ a_AU, e: 0, i_deg, Omega_deg: 0, omega_deg: 0, M0_rad: 0 });
	const star = { id: 's', name: 'Star', parentId: null, kind: 'body', roleHint: 'star', massKg: 1.989e30, radiusKm: 696340, temperatureK: 5778, tags: [] };
	const world = (id: string, a: number, i: number) => ({
		id, name: id, parentId: 's', kind: 'body', roleHint: 'planet', massKg: 5.97e24, radiusKm: 6371,
		orbit: { hostId: 's', hostMu: 1.327e20, t0: 0, elements: el(a, i) }, tags: []
	});
	const ring = (i: number) => ({
		id: 'ring', name: 'Ringworld', parentId: 's', kind: 'construct', megaType: 'ringworld',
		orbit: { hostId: 's', hostMu: 1.327e20, t0: 0, elements: el(1, i) }, tags: []
	});
	const sys = (nodes: any[]): System => ({ id: 'sys-mega-ecl', name: 'x', nodes } as unknown as System);

	it('a coplanar world beyond a solid ring reads PERMANENTLY eclipsed - the bad-ring case, said honestly', () => {
		const out = nextEclipse(sys([star, ring(0), world('p', 2, 0)]), 'p', 0);
		expect(out.megastructure).toHaveLength(1);
		const m = out.megastructure![0];
		expect(m.permanent).toBe(true);
		expect(m.obscuration).toBe(1);
		expect(m.kind).toBe('total');
		expect(describeEclipse(m, 0)).toContain('permanent');
		expect(describeEclipse(m, 0)).toContain('Ringworld');
	});

	it('a tilted world crosses the shadow twice an orbit, and the entry says how often and how long', () => {
		const out = nextEclipse(sys([star, ring(0), world('p', 2, 30)]), 'p', 0);
		expect(out.megastructure).toHaveLength(1);
		const m = out.megastructure![0];
		expect(m.permanent).toBeUndefined();
		expect(m.everyOrbit).toBe(true);
		// T(2 AU, 1 Msun) = 2.828 y; two crossings per orbit -> recurrence T/2 = 1.414 y.
		const T = 2 * Math.PI * Math.sqrt(Math.pow(2 * AU_KM * 1000, 3) / 1.327e20) * 1000;
		expect(m.periodMs).toBeCloseTo(T / 2, -8);
		// Aligned share at 30 deg with the default band: ~0.68% of the orbit, split over two
		// crossings -> ~84 h in shadow per crossing.
		expect(m.durationMs! / 3600_000).toBeGreaterThan(75);
		expect(m.durationMs! / 3600_000).toBeLessThan(95);
		const text = describeEclipse(m, 0);
		expect(text).toContain('every');
		expect(text).toContain('for ~');
	});

	it('an isotropic swarm makes no eclipse entry (steady dimming is not an event), nor does a ring you sit inside', () => {
		const swarm = { ...ring(0), id: 'sw', name: 'Swarm', megaType: 'dyson-swarm' };
		expect(nextEclipse(sys([star, swarm, world('p', 2, 0)]), 'p', 0).megastructure ?? []).toHaveLength(0);
		expect(nextEclipse(sys([star, ring(0), world('p', 0.5, 0)]), 'p', 0).megastructure ?? []).toHaveLength(0);
	});
});
