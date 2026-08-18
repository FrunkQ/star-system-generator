import { TravellerDecoder } from './decoder';
import { infillSystem } from '$lib/generation/infill';
import { guessSystemAge } from '$lib/physics/systemAge';
import { resolveImportedStarClass } from '$lib/physics/importedStarClass';
import { SeededRNG } from './rng';
import { bodyFactory } from '$lib/core/BodyFactory';
import { _generateStar } from '$lib/generation/star';
import { _generatePlanetaryBody } from '$lib/generation/planet';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { G, AU_KM, EARTH_MASS_KG } from '$lib/constants';
import { calculateOrbitalBoundaries, type PlanetData } from '$lib/physics/orbits';
import type { System, StarSystemNode, RulePack, CelestialBody, Barycenter, Orbit, TableSpec } from '$lib/types';
import { generateId, weightedChoice, randomFromRange, toRoman } from '$lib/utils';

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
        
        // Extract real subsector name if present in comments (e.g. # Subsector C: Regina)
        let subsectorDisplayName = "Subsector " + subsectorCode;
        const nameMatch = rawData.match(new RegExp(`#\\s*Subsector\\s+${subsectorCode}\\s*:\\s*(.+)`, 'i'));
        if (nameMatch) subsectorDisplayName = nameMatch[1].trim();

        for (let i = 2; i < lines.length; i++) {
            const line = lines[i];
            const worldData = this.decoder.parseWorldLine(line, headers);
            if (!worldData) continue;

            // Enrich world data with decoded values for UI
            const uwp = this.decoder.parseUWP(worldData.uwp);
            (worldData as any).starportDesc = this.decoder.getStarportDescription(uwp.starport);
            (worldData as any).atmoDesc = this.decoder.getAtmosphereDescription(uwp.atmosphere);
            (worldData as any).govDesc = (this as any).decoder.governments[uwp.government] || `Code ${uwp.government}`;
            (worldData as any).lawDesc = this.decoder.getLawDescription(uwp.law);
            (worldData as any).techLevel = uwp.techLevel;
            (worldData as any).allegianceName = this.decoder.getAllegianceName(worldData.allegiance);

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
                name: subsectorDisplayName,
                sectorName: sector.name,
                subsectorCode,
                originX,
                originY
            } 
        };
    }

    public generateTravellerSystem(data: any, rulePack: RulePack): System {
        const seed = `${data.uwp}-${data.name}`;
        this.rng = new SeededRNG(seed);
        const systemId = generateId();
        
        // Ensure trade codes are expanded (handle manual entry vs import)
        const expandedTradeCodes = data.tradeCodes.map((c: string) => this.decoder.tradeCodes[c] || c);
        data.tradeCodes = expandedTradeCodes; // Update the data object itself for the UI
        
        const uwp = this.decoder.parseUWP(data.uwp);
        
        // Enrich data for UI display (fix missing Starport/Class and unexpanded IX/EX)
        data.starport = uwp.starport;
        data.size = uwp.size;
        data.atmosphere = uwp.atmosphere;
        data.hydrographics = uwp.hydrographics;
        data.population = uwp.population;
        data.government = uwp.government;
        data.law = uwp.law;
        data.techLevel = uwp.techLevel;
        
        data.popDesc = this.decoder.formatPopulation(data.pbg ? data.pbg[0] : '1', uwp.population);
        
        if (data.ix) data.ixDesc = this.decoder.decodeImportance(data.ix);
        if (data.ex) data.exDesc = this.decoder.decodeEconomics(data.ex);
        if (data.cx) data.cxDesc = this.decoder.decodeCultural(data.cx);
        
        const description = "";

        // 1. Stars Generation
        // Robust Token Parser for Variable-Length Definitions
        const rawStars = (data.stars || "G2 V").replace(/\s+/g, ' ').trim();
        const tokens = rawStars.split(' ');
        const starEntries: string[] = [];
        
        let i = 0;
        const luminosityRegex = /^(I|II|III|IV|V|VI|VII|D|Ia|Ib)$/;

        while (i < tokens.length) {
            const token = tokens[i];
            
            // ONE classifier for every importer (physics/importedStarClass.ts). Traveller states its
            // stars fully — "F7 V", "K2 III", "M1 Ib", "D", "BD", "NS" — and this parser always kept the
            // luminosity class; what it lacked was the shared normalisation (a bare "G" defaults to
            // MAIN SEQUENCE, never a guessed giant; Ia/Ib/II fold to the supergiant band, IV to the
            // dwarf band; an unrecognised token is star/unknown, never pushed through as-is).
            const nextToken = tokens[i+1];
            const stated = (nextToken && luminosityRegex.test(nextToken)) ? `${token} ${nextToken}` : token;
            const cls = resolveImportedStarClass({ stated }, rulePack);
            starEntries.push(cls.classKey);
            i += (stated === token) ? 1 : 2;
        }

        const nodes: (CelestialBody | Barycenter)[] = [];
        let systemRootId: string;
        let primaryStar: CelestialBody;

        const isCloseBinary = (data.tradeCodes.includes('Close Binary') || (data.raw && data.raw.includes('Close Binary'))) && starEntries.length >= 2;

        let nextStarIndex = 0;

        if (isCloseBinary) {
            // P-Type Root
            const barycenter: Barycenter = {
                id: generateId(),
                parentId: null,
                name: `${data.name} Barycentre`,
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
            nextStarIndex = 2;
        } else {
            // Single Star Root
            primaryStar = _generateStar(generateId(), null, rulePack, this.rng, starEntries[0]);
            primaryStar.name = starEntries.length > 1 ? `${data.name} A` : `Star ${data.name}`;
            systemRootId = primaryStar.id;
            nodes.push(primaryStar);
            nextStarIndex = 1;
        }

        // Handle Companions (C, D, E...)
        // Track the previous star for potential hierarchy chaining
        let previousStar: CelestialBody | null = null;
        if (isCloseBinary) previousStar = nodes[2] as CelestialBody; // Star B
        else previousStar = primaryStar;

        for (let i = nextStarIndex; i < starEntries.length; i++) {
            const letter = String.fromCharCode(65 + i); // C, D, E...
            
            // Hierarchy Logic:
            // If we have at least 3 stars (e.g. A, B, C), and we are adding D (index 3),
            // give it a chance to orbit C instead of the Root.
            // "Pairs of Pairs" logic.
            
            let parentId = systemRootId;
            let parentMass = 0;
            let distAU = 0;
            let isNested = false;

            // 30% chance to nest if i >= 3 (Star D+)
            if (i >= 3 && previousStar && this.rng.nextFloat() < 0.3) {
                isNested = true;
                parentId = previousStar.id;
                parentMass = previousStar.massKg || 0;
                // Close-ish orbit for nested binary (e.g., 20 - 100 AU)
                distAU = randomFromRange(this.rng as any, 20, 100);
            } else {
                // Orbit System Root (Far Companion)
                // Use index to push them further out: 1000, 2000, 4000...
                const rootNode = nodes.find(n => n.id === systemRootId);
                parentMass = (rootNode?.kind === 'barycenter' ? (rootNode as Barycenter).effectiveMassKg : (rootNode as CelestialBody).massKg) || 0;
                distAU = 1000 * Math.pow(1.5, i - nextStarIndex) * randomFromRange(this.rng as any, 0.8, 1.2);
            }

            const newStar = _generateStar(generateId(), parentId, rulePack, this.rng, starEntries[i]);
            newStar.name = `${data.name} ${letter}`;
            
            newStar.orbit = {
                hostId: parentId,
                hostMu: G * parentMass,
                t0: Date.now(),
                elements: { 
                    a_AU: distAU, 
                    e: randomFromRange(this.rng as any, 0.1, 0.6), 
                    i_deg: randomFromRange(this.rng as any, 0, 180), 
                    omega_deg: 0, 
                    Omega_deg: 0, 
                    M0_rad: this.rng.next() * Math.PI * 2 
                }
            };

            nodes.push(newStar);
            previousStar = newStar;
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

        // --- FULL SYSTEM: the shared infill, with Traveller's numbers as hard targets ---
        //
        // This used to be 250 lines of private generation: its own slot list from calculateOrbitalSlots,
        // an "emergency fill" that forced random orbits when the culls ran short, and a deck of types
        // dealt onto slots with a Sol-shaped rule ("gas giants prefer > 1.5 AU"). It shared nothing with
        // the wizard, so a Traveller system and a generated one could look nothing alike round the
        // same star. Now: build the Main World and the stars here (they are Traveller's own data), then
        // hand the system to generation/infill.ts infillSystem - the same routine every importer and the
        // wizard use - with W as the HARD planet count and PBG's belts and giants as the composition.
        //
        // W IS A HARD COUNT AND IT NEVER INCLUDES MOONS (owner, G32). A "home world is a moon"
        // designation (trade code Sa) is a planet-sized body round a giant; applySatelliteTradeCodeIfNeeded
        // places it as an anchor BEFORE infill runs, so infill sees the giant it orbits as one of W and
        // the moon as a moon.
        //
        // The dials come from the profile where it says something (a high-population, high-tech world
        // suggests a settled, metal-rich system - but that is a taste call the GM makes in the infill
        // step, so the defaults are used here and the panel lets them adjust). Age is the shared guess.
        const numBelts = parseInt(data.pbg[1] || '0');
        const numGasGiants = parseInt(data.pbg[2] || '0');
        const totalWorldsCount = parseInt(data.w || '0');

        // Traveller trade code `Sa` = main world is a satellite of a larger world. Runs BEFORE infill so
        // the giant it creates is an anchor and counts toward W.
        this.applySatelliteTradeCodeIfNeeded(nodes, mainWorld, data, systemRootId);

        // THE AGE WAS A RANDOM ROLL between 1 and 10 Gyr, whatever the star. An O star does not live 10
        // Gyr; an M dwarf is not typically 1. One age model for every importer now (physics/systemAge):
        // guessed from the PRIMARY star's own life, with the band it makes reasonable, and marked
        // estimated so the GM knows it is a guess. Traveller states no age, so it is always a guess.
        const ageGuess = guessSystemAge(primaryStar ? { massKg: primaryStar.massKg, temperatureK: primaryStar.temperatureK, classes: primaryStar.classes } : null);
        const system: System = {
            id: systemId,
            name: data.name,
            seed: seed,
            epochT0: 0,
            age_Gyr: ageGuess.ageGyr,
            ageEstimated: ageGuess.estimated,
            ageBandGyr: ageGuess.bandGyr,
            nodes: nodes,
            rulePackId: rulePack.id,
            rulePackVersion: rulePack.version,
            tags: [],
            gmNotes: data.raw
        };

        this.spawnConstructs(system, mainWorld, data, rulePack, specClass);

        const processor = new SystemProcessor();
        processor.process(system, rulePack);

        // Fill out to W with PBG's composition. Imported (Traveller-authored) bodies are anchors and are
        // never moved; generated worlds take the free orbits the star's own zones allow.
        if (totalWorldsCount > 0) {
            const infill = infillSystem(system, rulePack, {
                targetPlanetCount: totalWorldsCount,
                composition: { giants: numGasGiants, belts: numBelts },
                seed: `traveller-${seed}`,
                ageGyr: system.age_Gyr,
            });
            if (infill.underTarget) {
                console.warn(`TravellerImporter: ${data.name} asked for W=${totalWorldsCount} (PBG giants ${numGasGiants}, belts ${numBelts}); the star's zones and the count table gave ${infill.addedPlanets} extra planet(s)` +
                    (infill.composition ? ` (giants ${infill.composition.giantsGot}/${infill.composition.giantsWanted}, belts ${infill.composition.beltsGot}/${infill.composition.beltsWanted})` : '') + '.');
            }
            // Traveller's own naming: Roman numerals outward from the star, Main World keeps its identity.
            const bodies = system.nodes.filter((n) => n.parentId === systemRootId && ((n as CelestialBody).roleHint === 'planet' || (n as CelestialBody).roleHint === 'belt')) as CelestialBody[];
            bodies.sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
            bodies.forEach((p, i) => {
                if (p.id === mainWorld.id) return;
                p.name = p.roleHint === 'belt' ? `${data.name} Belt ${toRoman(i + 1)}` : `${data.name} ${toRoman(i + 1)}`;
            });
        }

        // M-Star Hazard Check
        if (specClass === 'M' && (mainWorld.surfaceRadiation || 0) > 100) { 
             const bounds = mainWorld.orbitalBoundaries;
             this.addConstruct(system, mainWorld, "template-traveller-city-domed-hardened", "Surface", `${data.name} Protective Dome`, rulePack, uwp, bounds);
             this.addConstruct(system, mainWorld, "template-traveller-city-subsurface", "Surface", `${data.name} Subsurface Hab`, rulePack, uwp, bounds);
        }

        return system;
    }

    private applySatelliteTradeCodeIfNeeded(
        nodes: (CelestialBody | Barycenter)[],
        mainWorld: CelestialBody,
        data: any,
        systemRootId: string
    ) {
        const hasSatelliteCode = (data.tradeCodes || []).includes('Satellite');
        if (!hasSatelliteCode) return;

        const bodies = nodes.filter((n): n is CelestialBody => n.kind === 'body');
        const siblings = bodies.filter((b) => b.parentId === systemRootId && b.id !== mainWorld.id);
        if (siblings.length === 0) return;

        const giantCandidates = siblings.filter((b) =>
            (b.roleHint === 'planet' || b.roleHint === 'dwarf-planet') &&
            !!b.classes?.some((c) => c.includes('gas-giant') || c.includes('ice-giant'))
        );
        const fallbackCandidates = siblings.filter((b) =>
            (b.roleHint === 'planet' || b.roleHint === 'dwarf-planet') &&
            (b.massKg || 0) > (mainWorld.massKg || 0) * 3
        );

        const pool = (giantCandidates.length > 0 ? giantCandidates : fallbackCandidates)
            .sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
        const host = pool[0];
        if (!host) return;

        // Place main world on a plausible moon orbit around the host.
        const hostRadiusKm = Math.max(1000, host.radiusKm || 1000);
        const aKm = hostRadiusKm * this.rng.range(20, 80);
        const aAU = Math.max(1e-6, aKm / AU_KM);
        const hostMassKg = Math.max(1e20, host.massKg || 0);

        mainWorld.parentId = host.id;
        mainWorld.tags = mainWorld.tags || [];
        if (!mainWorld.tags.some((t) => t.key === 'traveller/satellite-main-world')) {
            mainWorld.tags.push({ key: 'traveller/satellite-main-world' });
        }

        if (!mainWorld.orbit) {
            mainWorld.orbit = {
                hostId: host.id,
                hostMu: G * hostMassKg,
                t0: Date.now(),
                elements: {
                    a_AU: aAU,
                    e: this.rng.range(0, 0.05),
                    i_deg: this.rng.range(0, 3),
                    Omega_deg: 0,
                    omega_deg: 0,
                    M0_rad: this.rng.next() * Math.PI * 2
                }
            };
            return;
        }

        mainWorld.orbit.hostId = host.id;
        mainWorld.orbit.hostMu = G * hostMassKg;
        mainWorld.orbit.elements.a_AU = aAU;
        mainWorld.orbit.elements.e = Math.min(0.05, Math.max(0, mainWorld.orbit.elements.e || 0));
        mainWorld.orbit.elements.i_deg = Math.min(5, Math.max(0, mainWorld.orbit.elements.i_deg || 0));
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
        const crewCap = 100000;
        const clampCrew = (value: number | undefined): number => {
            if (typeof value !== 'number' || Number.isNaN(value)) return 0;
            return Math.max(0, Math.min(Math.floor(value), crewCap));
        };
        
        if (construct.crew) {
            const scaledMax = (construct.crew.max || 0) * scale;
            construct.crew.max = clampCrew(scaledMax);
            const existingCurrent = typeof construct.crew.current === 'number'
                ? Math.floor(construct.crew.current * scale)
                : Math.floor(construct.crew.max * 0.8);
            construct.crew.current = Math.min(clampCrew(existingCurrent), construct.crew.max);
        }
        if (typeof construct.current_crew_count === 'number') {
            const scaledCurrentCrewCount = Math.floor(construct.current_crew_count * scale);
            construct.current_crew_count = clampCrew(scaledCurrentCrewCount);
            if (construct.crew) {
                construct.current_crew_count = Math.min(construct.current_crew_count, construct.crew.max || crewCap);
            }
        }
        if (construct.systems?.life_support?.max_crew !== undefined) {
            const scaledLifeSupportMax = (construct.systems.life_support.max_crew || 0) * scale;
            construct.systems.life_support.max_crew = clampCrew(scaledLifeSupportMax);
        }
        if (construct.systems?.life_support?.max_crew !== undefined && construct.crew) {
            const sharedMax = Math.min(construct.systems.life_support.max_crew || crewCap, construct.crew.max || crewCap);
            construct.systems.life_support.max_crew = sharedMax;
            construct.crew.max = sharedMax;
            construct.crew.current = Math.min(construct.crew.current || 0, sharedMax);
        }
        if (construct.crew && typeof construct.current_crew_count === 'number') {
            const sharedCurrent = Math.min(construct.crew.current || 0, construct.current_crew_count);
            construct.crew.current = sharedCurrent;
            construct.current_crew_count = sharedCurrent;
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
