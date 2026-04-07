import { SOLAR_MASS_KG, SOLAR_RADIUS_KM } from '../constants';

export interface StarSeed {
    id: string;
    temperatureK: number;
    luminositySolar: number;
    massKg: number;
    radiusKm: number;
    spectralClass: string;
    category: string; // Detailed category (e.g. 'Hypergiant', 'Magnetar')
    luminosityClass: string; // I, II, III, IV, V, etc.
    isRemnant: boolean;
    pos: { x: number, y: number, z: number }; 
    vel: { x: number, y: number, z: number }; 
    isEjected?: boolean;
    isMerged?: boolean;
}

export const SOLAR_TEMPERATURE_K = 5778;
const G = 6.67430e-11;
const SOLAR_LUM_WATT = 3.828e26;

/**
 * Advanced Stellar Classifier
 * Identifies any stellar object from physical parameters.
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

    // 1. Remnant Detection (Non-fusion bodies)
    if (isRemnant) {
        if (mSolar > 3.0) return { category: 'Black Hole', lumClass: 'X' };
        if (mSolar > 1.44) {
            // High magnetic field would be a tag, but we can class it
            return { category: 'Neutron Star', lumClass: 'X' };
        }
        if (tempK < 1000) return { category: 'Black Dwarf', lumClass: 'VII' };
        return { category: 'White Dwarf', lumClass: 'VII' };
    }

    // 2. Sub-stellar objects
    if (mSolar < 0.08) {
        if (mSolar < 0.013) return { category: 'Sub-Brown Dwarf / Planemo', lumClass: 'V' };
        return { category: 'Brown Dwarf', lumClass: 'V' };
    }

    // 3. Exotic / Early Universe
    if (mSolar > 1000 && tempK < 5000) return { category: 'Quasi-Star', lumClass: '0' };

    // 4. Stability Check: Eddington Limit
    // L_edd approx 32000 * M
    const eddingtonLum = 32000 * mSolar;
    if (lumSolar > eddingtonLum * 1.5) return { category: 'Invalid (Exceeds Eddington Limit)', lumClass: '?' };

    // 5. Yerkes Luminosity Classification
    
    // Hypergiants (0)
    if (logL > 5.5) return { category: 'Hypergiant', lumClass: '0' };

    // Supergiants (I)
    if (logL > 4.0) {
        if (logT > 4.0) return { category: 'Blue Supergiant', lumClass: 'I' };
        if (logT > 3.7) return { category: 'Yellow Supergiant', lumClass: 'I' };
        return { category: 'Red Supergiant', lumClass: 'I' };
    }

    // Giants (II / III)
    if (logL > 1.5) {
        if (logL > 3.0) return { category: 'Bright Giant', lumClass: 'II' };
        return { category: 'Giant', lumClass: 'III' };
    }

    // Subgiants (IV)
    const msExpectedLogL = 6.5 * logT - 24.5;
    if (logL > msExpectedLogL + 0.5 && logL < msExpectedLogL + 1.5) {
        return { category: 'Subgiant', lumClass: 'IV' };
    }

    // Main Sequence (V)
    if (Math.abs(logL - msExpectedLogL) <= 0.8) {
        if (mSolar < 0.5) return { category: 'Red Dwarf (MS)', lumClass: 'V' };
        return { category: 'Main Sequence', lumClass: 'V' };
    }

    // Subdwarfs (VI)
    if (logL < msExpectedLogL - 0.8 && logL > -4) {
        return { category: 'Subdwarf', lumClass: 'VI' };
    }

    return { category: 'Invalid / Exotic Unknown', lumClass: '?' };
}

/**
 * Maps a point on the H-R diagram (T, L) to physical star properties.
 */
export function deriveStarFromHR(temperatureK: number, luminositySolar: number): StarSeed {
    // Initial guess for mass using MS relation
    // (This is refined if the classification determines it's a Giant/WD)
    let massSolar = Math.pow(luminositySolar, 0.28);
    
    const { category, lumClass } = classifyStar({
        tempK: temperatureK,
        lumSolar: luminositySolar,
        massKg: massSolar * SOLAR_MASS_KG,
        ageGyr: 0 // Initial birth
    });

    // Refine properties based on category
    if (category === 'White Dwarf') {
        massSolar = 0.6; // Typical WD mass
    }

    const radiusSolar = Math.sqrt(luminositySolar) / Math.pow(temperatureK / SOLAR_TEMPERATURE_K, 2);

    return {
        id: `star-${Math.random().toString(36).substr(2, 9)}`,
        temperatureK,
        luminositySolar,
        massKg: massSolar * SOLAR_MASS_KG,
        radiusKm: radiusSolar * SOLAR_RADIUS_KM,
        spectralClass: determineSpectralClass(temperatureK),
        category,
        luminosityClass: lumClass,
        isRemnant: category.includes('Dwarf') || category.includes('Hole') || category.includes('Neutron'),
        pos: { x: 0, y: 0, z: 0 },
        vel: { x: 0, y: 0, z: 0 }
    };
}

export function determineSpectralClass(tempK: number): string {
    if (tempK >= 30000) return 'O';
    if (tempK >= 10000) return 'B';
    if (tempK >= 7500) return 'A';
    if (tempK >= 6000) return 'F';
    if (tempK >= 5200) return 'G';
    if (tempK >= 3700) return 'K';
    return 'M';
}

/**
 * Initializes stars in a cluster within a specific radius (AU).
 * Assigns semi-random velocities to encourage orbital formation.
 */
export function initializeStellarNursery(stars: StarSeed[], clusterRadiusAU: number = 50): StarSeed[] {
    const AU_TO_M = 149597870700;
    return stars.map(star => {
        const r = Math.random() * clusterRadiusAU * AU_TO_M;
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);

        // Position
        star.pos = {
            x: r * Math.sin(phi) * Math.cos(theta),
            y: r * Math.sin(phi) * Math.sin(theta),
            z: r * Math.cos(phi)
        };

        // Circular velocity approximation (v = sqrt(G*M_central / r))
        // We'll give them enough velocity to not immediately crash
        const vMag = Math.sqrt((G * SOLAR_MASS_KG) / (Math.max(r, 1 * AU_TO_M))) * (0.5 + Math.random() * 0.5);
        star.vel = {
            x: -vMag * Math.sin(theta),
            y: vMag * Math.cos(theta),
            z: (Math.random() - 0.5) * vMag * 0.2
        };

        return star;
    });
}

/**
 * 4th-order Runge-Kutta N-Body step
 */
export function stepNBody(stars: StarSeed[], dt: number): StarSeed[] {
    const activeStars = stars.filter(s => !s.isEjected && !s.isMerged);
    if (activeStars.length < 2) return stars;

    // 1. Calculate accelerations
    const getAccel = (positions: {x:number, y:number, z:number}[]) => {
        return activeStars.map((s1, i) => {
            let ax = 0, ay = 0, az = 0;
            activeStars.forEach((s2, j) => {
                if (i === j) return;
                const dx = positions[j].x - positions[i].x;
                const dy = positions[j].y - positions[i].y;
                const dz = positions[j].z - positions[i].z;
                const distSq = dx*dx + dy*dy + dz*dz + 1e12; // Softening factor to prevent infinity
                const dist = Math.sqrt(distSq);
                const force = (G * s2.massKg) / distSq;
                ax += force * (dx / dist);
                ay += force * (dy / dist);
                az += force * (dz / dist);
            });
            return { x: ax, y: ay, z: az };
        });
    };

    // RK4 Implementation
    const p0 = activeStars.map(s => s.pos);
    const v0 = activeStars.map(s => s.vel);

    const k1v = getAccel(p0);
    const k1p = v0;

    const p1 = p0.map((p, i) => ({ x: p.x + k1p[i].x * dt/2, y: p.y + k1p[i].y * dt/2, z: p.z + k1p[i].z * dt/2 }));
    const v1 = v0.map((v, i) => ({ x: v.x + k1v[i].x * dt/2, y: v.y + k1v[i].y * dt/2, z: v.z + k1v[i].z * dt/2 }));
    const k2v = getAccel(p1);
    const k2p = v1;

    const p2 = p0.map((p, i) => ({ x: p.x + k2p[i].x * dt/2, y: p.y + k2p[i].y * dt/2, z: p.z + k2p[i].z * dt/2 }));
    const v2 = v0.map((v, i) => ({ x: v.x + k2v[i].x * dt/2, y: v.y + k2v[i].y * dt/2, z: v.z + k2v[i].z * dt/2 }));
    const k3v = getAccel(p2);
    const k3p = v2;

    const p3 = p0.map((p, i) => ({ x: p.x + k3p[i].x * dt, y: p.y + k3p[i].y * dt, z: p.z + k3p[i].z * dt }));
    const v3 = v0.map((v, i) => ({ x: v.x + k3v[i].x * dt, y: v.y + k3v[i].y * dt, z: v.z + k3v[i].z * dt }));
    const k4v = getAccel(p3);
    const k4p = v3;

    // Update positions and velocities
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

/**
 * Detects and handles collisions (mergers).
 */
export function handleMergers(stars: StarSeed[]): { stars: StarSeed[], mergedAny: boolean } {
    let mergedAny = false;
    const active = stars.filter(s => !s.isEjected && !s.isMerged);
    
    for (let i = 0; i < active.length; i++) {
        for (let j = i + 1; j < active.length; j++) {
            const s1 = active[i];
            const s2 = active[j];
            const dx = s2.pos.x - s1.pos.x;
            const dy = s2.pos.y - s1.pos.y;
            const dz = s2.pos.z - s1.pos.z;
            const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);
            
            // Merger condition: closer than combined radii (with a bit of buffer)
            if (dist < (s1.radiusKm + s2.radiusKm) * 1000) {
                // Merge s2 into s1
                const totalMass = s1.massKg + s2.massKg;
                
                // Conservation of momentum for new velocity
                s1.vel.x = (s1.vel.x * s1.massKg + s2.vel.x * s2.massKg) / totalMass;
                s1.vel.y = (s1.vel.y * s1.massKg + s2.vel.y * s2.massKg) / totalMass;
                s1.vel.z = (s1.vel.z * s1.massKg + s2.vel.z * s2.massKg) / totalMass;
                
                s1.massKg = totalMass;
                // Rough radius scaling: R ~ M^0.8 for main sequence
                s1.radiusKm = Math.pow(s1.massKg / SOLAR_MASS_KG, 0.8) * SOLAR_RADIUS_KM;
                
                s2.isMerged = true;
                mergedAny = true;
            }
        }
    }
    
    return { stars, mergedAny };
}
