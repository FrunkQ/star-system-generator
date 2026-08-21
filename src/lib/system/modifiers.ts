import { _generatePlanetaryBody } from '../generation/planet';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM } from '../constants';
import { findViableHabitableOrbit } from '../physics/habitability';
import { calculateAllStellarZones, getDistanceForTemperature, calculateRocheLimit } from '../physics/zones';
import { SeededRNG } from '../rng';
import { randomFromRange, toRoman } from '../utils';

export function deleteNode(sys: System, nodeId: ID): System {
    const nodesToDelete = new Set<ID>([nodeId]);
    let changed = true;
    while (changed) {
        changed = false;
        sys.nodes.forEach(node => {
            if (node.parentId && nodesToDelete.has(node.parentId) && !nodesToDelete.has(node.id)) {
                nodesToDelete.add(node.id);
                changed = true;
            }
        });
    }

    const newSystem = {
        ...sys,
        nodes: sys.nodes.filter(node => !nodesToDelete.has(node.id))
    };

    return newSystem;
}

export function getValidPlanetTypesForHost(host: CelestialBody | Barycenter, pack: RulePack): string[] {
    if (!pack.statTemplates) return [];

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    
    // If host is a planet/moon, we can only add moons.
    if (host.kind === 'body' && ((host as CelestialBody).roleHint === 'planet' || (host as CelestialBody).roleHint === 'moon')) {
        return Object.keys(pack.statTemplates).filter(key => {
            if (!key.startsWith('planet/')) return false; // Only allow planet types
            
            const template = pack.statTemplates![key];
            // A moon's max mass should be significantly less than the parent's mass.
            // Let's use the template's max mass and check if it's less than, say, 10% of the host's mass.
            const maxMassEarths = template.mass_earth[1];
            const maxMassKg = maxMassEarths * EARTH_MASS_KG;

            return maxMassKg < hostMass * 0.1;
        });
    } 
    // If host is a star or barycenter, we can add any planet.
    else {
        return Object.keys(pack.statTemplates).filter(key => key.startsWith('planet/'));
    }
}

/**
 * A draw that is uniform in the LOGARITHM of the distance. See the note in `addPlanetaryBody`: a
 * ratio quantity wants a ratio-uniform draw, and a linear one over a gap spanning four decades puts
 * essentially every result at the far end.
 */
function logUniform(rng: SeededRNG, lo: number, hi: number): number {
    if (!(lo > 0) || !(hi > lo)) return randomFromRange(rng, Math.max(0, lo), Math.max(0, hi));
    return Math.exp(randomFromRange(rng, Math.log(lo), Math.log(hi)));
}

/**
 * The orbital band a TYPE belongs in, derived from the temperature band its own fingerprint
 * declares. Returns null when the pack says nothing about that type, which is most of them — the
 * caller must treat this as a refinement, never a requirement.
 */
function preferredOrbitBandAU(planetType: string, host: CelestialBody | Barycenter, pack: RulePack): [number, number] | null {
    if (host.kind !== 'body' || (host as CelestialBody).roleHint !== 'star') return null;
    const fp = pack.classifier?.fingerprints?.find((f) => f.class === planetType);
    const band = (fp as any)?.range?.Teq_K ?? (fp as any)?.match?.Teq_K;
    if (!Array.isArray(band) || band.length !== 2) return null;
    // Hotter temperature = closer in, so the band inverts.
    const near = getDistanceForTemperature(host as CelestialBody, Math.max(1, band[1]));
    const far = getDistanceForTemperature(host as CelestialBody, Math.max(1, band[0]));
    if (!(near > 0) || !(far > near)) return null;
    return [near, far];
}

export function addPlanetaryBody(sys: System, hostId: ID, planetType: string, pack: RulePack): System {
    const rng = new SeededRNG(sys.seed + Date.now()); // Use a new RNG seed to avoid determinism issues
    const host = sys.nodes.find(n => n.id === hostId) as CelestialBody;
    if (!host) throw new Error(`Host with id ${hostId} not found.`);

    const hostMass = host.massKg || 0;
    if (hostMass === 0) throw new Error(`Host ${hostId} has no mass.`);

    // Explicitly prevent adding giants as moons
    if (host.roleHint === 'planet' && (planetType.includes('giant'))) {
        throw new Error(`Cannot add a giant planet as a moon.`);
    }

    let finalPlanetType = planetType;
    if (planetType === 'planet/any-giant') {
        finalPlanetType = rng.nextFloat() < 0.5 ? 'planet/gas-giant' : 'planet/ice-giant';
    }

    // 1. Find a valid orbit using gap logic
    const children = (sys.nodes.filter(n => n.parentId === hostId && n.kind === 'body' && n.orbit) as CelestialBody[])
                      .sort((a, b) => a.orbit!.elements.a_AU - b.orbit!.elements.a_AU);
    
    const stellarZones = calculateAllStellarZones(host, pack, sys.nodes);
    const hostRadiusAU = (host.radiusKm || 0) / AU_KM;

    // THE INNER LIMIT IS NOT "just outside the host body" (B84). Two bounds the engine already
    // computes sit further out and both mean something: inside the ROCHE LIMIT a body is pulled
    // apart, which `generation/placement.ts` already refuses, and inside the KILL ZONE it is
    // sterilised, which the same file already warns about. Starting from the stellar surface put a
    // quarter of all new planets inside 0.04 AU at over 900 C. A GM can still drag a world in
    // there — this only decides where one APPEARS.
    const innerLimitAU = Math.max(
        hostRadiusAU * 2,
        host.kind === 'body' ? calculateRocheLimit(host as CelestialBody) : 0,
        stellarZones.killZone ?? 0
    );

    const orbitalPoints: number[] = [];
    orbitalPoints.push(innerLimitAU);
    children.forEach(child => {
        orbitalPoints.push(child.orbit!.elements.a_AU * (1 - child.orbit!.elements.e)); // Periapsis
        orbitalPoints.push(child.orbit!.elements.a_AU * (1 + child.orbit!.elements.e)); // Apoapsis
    });
    orbitalPoints.push(stellarZones.systemLimitAu); // Outer limit

    orbitalPoints.sort((a, b) => a - b);

    const gaps: { start: number, end: number }[] = [];
    for (let i = 0; i < orbitalPoints.length - 1; i++) {
        const start = orbitalPoints[i];
        const end = orbitalPoints[i+1];
        if (end - start > 0.2) { // Minimum gap size of 0.2 AU
            gaps.push({ start, end });
        }
    }

    // A gap that STRADDLES the CO2 ice line used to belong to neither bucket and was silently
    // dropped — so a bare single-star system, whose only gap runs from the stellar surface to the
    // system limit, could not take a planet at all ("There are no available orbital slots"). Split
    // a straddling gap at the line instead, which is what the two buckets were always for (B84).
    const line = stellarZones.co2IceLine;
    const outerGaps: { start: number, end: number }[] = [];
    const innerGaps: { start: number, end: number }[] = [];
    for (const g of gaps) {
        if (g.start > line) { outerGaps.push(g); continue; }
        if (g.end <= line) { innerGaps.push(g); continue; }
        if (line - g.start > 0.2) innerGaps.push({ start: g.start, end: line });
        if (g.end - line > 0.2) outerGaps.push({ start: line, end: g.end });
    }

    let chosenGap: { start: number, end: number } | null = null;
    if (finalPlanetType.includes('giant')) {
        if (outerGaps.length > 0) {
            chosenGap = outerGaps[Math.floor(rng.nextFloat() * outerGaps.length)];
        } else if (innerGaps.length > 0) {
            chosenGap = innerGaps[Math.floor(rng.nextFloat() * innerGaps.length)];
        }
    } else {
        // The MIRROR of the giant branch above, and it has the same justification rather than a new
        // one: giants prefer beyond the ice line because that is where there was ice to build them
        // from, so rocky worlds prefer INSIDE it for exactly the same reason. Without the symmetry a
        // "terrestrial" was a coin flip between the inner system and everything out to the system
        // limit, and the far half is where B84's frozen worlds were coming from.
        const preferred = innerGaps.length > 0 ? innerGaps : outerGaps;
        if (preferred.length > 0) {
            chosenGap = preferred[Math.floor(rng.nextFloat() * preferred.length)];
        }
    }

    if (!chosenGap) {
        throw new Error("There are no available orbital slots to add a new planet.");
    }

    // WHERE IN THE GAP, and this is what B84 turned out to be.
    //
    // The owner's report was "a freshly created planet is too cold until well inside the goldilocks
    // zone". The physics was honest and the atmosphere was honest; the PLACEMENT was not. A new body
    // is generated FOR the orbit it is given — its air is drawn from the entries whose declared
    // temperature range covers that orbit's equilibrium temperature — and the orbit was drawn
    // UNIFORMLY from a gap that, on a bare Sun-like system, runs from 0.009 AU to 172 AU. Almost
    // every draw therefore landed far out, the body correctly got a vacuum-trace atmosphere for a
    // Kuiper-belt distance, and dragging it inward afterwards could not give it air it never had.
    // Measured, same seed and same final orbit of 1.2 AU: born there it lands at +28 C with 4.2 bar;
    // born at 40 AU and moved in it lands at -28 C with none. A 56 K difference decided by nothing
    // but where it happened to appear.
    //
    // TWO CHANGES, AND NEITHER IS A PREFERENCE ABOUT WHERE PLANETS "SHOULD" GO.
    //
    // (1) SAMPLE LOG-UNIFORMLY. Orbital distance is a ratio quantity — the pack's own
    //     `orbital_spacing` rules are ratios, and every spacing law from Titius-Bode on is
    //     geometric — so uniform sampling in AU is the wrong measure and is what buried 99% of
    //     draws beyond 2 AU. Log-uniform over the same gap spans the same range and puts the median
    //     at the geometric mean.
    // (2) HONOUR THE TYPE WHERE THE PACK DECLARES ONE. A fingerprint's `range.Teq_K` says what
    //     temperature that type belongs at; inverting the equilibrium relation turns it into an
    //     orbital band. Only 18 of 71 types declare one, so this is a REFINEMENT of (1) and never a
    //     requirement — an ice giant asked for at 0-200 K gets the cold half of the gap, and a type
    //     that says nothing simply gets (1).
    const typeBand = preferredOrbitBandAU(finalPlanetType, host, pack);
    let lo = chosenGap.start, hi = chosenGap.end;
    if (typeBand) {
        const overlapLo = Math.max(lo, typeBand[0]);
        const overlapHi = Math.min(hi, typeBand[1]);
        if (overlapHi > overlapLo) { lo = overlapLo; hi = overlapHi; }
    }
    const newA_AU = logUniform(rng, lo, hi);

    const newEccentricity = randomFromRange(rng, 0.01, 0.15);
    const orbit: Orbit = {
        hostId: hostId,
        hostMu: G * hostMass,
        t0: Date.now(),
        elements: { 
            a_AU: newA_AU, 
            e: newEccentricity, 
            i_deg: Math.pow(rng.nextFloat(), 3) * 15, 
            omega_deg: 0, 
            Omega_deg: 0, 
            M0_rad: randomFromRange(rng, 0, 2 * Math.PI) 
        }
    };

    const siblings = sys.nodes.filter(n => n.parentId === hostId);
    const name = (host.roleHint === 'star' || host.kind === 'barycenter') 
        ? `${host.name} ${String.fromCharCode(98 + siblings.length)}`
        : `${host.name} ${toRoman(siblings.length + 1)}`;

    const propertyOverrides: Partial<CelestialBody> = {};
    if (newA_AU < stellarZones.co2IceLine) {
        propertyOverrides.tags = [{ key: 'origin/migrated' }];
    }

    const newNodes = _generatePlanetaryBody(rng, pack, `${sys.seed}-custom`, siblings.length, host, orbit, name, sys.nodes, sys.age_Gyr, finalPlanetType, false, propertyOverrides);
    
    const newSystem = {
        ...sys,
        nodes: [...sys.nodes, ...newNodes]
    };

    return newSystem;
}

export function renameNode(sys: System, nodeId: ID, newName: string): System {
    const nodes = JSON.parse(JSON.stringify(sys.nodes));
    const targetNode = nodes.find((n: CelestialBody | Barycenter) => n.id === nodeId);

    if (!targetNode) return sys;

    const oldName = targetNode.name;
    targetNode.name = newName;
    (targetNode as CelestialBody).isNameUserDefined = true;

    const queue: { parentOldName: string, parentNewName: string, parentId: ID }[] = [{ parentOldName: oldName, parentNewName: newName, parentId: nodeId }];

    while (queue.length > 0) {
        const { parentOldName, parentNewName, parentId } = queue.shift()!;

        nodes.filter((n: CelestialBody | Barycenter) => n.parentId === parentId).forEach((child: CelestialBody | Barycenter) => {
            if ((child as CelestialBody).isNameUserDefined) {
                return; // Stop propagation
            }

            const oldChildName = child.name;
            // This replacement is based on the assumption that the child's auto-generated name contains the parent's name.
            const newChildName = oldChildName.replace(parentOldName, parentNewName);
            child.name = newChildName;

            queue.push({ parentOldName: oldChildName, parentNewName: newChildName, parentId: child.id });
        });
    }

    let systemName = sys.name;
    if (targetNode.parentId === null) {
        systemName = newName;
    }

    return { ...sys, name: systemName, nodes: nodes };
}


function generateAndNormalizeComposition(rng: SeededRNG, compositionRanges: Record<string, number | [number, number]>): Record<string, number> {
    const rawComposition: Record<string, number> = {};
    let total = 0;
    for (const gas in compositionRanges) {
        const value = compositionRanges[gas];
        const amount = Array.isArray(value) ? randomFromRange(rng, value[0], value[1]) : value;
        rawComposition[gas] = amount;
        total += amount;
    }

    const finalComposition: Record<string, number> = {};
    if (total > 0) {
        for (const gas in rawComposition) {
            finalComposition[gas] = rawComposition[gas] / total;
        }
    }
    return finalComposition;
}

export function addHabitablePlanet(sys: System, hostId: ID, habitabilityType: 'earth-like' | 'human-habitable' | 'alien-habitable', pack: RulePack): System {

    const rng = new SeededRNG(sys.seed + Date.now());

    const host = sys.nodes.find(n => n.id === hostId) as CelestialBody;

    if (!host) throw new Error(`Host with id ${hostId} not found.`);



    const orbitResult = findViableHabitableOrbit(host, sys, habitabilityType, pack);



        if (!orbitResult.success) {



            throw new Error(orbitResult.reason);



        }



    const siblings = sys.nodes.filter(n => n.parentId === hostId);

    const name = ((host as CelestialBody).roleHint === 'star' || host.kind === 'barycenter') 

        ? `${host.name} ${String.fromCharCode(98 + siblings.length)}`

        : `${host.name} ${toRoman(siblings.length + 1)}`;



        const propertyOverrides: Partial<CelestialBody> = {};



        const atmEntries = pack.distributions.atmosphere_composition.entries;



                if (habitabilityType === 'earth-like') {



                    // Look for breathable atmosphere by tag first, fallback to name

                    let earthLikeAtmDef = atmEntries.find(e => e.value.tags?.includes('breathable-human'))?.value;

                    if (!earthLikeAtmDef) {

                        earthLikeAtmDef = atmEntries.find(e => e.value.name === 'Nitrogen–Oxygen (Earth-like)')?.value;

                    }

                    

                    if (!earthLikeAtmDef) throw new Error("No Earth-like atmosphere found in RulePack.");



                    const finalComposition = generateAndNormalizeComposition(rng, earthLikeAtmDef.composition);



                    const mainGas = Object.keys(finalComposition).reduce((a, b) => finalComposition[a] > finalComposition[b] ? a : b);



                    const pressure = randomFromRange(rng, earthLikeAtmDef.pressure_range_bar[0], earthLikeAtmDef.pressure_range_bar[1]);



    



                    propertyOverrides.massKg = randomFromRange(rng, 0.5, 1.5) * EARTH_MASS_KG;



                    propertyOverrides.radiusKm = randomFromRange(rng, 0.8, 1.2) * EARTH_RADIUS_KM;



                    propertyOverrides.atmosphere = { 



                        name: earthLikeAtmDef.name,



                        main: mainGas, 



                        composition: finalComposition, 



                        pressure_bar: pressure



                    };



                    propertyOverrides.hydrosphere = { composition: 'water', coverage: 0.7 };



                    propertyOverrides.magneticField = { strengthGauss: 1.0 };



                    propertyOverrides.targetTemperatureK = 288; // Target 15C



    



        



    



                } else if (habitabilityType === 'human-habitable') {

            

            // Look for hypoxic atmosphere by tag first

            let hypoxicAtmDef = atmEntries.find(e => e.value.tags?.includes('hypoxic'))?.value;

            if (!hypoxicAtmDef) {

                 hypoxicAtmDef = atmEntries.find(e => e.value.name === 'Low-O₂, Low-CO₂ (Hypoxic Inert)')?.value;

            }

            

            // Fallback to ANY breathable if hypoxic missing

            if (!hypoxicAtmDef) {

                hypoxicAtmDef = atmEntries.find(e => e.value.tags?.includes('breathable-human'))?.value;

            }

            

            if (!hypoxicAtmDef) throw new Error("No Human-Habitable atmosphere found in RulePack.");



            const finalComposition = generateAndNormalizeComposition(rng, hypoxicAtmDef.composition);

            const mainGas = Object.keys(finalComposition).reduce((a, b) => finalComposition[a] > finalComposition[b] ? a : b);

            const pressure = hypoxicAtmDef.pressure_range_bar ? randomFromRange(rng, hypoxicAtmDef.pressure_range_bar[0], hypoxicAtmDef.pressure_range_bar[1]) : randomFromRange(rng, 0.5, 1.5);



            propertyOverrides.massKg = randomFromRange(rng, 0.5, 1.5) * EARTH_MASS_KG;

            propertyOverrides.radiusKm = randomFromRange(rng, 0.8, 1.2) * EARTH_RADIUS_KM;

            propertyOverrides.atmosphere = { 

                name: hypoxicAtmDef.name || 'Human-Habitable (Hypoxic)',

                main: mainGas, 

                composition: finalComposition,

                pressure_bar: pressure

            };

            propertyOverrides.hydrosphere = { composition: 'water', coverage: randomFromRange(rng, 0.2, 0.8) };

            propertyOverrides.magneticField = { strengthGauss: 1.0 }; // Ensure it has a magnetic field

            propertyOverrides.targetTemperatureK = 288; // Target 15C



            if (hypoxicAtmDef.tags) {

                propertyOverrides.tags = hypoxicAtmDef.tags.map((t: string) => ({ key: t }));

            }



        } else { // alien-habitable

            propertyOverrides.massKg = randomFromRange(rng, 0.5, 3.0) * EARTH_MASS_KG;

            propertyOverrides.radiusKm = randomFromRange(rng, 0.8, 2.0) * EARTH_RADIUS_KM;

        }



    const newNodes = _generatePlanetaryBody(new SeededRNG(sys.seed + Date.now()), pack, `${sys.seed}-custom`, siblings.length, host, orbitResult.orbit, name, sys.nodes, sys.age_Gyr, 'planet/terrestrial', false, propertyOverrides);



    const newSystem = {

        ...sys,

        nodes: [...sys.nodes, ...newNodes]

    };



    return newSystem;

}
