import { describe, it } from 'vitest';
import fs from 'fs';
import path from 'path';
import { calculateTransitPlan } from './calculator.js';

const solPath = path.resolve('static/examples/Sol_Expanse-System.json');
const system = JSON.parse(fs.readFileSync(solPath, 'utf-8'));

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
} as any;

const rociId = 'ship-expanse-rocinante';
const marsId = system.nodes.find((n) => n.name === 'Mars').id;
const startTime = 1767250575000;

describe('Fast Plan Parameter Test', () => {
    it('Should output different times for different G limits', () => {
        function testG(g: number) {
            const plans = calculateTransitPlan(system, rociId, marsId, startTime, 'Speed', {
                maxG: g, 
                accelRatio: 0.1, 
                brakeRatio: 0.1, 
                interceptSpeed_ms: 0, 
                shipMass_kg: 1441575,
                shipIsp: 1100000,
                brakeAtArrival: true,
                parkingOrbitRadius_au: 0.000023489760370630024,
                arrivalPlacement: 'lo',
                aerobrake: { allowed: true, limit_kms: 12 }
            });
            const speedPlan = plans.find(p => p.planType === 'Speed');
            console.log(`MaxG: ${g.toFixed(1)} -> Time: ${speedPlan?.totalTime_days.toFixed(1)} days | DV: ${((speedPlan?.totalDeltaV_ms || 0)/1000).toFixed(1)} km/s | AccelRatio: ${(speedPlan?.accelRatio || 0).toFixed(3)} | BrakeRatio: ${(speedPlan?.brakeRatio || 0).toFixed(3)}`);
        }

        testG(1.0);
        testG(3.0);
        testG(5.6);
        testG(10.0);
    });
});

