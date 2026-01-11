// src/lib/generation/system.ts
import type { System, RulePack, ID, CelestialBody, Barycenter, Orbit } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange, toRoman } from '../utils';
import { _generateStar } from './star';
import { _generatePlanetaryBody } from './planet';
import { G, AU_KM, SOLAR_MASS_KG } from '../constants';
import type { GenOptions } from '../api';
import { calculateAllStellarZones } from '../physics/zones';
import { systemProcessor } from '../core/SystemProcessor';

export function generateSystem(seed: string, pack: RulePack, __opts: Partial<GenOptions> = {}, generationChoice?: string, empty: boolean = false, initialToytownFactor: number = 0): System {
  const rng = new SeededRNG(seed);
  const nodes: (CelestialBody | Barycenter)[] = [];

  let systemRoot: CelestialBody | Barycenter;
  let systemName: string;
  let totalMassKg = 0;
  let rootRadiusKm = 0;
  let baseName = `System ${seed}`;

  // --- Star Generation ---
  // ... (Code remains the same) ...
  const baseNamePrefixTable = pack.distributions['star_name_prefix'];
  const baseNameDigitsTable = pack.distributions['star_name_number_digits'];
  if (baseNamePrefixTable && baseNameDigitsTable) {
      const prefix = weightedChoice<string>(rng, baseNamePrefixTable);
      const numDigits = weightedChoice<number>(rng, baseNameDigitsTable);
      baseName = `${prefix}${ ' '.padStart(numDigits, '0').replace(/0/g, () => rng.nextInt(0, 9).toString())}`;
  }

  let starTypeOverride: string | undefined = undefined;
  let forceBinary: boolean | undefined = undefined;

  if (generationChoice && generationChoice !== 'Random') {
    const isBinarySelection = generationChoice.endsWith(' Binary');
    const type = generationChoice.replace('Type ', 'star/').replace(' Binary', '');
    starTypeOverride = type;
    forceBinary = isBinarySelection;
  }

  const starA = _generateStar(`${seed}-star-a`, null, pack, rng, starTypeOverride);
  const starClass = starA.classes[0].split('/')[1]; // e.g., "G2V" -> "G"

  let isBinary = forceBinary ?? false;
  if (forceBinary === undefined) { // Only use random chance if user didn't specify
    if (['O', 'B'].includes(starClass)) {
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_massive']);
    } else if (['A', 'F', 'G', 'K'].includes(starClass)) {
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_sunlike']);
    } else { // M, WD, etc.
        isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_lowmass']);
    }
  }

  if (!isBinary) {
    starA.name = baseName;
    nodes.push(starA);
    systemRoot = starA;
    systemName = starA.name;
    totalMassKg = starA.massKg || 0;
    rootRadiusKm = starA.radiusKm || 0;

    if (starA.classes.includes('star/BH_active')) {
        const ring = bodyFactory.createBody({
            name: `${starA.name} Accretion Disk`,
            roleHint: 'ring',
            parentId: starA.id,
            seed: `${starA.id}-accretion-disk`
        });
        ring.id = `${starA.id}-accretion-disk`;
        ring.classes = ['ring/accretion_disk'];
        ring.radiusInnerKm = (starA.radiusKm || 0) * 1.1;
        ring.radiusOuterKm = (starA.radiusKm || 0) * randomFromRange(rng, 5, 20);
        nodes.push(ring);
    }
  } else {
    const barycenterId = `${seed}-barycenter-0`;
    const barycenter: Barycenter = {
        id: barycenterId,
        parentId: null,
        name: `${baseName} System Barycenter`,
        kind: "barycenter",
        memberIds: [starA.id],
        tags: [],
    };

    starA.parentId = barycenterId;
    starA.name = `${baseName} A`;

    const starB = _generateStar(`${seed}-star-b`, barycenterId, pack, rng);
    starB.name = `${baseName} B`;
    barycenter.memberIds.push(starB.id);

    totalMassKg = (starA.massKg || 0) + (starB.massKg || 0);
    barycenter.effectiveMassKg = totalMassKg;

    const separationRange = weightedChoice<[number, number]>(rng, pack.distributions['binary_star_separation_au']);
    const totalSeparationAU = randomFromRange(rng, separationRange[0], separationRange[1]);

    const m1 = starA.massKg || 0;
    const m2 = starB.massKg || 0;

    const n_rad_per_s = Math.sqrt(G * totalMassKg / Math.pow(totalSeparationAU * AU_KM * 1000, 3));

    starA.orbit = {
        hostId: barycenterId,
        hostMu: G * totalMassKg,
        t0: Date.now(),
        n_rad_per_s: n_rad_per_s,
        elements: { a_AU: totalSeparationAU * (m2 / (m1 + m2)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 }
    };
    starB.orbit = {
        hostId: barycenterId,
        hostMu: G * totalMassKg,
        t0: Date.now(),
        n_rad_per_s: n_rad_per_s,
        elements: { a_AU: totalSeparationAU * (m1 / (m1 + m2)), e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: Math.PI }
    };

    nodes.push(barycenter, starA, starB);
    systemRoot = barycenter;
    systemName = `${baseName} System`;
    rootRadiusKm = (starA.radiusKm || 0) + (starB.radiusKm || 0);
  }

  const system_age_Gyr = randomFromRange(rng, 0.1, 10.0);

  // --- Planet & Belt Generation ---
  if (!empty) {
      let bodyCountTable;
      const spectralType = starClass[0];
      if (['O', 'B', 'A'].includes(spectralType)) {
        bodyCountTable = pack.distributions['planet_count_massive'];
      } else if (['G', 'K', 'M', 'F'].includes(spectralType) || starClass === 'red-giant') {
        bodyCountTable = pack.distributions['planet_count_main_sequence'];
      } else {
        bodyCountTable = pack.distributions['planet_count_remnant'];
      }
      const numBodies = bodyCountTable ? weightedChoice<number>(rng, bodyCountTable) : rng.nextInt(0, 8);

      const frostLineAU = (pack.generation_parameters?.frost_line_base_au || 2.7) * Math.sqrt((starA.massKg || SOLAR_MASS_KG) / SOLAR_MASS_KG);
    
      if (!isBinary) {
        const star = systemRoot as CelestialBody;
        const stellarZones = calculateAllStellarZones(star, pack);
        const systemLimitAu = stellarZones.systemLimitAu;

        const rocheLimitAU = (star.radiusKm * 2.44) / AU_KM;
        const sootLineAU = ((star.radiusKm / 2) * Math.pow(star.temperatureK / 1800, 2)) / AU_KM;
        const minOrbitAU = Math.max(rocheLimitAU, sootLineAU) * 1.2; // 20% buffer

        const tbParams = pack.distributions.titius_bode_law;
        let orbitalSlotsAU: number[] = [];
        if (tbParams) {
            orbitalSlotsAU = tbParams.sequence.map((n: number) => {
                const power = n === -999 ? 0 : Math.pow(tbParams.c, n);
                return tbParams.a + tbParams.b * power;
            });
            orbitalSlotsAU = orbitalSlotsAU.filter(au => au > minOrbitAU && au < systemLimitAu);
        } else {
            // Fallback to old method if T-B params not in rulepack
            let lastApoapsisAU = minOrbitAU;
            for (let i = 0; i < numBodies; i++) {
                const minGap = 0.2;
                const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
                const newA_AU = newPeriapsis / (1 - randomFromRange(rng, 0.01, 0.15));
                if (newA_AU > systemLimitAu) break; // Stop if we go beyond the limit
                orbitalSlotsAU.push(newA_AU);
                lastApoapsisAU = newA_AU * (1 + randomFromRange(rng, 0.01, 0.15));
            }
        }

        // Shuffle the slots and take the first numBodies
        rng.shuffle(orbitalSlotsAU);
        const planetSlots = orbitalSlotsAU.slice(0, numBodies);

        for (let i = 0; i < planetSlots.length; i++) {
            const slotAU = planetSlots[i];
            const jitter = tbParams ? tbParams.jitter : 0.1;
            const jitteredAU = slotAU * (1 + randomFromRange(rng, -jitter, jitter));

            const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
            const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);

            const orbit: Orbit = {
                hostId: systemRoot.id,
                hostMu: G * totalMassKg,
                t0: Date.now(),
                elements: { a_AU: jitteredAU, e: newEccentricity, i_deg: Math.pow(rng.nextFloat(), 3) * 15, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
            };

            if (weightedChoice<boolean>(rng, pack.distributions['retrograde_orbit_chance'])) {
                orbit.isRetrogradeOrbit = true;
            }

            const newNodes = _generatePlanetaryBody(rng, pack, seed, i, systemRoot, orbit, `${systemName} ${String.fromCharCode(98 + i)}`, nodes, system_age_Gyr, undefined, true);
            nodes.push(...newNodes);
        }
      } else {
        const starA = nodes.find(n => n.id.endsWith('-star-a')) as CelestialBody;
        const starB = nodes.find(n => n.id.endsWith('-star-b')) as CelestialBody;
        const barycenter = systemRoot as Barycenter;
    
        const m1 = starA.massKg || 0;
        const m2 = starB.massKg || 0;
        const mu = m2 / (m1 + m2);
        const starSeparationAU = (starA.orbit?.elements.a_AU || 0) + (starB.orbit?.elements.a_AU || 0);
    
        const pTypeCriticalAU = 1.60 * starSeparationAU;
        const sTypeACriticalAU = 0.464 * (1 - mu) * starSeparationAU;
        const sTypeBCriticalAU = 0.464 * mu * starSeparationAU;
    
        let lastApo_p = pTypeCriticalAU * 1.5;

        const rocheLimitA_AU = (starA.radiusKm * 2.44) / AU_KM;
        const sootLineA_AU = ((starA.radiusKm / 2) * Math.pow(starA.temperatureK / 1800, 2)) / AU_KM;
        let lastApo_sA = Math.max(rocheLimitA_AU, sootLineA_AU) * 1.2;

        const rocheLimitB_AU = (starB.radiusKm * 2.44) / AU_KM;
        const sootLineB_AU = ((starB.radiusKm / 2) * Math.pow(starB.temperatureK / 1800, 2)) / AU_KM;
        let lastApo_sB = Math.max(rocheLimitB_AU, sootLineB_AU) * 1.2;
    
        for (let i = 0; i < numBodies; i++) {
            const placement = weightedChoice<string>(rng, pack.distributions['binary_planet_placement']);
    
            let host: CelestialBody | Barycenter;
            let lastApo: number;
            let maxApo: number | null = null;
            let planetNamePrefix: string;
            let hostMassKg: number;
    
            if (placement === 'circumbinary') {
                host = barycenter;
                lastApo = lastApo_p;
                planetNamePrefix = `${baseName} P`;
                hostMassKg = totalMassKg;
            } else if (placement === 'around_primary') {
                host = starA;
                lastApo = lastApo_sA;
                maxApo = sTypeACriticalAU;
                planetNamePrefix = `${starA.name} `;
                hostMassKg = m1;
            } else { // around_secondary
                host = starB;
                lastApo = lastApo_sB;
                maxApo = sTypeBCriticalAU;
                planetNamePrefix = `${starB.name} `;
                hostMassKg = m2;
            }
    
            const minGap = 0.1 * (host.kind === 'barycenter' ? starSeparationAU : 1);
            const newPeriapsis = lastApo + randomFromRange(rng, minGap, minGap * 3);
            if (maxApo && newPeriapsis > maxApo) continue;
    
            const maxEccentricity = (system_age_Gyr > 5) ? 0.1 : 0.15;
            const newEccentricity = randomFromRange(rng, 0.01, maxEccentricity);
                    const newA_AU = newPeriapsis / (1 - newEccentricity);
                    const newApoapsis = newA_AU * (1 + newEccentricity);
            
                    if (maxApo && newApoapsis > maxApo) continue;
            
                    const orbit: Orbit = {
                        hostId: host.id,
                        hostMu: G * hostMassKg,
                        t0: Date.now(),
                        elements: { a_AU: newA_AU, e: newEccentricity, i_deg: Math.pow(rng.nextFloat(), 3) * 15, omega_deg: 0, Omega_deg: 0, M0_rad: randomFromRange(rng, 0, 2 * Math.PI) }
                    };

                    if (weightedChoice<boolean>(rng, pack.distributions['retrograde_orbit_chance'])) {
                        orbit.isRetrogradeOrbit = true;
                    }

            const newNodes = _generatePlanetaryBody(rng, pack, seed, i, host, orbit, `${planetNamePrefix}${toRoman(i + 1)}`, nodes, system_age_Gyr, undefined, true);
            nodes.push(...newNodes);
    
            if (placement === 'circumbinary') lastApo_p = newApoapsis;
            else if (placement === 'around_primary') lastApo_sA = newApoapsis;
            else lastApo_sB = newApoapsis;
        }
      }
  }
  
    const system: System = {
      id: seed,
      name: systemName,
      seed: seed,
      epochT0: Date.now(),
      age_Gyr: system_age_Gyr,
      nodes: nodes,
      rulePackId: pack.id,
      rulePackVersion: pack.version,
      tags: [],
      toytownFactor: initialToytownFactor,
      visualScalingMultiplier: 0.5,
      isManuallyEdited: false,
    };
  
  // Use the new SystemProcessor instead of processSystemData
  return systemProcessor.process(system, pack);
}
