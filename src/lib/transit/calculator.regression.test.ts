import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { System } from '../types';
import { calculateTransitPlan } from './calculator';
import { nodeIdByName } from './calculator.test.ts'; // Wait, I can't import from .test.ts easily if not exported.

function loadSolSystem(): System {
  const solPath = path.resolve('static/examples/Sol_2030-System.json');
  return JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
}

function findNodeId(system: System, name: string): string {
  const node = system.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Missing node ${name}`);
  return node.id;
}

describe('Transit Planner Regression Tests', () => {
  it('Jupiter -> Mars transfer has sane Delta-V (< 100 km/s)', () => {
    const system = loadSolSystem();
    const jupiterId = findNodeId(system, 'Jupiter');
    const marsId = findNodeId(system, 'Mars');
    const startTime = Date.UTC(2030, 0, 1, 0, 0, 0);

    const plans = calculateTransitPlan(system, jupiterId, marsId, startTime, 'Economy', {
      maxG: 5.0,
      accelRatio: 0.1,
      brakeRatio: 0.1,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 100_000,
      shipIsp: 10000, // High ISP Epstein
      aerobrake: { allowed: false, limit_kms: 0 }
    });

    console.log(`Plans found: ${plans.length}`);
    plans.forEach(p => {
        console.log(`Plan: ${p.name}, Type: ${p.planType}, DV: ${(p.totalDeltaV_ms/1000).toFixed(1)} km/s, Time: ${p.totalTime_days.toFixed(1)}d, Hidden: ${p.hiddenReason || 'No'}`);
    });

    expect(plans.length).toBeGreaterThan(0);
    const validPlans = plans.filter(p => !p.hiddenReason);
    expect(validPlans.length).toBeGreaterThan(0);
    
    const best = validPlans[0];
    expect(best.totalDeltaV_ms).toBeLessThan(100000); // Should be well under 100 km/s
  });
});
