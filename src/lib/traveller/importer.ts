import { TravellerDecoder } from './decoder';
import { SeededRNG } from './rng';
import { bodyFactory } from '$lib/core/BodyFactory';
import { _generateStar } from '$lib/generation/star';
import { _generatePlanetaryBody } from '$lib/generation/planet';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { G, AU_KM, EARTH_MASS_KG } from '$lib/constants';
import { calculateOrbitalBoundaries, type PlanetData } from '$lib/physics/orbits';
import type { System, StarSystemNode, RulePack, CelestialBody, Barycenter, Orbit, TableSpec } from '$lib/types';
import { generateId, weightedChoice, randomFromRange, toRoman } from '$lib/utils';
import { calculateOrbitalSlots } from '$lib/generation/placement-strategy';

export class TravellerImporter {
    private decoder = new TravellerDecoder();
    private rng: SeededRNG;

    constructor() {
        this.rng = new SeededRNG("traveller-default"); // Initial seed
    }

    processSubsectorData(
        sector: { name: string },
        subsectorCode: string,
        rawData: string, 
        originX: number, 
        originY: number, 
        gridSize: number,
        rulePack: RulePack
    ): { systems: StarSystemNode[], metadata: any } {
        const lines = rawData.split(/\r?\n/);
        if (lines.length < 2) return { systems: [], metadata: null };

        const headerLine = lines[0];
        const headers = headerLine.split('\t').reduce((acc, name, i) => {
            acc[name] = i;
            return acc;
        }, {} as Record<string, number>);

        const newSystems: StarSystemNode[] = [];
        const hexSize = gridSize / 2;
        const hexWidth = 2 * hexSize;
        const hexHeight = Math.sqrt(3) * hexSize;
        const horizDist = 1.5 * hexSize;

        // Calculate Subsector Offset
        const subIndex = subsectorCode.toUpperCase().charCodeAt(0) - 65; 
        const subRowIndex = Math.floor(subIndex / 4);
        const subColIndex = subIndex % 4;
        const offsetCol = subColIndex * 8;
        const offsetRow = subRowIndex * 10;

        const subsectorId = generateId();

        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            const worldData = this.decoder.parseWorldLine(line, headers);
            if (!worldData) continue;

            const hexCode = worldData.hex; 
            const col = parseInt(hexCode.substring(0, 2));
            const row = parseInt(hexCode.substring(2, 4));

            const c = (col - 1) - offsetCol;
            const r = (row - 1) - offsetRow;

            const posX = c * horizDist + originX;
            const posY = r * hexHeight + (Math.abs(c) % 2) * (hexHeight / 2) + originY;

            const system = this.generateTravellerSystem(worldData, rulePack);

            newSystems.push({
                id: system.id,
                name: worldData.name,
                position: { x: posX, y: posY },
                system: system,
                subsectorId: subsectorId
            });
        }
        
        return { 
            systems: newSystems, 
            metadata: {
                id: subsectorId,
                name: "Subsector " + subsectorCode,
                sectorName: sector.name,
                subsectorCode,
                originX,
                originY
            } 
        };
    }

    private generateTravellerSystem(data: any, rulePack: RulePack): System {
        const seed = `${data.uwp}-${data.name}`;
        this.rng = new SeededRNG(seed);
        const systemId = generateId();
        
        const uwp = this.decoder.parseUWP(data.uwp);
        const description = `
WORLD DATA: ${data.name.toUpperCase()}
-----------------------
Location:    ${this.decoder.getAllegianceName(data.allegiance)}
Travel Zone: ${data.travelZone}
System:      Stars: ${data.stars}
             Gas/Ice Giants: ${data.pbg[2]} | Belts: ${data.pbg[1]} | Other: ${data.w}

STATISTICS (UWP: ${data.uwp})
-----------------------
Starport:      [${uwp.starport}] ${this.decoder.getStarportDescription(uwp.starport)}
Size:          [${uwp.size}] ${this.decoder.getSizeDescription(uwp.size)}
Atmosphere:    [${uwp.atmosphere}] ${this.decoder.getAtmosphereDescription(uwp.atmosphere)}
Hydrographics: [${uwp.hydrographics}] ${this.decoder.getHydroDescription(uwp.hydrographics)}
Population:    [${uwp.population}] ${data.pbg[0]} x ${this.decoder.getPopDescription(uwp.population)}
Government:    [${uwp.government}] (Code ${uwp.government})
Law Level:     [${uwp.law}] ${this.decoder.getLawDescription(uwp.law)}
Tech Level:    [${uwp.techLevel}] (TL-${uwp.techLevel})

ECONOMICS & CULTURE
-------------------
Trade Codes:   ${data.tradeCodes.join(', ')}
Importance:    ${this.decoder.decodeImportance(data.ix)}
Economics:     ${this.decoder.decodeEconomics(data.ex)}

RAW DATA
--------
${data.raw}
        `.trim();

        // 1. Stars Generation
        const starParts = (data.stars || "G2 V").split(' ');
        const starEntries: string[] = [];
        for (let i = 0; i < starParts.length; i += 2) {
            if (starParts[i] && starParts[i+1]) starEntries.push(`star/${starParts[i]}${starParts[i+1]}`);
            else if (starParts[i]) starEntries.push(`star/${starParts[i]}V`);
        }

        const nodes: (CelestialBody | Barycenter)[] = [];
        let systemRootId: string;
        let primaryStar: CelestialBody;

        const isCloseBinary = data.tradeCodes.includes('Close Binary') || (data.raw && data.raw.includes('Close Binary'));

        if (starEntries.length < 2) {
            // Single Star
            primaryStar = _generateStar(generateId(), null, rulePack, this.rng, starEntries[0]);
            primaryStar.name = `Star ${data.name}`;
            nodes.push(primaryStar);
            systemRootId = primaryStar.id;
        } else if (isCloseBinary) {
            // P-Type
            const barycenter: Barycenter = {
                id: generateId(),
                parentId: null,
                name: `${data.name} Barycenter`,
                kind: "barycenter",
                memberIds: [],
                tags: []
            };
            systemRootId = barycenter.id;

            const starA = _generateStar(generateId(), barycenter.id, rulePack, this.rng, starEntries[0]);
            starA.name = `${data.name} A`;
            const starB = _generateStar(generateId(), barycenter.id, rulePack, this.rng, starEntries[1]);
            starB.name = `${data.name} B`;

            barycenter.memberIds = [starA.id, starB.id];
            const totalMassKg = (starA.massKg || 0) + (starB.massKg || 0);
            barycenter.effectiveMassKg = totalMassKg;

            const totalSeparationAU = randomFromRange(this.rng as any, 0.1, 5.0);
            const m1 = starA.massKg || 0;
            const m2 = starB.massKg || 0;
            const hostMu = G * totalMassKg;
            const n_rad_per_s = Math.sqrt(hostMu / Math.pow(totalSeparationAU * AU_KM * 1000, 3));

            starA.orbit = { hostId: barycenter.id, hostMu, t0: Date.now(), n_rad_per_s, elements: { a_AU: totalSeparationAU * (m2 / (totalMassKg || 1)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } };
            starB.orbit = { hostId: barycenter.id, hostMu, t0: Date.now(), n_rad_per_s, elements: { a_AU: totalSeparationAU * (m1 / (totalMassKg || 1)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: Math.PI } };

            nodes.push(barycenter, starA, starB);
            primaryStar = starA;
        } else {
            // S-Type
            primaryStar = _generateStar(generateId(), null, rulePack, this.rng, starEntries[0]);
            primaryStar.name = `${data.name} A`;
            systemRootId = primaryStar.id;
            nodes.push(primaryStar);

            const starB = _generateStar(generateId(), primaryStar.id, rulePack, this.rng, starEntries[1]);
            starB.name = `${data.name} B`;
            const distAU = randomFromRange(this.rng as any, 1000, 5000);
            starB.orbit = {
                hostId: primaryStar.id,
                hostMu: G * (primaryStar.massKg || 0),
                t0: Date.now(),
                elements: { a_AU: distAU, e: randomFromRange(this.rng as any, 0.1, 0.5), i_deg: randomFromRange(this.rng as any, 0, 180), omega_deg: 0, Omega_deg: 0, M0_rad: this.rng.next() * Math.PI * 2 }
            };
            nodes.push(starB);
        }

        primaryStar.description = description; 
        primaryStar.traveller = data;

        // 2. Main World Generation
        const uwpSizeDigit = this.decoder.hexVal(uwp.size);
        
        // --- Calculate Traveller Orbit (Bode's Law & HZ Anchors) ---
        // Adjusted 15% closer
        const BODE_TABLE: Record<number, number> = {
            0: 0.17, 1: 0.34, 2: 0.595, 3: 0.85, 4: 1.36, 5: 2.38, 6: 4.42, 7: 8.5, 8: 16.66, 9: 32.98, 10: 65.62
        };
        const HZ_ANCHORS: Record<string, number> = {
            "O": 11, "B": 9, "A": 7, "F": 5, "G": 3, "K": 2, "M": 0
        };

        const starClassStr = primaryStar.classes[0]?.split('/')[1] || "G2V";
        const specClass = starClassStr[0]; // e.g. "G"
        const subtype = this.decoder.hexVal(starClassStr[1] || '2');

        let orbitIndex = HZ_ANCHORS[specClass] ?? 3;
        if (specClass === 'M' && subtype > 5) orbitIndex = 0;
        else if (specClass === 'K' && subtype > 5) orbitIndex = 1;
        if (uwpSizeDigit >= 10) orbitIndex += 3;

        let orbitAU = 1.0;
        if (orbitIndex <= 10) orbitAU = BODE_TABLE[orbitIndex];
        else orbitAU = 0.4 + (0.3 * Math.pow(2, orbitIndex - 2));
        
        orbitAU *= (1.0 + this.rng.range(-0.1, 0.1));

        const mainOrbit: Orbit = {
            hostId: systemRootId,
            elements: {
                a_AU: orbitAU,
                e: 0.01,
                i_deg: 0,
                Omega_deg: 0,
                omega_deg: 0,
                M0_rad: this.rng.next() * Math.PI * 2
            },
            t0: 0,
            hostMu: G * (primaryStar.massKg || 1.989e30)
        };

        // Use core generator with strict overrides
        const generatedNodes = _generatePlanetaryBody(
            this.rng, 
            rulePack, 
            systemId, 
            1, 
            primaryStar, 
            mainOrbit, 
            data.name, 
            nodes, 
            2.0, // age
            'planet/terrestrial',
            true,
            undefined, 
            false // NO BELT allowed
        );
        
        const mainWorld = generatedNodes[0] as CelestialBody;
        mainWorld.name += " (Main World)";
        mainWorld.description = description; 
        mainWorld.traveller = data;
        
        // --- OVERRIDE WITH TRAVELLER DATA ---
        // Radius & Mass
        const baseDiameterKm = uwpSizeDigit * 1600;
        const diameterKm = this.rng.range(Math.max(1000, baseDiameterKm - 800), baseDiameterKm + 800);
        const radius = diameterKm / 2;
        mainWorld.radiusKm = radius;

        const densityMult = this.rng.range(0.9, 1.1);
        const radiusFrac = radius / 6371;
        mainWorld.massKg = Math.pow(radiusFrac, 3) * densityMult * EARTH_MASS_KG;

        // Atmosphere
        const atmoName = this.getTravellerAtmosphereName(uwp.atmosphere);
        const atmoTable = rulePack.distributions['atmosphere_composition'];
        if (atmoTable && atmoName) {
             const entry = atmoTable.entries.find(e => (e.value as any).name.startsWith(atmoName));
             if (entry) {
                 const template = entry.value as any;
                 mainWorld.atmosphere = JSON.parse(JSON.stringify(template));
                 if (template.pressure_range_bar) {
                     mainWorld.atmosphere!.pressure_bar = this.rng.range(template.pressure_range_bar[0], template.pressure_range_bar[1]);
                 }
                 if (template.composition) {
                     const comp: Record<string, number> = {};
                     let total = 0;
                     for (const gas in template.composition) {
                         const val = template.composition[gas];
                         const amount = Array.isArray(val) ? this.rng.range(val[0], val[1]) : val;
                         comp[gas] = amount;
                         total += amount;
                     }
                     for (const gas in comp) comp[gas] /= total;
                     mainWorld.atmosphere!.composition = comp;
                 }
             }
        }

        // Hydrosphere
        const hydroCode = this.decoder.hexVal(uwp.hydrographics);
        if (mainWorld.hydrosphere) {
            mainWorld.hydrosphere.coverage = hydroCode / 10;
        } else {
            mainWorld.hydrosphere = { coverage: hydroCode / 10, composition: 'water' };
        }

        nodes.push(...generatedNodes);

        // --- FULL SYSTEM GENERATION (Deck Building Method) ---
        // 1. Calculate Required Extra Bodies
        const numBelts = parseInt(data.pbg[1] || '0');
        const numGasGiants = parseInt(data.pbg[2] || '0');
        const totalWorldsCount = parseInt(data.w || '0');
        
        // W includes Main World (1) + Belts + Gas Giants + Others.
        // So Others = W - 1 - Belts - Gas Giants.
        let numOtherWorlds = totalWorldsCount - 1 - numBelts - numGasGiants;
        if (numOtherWorlds < 0) numOtherWorlds = 0; // Safety floor
        
        const totalExtraBodies = numBelts + numGasGiants + numOtherWorlds;
        
        let minStableAU = 0;
        let maxStableAU = 99999;

        // Determine stability limits
        if (starEntries.length >= 2) {
            if (isCloseBinary) {
                const stars = nodes.filter(n => n.roleHint === 'star');
                if (stars.length === 2) {
                    const sep = (stars[0].orbit?.elements.a_AU || 0) + (stars[1].orbit?.elements.a_AU || 0);
                    minStableAU = 1.6 * sep;
                }
            } else {
                const starB = nodes.find(n => n.roleHint === 'star' && n.id !== primaryStar.id);
                if (starB && starB.orbit) {
                    maxStableAU = 0.4 * starB.orbit.elements.a_AU;
                }
            }
        }

        if (totalExtraBodies > 0) {
            // 2. Generate Natural Slots (Standard Logic)
            // Request ample buffer to account for Main World collisions and Binary Instability zones
            let candidateSlots = calculateOrbitalSlots(primaryStar, rulePack, this.rng, (totalExtraBodies * 3) + 5);
            
            // 3. Filter Conflicts & Instability
            candidateSlots = candidateSlots.filter(au => {
                // Main World Proximity Check (15% exclusion)
                const diff = Math.abs(au - orbitAU);
                const ratio = diff / orbitAU;
                if (ratio <= 0.15) return false;

                // Binary Stability Check
                if (au < minStableAU) return false;
                if (au > maxStableAU) return false;

                return true;
            });
            
            // 3b. Emergency Fill: If stability/proximity culled too many, force random slots in the stable zone
            // to ensure we meet the Traveller 'W' count.
            while (candidateSlots.length < totalExtraBodies) {
                // Pick a random spot in the stable zone
                // If minStable is 0 (single star), use 0.2 as floor.
                // If maxStable is 99999, use 50 as ceiling.
                const lower = Math.max(minStableAU, 0.2);
                const upper = Math.min(maxStableAU, 80.0);
                
                if (upper > lower) {
                    const randomAU = this.rng.range(lower, upper);
                    
                    // Check Main World collision again
                    const diff = Math.abs(randomAU - orbitAU);
                    if (diff / orbitAU > 0.15) {
                        candidateSlots.push(randomAU);
                    }
                } else {
                    // Extremely unlikely case: No stable zone exists?
                    // Just push a "best effort" slot and let physics deal with it later
                    candidateSlots.push(orbitAU * (this.rng.nextFloat() > 0.5 ? 1.5 : 0.7));
                }
            }

            // Cap to needed amount
            const finalSlots = candidateSlots.slice(0, totalExtraBodies);
            
            // 4. Create "Deck" of Body Types
            const deck: Array<{ type: string, priority: number }> = [];
            
            for(let i=0; i<numGasGiants; i++) deck.push({ type: 'Gas Giant', priority: 10 });
            for(let i=0; i<numBelts; i++) deck.push({ type: 'Belt', priority: 5 });
            for(let i=0; i<numOtherWorlds; i++) deck.push({ type: 'Terrestrial', priority: 1 });
            
            // 5. Assign Bodies to Slots
            // Strategy: 
            // - Gas Giants prefer outer system (> 2.0 AU approx Frost Line)
            // - Belts and Terrestrials fill the rest
            
            // Sort slots by distance
            finalSlots.sort((a, b) => a - b);
            
            const assignments: Array<{ au: number, type: string }> = [];
            const occupiedIndices = new Set<number>();
            
            // A. Place Gas Giants
            const gasGiants = deck.filter(d => d.type === 'Gas Giant');
            for (const gg of gasGiants) {
                // Find first available slot > 2.0 AU, or just the furthest available
                let bestIdx = -1;
                
                // Try to find furthest slot
                for (let i = finalSlots.length - 1; i >= 0; i--) {
                    if (!occupiedIndices.has(i)) {
                        bestIdx = i;
                        // If we found one > 1.5 AU, take it immediately (outer system preference)
                        if (finalSlots[i] > 1.5) break; 
                    }
                }
                
                if (bestIdx !== -1) {
                    occupiedIndices.add(bestIdx);
                    assignments.push({ au: finalSlots[bestIdx], type: 'Gas Giant' });
                }
            }
            
            // B. Place Remaining
            const others = deck.filter(d => d.type !== 'Gas Giant');
            for (const item of others) {
                // Find any available slot
                let bestIdx = -1;
                for (let i = 0; i < finalSlots.length; i++) {
                    if (!occupiedIndices.has(i)) {
                        bestIdx = i;
                        break;
                    }
                }
                
                if (bestIdx !== -1) {
                    occupiedIndices.add(bestIdx);
                    assignments.push({ au: finalSlots[bestIdx], type: item.type });
                }
            }
            
            // 6. Generate Bodies
            for (let i = 0; i < assignments.length; i++) {
                const assign = assignments[i];
                const slotOrbit: Orbit = {
                    hostId: systemRootId,
                    elements: {
                        a_AU: assign.au,
                        e: this.rng.range(0, 0.1),
                        i_deg: this.rng.range(0, 5),
                        Omega_deg: 0,
                        omega_deg: 0,
                        M0_rad: this.rng.next() * Math.PI * 2
                    },
                    t0: 0,
                    hostMu: G * (primaryStar.massKg || 1.989e30)
                };

                const typeOverride = assign.type === 'Gas Giant' ? 'planet/gas-giant' : (assign.type === 'Belt' ? 'belt/asteroid' : 'planet/terrestrial');
                const allowBelt = assign.type === 'Belt'; 
                
                // Naming: e.g. "Sol I", "Sol II"... but skip Main World's index if possible?
                // Actually, just append Roman numerals sequentially based on distance is standard,
                // but Traveller Main World already has a name.
                // Let's just use "Name [Outer I]" or similar to distinguish?
                // Or just standard Roman numerals based on sort order?
                // The Main World is already named "Name (Main World)".
                // Let's just use sequential Roman numerals for the *extras* relative to star.
                // To do this properly we'd need to sort ALL bodies (Main + Extras) and rename them.
                // But for now, let's just name them "Name Companion I", etc?
                // User said: "standard planet placement logic... looks teh same as everyone elses".
                // Standard logic uses Roman numerals.
                // Let's just use Roman numerals for these extras, skipping the Main World's likely slot?
                // Actually, duplicate names like "Regina I" (Main) and "Regina I" (Inner) is confusing.
                // Let's name them "Name [Distance]"? No, that's ugly.
                // Let's stick to the Roman Numeral generator but maybe append 'b', 'c' etc?
                // Standard naming in this app seems to be Roman Numerals.
                
                const newNodes = _generatePlanetaryBody(
                    this.rng,
                    rulePack,
                    systemId,
                    i + 10, // Offset index to avoid collision with Main World internals if any
                    primaryStar,
                    slotOrbit,
                    `${data.name} ${toRoman(i + 1)}`, // Temporary naming
                    nodes,
                    2.0,
                    typeOverride,
                    true,
                    undefined,
                    allowBelt
                );
                
                if (assign.type === 'Belt' && newNodes.length > 0) {
                    newNodes[0].classes = ['belt/asteroid'];
                    newNodes[0].roleHint = 'belt';
                    newNodes[0].name = `${data.name} Belt ${toRoman(i + 1)}`;
                }
                
                nodes.push(...newNodes);
            }
            
            // Optional: Re-sort and rename all planets by distance?
            // This is a nice-to-have for "Standard Look"
            // Filter only direct children of the star
            const planets = nodes.filter(n => n.parentId === systemRootId && (n.roleHint === 'planet' || n.roleHint === 'belt'));
            planets.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
            
            for(let i=0; i<planets.length; i++) {
                const p = planets[i];
                // Don't rename Main World completely, keep its identity
                if (p.id === mainWorld.id) continue;
                
                if (p.roleHint === 'belt') {
                    p.name = `${data.name} Belt ${toRoman(i+1)}`;
                } else {
                    p.name = `${data.name} ${toRoman(i+1)}`;
                }
            }
        }

        const system: System = {
            id: systemId,
            name: data.name,
            seed: seed,
            epochT0: 0,
            age_Gyr: this.rng.range(1, 10),
            nodes: nodes,
            rulePackId: rulePack.id,
            rulePackVersion: rulePack.version,
            tags: [],
            gmNotes: data.raw
        };

        this.spawnConstructs(system, mainWorld, data, rulePack, specClass);

        const processor = new SystemProcessor();
        processor.process(system, rulePack);

        // M-Star Hazard Check
        if (specClass === 'M' && (mainWorld.surfaceRadiation || 0) > 100) { 
             const bounds = mainWorld.orbitalBoundaries;
             this.addConstruct(system, mainWorld, "template-traveller-city-domed-hardened", "Surface", `${data.name} Protective Dome`, rulePack, uwp, bounds);
             this.addConstruct(system, mainWorld, "template-traveller-city-subsurface", "Surface", `${data.name} Subsurface Hab`, rulePack, uwp, bounds);
        }

        return system;
    }

    private spawnConstructs(system: System, mainWorld: CelestialBody, data: any, rulePack: RulePack, starCode: string) {
        const uwp = this.decoder.parseUWP(data.uwp);
        const bases = data.bases || "";
        const isMStar = starCode.toUpperCase().startsWith('M');
        const isAsteroid = data.tradeCodes.includes('Asteroid');
        
        let boundaries = undefined;
        if (mainWorld.massKg && mainWorld.radiusKm) {
             const gravity = (G * mainWorld.massKg) / Math.pow(mainWorld.radiusKm * 1000, 2);
             const planetData: PlanetData = {
                gravity,
                surfaceTempKelvin: 288, 
                massKg: mainWorld.massKg,
                rotationPeriodSeconds: (mainWorld.rotation_period_hours || 24) * 3600,
                molarMassKg: mainWorld.atmosphere?.molarMassKg || 0.028,
                surfacePressurePa: (mainWorld.atmosphere?.pressure_bar || 0) * 100000,
                distanceToHost_km: (mainWorld.orbit?.elements.a_AU || 1) * AU_KM,
                hostMass_kg: 1.989e30 
            };
            boundaries = calculateOrbitalBoundaries(planetData, rulePack);
        }

        let starportTemplate = "";
        let placement = "Surface";
        
        switch(uwp.starport) {
            case 'A': starportTemplate = "template-traveller-highport-class-a"; placement = "Geostationary"; break;
            case 'B': starportTemplate = "template-traveller-highport-class-b"; placement = "Geostationary"; break;
            case 'C': starportTemplate = "template-traveller-downport-basic"; placement = "Surface"; break;
            case 'D': starportTemplate = "template-traveller-starport-class-d"; placement = "Surface"; break;
            case 'E': starportTemplate = "template-traveller-starport-class-e"; placement = "Surface"; break;
        }

        if (starportTemplate) {
            if (isAsteroid && placement === "Surface") placement = "Low";
            this.addConstruct(system, mainWorld, starportTemplate, placement, `${data.name} Starport`, rulePack, uwp, boundaries);
        }

        for (const char of bases) {
            let baseTemplate = "";
            let basePlacement = "Surface";
            let baseName = "";

            switch(char) {
                case 'N': case 'K': baseTemplate = "template-traveller-naval-base"; basePlacement = "High"; baseName = "Naval Base"; break;
                case 'D': baseTemplate = "template-traveller-naval-depot"; basePlacement = "Far"; baseName = "Naval Depot"; break;
                case 'W': baseTemplate = "template-traveller-way-station"; basePlacement = "High"; baseName = "Way Station"; break;
                case 'S': baseTemplate = "template-traveller-scout-base"; basePlacement = "Surface"; baseName = "Scout Base"; break;
                case 'M': baseTemplate = "template-traveller-base-military"; basePlacement = "Surface"; baseName = "Military Base"; break;
                case 'C': baseTemplate = "template-traveller-base-corsair"; basePlacement = "Far"; baseName = "Corsair Base"; break;
                case 'R': baseTemplate = "template-traveller-research-station"; basePlacement = "Low"; baseName = "Research Station"; break;
            }

            if (baseTemplate) {
                if (isAsteroid && basePlacement === "Surface") basePlacement = "Low";
                this.addConstruct(system, mainWorld, baseTemplate, basePlacement, `${data.name} ${baseName}`, rulePack, uwp, boundaries);
            }
        }
    }

    private findTemplate(templateId: string, rulePack: RulePack): CelestialBody | null {
        if (!rulePack.constructTemplates) return null;
        for (const category in rulePack.constructTemplates) {
            const list = rulePack.constructTemplates[category];
            if (!Array.isArray(list)) continue;
            
            const found = list.find(t => t.id === templateId);
            if (found) return found;
        }
        return null;
    }

    private addConstruct(
        system: System, 
        host: CelestialBody, 
        templateId: string, 
        placementType: string, 
        name: string, 
        rulePack: RulePack,
        uwp: any,
        boundaries?: any
    ) {
        const template = this.findTemplate(templateId, rulePack);
        let construct: CelestialBody;

        if (template) {
            construct = JSON.parse(JSON.stringify(template));
            construct.id = generateId();
            construct.name = name;
            construct.parentId = host.id;
            construct.IsTemplate = false;
        } else {
            construct = bodyFactory.createBody({ name, roleHint: 'construct', parentId: host.id });
        }

        const popCode = this.decoder.hexVal(uwp.population);
        const scale = Math.pow(10, Math.max(0, popCode - 5)); 
        
        if (construct.crew) {
            construct.crew.max = Math.floor(construct.crew.max * scale);
            construct.crew.current = Math.floor(construct.crew.max * 0.8);
        }
        if (construct.physical_parameters?.cargoCapacity_tonnes) {
            construct.physical_parameters.cargoCapacity_tonnes *= scale;
        }

        const hostRadiusKm = host.radiusKm || 1000;

        if (placementType === "Surface") {
            construct.placement = "Surface";
            construct.orbit = {
                hostId: host.id,
                elements: { a_AU: hostRadiusKm / AU_KM, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 },
                t0: 0,
                hostMu: G * (host.massKg || 0)
            };
        } else {
            let altitudeKm = 2000; 
            if (boundaries) {
                if (placementType === "Low") altitudeKm = (boundaries.minLeoKm + boundaries.leoMoeBoundaryKm) / 2;
                else if (placementType === "Geostationary") altitudeKm = boundaries.geoStationaryKm || ((boundaries.meoHeoBoundaryKm + boundaries.leoMoeBoundaryKm) / 2);
                else if (placementType === "High") altitudeKm = (boundaries.meoHeoBoundaryKm + boundaries.heoUpperBoundaryKm) / 2;
                else if (placementType === "Far") altitudeKm = boundaries.heoUpperBoundaryKm ? boundaries.heoUpperBoundaryKm * 0.9 : 100000;
            } else {
                if (placementType === "Geostationary") altitudeKm = 35000;
                else if (placementType === "High") altitudeKm = 50000;
                else if (placementType === "Far") altitudeKm = 200000;
            }

            construct.placement = `${placementType} Orbit`;
            construct.orbit = {
                hostId: host.id,
                elements: {
                    a_AU: (hostRadiusKm + altitudeKm) / AU_KM,
                    e: 0,
                    i_deg: 0,
                    Omega_deg: 0,
                    omega_deg: 0,
                    M0_rad: this.rng.next() * Math.PI * 2
                },
                t0: 0,
                hostMu: G * (host.massKg || 0)
            };
        }

        system.nodes.push(construct);
    }

    private getTravellerAtmosphereName(code: string): string {
        switch(code) {
            case '0': return "Traveller-0";
            case '1': return "Traveller-1";
            case '2': return this.rng.nextFloat() > 0.5 ? "Traveller-2a" : "Traveller-2b";
            case '3': return "Traveller-3";
            case '4': return "Traveller-4";
            case '5': return "Traveller-5";
            case '6': return "Traveller-6";
            case '7': return "Traveller-7";
            case '8': return "Traveller-8";
            case '9': return this.rng.nextFloat() > 0.5 ? "Traveller-9a" : "Traveller-9b";
            case 'A': return "Traveller-A";
            case 'B': return "Traveller-B";
            case 'C': return "Traveller-C";
            case 'D': return "Traveller-D";
            case 'F': return "Traveller-F";
            default: return "";
        }
    }
}