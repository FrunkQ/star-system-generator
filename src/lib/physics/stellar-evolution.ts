import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

export interface StarSeed {
    id: string;
    temperatureK: number;
    luminositySolar: number;
    massKg: number;
    radiusKm: number;
    spectralClass: string;
    category: string; 
    luminosityClass: string; 
    isRemnant: boolean;
    pos: { x: number, y: number, z: number }; 
    vel: { x: number, y: number, z: number }; 
    isEjected?: boolean;
    isUnbound?: boolean;
    isMerged?: boolean;
}

export const SOLAR_TEMPERATURE_K = 5778;
const G = 6.67430e-11;
const SOLAR_LUM_WATT = 3.828e26;

/**
 * Advanced Stellar Classifier
 */
export function classifyStar(params: {
    tempK: number,
    lumSolar: number,
    massKg: number,
    ageGyr: number,
    isRemnant?: boolean
}): { category: string, lumClass: string } {
    const { tempK, lumSolar, massKg, ageGyr, isRemnant } = params;
    const mSolar = massKg / SOLAR_MASS_KG;
    const logL = Math.log10(lumSolar);
    const logT = Math.log10(tempK);

    if (isRemnant) {
        if (mSolar > 3.0) return { category: 'Black Hole', lumClass: 'X' };
        if (mSolar > 1.44) return { category: 'Neutron Star', lumClass: 'X' };
        if (tempK < 1000) return { category: 'Black Dwarf', lumClass: 'VII' };
        return { category: 'White Dwarf', lumClass: 'VII' };
    }
    if (mSolar < 0.08) {
        if (mSolar < 0.013) return { category: 'Sub-Brown Dwarf / Planemo', lumClass: 'V' };
        return { category: 'Brown Dwarf', lumClass: 'V' };
    }
    if (mSolar > 1000 && tempK < 5000) return { category: 'Quasi-Star', lumClass: '0' };
    const eddingtonLum = 32000 * mSolar;
    if (lumSolar > eddingtonLum * 1.5) return { category: 'Invalid (Exceeds Eddington Limit)', lumClass: '?' };
    if (logL > 5.5) return { category: 'Hypergiant', lumClass: '0' };
    if (logL > 4.0) {
        if (logT > 4.0) return { category: 'Blue Supergiant', lumClass: 'I' };
        if (logT > 3.7) return { category: 'Yellow Supergiant', lumClass: 'I' };
        return { category: 'Red Supergiant', lumClass: 'I' };
    }
    if (logL > 1.5) {
        if (logL > 3.0) return { category: 'Bright Giant', lumClass: 'II' };
        return { category: 'Giant', lumClass: 'III' };
    }
    const msExpectedLogL = 6.5 * logT - 24.5;
    if (logL > msExpectedLogL + 0.5 && logL < msExpectedLogL + 1.5) return { category: 'Subgiant', lumClass: 'IV' };
    if (Math.abs(logL - msExpectedLogL) <= 0.8) {
        if (mSolar < 0.5) return { category: 'Red Dwarf (MS)', lumClass: 'V' };
        return { category: 'Main Sequence', lumClass: 'V' };
    }
    if (logL < msExpectedLogL - 0.8 && logL > -4) return { category: 'Subdwarf', lumClass: 'VI' };
    return { category: 'Invalid / Exotic Unknown', lumClass: '?' };
}

export function deriveStarFromHR(temperatureK: number, luminositySolar: number): StarSeed {
    let massSolar = Math.pow(luminositySolar, 0.28);
    const { category, lumClass } = classifyStar({ tempK: temperatureK, lumSolar: luminositySolar, massKg: massSolar * SOLAR_MASS_KG, ageGyr: 0 });
    if (category === 'White Dwarf') massSolar = 0.6;
    const radiusSolar = Math.sqrt(luminositySolar) / Math.pow(temperatureK / SOLAR_TEMPERATURE_K, 2);
    return {
        id: `star-${Math.random().toString(36).substr(2, 9)}`,
        temperatureK, luminositySolar,
        massKg: massSolar * SOLAR_MASS_KG, radiusKm: radiusSolar * SOLAR_RADIUS_KM,
        spectralClass: determineSpectralClass(temperatureK), category, luminosityClass: lumClass,
        isRemnant: category.includes('Dwarf') || category.includes('Hole') || category.includes('Neutron'),
        pos: { x: 0, y: 0, z: 0 }, vel: { x: 0, y: 0, z: 0 }
    };
}

export function determineSpectralClass(tempK: number): string {
    if (tempK >= 30000) return 'O'; if (tempK >= 10000) return 'B'; if (tempK >= 7500) return 'A';
    if (tempK >= 6000) return 'F'; if (tempK >= 5200) return 'G'; if (tempK >= 3700) return 'K';
    return 'M';
}

export function initializeStellarNursery(stars: StarSeed[], clusterRadiusAU: number = 50): StarSeed[] {
    const AU_TO_M = 149597870700;
    return stars.map(star => {
        const r = Math.random() * clusterRadiusAU * AU_TO_M;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        star.pos = { x: r * Math.sin(phi) * Math.cos(theta), y: r * Math.sin(phi) * Math.sin(theta), z: r * Math.cos(phi) };
        const vMag = Math.sqrt((G * SOLAR_MASS_KG) / (Math.max(r, 1 * AU_TO_M))) * (0.5 + Math.random() * 0.5);
        star.vel = { x: -vMag * Math.sin(theta), y: vMag * Math.cos(theta), z: (Math.random() - 0.5) * vMag * 0.2 };
        return star;
    });
}

export function stepNBody(stars: StarSeed[], dt: number): StarSeed[] {
    const activeStars = stars.filter(s => !s.isEjected && !s.isMerged);
    if (activeStars.length < 2) return stars;

    const getAccel = (positions: {x:number, y:number, z:number}[]) => {
        return activeStars.map((s1, i) => {
            let ax = 0, ay = 0, az = 0;
            activeStars.forEach((s2, j) => {
                if (i === j) return;
                const dx = positions[j].x - positions[i].x;
                const dy = positions[j].y - positions[i].y;
                const dz = positions[j].z - positions[i].z;
                const distSq = dx*dx + dy*dy + dz*dz + 1e14; 
                const dist = Math.sqrt(distSq);
                const force = (G * s2.massKg) / distSq;
                ax += force * (dx / dist); ay += force * (dy / dist); az += force * (dz / dist);
            });
            return { x: ax, y: ay, z: az };
        });
    };

    const p0 = activeStars.map(s => s.pos);
    const v0 = activeStars.map(s => s.vel);
    const k1v = getAccel(p0); const k1p = v0;
    const p1 = p0.map((p, i) => ({ x: p.x + k1p[i].x * dt/2, y: p.y + k1p[i].y * dt/2, z: p.z + k1p[i].z * dt/2 }));
    const v1 = v0.map((v, i) => ({ x: v.x + k1v[i].x * dt/2, y: v.y + k1v[i].y * dt/2, z: v.z + k1v[i].z * dt/2 }));
    const k2v = getAccel(p1); const k2p = v1;
    const p2 = p0.map((p, i) => ({ x: p.x + k2p[i].x * dt/2, y: p.y + k2p[i].y * dt/2, z: p.z + k2p[i].z * dt/2 }));
    const v2 = v0.map((v, i) => ({ x: v.x + k2v[i].x * dt/2, y: v.y + k2v[i].y * dt/2, z: v.z + k2v[i].z * dt/2 }));
    const k3v = getAccel(p2); const k3p = v2;
    const p3 = p0.map((p, i) => ({ x: p.x + k3p[i].x * dt, y: p.y + k3p[i].y * dt, z: p.z + k3p[i].z * dt }));
    const v3 = v0.map((v, i) => ({ x: v.x + k3v[i].x * dt, y: v.y + k3v[i].y * dt, z: v.z + k3v[i].z * dt }));
    const k4v = getAccel(p3); const k4p = v3;

    activeStars.forEach((s, i) => {
        s.pos.x += (dt/6) * (k1p[i].x + 2*k2p[i].x + 2*k3p[i].x + k4p[i].x);
        s.pos.y += (dt/6) * (k1p[i].y + 2*k2p[i].y + 2*k3p[i].y + k4p[i].y);
        s.pos.z += (dt/6) * (k1p[i].z + 2*k2p[i].z + 2*k3p[i].z + k4p[i].z);
        s.vel.x += (dt/6) * (k1v[i].x + 2*k2v[i].x + 2*k3v[i].x + k4v[i].x);
        s.vel.y += (dt/6) * (k1v[i].y + 2*k2v[i].y + 2*k3v[i].y + k4v[i].y);
        s.vel.z += (dt/6) * (k1v[i].z + 2*k2v[i].z + 2*k3v[i].z + k4v[i].z);
    });
    return stars;
}

export function shiftToBarycentricFrame(stars: StarSeed[]): StarSeed[] {
    let totalMass = 0; let baryX = 0, baryY = 0, baryZ = 0; let momX = 0, momY = 0, momZ = 0;
    stars.forEach(s => {
        totalMass += s.massKg; baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg; baryZ += s.pos.z * s.massKg;
        momX += s.vel.x * s.massKg; momY += s.vel.y * s.massKg; momZ += s.vel.z * s.massKg;
    });
    if (totalMass === 0) return stars;
    const vDriftX = momX / totalMass; const vDriftY = momY / totalMass; const vDriftZ = momZ / totalMass;
    const pShiftX = baryX / totalMass; const pShiftY = baryY / totalMass; const pShiftZ = baryZ / totalMass;
    stars.forEach(s => {
        s.pos.x -= pShiftX; s.pos.y -= pShiftY; s.pos.z -= pShiftZ;
        s.vel.x -= vDriftX; s.vel.y -= vDriftY; s.vel.z -= vDriftZ;
    });
    return stars;
}

export function checkEjections(stars: StarSeed[]): { stars: StarSeed[], ejectedAny: boolean } {
    let ejectedAny = false;
    const active = stars.filter(s => !s.isEjected && !s.isMerged);
    if (active.length < 2) return { stars, ejectedAny: false };

    let totalMass = 0; let baryX = 0, baryY = 0, baryZ = 0; let maxMass = -1; let anchorId = "";
    active.forEach(s => {
        totalMass += s.massKg; baryX += s.pos.x * s.massKg; baryY += s.pos.y * s.massKg; baryZ += s.pos.z * s.massKg;
        if (s.massKg > maxMass) { maxMass = s.massKg; anchorId = s.id; }
    });
    const cx = baryX / totalMass; const cy = baryY / totalMass; const cz = baryZ / totalMass;

    active.forEach(s => {
        if (s.id === anchorId) return; 

        const dx = s.pos.x - cx; const dy = s.pos.y - cy; const dz = s.pos.z - cz;
        const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        if (dist < 20 * 149597870700) return; // Don't unbound if within 20 AU

        // TOTAL ENERGY CALCULATION (K + U)
        const vMagSq = s.vel.x**2 + s.vel.y**2 + s.vel.z**2;
        const kineticEnergyPerMass = 0.5 * vMagSq;
        const potentialEnergyPerMass = -(G * (totalMass - s.massKg)) / dist;
        const totalEnergyPerMass = kineticEnergyPerMass + potentialEnergyPerMass;

        const vRad = (s.vel.x * dx + s.vel.y * dy + s.vel.z * dz) / dist;

        // A star is only unbound if its Total Energy is positive (parabolic/hyperbolic)
        if (totalEnergyPerMass > 0 && vRad > 0 && !s.isUnbound) {
            s.isUnbound = true;
            ejectedAny = true;
        }
    });
    return { stars, ejectedAny };
}

export function handleMergers(stars: StarSeed[]): { stars: StarSeed[], mergedAny: boolean } {
    let mergedAny = false;
    const active = stars.filter(s => !s.isEjected && !s.isMerged);
    for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const s1 = active[i]; const s2 = active[j];
            const dx = s2.pos.x - s1.pos.x; const dy = s2.pos.y - s1.pos.y; const dz = s2.pos.z - s1.pos.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            if (dist < (s1.radiusKm + s2.radiusKm) * 1000) {
                const totalMass = s1.massKg + s2.massKg;
                s1.vel.x = (s1.vel.x * s1.massKg + s2.vel.x * s2.massKg) / totalMass;
                s1.vel.y = (s1.vel.y * s1.massKg + s2.vel.y * s2.massKg) / totalMass;
                s1.vel.z = (s1.vel.z * s1.massKg + s2.vel.z * s2.massKg) / totalMass;
                s1.massKg = totalMass;
                s1.radiusKm = Math.pow(s1.massKg / 1.989e30, 0.8) * 696340;
                s2.isMerged = true; mergedAny = true;
            }
        }
    }
    return { stars, mergedAny };
}
