import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { System } from '../types';
import { calculateTransitPlan } from './calculator';
import { getGlobalState } from './physics';
import { AU_KM, G } from '../constants';

function loadSolSystem(): System {
  const solPath = path.resolve('static/examples/Sol_2030-System.json');
  return JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
}

function nodeIdByName(system: System, name: string): string {
  const node = system.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Missing node ${name}`);
  return node.id;
}

function angularSeparationRad(system: System, aId: string, bId: string, tMs: number): number {
  const a = system.nodes.find((n) => n.id === aId);
  const b = system.nodes.find((n) => n.id === bId);
  if (!a || !b) return 0;
  const sa = getGlobalState(system, a as any, tMs);
  const sb = getGlobalState(system, b as any, tMs);
  const aa = Math.atan2(sa.r.y, sa.r.x);
  const ab = Math.atan2(sb.r.y, sb.r.x);
  let d = Math.abs(ab - aa);
  while (d > Math.PI) d = Math.abs(d - 2 * Math.PI);
  return d;
}

describe('Transit Calculator Grounded Cases', () => {
  it('Earth -> Luna returns physically valid plans and no legacy kinematic direct path', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const moonId = nodeIdByName(system, 'Luna');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const earth = system.nodes.find((n) => n.id === earthId) as any;
    const rOrbitAu = 7000 / AU_KM;
    const vOrbitAuS = Math.sqrt((earth.massKg * G) / (7000 * 1000)) / (AU_KM * 1000);

    const plans = calculateTransitPlan(system, earthId, moonId, startTime, 'Economy', {
      maxG: 3.0,
      accelRatio: 0.6,
      brakeRatio: 0.3,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      initialState: {
        r: { x: rOrbitAu, y: 0 },
        v: { x: 0, y: vOrbitAuS }
      },
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    expect(plans.length).toBeGreaterThan(0);

    const direct = plans.find((p) => p.planType === 'Speed');
    expect(direct).toBeDefined();
    expect(direct?.isKinematic).not.toBe(true);

    for (const p of plans) {
      expect(Number.isFinite(p.totalDeltaV_ms)).toBe(true);
      expect(Number.isFinite(p.totalTime_days)).toBe(true);
      expect(p.segments.length).toBeGreaterThan(0);
      for (const seg of p.segments) {
        expect(seg.pathPoints.length).toBeGreaterThan(1);
        for (const pt of seg.pathPoints) {
          expect(Number.isFinite(pt.x)).toBe(true);
          expect(Number.isFinite(pt.y)).toBe(true);
        }
      }
    }
  });

  it('Earth -> Luna accepts global chained state and still solves local-frame direct transfer', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const moonId = nodeIdByName(system, 'Luna');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const earth = system.nodes.find((n) => n.id === earthId) as any;
    const earthGlobal = getGlobalState(system, earth, startTime);
    const rOrbitAu = 7000 / AU_KM;
    const vOrbitAuS = Math.sqrt((earth.massKg * G) / (7000 * 1000)) / (AU_KM * 1000);

    const plans = calculateTransitPlan(system, earthId, moonId, startTime, 'Economy', {
      maxG: 2.0,
      accelRatio: 0.2,
      brakeRatio: 0.2,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      initialStateFrame: 'global',
      initialState: {
        r: { x: earthGlobal.r.x + rOrbitAu, y: earthGlobal.r.y },
        v: { x: earthGlobal.v.x, y: earthGlobal.v.y + vOrbitAuS }
      },
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    expect(plans.length).toBeGreaterThan(0);
    const direct = plans.find((p) => p.planType === 'Speed');
    expect(direct).toBeDefined();
    expect(Number.isFinite(direct!.totalDeltaV_ms)).toBe(true);
    expect(direct!.segments.length).toBeGreaterThan(0);
    for (const seg of direct!.segments) {
      for (const pt of seg.pathPoints) {
        expect(Number.isFinite(pt.x)).toBe(true);
        expect(Number.isFinite(pt.y)).toBe(true);
      }
    }
  });

  it('Earth -> Luna Most Efficient window stays within local-orbit-scale delays', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const moonId = nodeIdByName(system, 'Luna');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);

    const plans = calculateTransitPlan(system, earthId, moonId, startTime, 'Economy', {
      maxG: 1.0,
      accelRatio: 0.1,
      brakeRatio: 0.1,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    const efficientPlans = plans.filter((p) => p.name === 'Most Efficient' || p.name === 'Efficient Now' || p.planType === 'Efficiency');
    for (const p of efficientPlans) {
      expect((p.initialDelay_days || 0)).toBeLessThan(60);
    }
  });

  it('Earth -> Saturn supports non-zero flyby arrival speed when requested', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const saturnId = nodeIdByName(system, 'Saturn');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);

    const plans = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', {
      maxG: 1.0,
      accelRatio: 0.25,
      brakeRatio: 0.15,
      interceptSpeed_ms: 5000,
      brakeAtArrival: false,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    expect(plans.length).toBeGreaterThan(0);
    const flybyCandidate = plans.find((p) => p.planType === 'Speed') ?? plans[0];
    expect(flybyCandidate.arrivalVelocity_ms).toBeGreaterThan(3000);
  });

  it('Earth -> Saturn aerobraking reduces capture effort when enabled', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const saturnId = nodeIdByName(system, 'Saturn');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);

    const baseParams = {
      maxG: 1.0,
      accelRatio: 0.15,
      brakeRatio: 0.15,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      parkingOrbitRadius_au: 70_000 / 149_597_870.7 // ~70,000 km orbit radius converted to AU
    };

    const noAero = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', {
      ...baseParams,
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    const withAero = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', {
      ...baseParams,
      aerobrake: { allowed: true, limit_kms: 80 }
    });

    expect(noAero.length).toBeGreaterThan(0);
    expect(withAero.length).toBeGreaterThan(0);

    const noAeroEff = noAero.find((p) => p.planType === 'Efficiency') ?? noAero[0];
    const aeroEff = withAero.find((p) => p.planType === 'Efficiency') ?? withAero[0];

    expect(aeroEff.totalDeltaV_ms).toBeLessThanOrEqual(noAeroEff.totalDeltaV_ms);
    expect((aeroEff.aerobrakingDeltaV_ms || 0)).toBeGreaterThanOrEqual(0);
  });

  it('Earth -> Jupiter with near-opposite solar alignment still returns sane routes', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const jupiterId = nodeIdByName(system, 'Jupiter');

    // Search a 5-year window for a near-opposition geometry (>170 deg separation).
    const startAnchor = Date.UTC(2030, 0, 1, 0, 0, 0);
    let startTime = startAnchor;
    for (let i = 0; i < 365 * 5; i += 5) {
      const t = startAnchor + i * 86400 * 1000;
      const sep = angularSeparationRad(system, earthId, jupiterId, t);
      if (sep > (170 * Math.PI) / 180) {
        startTime = t;
        break;
      }
    }

    const plans = calculateTransitPlan(system, earthId, jupiterId, startTime, 'Economy', {
      maxG: 1.0,
      accelRatio: 0.2,
      brakeRatio: 0.2,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 2_000_000,
      shipIsp: 380,
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    expect(plans.length).toBeGreaterThan(0);
    const best = plans.find((p) => p.planType === 'Efficiency') ?? plans[0];
    expect(best.totalDeltaV_ms).toBeLessThan(200_000);

    // Reject obvious "line into space / sundive" artifacts via perihelion floor on drawn path.
    const allPoints = best.segments.flatMap((s) => s.pathPoints);
    const minR = Math.min(...allPoints.map((p) => Math.hypot(p.x, p.y)));
    expect(minR).toBeGreaterThan(0.2);
  });
});

describe('Transit Calculator — costOnly (autopilot reorder cost path)', () => {
  it('costOnly returns the same time/Δv as the full plan, but far fewer path points', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const saturnId = nodeIdByName(system, 'Saturn');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const params: any = {
      maxG: 3.0, accelRatio: 0.6, brakeRatio: 0.3, interceptSpeed_ms: 0, brakeAtArrival: true,
      shipMass_kg: 2_000_000, shipIsp: 380, aerobrake: { allowed: false, limit_kms: 0 }
    };
    const full = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', { ...params });
    const cheap = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', { ...params, costOnly: true });
    expect(full.length).toBeGreaterThan(0);

    const pts = (p: any) => p.segments.reduce((s: number, seg: any) => s + (seg.pathPoints?.length || 0), 0);
    for (const f of full) {
      const c = cheap.find((x) => x.planType === f.planType && x.name === f.name);
      if (!c) continue;
      // Same analytic cost — the reorder and the committed leg can't disagree.
      expect(c.totalTime_days).toBeCloseTo(f.totalTime_days, 2);
      expect(Math.abs(c.totalDeltaV_ms - f.totalDeltaV_ms) / Math.max(1, f.totalDeltaV_ms)).toBeLessThan(0.05);
      // ...but the heavy display trajectory is skipped.
      expect(pts(c)).toBeLessThan(pts(f));
    }
  });

  it('quote returns only the two cost families the search ranks on (Efficient Now + Direct Burn)', () => {
    const system = loadSolSystem();
    const earthId = nodeIdByName(system, 'Earth');
    const saturnId = nodeIdByName(system, 'Saturn');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);
    const params: any = {
      maxG: 3.0, accelRatio: 0.6, brakeRatio: 0.3, interceptSpeed_ms: 0, brakeAtArrival: true,
      shipMass_kg: 2_000_000, shipIsp: 380, aerobrake: { allowed: false, limit_kms: 0 }
    };
    const full = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', { ...params });
    const quote = calculateTransitPlan(system, earthId, saturnId, startTime, 'Economy', { ...params, quote: true });

    // Quote drops the costly extras: the delayed-window "Most Efficient" and the gravity-assist "Complex".
    expect(quote.some((p) => p.name === 'Most Efficient')).toBe(false);
    expect(quote.some((p) => p.planType === 'Complex')).toBe(false);
    // It keeps a torch (Direct Burn) and an efficiency (Efficient Now) leg to rank fast-vs-thrifty on.
    expect(quote.some((p) => p.name === 'Direct Burn')).toBe(true);
    expect(quote.some((p) => p.planType === 'Efficiency')).toBe(true);

    // FAITHFULNESS: the torch leg the search ranks on is the SAME plan the full solver commits — equal cost,
    // so a quoted ordering can never disagree with the leg it actually flies.
    const qDirect = quote.find((p) => p.name === 'Direct Burn')!;
    const fDirect = full.find((p) => p.name === 'Direct Burn')!;
    expect(qDirect).toBeTruthy();
    expect(fDirect).toBeTruthy();
    expect(qDirect.totalTime_days).toBeCloseTo(fDirect.totalTime_days, 2);
    expect(qDirect.totalDeltaV_ms).toBeCloseTo(fDirect.totalDeltaV_ms, 0);

    // The quoted efficiency leg is a conservative (>=) stand-in for the full Most-Efficient window search —
    // never cheaper than the real optimum, so the search never under-promises what the commit can do.
    const qEff = quote.find((p) => p.planType === 'Efficiency')!;
    const fEff = full.find((p) => p.name === 'Most Efficient') || full.find((p) => p.planType === 'Efficiency')!;
    expect(qEff.totalDeltaV_ms).toBeGreaterThanOrEqual(fEff.totalDeltaV_ms - 1);
  });
});
