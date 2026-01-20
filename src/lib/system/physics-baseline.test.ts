import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import type { System, RulePack, CelestialBody } from '../types';

// --- Helper: Node RulePack Loader ---
function deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        Object.keys(source).forEach(key => {
            if (isObject(source[key])) {
                if (!(key in target)) {
                    Object.assign(output, { [key]: source[key] });
                } else {
                    output[key] = deepMerge(target[key], source[key]);
                }
            } else {
                Object.assign(output, { [key]: source[key] });
            }
        });
    }
    return output;
}

function isObject(item: any): boolean {
    return (item && typeof item === 'object' && !Array.isArray(item));
}

function loadRulePackFromDisk(basePath: string): RulePack {
    const mainPath = path.join(basePath, 'main.json');
    const mainContent = fs.readFileSync(mainPath, 'utf-8');
    let pack = JSON.parse(mainContent) as RulePack;

    const filesToMerge = [
        'construct_templates.json',
        'engine-definitions.json',
        'fuel-definitions.json',
        'liquids.json',
        'classification.json',
        'atmospheres.json' // Explicitly added as we know it's there
    ];

    for (const file of filesToMerge) {
        const filePath = path.join(basePath, file);
        if (fs.existsSync(filePath)) {
            const content = fs.readFileSync(filePath, 'utf-8');
            const data = JSON.parse(content);
            pack = deepMerge(pack, data);
        }
    }
    
    return pack;
}

// --- Helper: Strip Derived Data ---
function stripDerivedData(system: System): System {
    const stripped = JSON.parse(JSON.stringify(system)); // Deep copy

    const keysToRemove = [
        'calculatedGravity_ms2',
        'calculatedRotationPeriod_s',
        'orbital_period_days', // Derived from mass/radius/orbit
        'equilibriumTempK',
        'greenhouseTempK',
        'temperatureK',
        'tidalHeatK',
        'radiogenicHeatK',
        'surfaceRadiation',
        'habitabilityScore',
        'orbitalBoundaries',
        'loDeltaVBudget_ms',
        'propulsiveLandBudget_ms',
        'aerobrakeLandBudget_ms'
    ];

    // Also clear habitability tags, they are re-added
    const tagPrefixesToRemove = ['habitability/'];

    stripped.nodes.forEach((node: any) => {
        if (node.kind === 'body') {
            keysToRemove.forEach(key => delete node[key]);

            if (node.tags) {
                node.tags = node.tags.filter((t: any) => !tagPrefixesToRemove.some(prefix => t.key.startsWith(prefix)));
            }
            
            // Atmosphere molar mass is derived from composition
            if (node.atmosphere && node.atmosphere.molarMassKg) {
                 delete node.atmosphere.molarMassKg;
            }
        }
    });

    return stripped;
}

describe('Solar System Physics Baseline', () => {
    it('should reproduce Solar System physics values', () => {
        // 1. Load Data
        const solPath = path.resolve('static/examples/Sol_2030-System.json');
        const solSystem = JSON.parse(fs.readFileSync(solPath, 'utf-8')) as System;
        
        const rulePackPath = path.resolve('static/rulepacks/starter-sf');
        const rulePack = loadRulePackFromDisk(rulePackPath);

        // 2. Strip Data
        const strippedSystem = stripDerivedData(solSystem);
        
        // Save Stripped Input for inspection
        const fixturePath = path.resolve('tests/fixtures/solar-system-input.json');
        fs.writeFileSync(fixturePath, JSON.stringify(strippedSystem, null, 2));
        console.log(`Saved stripped fixture to ${fixturePath}`);

        // 3. Process
        const processedSystem = systemProcessor.process(strippedSystem, rulePack);

        // 4. Save Output
        const outputPath = path.resolve('tests/output/solar-system-derived.json');
        fs.writeFileSync(outputPath, JSON.stringify(processedSystem, null, 2));
        console.log(`Saved processed output to ${outputPath}`);

        // 5. Basic Assertions (Sanity Check)
        const earth = processedSystem.nodes.find(n => n.name === 'Earth') as CelestialBody;
        const moon = processedSystem.nodes.find(n => n.name === 'Luna') as CelestialBody;
        const venus = processedSystem.nodes.find(n => n.name === 'Venus') as CelestialBody;
        const mars = processedSystem.nodes.find(n => n.name === 'Mars') as CelestialBody;
        const io = processedSystem.nodes.find(n => n.name === 'Io') as CelestialBody;
        const jupiter = processedSystem.nodes.find(n => n.name === 'Jupiter') as CelestialBody;
        const saturn = processedSystem.nodes.find(n => n.name === 'Saturn') as CelestialBody;
        const uranus = processedSystem.nodes.find(n => n.name === 'Uranus') as CelestialBody;
        const neptune = processedSystem.nodes.find(n => n.name === 'Neptune') as CelestialBody;

        expect(earth).toBeDefined();

        // --- Gravity (F = G*M/r^2) ---
        // Earth: ~9.81 m/s^2
        expect(earth.calculatedGravity_ms2).toBeCloseTo(9.8, 1);
        
        // --- Orbital Physics (Kepler's 3rd Law) ---
        // Earth Period: ~365.25 days
        expect(earth.orbital_period_days).toBeCloseTo(365.25, 0); 
        // Moon Period: ~27.3 days
        expect(moon.orbital_period_days).toBeCloseTo(27.3, 0);

        // --- Thermodynamics & Atmosphere ---
        // Earth Surface Temp: ~288K (15C)
        expect(earth.temperatureK).toBeGreaterThan(260);
        expect(earth.temperatureK).toBeLessThan(320);
        expect(earth.atmosphere?.pressure_bar).toBeCloseTo(1.013, 2);

        // Venus: Runaway Greenhouse
        // Surface Temp should be hellish (>700K)
        expect(venus.temperatureK).toBeGreaterThan(700);
        // Greenhouse contribution should be massive (>400K)
        expect(venus.greenhouseTempK).toBeGreaterThan(400);

        // Mars: Thin Atmosphere & Cold
        // Pressure < 0.01 bar
        expect(mars.atmosphere?.pressure_bar).toBeLessThan(0.01);
        // Temp < 250K
        expect(mars.temperatureK).toBeLessThan(250);

        // --- Gas Giants (1 bar / Cloud Top Temp) ---
        // Jupiter: ~165K at 1 bar.
        // Our model previously returned > 400K due to runaway greenhouse.
        // With the 200 bar cap, it should be lower, but we need to tune it.
        // Expect < 250K for now to allow some margin.
        expect(jupiter.temperatureK).toBeLessThan(250); 

        // Neptune: ~72K at 1 bar.
        // With Greenhouse cap, it should definitely not be +500C (790K).
        // Expect < 150K.
        expect(neptune.temperatureK).toBeLessThan(150);

        // --- Tidal Physics ---
        // Io: Extreme Tidal Heating
        // Should be significant (> 100K contribution)
        expect(io.tidalHeatK).toBeGreaterThan(100);

        // --- Habitability ---
        expect(earth.habitabilityScore).toBeGreaterThan(90);
        expect(mars.habitabilityScore).toBeLessThan(40);

        // --- Flight Dynamics ---
        // Earth LEO min boundary: ~160km - 200km (depends on atmosphere model)
        expect(earth.orbitalBoundaries?.minLeoKm).toBeGreaterThan(150);
        expect(earth.orbitalBoundaries?.minLeoKm).toBeLessThan(200);

        // --- Radiation (Real World Baseline) ---
        // Earth Surface: ~2.4 mSv/year (Global Average Background)
        // Note: Our engine might only calculate Space Weather contribution (~0.3 mSv), but let's test for the total.
        expect(earth.surfaceRadiation).toBeGreaterThan(2.0); 
        expect(earth.surfaceRadiation).toBeLessThan(3.0);

        // Luna Surface: ~500 mSv/year (Unshielded GCR + Solar)
        expect(moon.surfaceRadiation).toBeGreaterThan(400);
        expect(moon.surfaceRadiation).toBeLessThan(600);
    });
});
