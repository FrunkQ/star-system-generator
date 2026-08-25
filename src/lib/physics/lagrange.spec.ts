// G43 P1 — the ONE Lagrange convention, its exactness claims, and the derivation pass.
//
// The exactness claims are the load-bearing ones: the design note promises that the rotated-ellipse
// representation holds the equilateral triangle on an ECCENTRIC orbit at every instant, and that
// the (1∓k) scaled orbit reproduces the collinear point's position AND velocity through the
// standard propagator. If either drifts, the P4 velocity-cancelling promise silently breaks.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    deriveCoOrbitalOrbit, deriveCoOrbitalOrbits, coOrbitalRelState, hillFactor,
    maxTrojanMassKg, gascheauMargin, ROUTH_CRITICAL_MU, tadpoleRegion, calculateLagrangePoints
} from './lagrange';
import { propagateState } from './orbits';
import { migrateLagrangePlacements } from '../system/importFixup';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, CelestialBody, RulePack } from '../types';
import { G } from '../constants';

const SUN_KG = 1.989e30;
const PLANET_KG = 1.898e27;   // Jupiter-ish
const TROJAN_KG = 1e20;       // a small moon

function makeSystem(overrides?: { trojanPoint?: 'l1' | 'l2' | 'l3' | 'l4' | 'l5'; e?: number; retrograde?: boolean }): System {
    const e = overrides?.e ?? 0.2;
    const planetOrbit = {
        hostId: 'star', hostMu: SUN_KG * G, t0: 0,
        ...(overrides?.retrograde ? { isRetrogradeOrbit: true } : {}),
        elements: { a_AU: 5.2, e, i_deg: 0, Omega_deg: 0, omega_deg: 30, M0_rad: 1.1 }
    };
    return {
        id: 'sys', name: 'trojan test', seed: 'g43', epochT0: 0, age_Gyr: 4.6,
        rulePackId: 'starter-sf', rulePackVersion: '1', tags: [],
        nodes: [
            { id: 'star', name: 'Star', kind: 'body', roleHint: 'star', parentId: null, tags: [],
              massKg: SUN_KG, radiusKm: 696000, temperatureK: 5778, classes: ['star/G2V'] },
            { id: 'planet', name: 'Planet', kind: 'body', roleHint: 'planet', parentId: 'star', tags: [],
              massKg: PLANET_KG, radiusKm: 69911, orbit: JSON.parse(JSON.stringify(planetOrbit)) },
            { id: 'trojan', name: 'Trojan', kind: 'body', roleHint: 'moon', parentId: 'star', tags: [],
              massKg: TROJAN_KG, radiusKm: 200,
              coOrbital: { hostId: 'planet', point: overrides?.trojanPoint ?? 'l4' } }
        ] as any
    } as System;
}

const times = [0, 86400e3 * 100, 86400e3 * 1000, 86400e3 * 2163]; // ms — across the ~12 yr period

describe('the rotated-ellipse representation (l3/l4/l5)', () => {
    it('holds the equilateral triangle exactly on an eccentric orbit, at every instant', () => {
        const sys = makeSystem({ trojanPoint: 'l4', e: 0.2 });
        deriveCoOrbitalOrbits(sys);
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(trojan.orbit).toBeTruthy();
        for (const t of times) {
            const p = propagateState(planet, t);
            const tr = propagateState(trojan, t);
            const rP = Math.hypot(p.r.x, p.r.y);
            const rT = Math.hypot(tr.r.x, tr.r.y);
            const sep = Math.hypot(p.r.x - tr.r.x, p.r.y - tr.r.y);
            // equilateral: |star-planet| == |star-trojan| == |planet-trojan|
            expect(rT).toBeCloseTo(rP, 8);
            expect(sep).toBeCloseTo(rP, 8);
            // and the trojan LEADS by +60 degrees
            const cross = p.r.x * tr.r.y - p.r.y * tr.r.x;
            expect(cross).toBeGreaterThan(0);
        }
    });

    it('flips the leading side for a retrograde secondary (L4 still leads the motion)', () => {
        const sys = makeSystem({ trojanPoint: 'l4', retrograde: true });
        deriveCoOrbitalOrbits(sys);
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        const p = propagateState(planet, 0);
        const tr = propagateState(trojan, 0);
        // retrograde motion is clockwise, so leading = clockwise of the planet = negative cross
        const cross = p.r.x * tr.r.y - p.r.y * tr.r.x;
        expect(cross).toBeLessThan(0);
    });
});

describe('the scaled-orbit representation (l1/l2)', () => {
    it('reproduces (1-k)·position AND (1-k)·velocity through the standard propagator', () => {
        const sys = makeSystem({ trojanPoint: 'l1', e: 0.2 });
        deriveCoOrbitalOrbits(sys);
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        const k = hillFactor(PLANET_KG, SUN_KG);
        expect(k).toBeGreaterThan(0.06); // Jupiter-ish: ~0.068
        for (const t of times) {
            const p = propagateState(planet, t);
            const tr = propagateState(trojan, t);
            expect(tr.r.x).toBeCloseTo(p.r.x * (1 - k), 8);
            expect(tr.r.y).toBeCloseTo(p.r.y * (1 - k), 8);
            expect(tr.v.x).toBeCloseTo(p.v.x * (1 - k), 10);
            expect(tr.v.y).toBeCloseTo(p.v.y * (1 - k), 10);
        }
    });

    it('l2 scales outward by (1+k)', () => {
        const sys = makeSystem({ trojanPoint: 'l2' });
        deriveCoOrbitalOrbits(sys);
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        const k = hillFactor(PLANET_KG, SUN_KG);
        const p = propagateState(planet, times[1]);
        const tr = propagateState(trojan, times[1]);
        expect(Math.hypot(tr.r.x, tr.r.y)).toBeCloseTo(Math.hypot(p.r.x, p.r.y) * (1 + k), 8);
    });
});

describe('the overlay wrapper agrees with the derivation', () => {
    it('L4 display point equals the derived L4 orbit position', () => {
        const sys = makeSystem({ trojanPoint: 'l4' });
        deriveCoOrbitalOrbits(sys);
        const star = sys.nodes.find(n => n.id === 'star') as CelestialBody;
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        const t = times[2];
        const p = propagateState(planet, t);
        const tr = propagateState(trojan, t);
        const pts = calculateLagrangePoints(star, planet, { x: p.r.x, y: p.r.y });
        const l4 = pts.find(pt => pt.name === 'L4')!;
        expect(l4.x).toBeCloseTo(tr.r.x, 8);
        expect(l4.y).toBeCloseTo(tr.r.y, 8);
    });
});

describe('mass criteria (reference anchors)', () => {
    it('maxTrojanMassKg collapses to the Routh bound as the secondary vanishes', () => {
        const m3 = maxTrojanMassKg(SUN_KG, 0);
        const mu = m3 / (SUN_KG + m3);
        expect(mu).toBeCloseTo(ROUTH_CRITICAL_MU, 6);
    });
    it('a pair already past Routh admits no trojan at all', () => {
        // Pluto-Charon-like: mu ~ 0.108 > 0.0385
        expect(maxTrojanMassKg(1.3e22, 1.6e21)).toBe(0);
    });
    it('gascheauMargin: Sun-Jupiter is stable, an equal binary is not', () => {
        expect(gascheauMargin(SUN_KG, PLANET_KG, TROJAN_KG)).toBeGreaterThan(1);
        expect(gascheauMargin(SUN_KG, SUN_KG, 0)).toBeLessThan(1);
    });
    it('tadpole region carries the Murray & Dermott half-width', () => {
        const r = tadpoleRegion(PLANET_KG, SUN_KG);
        const mu = PLANET_KG / (SUN_KG + PLANET_KG);
        expect(r.radialHalfWidthFrac).toBeCloseTo(Math.sqrt(8 * mu / 3), 12);
        expect(r.longitudeSpanDeg).toEqual([24, 180]);
    });
});

describe('the derivation pass', () => {
    it('re-parents the trojan beside its secondary and is idempotent', () => {
        const sys = makeSystem();
        (sys.nodes.find(n => n.id === 'trojan') as any).parentId = 'planet'; // authored wrong
        deriveCoOrbitalOrbits(sys);
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(trojan.parentId).toBe('star');
        expect(trojan.ui_parentId).toBe('planet');
        const snapshot = JSON.stringify(trojan);
        deriveCoOrbitalOrbits(sys);
        expect(JSON.stringify(sys.nodes.find(n => n.id === 'trojan'))).toBe(snapshot);
    });

    it('drops a dangling marker and keeps the node a plain orbiter', () => {
        const sys = makeSystem();
        deriveCoOrbitalOrbits(sys);                     // trojan now has a real orbit
        sys.nodes = sys.nodes.filter(n => n.id !== 'planet');
        deriveCoOrbitalOrbits(sys);
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(trojan.coOrbital).toBeUndefined();
        expect(trojan.orbit).toBeTruthy();              // last derived orbit survives as authored
    });

    it('editing the secondary moves the trojan on the next pass (the drift class dies)', () => {
        const sys = makeSystem();
        deriveCoOrbitalOrbits(sys);
        const planet = sys.nodes.find(n => n.id === 'planet') as CelestialBody;
        planet.orbit!.elements.a_AU = 7.0;
        deriveCoOrbitalOrbits(sys);
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(trojan.orbit!.elements.a_AU).toBeCloseTo(7.0, 12);
    });
});

describe('migration (Q7): legacy placement strings become markers', () => {
    it('converts placement L4/L5 + ui_parentId, marker-guarded', () => {
        const sys = makeSystem();
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        delete trojan.coOrbital;
        (trojan as any).placement = 'L5';
        trojan.ui_parentId = 'planet';
        migrateLagrangePlacements(sys);
        expect(trojan.coOrbital).toEqual({ hostId: 'planet', point: 'l5' });
        // idempotent: a second run changes nothing, and an existing marker is never overwritten
        (trojan as any).placement = 'L4';
        migrateLagrangePlacements(sys);
        expect(trojan.coOrbital!.point).toBe('l5');
    });
    it('leaves a placement with no recorded secondary alone', () => {
        const sys = makeSystem();
        const trojan = sys.nodes.find(n => n.id === 'trojan') as CelestialBody;
        delete trojan.coOrbital;
        (trojan as any).placement = 'L4';
        trojan.ui_parentId = null as any;
        migrateLagrangePlacements(sys);
        expect(trojan.coOrbital).toBeUndefined();
    });
});

// The full-processor gate: a trojan body survives process() with a derived orbit, no spurious
// instability verdict against its own secondary, and process-twice leaves it unchanged.
function deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (target && typeof target === 'object' && source && typeof source === 'object') {
        for (const key of Object.keys(source)) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && key in target) {
                output[key] = deepMerge(target[key], source[key]);
            } else Object.assign(output, { [key]: source[key] });
        }
    }
    return output;
}
function loadPack(): RulePack {
    const basePath = path.resolve('static/rulepacks/starter-sf');
    let pack = JSON.parse(fs.readFileSync(path.join(basePath, 'main.json'), 'utf-8')) as RulePack;
    for (const file of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json']) {
        const p = path.join(basePath, file);
        if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
    }
    return pack;
}

describe('through the full processor', () => {
    const pack = loadPack();

    it('a trojan body processes cleanly: derived orbit, no crossing verdict, idempotent', () => {
        const sys = makeSystem();
        const once = systemProcessor.process(JSON.parse(JSON.stringify(sys)), pack);
        const trojan1 = once.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(trojan1.orbit).toBeTruthy();
        expect(trojan1.orbit!.elements.a_AU).toBeCloseTo(5.2, 10);
        // co-orbital exemption: no "orbit overlap" doom against its own secondary
        expect((trojan1 as any).orbitalStability).toBeUndefined();

        const twice = systemProcessor.process(JSON.parse(JSON.stringify(once)), pack);
        const trojan2 = twice.nodes.find(n => n.id === 'trojan') as CelestialBody;
        expect(JSON.stringify(trojan2.orbit)).toBe(JSON.stringify(trojan1.orbit));
        expect(trojan2.coOrbital).toEqual(trojan1.coOrbital);
    });
});
