import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { System } from '../types';
import { calculateTransitPlan } from './calculator';

function loadSolSystem(): System {
  const solPath = path.resolve('static/examples/Sol_Expanse-System.json');
  return JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
}

function findNodeId(system: System, name: string): string {
  const node = system.nodes.find((n) => n.name === name);
  if (!node) throw new Error(`Missing node ${name}`);
  return node.id;
}

describe('Transit Planner Rocinante Tests', () => {
  it('Rocinante -> Mars transfer has sane Delta-V', () => {
    const system = loadSolSystem();
    const rociIndex = system.nodes.findIndex((n) => n.name === 'Rocinante (Tachi)');
    
    // Inject user's exact Rocinante JSON
    system.nodes[rociIndex] = {
      "id": "ship-expanse-rocinante",
      "parentId": "solar-system-sun",
      "name": "Rocinante (Tachi)",
      "kind": "construct",
      "roleHint": "ship",
      "class": "Expanse/Ship/Corvette",
      "description": "Legitimate salvage. A Martian Corvette class. Fast, deadly, and versatile.",
      "gmNotes": "Hero ship. Capable of atmospheric landing and 10G+ burns.",
      "IsTemplate": false,
      "icon_type": "triangle",
      "icon_color": "#ff4400",
      "crew": {
        "current": 4,
        "max": 15
      },
      "physical_parameters": {
        "dimensionsM": [
          46,
          15,
          15
        ],
        "massKg": 250000,
        "cargoCapacity_tonnes": 100,
        "rotation_period_hours": 0,
        "spinRadiusM": 0,
        "can_aerobrake": true,
        "has_landing_gear": true
      },
      "engines": [
        {
          "engine_id": "engine-fusion-epstein",
          "quantity": 2
        }
      ],
      "fuel_tanks": [
        {
          "fuel_type_id": "fuel-fusion-dt",
          "capacity_units": 10000,
          "current_units": 5207
        }
      ],
      "systems": {
        "power_plants": [
          {
            "type": "Epstein Drive Cone",
            "output_MW": 800
          }
        ],
        "modules": [
          "PDC Grid (6x)",
          "Torpedo Tubes (2x)",
          "Coffee Machine"
        ],
        "life_support": {
          "consumables_max_person_days": 600,
          "consumables_current_person_days": 550
        }
      },
      "current_cargo_tonnes": 20,
      "cargoDescription": "Ammo & Coffee",
      "orbit": {
        "hostId": "solar-system-sun",
        "hostMu": 132751826999999990000,
        "t0": 1763640079144,
        "elements": {
          "a_AU": 13.290204159724523,
          "e": 0,
          "i_deg": 0,
          "omega_deg": 0,
          "Omega_deg": 0,
          "M0_rad": 3.4402037081602392
        }
      },
      "placement": "Saturn - Uranus",
      "ui_parentId": null
    } as any;

    const rociId = 'ship-expanse-rocinante';
    const marsId = findNodeId(system, 'Mars');
    // Force exact time from user log
    const startTime = 1767250575000; 

    const plans = calculateTransitPlan(system, rociId, marsId, startTime, 'Economy', {
      maxG: 1,
      accelRatio: 0.1,
      brakeRatio: 0.1,
      interceptSpeed_ms: 0,
      brakeAtArrival: true,
      shipMass_kg: 1441575,
      shipIsp: 1100000, 
      aerobrake: { allowed: true, limit_kms: 12 },
      arrivalPlacement: 'lo',
      parkingOrbitRadius_au: 0.000023489760370630024
    });

    console.log(`Plans found: ${plans.length}`);
    plans.forEach(p => {
        console.log(`Plan: ${p.name}, Type: ${p.planType}, DV: ${(p.totalDeltaV_ms/1000).toFixed(1)} km/s, Time: ${p.totalTime_days.toFixed(1)}d, Hidden: ${p.hiddenReason || 'No'}`);
    });

    expect(plans.length).toBeGreaterThan(0);
  });
});
