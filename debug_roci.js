import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './src/lib/transit/calculator.js';
import { getGlobalState } from './src/lib/transit/physics.js';
import { AU_KM } from './src/lib/constants.js';

// Load system
const solPath = path.resolve('static/examples/Sol_Expanse-System.json');
const system = JSON.parse(fs.readFileSync(solPath, 'utf-8'));

// Inject Roci
const rociIndex = system.nodes.findIndex((n) => n.name === 'Rocinante (Tachi)');
system.nodes[rociIndex] = {
    "id": "ship-expanse-rocinante",
    "parentId": "solar-system-sun",
    "name": "Rocinante (Tachi)",
    "kind": "construct",
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
    }
};

const rociId = 'ship-expanse-rocinante';
const marsId = system.nodes.find((n) => n.name === 'Mars').id;

// EXACT variables from User's UI Log
const startTime = 1767250575000;
const params = {
    maxG: 1, 
    accelRatio: 0.1, 
    brakeRatio: 0.1, 
    interceptSpeed_ms: 0, 
    shipMass_kg: 1441575,
    shipIsp: 1100000,
    brakeAtArrival: true,
    parkingOrbitRadius_au: 0.000023489760370630024,
    arrivalPlacement: 'lo',
    aerobrake: { allowed: true, limit_kms: 12 }
};

console.log("Start State Roci:", getGlobalState(system, system.nodes.find(n=>n.id === rociId), startTime));
console.log("Start State Mars:", getGlobalState(system, system.nodes.find(n=>n.id === marsId), startTime));

const plans = calculateTransitPlan(system, rociId, marsId, startTime, 'Economy', params as any);

console.log(`\nFound ${plans.length} plans.`);
plans.forEach(p => {
    console.log(`- ${p.name} | hidden: ${p.hiddenReason || 'No'} | DV: ${p.totalDeltaV_ms.toFixed(1)} m/s | Time: ${p.totalTime_days.toFixed(1)} d`);
});
