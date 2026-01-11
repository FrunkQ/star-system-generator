import type { CelestialBody, Barycenter, RulePack, Orbit } from '../types';
import { SeededRNG } from '../rng';
import { weightedChoice, randomFromRange } from '../utils';
import { _generateStar } from './star';
import { bodyFactory } from '../core/BodyFactory';
import { G, AU_KM } from '../constants';

export interface StarSetupResult {
    nodes: (CelestialBody | Barycenter)[];
    systemRoot: CelestialBody | Barycenter;
    systemName: string;
    isBinary: boolean;
    starA: CelestialBody;
}

export function setupStars(seed: string, pack: RulePack, rng: SeededRNG, generationChoice?: string): StarSetupResult {
    let baseName = `System ${seed}`;
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
    const starClass = starA.classes[0].split('/')[1]; 

    let isBinary = forceBinary ?? false;
    if (forceBinary === undefined) { 
        if (['O', 'B'].includes(starClass)) {
            isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_massive']);
        } else if (['A', 'F', 'G', 'K'].includes(starClass)) {
            isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_sunlike']);
        } else { 
            isBinary = weightedChoice<boolean>(rng, pack.distributions['is_binary_chance_lowmass']);
        }
    }

    const nodes: (CelestialBody | Barycenter)[] = [];
    let systemRoot: CelestialBody | Barycenter;
    let systemName: string;

    if (!isBinary) {
        starA.name = baseName;
        nodes.push(starA);
        systemRoot = starA;
        systemName = starA.name;

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

        const totalMassKg = (starA.massKg || 0) + (starB.massKg || 0);
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
    }

    return { nodes, systemRoot, systemName, isBinary, starA };
}
