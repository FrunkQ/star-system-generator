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
