import type { ISystemProcessor } from './interfaces';
import type { System, RulePack, CelestialBody, Barycenter } from '../types';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG } from '../constants';
import { calculateEquilibriumTemperature, calculateDistanceToStar, calculateEquilibriumTemperatureRange, estimateBondAlbedo, composeSurfaceTemperatureFromDeltaComponents, estimateInternalHeatK } from '../physics/temperature';
import { calculateSurfaceRadiation } from '../physics/radiation';
import { classifyBody } from '../system/classification';
import { makeupFractions } from '../physics/makeup';
import { surfaceTempRange } from '../physics/tidalThermal';
import { deriveFluidLayers } from '../physics/fluidLayers';
import { deriveMagnetism } from '../physics/magnetism';
import { deriveGeoActivity } from '../physics/geoActivity';
import { deriveApparentColorParts } from '../rendering/apparentColor';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets } from '../physics/orbits';
import { calculateMolarMass, recalculateAtmosphereDerivedProperties } from '../physics/atmosphere';
import { SeededRNG } from '../rng';
import { annotateGravitationalStability } from '../physics/stability';
import { reconcileBarycenters } from '../physics/barycenterReconcile';

export class SystemProcessor implements ISystemProcessor {
    private systemAgeGyr = 4.6;

    process(system: System, rulePack: RulePack): System {
        const processedSystem = { ...system }; // Shallow copy
        const allNodes = processedSystem.nodes;
        this.systemAgeGyr = system.age_Gyr ?? 4.6;
        const rng = new SeededRNG(system.seed); // Deterministic RNG for procedural aspects of processing

        // 0. Pass 0a: Auto reconcile barycenters from mass hierarchy changes.
        reconcileBarycenters(processedSystem);

        // 0. Pass 0b: Orbital Dynamics & existing barycenters (Ensure mass/orbits are correct first)
        this.processBarycenters(processedSystem);

        // 1. First Pass: Physical Basics (Orbital Period, Gravity, etc.)
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processPhysicalBasics(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 2. Second Pass: Environment (Radiation, Temperature, Atmosphere Retention)
        // Requires basics to be set (like distance)
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processEnvironment(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 3. Third Pass: Life & Classification (Habitability, Tags, Classes)
        // Requires environment to be set
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processClassification(node as CelestialBody, allNodes, rulePack, rng);
            }
        }
        
        // 4. Fourth Pass: Flight Dynamics (Boundaries, Delta V)
        // Requires Temperature and Atmosphere from Pass 2
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processFlightDynamics(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 5. Stability pass: annotate objects at risk of N-body instability.
        annotateGravitationalStability(processedSystem);

        return processedSystem;
    }

    private processBarycenters(system: System) {
        const barycenters = system.nodes.filter(n => n.kind === 'barycenter') as Barycenter[];
        const nodesById = new Map(system.nodes.map(n => [n.id, n]));

        for (const bary of barycenters) {
            if (!bary.memberIds || bary.memberIds.length < 2) continue;

            // Keep barycenter parent-orbit dynamics consistent with current parent mass.
            if (bary.orbit && bary.parentId) {
                const parent = nodesById.get(bary.parentId) as CelestialBody | Barycenter | undefined;
                const parentMass = parent?.kind === 'barycenter'
                    ? (parent.effectiveMassKg || 0)
                    : ((parent as CelestialBody | undefined)?.massKg || 0);
                if (parentMass > 0) {
                    bary.orbit.hostMu = G * parentMass;
                    const aMeters = (bary.orbit.elements.a_AU || 0) * AU_KM * 1000;
                    if (aMeters > 0) {
                        bary.orbit.n_rad_per_s = Math.sqrt((G * parentMass) / Math.pow(aMeters, 3));
                    }
                }
            }

            const members = bary.memberIds.map(id => nodesById.get(id)).filter(n => n !== undefined) as (CelestialBody | Barycenter)[];
            if (members.length < 2) continue;

            // 1. Calculate New Total Mass
            let totalMass = 0;
            for (const member of members) {
                if (member.kind === 'body') {
                    totalMass += (member as CelestialBody).massKg || 0;
                } else if (member.kind === 'barycenter') {
                    totalMass += (member as Barycenter).effectiveMassKg || 0;
                }
            }
            bary.effectiveMassKg = totalMass;

            // 2. Calculate Current Separation (a_total)
            // We assume the user edited the mass but wants the physical distance to remain roughly similar,
            // OR we derive it from current 'a' values.
            let separationAU = 0;
            for (const member of members) {
                if (member.orbit) separationAU += member.orbit.elements.a_AU || 0;
            }

            // 3. Recalculate Orbits based on Mass Ratio
            // n (mean motion) is common for the system: sqrt( G * M_tot / a_sep^3 )
            const separationMeters = separationAU * AU_KM * 1000;
            let n_rad_per_s = 0;
            if (separationMeters > 0 && totalMass > 0) {
                n_rad_per_s = Math.sqrt((G * totalMass) / Math.pow(separationMeters, 3));
            }

            for (const member of members) {
                if (!member.orbit) continue;

                const memberMass = member.kind === 'body' ? (member as CelestialBody).massKg : (member as Barycenter).effectiveMassKg;
                if (memberMass === undefined) continue;

                // Distance from barycenter: r1 = a * (m2 / (m1+m2))
                // Generalized: r_i = a * ( (M_tot - m_i) / M_tot ) ?? No, specific for binary:
                // r1 = a * m2 / M_tot
                // For N-body it's complex, but for binary stored in memberIds:
                
                // If strictly binary:
                if (members.length === 2) {
                    const otherMember = members.find(m => m.id !== member.id)!;
                    const otherMass = otherMember.kind === 'body' ? (otherMember as CelestialBody).massKg : (otherMember as Barycenter).effectiveMassKg;
                    
                    if (totalMass > 0) {
                        member.orbit.elements.a_AU = separationAU * ((otherMass || 0) / totalMass);
                    }
                }

                // Update Physics
                member.orbit.hostMu = G * totalMass;
                member.orbit.n_rad_per_s = n_rad_per_s;
            }

            // 4. Binary coupling: keep paired orbits physically reciprocal.
            if (members.length === 2) {
                const m0 = members[0];
                const m1 = members[1];
                if (m0.orbit && m1.orbit) {
                    const mass0 = m0.kind === 'body' ? ((m0 as CelestialBody).massKg || 0) : ((m0 as Barycenter).effectiveMassKg || 0);
                    const mass1 = m1.kind === 'body' ? ((m1 as CelestialBody).massKg || 0) : ((m1 as Barycenter).effectiveMassKg || 0);
                    const denom = mass0 + mass1;

                    // Prioritize the member that was most recently edited by the user.
                    // If neither or both have the same timestamp, fallback to heavier mass.
                    const t0 = m0.orbit.lastEditedT0 || 0;
                    const t1 = m1.orbit.lastEditedT0 || 0;
                    
                    let reference: Orbit;
                    if (t0 > t1) {
                        reference = m0.orbit;
                    } else if (t1 > t0) {
                        reference = m1.orbit;
                    } else {
                        reference = mass0 >= mass1 ? m0.orbit : m1.orbit;
                    }

                    const refM0 = this.normalizeAngle(reference.elements.M0_rad || 0);
                    const coupledE = Math.max(0, Math.min(0.999, reference.elements.e || 0));
                    const coupledI = reference.elements.i_deg || 0;
                    const coupledOmega = reference.elements.Omega_deg || 0;
                    const coupledArgPeri = reference.elements.omega_deg || 0;

                    const separation = (m0.orbit.elements.a_AU || 0) + (m1.orbit.elements.a_AU || 0);
                    const sepAU = Math.max(separation, 1e-9);

                    const a0 = denom > 0 ? sepAU * (mass1 / denom) : (m0.orbit.elements.a_AU || 0);
                    const a1 = denom > 0 ? sepAU * (mass0 / denom) : (m1.orbit.elements.a_AU || 0);

                    m0.orbit.elements.a_AU = a0;
                    m1.orbit.elements.a_AU = a1;

                    m0.orbit.elements.e = coupledE;
                    m1.orbit.elements.e = coupledE;
                    m0.orbit.elements.i_deg = coupledI;
                    m1.orbit.elements.i_deg = coupledI;
                    m0.orbit.elements.Omega_deg = coupledOmega;
                    m1.orbit.elements.Omega_deg = coupledOmega;
                    m0.orbit.elements.omega_deg = coupledArgPeri;
                    m1.orbit.elements.omega_deg = coupledArgPeri;

                    m0.orbit.elements.M0_rad = refM0;
                    m1.orbit.elements.M0_rad = this.normalizeAngle(refM0 + Math.PI);

                    m0.orbit.hostMu = G * totalMass;
                    m1.orbit.hostMu = G * totalMass;
                    m0.orbit.n_rad_per_s = n_rad_per_s;
                    m1.orbit.n_rad_per_s = n_rad_per_s;
                }
            }
        }
    }

    private normalizeAngle(rad: number): number {
        const twoPi = Math.PI * 2;
        let v = rad % twoPi;
        if (v < 0) v += twoPi;
        return v;
    }

    private processPhysicalBasics(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], rulePack: RulePack) {
        if (body.massKg && body.radiusKm) {
            body.calculatedGravity_ms2 = (G * body.massKg) / Math.pow(body.radiusKm * 1000, 2);
        }

        if (body.rotation_period_hours) {
            body.calculatedRotationPeriod_s = body.rotation_period_hours * 3600;
        }

        if (body.orbit && body.parentId) {
            const host = allNodes.find(n => n.id === body.parentId);
            const hostMass = (host?.kind === 'barycenter' ? host.effectiveMassKg : (host as CelestialBody)?.massKg) || 0;
            
            if (hostMass > 0) {
                body.orbital_period_days = Math.sqrt(4 * Math.PI**2 * (body.orbit.elements.a_AU * AU_KM * 1000)**3 / (G * hostMass)) / (60 * 60 * 24);
            }
        }
        
        if (body.atmosphere && body.atmosphere.molarMassKg === undefined) {
            body.atmosphere.molarMassKg = calculateMolarMass(body.atmosphere, rulePack);
        }
    }

    private processEnvironment(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack) {
        // Skip Stars for environment processing as they generate their own physics (Temp, Radiation)
        if (body.roleHint === 'star') return;

        // Radiation
        body.surfaceRadiation = calculateSurfaceRadiation(body, allNodes, pack);

        // Escape Velocity
        const escapeVelocity = Math.sqrt(2 * G * (body.massKg || 0) / ((body.radiusKm || 1) * 1000)) / 1000; // in km/s
        
        // Temperature Components
        const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
        let equilibriumTempK = 0;
        
        if (allStars.length > 0) {
            const albedo = estimateBondAlbedo(body);
            equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, albedo);
            const eqRange = calculateEquilibriumTemperatureRange(body, allNodes, albedo);
            (body as any).equilibriumTempMinK = eqRange.minK;
            (body as any).equilibriumTempMaxK = eqRange.maxK;
        }
        body.equilibriumTempK = equilibriumTempK;

        // Tidal Heating
        let tidalHeatingK = 0;
        let tidalRawIndex = 0;
        if (body.roleHint === 'moon' && body.parentId) {
            const host = allNodes.find(n => n.id === body.parentId);
            if (host && host.kind === 'body') {
                tidalRawIndex = this.calculateRawTidalIndex(body, host as CelestialBody);
                tidalHeatingK = this.calculateTidalHeating(body, host as CelestialBody);
                const hasHotspots = this.hasTidalHotspots(body, host as CelestialBody);
                body.tags = body.tags || [];
                body.tags = body.tags.filter(t => t.key !== 'tidal/hotspots');
                if (hasHotspots) {
                    body.tags.push({ key: 'tidal/hotspots' });
                }
            }
        }
        body.tidalHeatK = tidalHeatingK;

        // Radiogenic Heating (Simplified)
        // Internal heat is negligible for surface temp compared to solar/greenhouse for Earth-likes.
        const radiogenicHeatK = body.radiogenicHeatK || 0; 
        body.radiogenicHeatK = radiogenicHeatK;
        body.internalHeatK = estimateInternalHeatK(body, pack);

        // V1.4.0 Unified Atmospheric Physics
        recalculateAtmosphereDerivedProperties(body, allNodes, pack);

        // Total temperature from flux-space composition (avoids direct +K stacking artifacts).
        body.temperatureK = composeSurfaceTemperatureFromDeltaComponents(
            equilibriumTempK,
            body.greenhouseTempK || 0,
            tidalHeatingK,
            radiogenicHeatK,
            body.internalHeatK || 0
        );

        // Surface temperature RANGE + tidal-volcanic context (the honest picture the mean hides).
        body.tags = body.tags || [];
        body.tags = body.tags.filter(t => t.key !== 'tidal/volcanism' && t.key !== 'tidal/lava-flows');
        const range = surfaceTempRange({
            meanK: body.temperatureK ?? equilibriumTempK,
            equilibriumK: equilibriumTempK,
            atmPressureBar: body.atmosphere?.pressure_bar ?? 0,
            tidalRawIndex,
            iceFrac: makeupFractions(body).ice
        });
        for (const key of range.tags) body.tags.push({ key });
        body.temperatureRangeK = { min: range.min, max: range.max };

        // Atmosphere Retention Check (Physics-based stripping)
        const totalStellarRadiation = this.calculateTotalStellarFlux(body, allStars, allNodes);
        const magneticFieldStrength = body.magneticField?.strengthGauss || 0;
        const atmosphereRetentionFactor = pack.generation_parameters?.atmosphere_retention_factor || 100;
        const retainsAtmosphere = (magneticFieldStrength * atmosphereRetentionFactor) > totalStellarRadiation;
    }

    private processClassification(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack, rng: SeededRNG) {
        // Skip classification for Stars, Barycenters, etc. 
        // Only Planets and Moons need dynamic classification based on physics.
        if (body.roleHint !== 'planet' && body.roleHint !== 'moon') return;

        // --- Derived inputs the fingerprints/rules need (several were previously missing,
        // which silently dead-lettered rules for rogue/coreless/silicate/barren/crater/…). ---
        const massKg = body.massKg || 0;
        const radiusKm = body.radiusKm || 0;
        const radiusM = radiusKm * 1000;
        // Bulk density in g/cm³ (Earth ≈ 5.51, water ≈ 1.0, Jupiter ≈ 1.33, Saturn ≈ 0.69).
        const volumeM3 = radiusM > 0 ? (4 / 3) * Math.PI * radiusM ** 3 : 0;
        const density_gcc = volumeM3 > 0 ? (massKg / volumeM3) / 1000 : 0;
        const escapeVelocity_kms = radiusM > 0 ? Math.sqrt((2 * G * massKg) / radiusM) / 1000 : 0;
        // Dominant (most-massive) star's spectral letter, for star-class-dependent types.
        const stars = allNodes.filter((n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'star') as CelestialBody[];
        const primary = stars.sort((a, b) => (b.massKg || 0) - (a.massKg || 0))[0];
        const stellarType = primary?.classes?.find((c) => c.startsWith('star/'))?.split('/')[1]?.[0] || '';
        // Does this body orbit a star (or a star-pair barycentre)? a_AU/period/eccentricity
        // are otherwise relative to a planet/moon barycentre, so star-relative modifiers
        // (ultra-short-period, disrupted) must not use them. Circumbinary planets count.
        const parentNode = allNodes.find((n) => n.id === body.parentId);
        let orbitsStar = 0;
        if (parentNode?.kind === 'body' && (parentNode as CelestialBody).roleHint === 'star') {
            orbitsStar = 1;
        } else if (parentNode?.kind === 'barycenter') {
            const memberIds = (parentNode as Barycenter).memberIds || [];
            const membersAreStars = memberIds.some((mid) => {
                const m = allNodes.find((n) => n.id === mid);
                return m?.kind === 'body' && (m as CelestialBody).roleHint === 'star';
            });
            if (membersAreStars) orbitsStar = 1;
        }

        // Feature vector for classification
        const features: Record<string, number | string> = {
            id: body.id,
            parentId: (body.parentId ?? '') as string,
            mass_Me: massKg / EARTH_MASS_KG,
            radius_Re: radiusKm / EARTH_RADIUS_KM,
            density: density_gcc,
            escapeVelocity_kms,
            a_AU: body.orbit?.elements.a_AU || 0,
            eccentricity: body.orbit?.elements.e || 0,
            orbitsStar,
            age_Gyr: this.systemAgeGyr,
            stellarType,
            stellarIrradiation: body.stellarRadiation || 0, // incident flux, ~1 at Earth
            radiation_flux: body.surfaceRadiation || 0,
            tidalHeating: body.tidalHeatK || 0,
            Teq_K: body.equilibriumTempK || 0,
            SurfaceTemp_K: body.temperatureK || 0,
            orbital_period_days: body.orbital_period_days || 0,
            rotation_period_hours: Math.abs(body.rotation_period_hours || 0),
            tidallyLocked: body.tidallyLocked ? 1 : 0
        };

        // Default the environment features so airless/dry bodies match (undefined would
        // disqualify e.g. "barren" which requires pressure≈0 / coverage≈0).
        features['atm.main'] = body.atmosphere?.name && body.atmosphere.name !== 'None' ? (body.atmosphere.main ?? 'None') : 'None';
        features['atm.pressure_bar'] = body.atmosphere?.pressure_bar ?? 0;
        if (body.atmosphere?.composition) {
            for (const gas in body.atmosphere.composition) {
                features[`atm.composition.${gas}`] = body.atmosphere.composition[gas];
            }
        }
        features['hydrosphere.coverage'] = body.hydrosphere?.coverage ?? 0;
        features['hydrosphere.composition'] = body.hydrosphere?.composition ?? 'none';

        // Interior makeup fractions (explicit body.makeup, else inferred from density) — so the
        // composition types (iron/silicate/coreless/carbon) classify on COMPOSITION, not a
        // fragile density band. (§2a)
        const mk = makeupFractions(body);
        features['makeup.metal'] = mk.metal;
        features['makeup.rock'] = mk.rock;
        features['makeup.carbon'] = mk.carbon;
        features['makeup.ice'] = mk.ice;
        features['makeup.gas'] = mk.gas;

        // Fluid layers (surface/subsurface oceans, cloud decks, interior conductive) — feed
        // classification (subsurface-ocean), apparent colour (clouds) and §2d magnetism.
        const fluidLayers = deriveFluidLayers(body, pack);
        if (fluidLayers.length) {
            body.hydrosphere = { ...(body.hydrosphere || {}), layers: fluidLayers };
        }
        features['hasSubsurfaceOcean'] = fluidLayers.some((l) => l.location === 'subsurface') ? 1 : 0;

        // Structural tags (surfaced for GMs): a frozen icy shell, a subsurface ocean, a discrete
        // cloud deck. These are derived facts about the body's layering.
        const surfTForStruct = body.temperatureK ?? body.equilibriumTempK ?? 0;
        const waterHydroForStruct = body.hydrosphere?.composition === 'water' || body.hydrosphere?.composition === 'water-ammonia';
        const icyShell = mk.ice > 0.3 || (waterHydroForStruct && surfTForStruct < 273); // frozen water exterior
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('structure/'));
        if (icyShell) body.tags.push({ key: 'structure/icy-shell' });
        if (fluidLayers.some((l) => l.location === 'subsurface')) body.tags.push({ key: 'structure/subsurface-ocean' });
        if (mk.gas <= 0.5 && fluidLayers.some((l) => l.location === 'cloud')) body.tags.push({ key: 'structure/cloud-deck' });

        // Magnetism profile (§2d) — descriptive read of the dynamo from interior conductive layers
        // + rotation; does NOT override the editable field strength. A salty subsurface ocean only
        // induces a field when the moon sits inside a giant host's magnetosphere.
        let insideHostMagnetosphere = false;
        if (body.roleHint === 'moon' && body.parentId) {
            const host = allNodes.find(n => n.id === body.parentId) as CelestialBody | undefined;
            if (host && host.kind === 'body') {
                const hostMassMe = (host.massKg ?? 0) / EARTH_MASS_KG;
                insideHostMagnetosphere =
                    hostMassMe > 50 || makeupFractions(host).gas > 0.5 || (host.magneticField?.strengthGauss ?? 0) >= 1;
            }
        }
        body.magnetism = deriveMagnetism(body, { insideHostMagnetosphere });
        body.tags = (body.tags || []).filter(t => !t.key.startsWith('magnetic/'));
        body.tags.push({
            key: body.magnetism.intrinsic ? 'magnetic/dynamo'
                : body.magnetism.source === 'salty-ocean-induced' ? 'magnetic/induced'
                : 'magnetic/unshielded'
        });

        // Geological activity (tectonics + volcanism by MECHANISM) — the biosphere keystone. Uses
        // makeup (radiogenic budget + iron core), mass/radius (cooling rate), system AGE (radiogenic
        // decay), surface water (mobile vs stagnant lid) and tidal tags (Io/Europa). Adds a
        // geology/* tag and feeds habitability (carbonate–silicate climate regulation).
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('geology/'));
        // Gas/ice giants have no solid surface → no tectonic regime; skip them.
        if (mk.gas <= 0.5 && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            const hasLiquidSurfaceWater = fluidLayers.some(
                (l) => l.location === 'surface' && /water/.test(l.liquid)
            );
            const tidalKeys = (body.tags || []).map((t) => t.key);
            body.geoActivity = deriveGeoActivity({
                makeup: mk,
                massMe: (body.massKg ?? 0) / EARTH_MASS_KG,
                radiusRe: (body.radiusKm ?? 0) / EARTH_RADIUS_KM,
                ageGyr: this.systemAgeGyr,
                hasSurfaceWater: hasLiquidSurfaceWater,
                hasSubsurfaceOcean: features['hasSubsurfaceOcean'] === 1,
                icyShell,
                tidalHotspots: tidalKeys.includes('tidal/hotspots') || tidalKeys.includes('tidal/volcanism'),
                tidalLavaFlows: tidalKeys.includes('tidal/lava-flows')
            });
            for (const key of body.geoActivity.tags) body.tags.push({ key });
            features['geoActive'] = body.geoActivity.active ? 1 : 0;
            features['plateTectonics'] = body.geoActivity.regime === 'plate-tectonics' ? 1 : 0;
        } else {
            body.geoActivity = undefined;
            features['geoActive'] = 0;
            features['plateTectonics'] = 0;
        }

        // Re-run Classification
        // Note: This might override manual class changes if not careful.
        // We should probably only classify if classes are empty or if we want to force update.
        // For now, we update to ensure consistency with physics.
        // Derived apparent (true) colour from makeup + atmosphere + cloud decks + temperature.
        const apparent = deriveApparentColorParts(body, pack);
        body.apparentColor = apparent;
        body.apparentColorHex = apparent.hex;

        const newClasses = classifyBody(body, features, pack, allNodes);
        // Preserve any "manual" or "special" classes that strictly aren't output by the classifier?
        // The classifier is usually comprehensive.
        body.classes = newClasses;

        // Habitability
        this.calculateHabitabilityAndBiosphere(body, rng);
    }
    
    private processFlightDynamics(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], rulePack: RulePack) {
        let immediateHost: CelestialBody | Barycenter | null = null;
        let distanceToHost_au = 0;
        
        if (body.parentId) {
            immediateHost = allNodes.find(n => n.id === body.parentId) || null;
            distanceToHost_au = body.orbit?.elements.a_AU || 0;
        }

        const hostMass = immediateHost ? (immediateHost.kind === 'barycenter' ? immediateHost.effectiveMassKg : (immediateHost as CelestialBody).massKg) : undefined;
        // Ensure required fields (temperatureK populated in Pass 2)
        const hasRequiredData = body.calculatedGravity_ms2 && body.temperatureK !== undefined && body.massKg && body.calculatedRotationPeriod_s !== undefined && immediateHost && hostMass !== undefined;
        
        if (hasRequiredData) {
            const planetData: PlanetData = {
                gravity: body.calculatedGravity_ms2!,
                surfaceTempKelvin: body.temperatureK!,
                massKg: body.massKg!,
                rotationPeriodSeconds: body.calculatedRotationPeriod_s!,
                molarMassKg: body.atmosphere?.molarMassKg ?? 0.028,
                surfacePressurePa: (body.atmosphere?.pressure_bar ?? 0) * 100000,
                distanceToHost_km: distanceToHost_au * AU_KM,
                hostMass_kg: hostMass!,
            };
            body.orbitalBoundaries = calculateOrbitalBoundaries(planetData, rulePack);
        }

        // Calculate Delta-V Budgets
        calculateDeltaVBudgets(body);
    }

    // ... existing private methods ...
    private calculateTidalHeating(planet: CelestialBody, host: CelestialBody): number {
        const rawTidalIndex = this.calculateRawTidalIndex(planet, host);
        if (rawTidalIndex <= 0) return 0;

        // Tidal dissipation produces localized hotspots more than uniform global warming.
        // Apply an activity onset so moderate forcing does not overheat global means.
        const meanCapK = 5.0;
        const globalMeanOnset = 80.0;
        if (rawTidalIndex <= globalMeanOnset) return 0;
        const responseScale = 35.0;
        return meanCapK * (1 - Math.exp(-(rawTidalIndex - globalMeanOnset) / responseScale));
    }

    private calculateRawTidalIndex(planet: CelestialBody, host: CelestialBody): number {
        let raw = 0;
        const parentMassKg = host.massKg || 0;
        const eccentricity = planet.orbit?.elements.e || 0;
        const moonRadiusKm = planet.radiusKm || 0;
        const semiMajorAxisKm = (planet.orbit?.elements.a_AU || 0) * AU_KM;

        if (parentMassKg > 0 && eccentricity > 0 && moonRadiusKm > 0 && semiMajorAxisKm > 0) {
            const C = 4.06e-6; // Calibration constant
            raw = C * 
                (Math.pow(parentMassKg, 0.625)) * 
                (Math.pow(moonRadiusKm, 0.75)) * 
                (Math.pow(eccentricity, 0.5)) * 
                (Math.pow(semiMajorAxisKm, -1.875));
        }
        return raw;
    }

    private hasTidalHotspots(planet: CelestialBody, host: CelestialBody): boolean {
        const raw = this.calculateRawTidalIndex(planet, host);
        return raw >= 100;
    }

    private calculateTotalStellarFlux(planet: CelestialBody, stars: CelestialBody[], allNodes: (CelestialBody | Barycenter)[]): number {
        let total = 0;
        for (const star of stars) {
            const dist_au = calculateDistanceToStar(planet, star, allNodes);
            if (dist_au > 0) {
                total += (star.radiationOutput || 1) / (dist_au * dist_au);
            }
        }
        return total;
    }

    private calculateHabitabilityAndBiosphere(planet: CelestialBody, rng: SeededRNG) {
        if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;
    
        // Plateau Scoring: Max score within [min, max], linear falloff outside
        const scoreFromPlateau = (value: number, minOpt: number, maxOpt: number, falloff: number) => {
            if (value >= minOpt && value <= maxOpt) return 1.0;
            const diff = value < minOpt ? (minOpt - value) : (value - maxOpt);
            return Math.max(0, 1 - (diff / falloff));
        };

        // Peak Scoring: Max score at optimal, linear falloff (Legacy wrapper)
        const scoreFromRange = (value: number, optimal: number, range: number) => {
            return scoreFromPlateau(value, optimal, optimal, range);
        };
    
        let score = 0;
        let factors = {
            temp: 0,
            pressure: 0,
            solvent: 0,
            radiation: 0,
            gravity: 0
        };
    
        // Temperature Score (Max 30 points)
        if (planet.temperatureK) {
            if (planet.hydrosphere?.composition === 'water' || !planet.hydrosphere) {
                // Optimal: 10C to 25C (283K - 298K). Falloff 40K.
                factors.temp = scoreFromPlateau(planet.temperatureK, 283, 298, 40); 
            } else if (planet.hydrosphere?.composition === 'methane') {
                factors.temp = scoreFromRange(planet.temperatureK, 111, 30); // Optimal -162C, range +/- 30C
            } else if (planet.hydrosphere?.composition === 'ammonia') {
                factors.temp = scoreFromRange(planet.temperatureK, 218, 30); // Optimal -55C, range +/- 30C
            }
        }
        score += factors.temp * 30;
    
        // Pressure Score (Max 20 points)
        if (planet.atmosphere?.pressure_bar) {
            // Optimal: 0.8 to 1.5 bar. Falloff 1.5 bar.
            factors.pressure = scoreFromPlateau(planet.atmosphere.pressure_bar, 0.8, 1.5, 1.5);
        }
        score += factors.pressure * 20;
    
        // Solvent Score (Max 20 points)
        if ((planet.hydrosphere?.coverage || 0) > 0.1) {
            factors.solvent = 1;
            if (planet.hydrosphere?.composition === 'water') {
                score += 5; // Bonus for water
            }
        }
        score += factors.solvent * 15;
    
        // Radiation Score (Max 15 points)
        // Optimal: 0 to 5 mSv/yr. Falloff 20 mSv.
        factors.radiation = scoreFromPlateau(planet.surfaceRadiation || 0, 0, 5, 20);
        score += factors.radiation * 15;
    
        // Gravity Score (Max 15 points)
        const surfaceGravityG = (planet.massKg && planet.radiusKm) ? (G * planet.massKg / ((planet.radiusKm*1000) * (planet.radiusKm*1000))) / 9.81 : 0;
        if (surfaceGravityG > 0) {
            // Optimal: 0.8g to 1.2g. Falloff 0.5g.
            factors.gravity = scoreFromPlateau(surfaceGravityG, 0.8, 1.2, 0.5);
        }
        score += factors.gravity * 15;

        // --- Long-term habitability: geology + magnetism (HEURISTIC — admitted guesswork, see the
        //     /physics "biosphere" note). These don't change instantaneous surface conditions; they
        //     decide whether a world STAYS habitable. Earth is the 100 ANCHOR, so plate tectonics +
        //     an intrinsic magnetosphere are the expected baseline (no bonus) — only DEFICIENCIES
        //     penalise. Super-habitability (below) is what pushes a world above Earth. ---
        let geoMod = 0;
        const regime = planet.geoActivity?.regime;
        if (regime === 'stagnant-lid') geoMod -= 25;          // runaway-greenhouse risk (Venus)
        else if (regime === 'tidal-volcanic') geoMod -= 20;   // resurfaced too fast for surface life
        else if (regime === 'inactive') geoMod -= 10;         // no outgassing / nutrient recycling
        if (planet.magnetism && !planet.magnetism.intrinsic && planet.magnetism.source === 'none') {
            geoMod -= 8;                                       // unshielded → atmosphere stripping
        }
        score = Math.max(0, score + geoMod);

        // --- Super-habitability (Heller & Armstrong): conditions that EXCEED Earth — a larger
        //     biosphere on a durable-tectonics super-Earth, a mature/stable system, and a warm, wet
        //     optimum. Earth itself scores 0 here (it is the 100 anchor); only genuinely better
        //     worlds break 100. Gated to an already good surface. (HEURISTIC.) ---
        const surfaceGood = factors.temp > 0.7 && factors.pressure > 0.6 && factors.solvent === 1 &&
            factors.gravity > 0.6 && planet.hydrosphere?.composition === 'water';
        if (surfaceGood && regime === 'plate-tectonics') {
            const massMe = (planet.massKg ?? 0) / EARTH_MASS_KG;
            if (massMe >= 1.3 && massMe <= 3.5) score += 6;   // more land area + longer-lived tectonics
            if (this.systemAgeGyr >= 5 && this.systemAgeGyr <= 9) score += 4; // mature, stable, time for biodiversity
            const t = planet.temperatureK ?? 0;
            if (t >= 290 && t <= 298 && (planet.hydrosphere?.coverage ?? 0) > 0.5) score += 4; // warm, wet optimum
        }

        // Earth anchors at 100; super-habitable worlds may exceed it (capped at 130).
        planet.habitabilityScore = Math.max(0, Math.min(130, score));

        // --- Subsurface-ocean niche: not surface-habitable, but a genuine sub-ice habitability axis
        //     (liquid water + tidal/radiogenic energy + rock chemistry — Europa/Enceladus). Bounded
        //     guesswork floor, independent of the surface Goldilocks zone. ---
        const hasSubsurfaceNiche =
            (planet.tags || []).some(t => t.key === 'structure/subsurface-ocean') || regime === 'cryovolcanic';
        const SUBSURFACE_NICHE_SCORE = 35;
        let subsurfaceHabitable = false;
        if (hasSubsurfaceNiche && planet.habitabilityScore < SUBSURFACE_NICHE_SCORE) {
            planet.habitabilityScore = SUBSURFACE_NICHE_SCORE;
            subsurfaceHabitable = true;
        }

        // Determine Tier and add Tag. The top tiers now require a geologically STABLE world —
        // plate tectonics for Earth-like; not stagnant-lid/tidal-volcanic for human-habitable.
        const isEarthLike = factors.temp > 0.9 && factors.pressure > 0.8 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.9 && factors.gravity > 0.8 && planet.atmosphere?.composition?.['O2'] > 0.1 && regime === 'plate-tectonics';
        const isHumanHabitable = factors.temp > 0.7 && factors.pressure > 0.6 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.7 && factors.gravity > 0.6 && regime !== 'stagnant-lid' && regime !== 'tidal-volcanic';
        const isAlienHabitable = planet.habitabilityScore > 40;
        const isSuperHabitable = planet.habitabilityScore > 100; // better-than-Earth (only super-habitable worlds)

        // Clear old habitability tags before adding new ones
        planet.tags = planet.tags?.filter(t => !t.key.startsWith('habitability/')) || [];

        let tier: string;
        if (isSuperHabitable) tier = 'habitability/super';
        else if (isEarthLike) tier = 'habitability/earth-like';
        else if (isHumanHabitable) tier = 'habitability/human';
        else if (subsurfaceHabitable) tier = 'habitability/subsurface';
        else if (isAlienHabitable) tier = 'habitability/alien';
        else tier = 'habitability/none';
        planet.tags.push({ key: tier });
    
        // --- Biosphere Generation ---
        if (planet.habitabilityScore > 10 && !planet.biosphere) {
             // Future logic: Conditional procedural spawning
        }
    }
}

export const systemProcessor = new SystemProcessor();
