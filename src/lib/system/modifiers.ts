// src/lib/system/modifiers.ts
import type { System, ID, CelestialBody, Barycenter, RulePack, Orbit } from "../types";
import { SeededRNG } from '../rng';
import { randomFromRange, toRoman } from '../utils';
import { _generatePlanetaryBody } from '../generation/planet';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM } from '../constants';
import { findHabitableOrbit } from '../physics/habitability';

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

export function addPlanetaryBody(sys: System, hostId: ID, planetType: string, pack: RulePack): System {
    const rng = new SeededRNG(sys.seed + Date.now()); // Use a new RNG seed to avoid determinism issues
    const host = sys.nodes.find(n => n.id === hostId);
    if (!host) throw new Error(`Host with id ${hostId} not found.`);

    const hostMass = (host.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody).massKg) || 0;
    if (hostMass === 0) throw new Error(`Host ${hostId} has no mass.`);

    // 1. Find a valid orbit
    const children = sys.nodes.filter(n => n.parentId === hostId && n.kind === 'body') as CelestialBody[];
    let lastApoapsisAU = 0;

    if (children.length > 0) {
        children.forEach(child => {
            if (child.orbit) {
                const apoapsis = child.orbit.elements.a_AU * (1 + child.orbit.elements.e);
                if (apoapsis > lastApoapsisAU) {
                    lastApoapsisAU = apoapsis;
                }
            }
        });
    } else if (host.kind === 'body') {
        // If no children, start just outside the host's Roche limit
        const parentDensity = (host.massKg || 0) / (4/3 * Math.PI * Math.pow((host.radiusKm || 1) * 1000, 3));
        const moonDensity = 3344; // Approximate density of Earth's moon
        const rocheLimit_km = (host.radiusKm || 1) * Math.pow(2 * (parentDensity / moonDensity), 1/3);
        lastApoapsisAU = rocheLimit_km / AU_KM * 1.5;
    } else {
        // Fallback for barycenters or other non-body hosts
        lastApoapsisAU = ((host as CelestialBody).radiusKm || 0) / AU_KM;
    }

    const minGap = (lastApoapsisAU > 0) ? lastApoapsisAU * 0.2 : 0.1;
    const newPeriapsis = lastApoapsisAU + randomFromRange(rng, minGap, minGap * 5);
    const newEccentricity = randomFromRange(rng, 0.01, 0.15);
    const newA_AU = newPeriapsis / (1 - newEccentricity);

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
    const name = ((host as CelestialBody).roleHint === 'star' || host.kind === 'barycenter') 
        ? `${host.name} ${String.fromCharCode(98 + siblings.length)}`
        : `${host.name} ${toRoman(siblings.length + 1)}`;

    const newNodes = _generatePlanetaryBody(rng, pack, `${sys.seed}-custom`, siblings.length, host, orbit, name, sys.nodes, sys.age_Gyr, planetType, false);
    
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

export function addHabitablePlanet(sys: System, hostId: ID, habitabilityType: 'earth-like' | 'human-habitable' | 'alien-habitable', pack: RulePack): System {
    const rng = new SeededRNG(sys.seed + Date.now());
    const host = sys.nodes.find(n => n.id === hostId) as CelestialBody;
    if (!host) throw new Error(`Host with id ${hostId} not found.`);

    const tempRange: [number, number] = (habitabilityType === 'alien-habitable') ? [150, 400] : [273, 313];
    const orbit = findHabitableOrbit(host, sys, tempRange);

    if (!orbit) {
        throw new Error(`No suitable habitable orbit found for a ${habitabilityType} planet around ${host.name}.`);
    }

    const propertyOverrides: Partial<CelestialBody> = {
    };

    if (habitabilityType === 'earth-like') {
        propertyOverrides.massKg = randomFromRange(rng, 0.8, 1.2) * EARTH_MASS_KG;
        propertyOverrides.radiusKm = randomFromRange(rng, 0.9, 1.1) * EARTH_RADIUS_KM;
        propertyOverrides.atmosphere = { main: 'N2', composition: {'N2': 0.78, 'O2': 0.21, 'Ar': 0.01}, pressure_bar: 1.0 };
        propertyOverrides.hydrosphere = { composition: 'water', coverage: 0.7 };
    } else if (habitabilityType === 'human-habitable') {
        propertyOverrides.massKg = randomFromRange(rng, 0.5, 1.5) * EARTH_MASS_KG;
        propertyOverrides.radiusKm = randomFromRange(rng, 0.8, 1.2) * EARTH_RADIUS_KM;
        propertyOverrides.atmosphere = { main: 'N2', composition: {'N2': 0.8, 'O2': 0.2}, pressure_bar: randomFromRange(rng, 0.5, 1.5) };
        propertyOverrides.hydrosphere = { composition: 'water', coverage: randomFromRange(rng, 0.2, 0.8) };
    } else { // alien-habitable
        propertyOverrides.massKg = randomFromRange(rng, 0.5, 3.0) * EARTH_MASS_KG;
        propertyOverrides.radiusKm = randomFromRange(rng, 0.8, 2.0) * EARTH_RADIUS_KM;
        // Leave atmosphere and hydrosphere to be generated randomly, allowing for more exotic types
    }

    const siblings = sys.nodes.filter(n => n.parentId === hostId);
    const name = ((host as CelestialBody).roleHint === 'star' || host.kind === 'barycenter') 
        ? `${host.name} ${String.fromCharCode(98 + siblings.length)}`
        : `${host.name} ${toRoman(siblings.length + 1)}`;

    const newNodes = _generatePlanetaryBody(new SeededRNG(sys.seed + Date.now()), pack, `${sys.seed}-custom`, siblings.length, host, orbit, name, sys.nodes, sys.age_Gyr, 'planet/terrestrial', false, propertyOverrides);
    
    const newSystem = {
        ...sys,
        nodes: [...sys.nodes, ...newNodes]
    };

    return newSystem;
}