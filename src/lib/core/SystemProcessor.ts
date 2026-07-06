import type { ISystemProcessor } from './interfaces';
import type { System, RulePack, CelestialBody, Barycenter } from '../types';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG } from '../constants';
import { calculateEquilibriumTemperature, calculateDistanceToStar, calculateEquilibriumTemperatureRange, composeSurfaceTemperatureFromDeltaComponents, estimateInternalHeatK } from '../physics/temperature';
import { deriveAlbedo } from '../physics/albedo';
import { calculateSurfaceRadiation, calculateTotalStellarRadiation } from '../physics/radiation';
import { classifyBody, explainClassification } from '../system/classification';
import { makeupFractions } from '../physics/makeup';
import { surfaceTempProfile } from '../physics/surfaceTemperature';
import { deriveFluidLayers, cloudColourName } from '../physics/fluidLayers';
import { phaseAt, liquidDef, biosolventScore } from '../physics/liquids';
import { deriveMagnetism, magneticShieldingTag } from '../physics/magnetism';
import { deriveAurora } from '../physics/aurora';
import { rotationalDeform } from '../physics/rotation';
import { deriveGeoActivity } from '../physics/geoActivity';
import { deriveApparentColorParts } from '../rendering/apparentColor';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets } from '../physics/orbits';
import { calculateMolarMass, recalculateAtmosphereDerivedProperties, applyAtmosphericEscape } from '../physics/atmosphere';
import { flareActivity } from '../physics/stellar-evolution';
import { predictTidalLock } from '../physics/tidalLock';

// Planets are assumed to coalesce a few Myr into the system's life — the baseline for age-integrated
// processes (atmospheric escape, etc.). Negligible vs Gyr ages but makes the assumption explicit.
const FORMATION_DELAY_GYR = 0.005;

// Old friendly-label tags that duplicate physics-derived ones — dropped on load (the physics
// re-adds the correct namespaced versions). Explicit so user free-text tags are never touched.
// A few friendly-label duplicates of CURRENT physics tags (the new label differs from the key).
const LEGACY_DUPLICATE_TAGS = new Set<string>([
  'Active Volcanism', 'Active Volcano', 'Tidal Volcanism', 'Tidal Hotspots', 'Rings'
]);
import { SeededRNG } from '../rng';
import { annotateGravitationalStability } from '../physics/stability';
import { annotateResonances } from '../physics/resonance';
import { annotateReasonsToVisit } from '../physics/reasonsToVisit';
import { reconcileBarycenters } from '../physics/barycenterReconcile';
import { isLegacyTag } from '../tags/tagPresentation';

export class SystemProcessor implements ISystemProcessor {
    private systemAgeGyr = 4.6;

    process(system: System, rulePack: RulePack): System {
        const processedSystem = { ...system }; // Shallow copy
        const allNodes = processedSystem.nodes;
        this.systemAgeGyr = system.age_Gyr ?? 4.6;
        const rng = new SeededRNG(system.seed); // Deterministic RNG for procedural aspects of processing

        // Strip only KNOWN legacy duplicate tags — old data carries friendly-label copies
        // ("Active Volcanism", "Tidally Locked") of tags the physics now re-derives each run
        // (tidal/volcanism, orbit/tidally-locked). Use an explicit list so we NEVER wipe a user's
        // own free-text tags (those are theirs to keep — see isUserTag in tagPresentation).
        for (const node of allNodes) {
            const b = node as CelestialBody;
            if (!b.tags || !b.tags.length) continue;
            // Strip friendly-label duplicates AND the broader legacy set (classes-as-tags, retired
            // atmosphere flavour, V1 display-name physics) — but NEVER a hand-added (manual) tag.
            b.tags = b.tags.filter((t) => t.manual || (!LEGACY_DUPLICATE_TAGS.has(t.key) && !isLegacyTag(t.key)));
        }

        // Stellar flare activity (drives the flare particle dose on planets) — derived for every star
        // from its class + the system age, so imported systems get it too. Re-targets the hazard/flaring
        // tag to the physically-active stars (young / M-K dwarfs), not just luminous ones.
        for (const node of allNodes) {
            const s = node as CelestialBody;
            if (s.kind !== 'body' || s.roleHint !== 'star') continue;
            s.flareActivity = flareActivity(s.classes?.[0], this.systemAgeGyr);
            s.tags = (s.tags || []).filter((t) => t.key !== 'hazard/flaring');
            if (s.flareActivity > 0.4) s.tags.push({ key: 'hazard/flaring' });
        }

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

        // 1b. Mean-motion resonances (needs only orbits + masses, set by now). Runs BEFORE the
        //     environment pass so geology can see resonance-pumped tidal forcing (Enceladus–Dione),
        //     and before stability so protective resonances spare crossing orbits.
        annotateResonances(processedSystem);

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

        // 5. Stability pass (consults the resonance annotations from 1b).
        annotateGravitationalStability(processedSystem);

        // 6. RPG "reasons to visit" pass — reads the now-complete physics/tags and adds resource/
        //    science/frontier/intrigue hooks (config-gated; reads the reasonsConfig store).
        annotateReasonsToVisit(processedSystem);

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
                    // The two members must sit on OPPOSITE sides of the barycentre at all times. That
                    // means antiparallel position vectors: same true anomaly (so same M0), with the
                    // argument of periapsis flipped by 180°. Offsetting M0 by π instead (the old way)
                    // only lines them up for circular orbits — for an eccentric pair the nonlinear
                    // mean→true map drifts them onto the SAME side away from periapsis/apoapsis.
                    m0.orbit.elements.omega_deg = coupledArgPeri;
                    m1.orbit.elements.omega_deg = (coupledArgPeri + 180) % 360;

                    m0.orbit.elements.M0_rad = refM0;
                    m1.orbit.elements.M0_rad = refM0;

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
            const isBaryMember = host?.kind === 'barycenter' && (host as Barycenter).memberIds?.includes(body.id);

            if (isBaryMember && (body.orbit.n_rad_per_s || 0) > 0) {
                // A binary member orbits the barycentre; BOTH members share one period — the relative
                // orbit's — which the binary pass carries on n_rad_per_s. Deriving from a_member³/M_total
                // would give each member a different, physically-wrong period (Rigil 25 yr, Toliman 60 yr).
                body.orbital_period_days = (2 * Math.PI / body.orbit.n_rad_per_s!) / (60 * 60 * 24);
            } else if (hostMass > 0) {
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

        // Escape Velocity
        const escapeVelocity = Math.sqrt(2 * G * (body.massKg || 0) / ((body.radiusKm || 1) * 1000)) / 1000; // in km/s

        // Temperature Components
        const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
        let equilibriumTempK = 0;
        
        if (allStars.length > 0) {
            // Albedo is DERIVED from surface makeup + cloud decks (which depend on temperature), so
            // solve the albedo ⇄ equilibrium-temp coupling as a quick fixed point: a first-guess temp
            // picks the clouds, the clouds set the albedo, the albedo sets the temp. Two iterations
            // converge (albedo is bounded). A manually-pinned body.albedo short-circuits this.
            let albedoInfo = deriveAlbedo(body, calculateEquilibriumTemperature(body, allNodes, 0.3), pack);
            equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, albedoInfo.albedo);
            albedoInfo = deriveAlbedo(body, equilibriumTempK, pack);
            equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, albedoInfo.albedo);
            body.albedoBreakdown = albedoInfo;
            const eqRange = calculateEquilibriumTemperatureRange(body, allNodes, albedoInfo.albedo);
            (body as any).equilibriumTempMinK = eqRange.minK;
            (body as any).equilibriumTempMaxK = eqRange.maxK;
        }
        body.equilibriumTempK = equilibriumTempK;

        // Atmospheric escape over the system's age — thins/strips the atmosphere BEFORE greenhouse &
        // radiation read it (so a stripped world loses its greenhouse + shielding). Planets are assumed
        // to form a few Myr into the system's life (FORMATION_DELAY_GYR), so they erode for ~that long.
        // OPT-IN per body (evolveAtmosphere): hand-authored, imported and picker-placed worlds carry
        // END-STATE atmospheres the GM chose — re-aging them deletes every deliberate trace exosphere.
        // Opted-in bodies erode a COPY of their primordial baseline (atmosphere0, snapshotted on first
        // run) so re-processing — which happens on every load and edit — never compounds the loss.
        if ((body.roleHint === 'planet' || body.roleHint === 'moon') && body.evolveAtmosphere) {
            if (!body.atmosphere0 && body.atmosphere) body.atmosphere0 = JSON.parse(JSON.stringify(body.atmosphere));
            if (body.atmosphere0) body.atmosphere = JSON.parse(JSON.stringify(body.atmosphere0));
            const magG = body.magneticField?.strengthGauss || 0;
            const magShield = magG > 0 ? Math.min(0.99, (Math.log10(magG + 0.01) + 2) / 3) : 0;
            const stellarFluxRel = calculateTotalStellarRadiation(body, allNodes);
            const planetAgeGyr = Math.max(0, this.systemAgeGyr - FORMATION_DELAY_GYR);
            applyAtmosphericEscape(body, equilibriumTempK, planetAgeGyr, stellarFluxRel, magShield, pack);
        }

        // Radiation (after escape, so shielding reflects any thinned/stripped atmosphere).
        body.surfaceRadiation = calculateSurfaceRadiation(body, allNodes, pack);

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

        // Tidal locking — derived from the despinning timescale vs the system age (a moon locks to
        // its planet, a planet to its star/barycentre). DYNAMIC by default; the body editor's
        // checkbox pins it (tidalLockManual) and skips this assessment. Emits orbit/tidally-locked.
        if (!(body as any).tidalLockManual && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            const lockHost = allNodes.find(n => n.id === body.parentId);
            const lockHostMass = lockHost
                ? (lockHost.kind === 'barycenter' ? (lockHost as Barycenter).effectiveMassKg : (lockHost as CelestialBody).massKg)
                : 0;
            body.tidallyLocked = predictTidalLock(
                body.orbit?.elements.a_AU || 0, body.radiusKm || 0, body.massKg || 0,
                lockHostMass || 0, this.systemAgeGyr
            );
        }
        body.tags = (body.tags || []).filter(t => t.key !== 'orbit/tidally-locked');
        if (body.tidallyLocked) body.tags.push({ key: 'orbit/tidally-locked' });

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

        // Surface temperature DECOMPOSED by cause (latitude / seasonal / day-night / locked faces /
        // tidal hotspots) — the whole picture, not one opaque min/max.
        body.tags = body.tags || [];
        body.tags = body.tags.filter(t => t.key !== 'tidal/volcanism' && t.key !== 'tidal/lava-flows');
        const surfaceLiquidWater = (body.hydrosphere?.composition === 'water')
            && (body.hydrosphere?.coverage ?? 0) > 0.2 && (body.temperatureK ?? 0) >= 273;
        const { profile, tags: tempTags } = surfaceTempProfile({
            meanK: body.temperatureK ?? equilibriumTempK,
            equilibriumK: equilibriumTempK,
            pressureBar: body.atmosphere?.pressure_bar ?? 0,
            rotationHours: body.rotation_period_hours,
            tidallyLocked: body.tidallyLocked,
            eccentricity: body.orbit?.elements.e,
            obliquityDeg: body.obliquity_deg,
            hasLiquidOcean: surfaceLiquidWater,
            tidalRawIndex,
            iceFrac: makeupFractions(body).ice
        });
        for (const key of tempTags) body.tags.push({ key });
        body.temperatureProfile = profile;
        body.temperatureRangeK = { min: profile.totalMinK, max: profile.totalMaxK };

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
            tidallyLocked: body.tidallyLocked ? 1 : 0,
            // Eyeball worlds need STAR-lock: a permanent substellar point facing the star. A moon is
            // tidally locked to its PLANET, not the star, so its far side still cycles through stellar
            // day/night — it can never be an eyeball. orbitsStar is 0 for moons (they orbit a planet /
            // planet-moon barycentre), so this is 0 for them even when tidallyLocked is 1.
            starTidallyLocked: (body.tidallyLocked && orbitsStar) ? 1 : 0
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

        // Structural tags (surfaced for GMs): a frozen icy shell, polar ice, a subsurface ocean, a
        // discrete cloud deck. The freeze point comes from the SOLVENT, not hard-coded water — so
        // a nitrogen/methane/CO₂ surface freezes by its own melt point.
        const surfTForStruct = body.temperatureK ?? body.equilibriumTempK ?? 0;
        const hydroComp = body.hydrosphere?.composition;
        const hydroCov = body.hydrosphere?.coverage ?? 0;
        const surfaceDef = liquidDef(hydroComp, pack);
        const surfacePhase = hydroComp && hydroComp !== 'none' ? phaseAt(hydroComp, surfTForStruct, pack) : undefined;
        // A frozen surface is named for its volatile; an icy shell from makeup-ice is water ice.
        const icyShell = mk.ice > 0.3 || (surfacePhase === 'solid' && hydroCov > 0.05);
        const iceLabel = surfacePhase === 'solid' ? (hydroComp as string) : 'water';
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('structure/') && t.key !== 'climate/polar-ice');
        if (icyShell) body.tags.push({ key: 'structure/icy-shell', value: iceLabel });
        if (fluidLayers.some((l) => l.location === 'subsurface')) body.tags.push({ key: 'structure/subsurface-ocean' });
        // Polar ice: liquid at the MEAN, but the cold extreme (poles / night side) dips below the
        // solvent's freezing point → partial frozen caps even on a temperate world (Earth, Mars).
        const meltK = surfaceDef?.meltK ?? 273;
        if (surfacePhase === 'liquid' && hydroCov > 0.1 && (body.temperatureRangeK?.min ?? surfTForStruct) < meltK) {
            body.tags.push({ key: 'climate/polar-ice', value: hydroComp as string }); // the surface liquid, frozen at the poles
        }
        const cloudLayer = mk.gas <= 0.5 ? fluidLayers.find((l) => l.location === 'cloud') : undefined;
        if (cloudLayer) body.tags.push({ key: 'structure/cloud-deck', value: cloudColourName(cloudLayer.liquid) });

        // Ring system — DERIVED from geometry (does the body host ring children?), not hand-tagged.
        // One ring → "ringed"; more than one → "multiple rings". Each ring's debris mass sorts it into
        // a light / medium / heavy tier (log scale, same as the orrery disc); the DISTINCT tiers present
        // are surfaced, so a heavy ring beside a faint one reads as both.
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('ring/'));
        const ringChildren = allNodes.filter(
            (n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'ring' && n.parentId === body.id
        ) as CelestialBody[];
        if (ringChildren.length) {
            body.tags.push({ key: 'ring/system' });
            if (ringChildren.length > 1) body.tags.push({ key: 'ring/multiple' });
            const tiers = new Set<string>();
            for (const r of ringChildren) {
                const me = (r.massKg ?? 0) / EARTH_MASS_KG;
                const d = me > 0 ? Math.max(0, Math.min(1, (Math.log(me) - Math.log(1e-5)) / (Math.log(1) - Math.log(1e-5)))) : 0.5;
                tiers.add(d < 1 / 3 ? 'light' : d < 2 / 3 ? 'medium' : 'heavy');
            }
            for (const tier of ['light', 'medium', 'heavy']) if (tiers.has(tier)) body.tags.push({ key: `ring/${tier}` });
        }

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
        // The field STRENGTH derives from the model (rotation + composition + core size) unless the GM
        // has set it manually (F-OVR). So spinning a world up or making it metal-rich changes its field,
        // and a small iron-cored world like Mercury gets a tenuous field instead of nothing. A manual
        // value is left untouched and still overrides the tag below.
        if (!body.magneticField?.manual) {
            body.magneticField = { strengthGauss: +body.magnetism.nominalGauss.toFixed(4) };
        }
        body.tags = (body.tags || []).filter(t => !t.key.startsWith('magnetic/'));
        // The shielding tag reconciles with the field the GM sees: 0 → unshielded, a whisker → tenuous
        // (Mercury), induced ocean → induced, a manual field with no interior source → anomalous, else a
        // dynamo. A manual value overrides the derived one.
        body.tags.push({ key: magneticShieldingTag(body.magnetism, body.magneticField) });

        // Rotational deformation (E4). A spinning body flattens; past the density-set breakup spin it
        // would shed mass into a ring. DERIVED dynamically from the bulk density (composition) + rotation
        // period, so it tracks either changing. Stored (renderers draw the oblate shape) + surfaced as
        // progressive shape/* tags, and the ellipsoid/toroidal classes key on the spin fraction below.
        const deform = rotationalDeform(body.rotation_period_hours ?? 0, density_gcc);
        body.oblateness = deform.oblateness;
        features['spinFraction'] = deform.fraction;
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('shape/'));
        if (deform.shape !== 'spherical') body.tags.push({ key: `shape/${deform.shape}` });

        // Auroras (Phase G viz driver): atmosphere + magnetosphere + incident ionising flux → a polar
        // glow, graded faint→brilliant. Derived here (after magnetism + radiation + atmosphere are all
        // final); the numeric strength rides on the tag value so the renderer can scale the curtain.
        body.tags = (body.tags || []).filter((t) => !t.key.startsWith('aurora/'));
        const aurora = deriveAurora(body);
        if (aurora.tier) body.tags.push({ key: `aurora/${aurora.tier}`, value: aurora.strength.toFixed(2) });

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
                tidalLavaFlows: tidalKeys.includes('tidal/lava-flows'),
                // Resonance-pumped forcing (annotated in pass 1b) + the cold-ice signals for the
                // Enceladus / Triton cryovolcanism branches.
                resonanceTidal: !!(body as any).resonanceTidal,
                surfaceIce: (body.hydrosphere?.coverage ?? 0) > 0.3,
                teqK: body.equilibriumTempK
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
        // The host star's photosphere temperature drives liquid shades (#8) — walk up the parent
        // chain to the nearest star (fall back to the most massive star in the system).
        let hostStarTempK: number | undefined;
        {
            let cur: any = body;
            for (let hops = 0; cur?.parentId && hops < 10; hops++) {
                cur = allNodes.find((n) => n.id === cur.parentId);
                if (cur && (cur as any).roleHint === 'star') { hostStarTempK = (cur as any).temperatureK; break; }
            }
            if (hostStarTempK === undefined) {
                const brightest = allNodes
                    .filter((n: any) => n.kind === 'body' && n.roleHint === 'star')
                    .sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0))[0] as any;
                hostStarTempK = brightest?.temperatureK;
            }
        }
        const apparent = deriveApparentColorParts(body, pack, { starTempK: hostStarTempK });
        body.apparentColor = apparent;
        body.apparentColorHex = apparent.hex;

        // Expose the newly-derived subsystems as classifier FEATURES, so fingerprints can key on
        // them (biome worlds on a biosphere + climate, glaciated on ice + albedo, volcanic on the
        // geology regime, …). Still raw physics — no tag circularity.
        features['hasBiosphere'] = body.biosphere ? 1 : 0;
        features['geoRegime'] = body.geoActivity?.regime ?? 'none';
        features['hasPolarIce'] = (body.tags || []).some(t => t.key === 'climate/polar-ice') ? 1 : 0;
        features['hasIcyShell'] = (body.tags || []).some(t => t.key === 'structure/icy-shell') ? 1 : 0;
        features['albedo'] = body.albedoBreakdown?.albedo ?? 0;
        features['magnetismSource'] = body.magnetism?.source ?? 'none';
        features['surfaceLiquid'] = body.hydrosphere?.layers?.find(l => l.location === 'surface')?.liquid ?? 'none';

        // A gas/ice-dominated body has no solid surface: any biosphere, hydrosphere or surface liquid
        // is physically meaningless for classification. Zero those features so the terrestrial/habitable
        // fingerprints (swamp, jungle, ocean…) cannot match on stale surface data and mask the giant —
        // this is what lets a world recomposed to gas-dominated actually classify as a giant.
        if (mk.gas > 0.5) {
            features['hasBiosphere'] = 0;
            features['hydrosphere.coverage'] = 0;
            features['hydrosphere.composition'] = 'none';
            features['surfaceLiquid'] = 'none';
        }

        const newClasses = classifyBody(body, features, pack, allNodes);
        // Authored classes are END-STATE data (hand-built, imported, or picked from the type
        // catalogue) — only the engine's own creations (autoClassify) or class-less bodies get
        // (re)classified. body.classification below still records the engine's view either way,
        // so the Newton panel can show what the physics WOULD call a locked body.
        if (body.autoClassify || !body.classes?.length) body.classes = newClasses;

        // Re-derive the type IMAGE from the (re)classification so the picture ALWAYS matches the
        // type — editing makeup that reclassifies a world (ice-giant → puffy) now updates its image,
        // and an imported body's stale generation-time image is corrected. (Stars use a different
        // image map and are untouched here.)
        // …but NOT if the GM has uploaded a CUSTOM image (F2) — that's authored, so leave it alone.
        const primaryClass = body.classes?.[0];
        if (body.roleHint !== 'star' && primaryClass && pack.classifier?.planetImages && !(body.image as any)?.custom) {
            const img = pack.classifier.planetImages[primaryClass]
                ?? pack.classifier.planetImages[`planet/${primaryClass.split('/')[1]}`];
            if (img) body.image = { url: img };
        }

        // Record WHY (the winning fingerprint + matched bands + runner-up) for the Newton panel.
        const fps = pack.classifier?.fingerprints;
        body.classification = fps && fps.length ? explainClassification(features, fps) : undefined;

        // Habitability
        this.calculateHabitabilityAndBiosphere(body, rng, pack);
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

        // Tidal dissipation produces localized hotspots more than uniform global warming, so the
        // global-mean contribution is small and capped.
        const meanCapK = 5.0;

        // RESONANCE feeds the numeric heat. A mean-motion resonance MAINTAINS the eccentricity
        // against tidal damping, so the dissipation is sustained — the moon heats from zero forcing
        // up. A non-resonant eccentricity would circularise, so its transient heat must clear a high
        // onset before it counts toward the mean. This is why Enceladus (pumped by the Dione 2:1)
        // and the Galilean Laplace chain get real tidal heat, while a coincidentally-eccentric moon
        // (Ganymede, Luna) stays cold. resonanceTidal is set in annotateResonances (pass 1b).
        const onset = (planet as any).resonanceTidal ? 0 : 80.0;
        const drive = rawTidalIndex - onset;
        if (drive <= 0) return 0;

        // Saturating response (→ meanCapK), monotonic in the drive so Io > Europa > Enceladus.
        const halfSatK = 50.0; // drive at which the mean reaches half the cap
        return meanCapK * (drive / (drive + halfSatK));
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

    private calculateHabitabilityAndBiosphere(planet: CelestialBody, rng: SeededRNG, pack: RulePack) {
        if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;
    
        // Plateau Scoring: Max score within [min, max], linear falloff outside
        const scoreFromPlateau = (value: number, minOpt: number, maxOpt: number, falloff: number) => {
            if (value >= minOpt && value <= maxOpt) return 1.0;
            const diff = value < minOpt ? (minOpt - value) : (value - maxOpt);
            return Math.max(0, 1 - (diff / falloff));
        };

        let score = 0;
        let factors = {
            temp: 0,
            pressure: 0,
            solvent: 0,
            radiation: 0,
            gravity: 0
        };
    
        // REBALANCED weights (toward current astrobiology thinking): a liquid SOLVENT is the master
        // variable for life, with temperature gating it; atmosphere/radiation are retention/shielding
        // terms; GRAVITY is a weak direct constraint (life is robust across a wide range), so its
        // tolerance is widened and its weight trimmed. Weights still sum to 100 and Earth = 100.

        // Temperature (Max 25) — within the solvent's liquid range. Capture the band so the Bio tab
        // can show where this world sits (idealLo/idealHi = full marks, ±falloff = the score-zero edge).
        let tempIdealLo = 283, tempIdealHi = 298, tempFall = 40; // water default (10–25 °C)
        if (planet.hydrosphere?.composition === 'methane') { tempIdealLo = tempIdealHi = 111; tempFall = 30; }
        else if (planet.hydrosphere?.composition === 'ammonia') { tempIdealLo = tempIdealHi = 218; tempFall = 30; }
        if (planet.temperatureK) {
            factors.temp = scoreFromPlateau(planet.temperatureK, tempIdealLo, tempIdealHi, tempFall);
        }
        score += factors.temp * 25;

        // Solvent (Max 25) — a standing LIQUID is the prerequisite, weighted by its BIO-SOLVENT
        // quality: water is ideal (1.0), hydrocarbons/ammonia are plausible alternatives (0.6),
        // everything else can't host life (0). Uses the fluid-layer model: a frozen ice cap is not
        // a surface solvent (its life potential is the subsurface ocean), so it scores 0 here.
        const hasSurfaceLiquid = (planet.hydrosphere?.layers || []).some(l => l.location === 'surface');
        if (hasSurfaceLiquid) {
            factors.solvent = biosolventScore(planet.hydrosphere?.composition, pack); // 1 / 0.6 / 0
        }
        score += factors.solvent * 25;

        // Atmosphere pressure (Max 18) — enough to keep a solvent stable + shield; wide tolerance.
        if (planet.atmosphere?.pressure_bar) {
            factors.pressure = scoreFromPlateau(planet.atmosphere.pressure_bar, 0.5, 2.0, 2.0);
        }
        score += factors.pressure * 18;

        // Radiation (Max 17) — surface dose; DNA damage / sterilization.
        factors.radiation = scoreFromPlateau(planet.surfaceRadiation || 0, 0, 5, 20);
        score += factors.radiation * 17;

        // Gravity (Max 15) — a WEAK direct constraint; widen the tolerable band to 0.5–1.5 g.
        const surfaceGravityG = (planet.massKg && planet.radiusKm) ? (G * planet.massKg / ((planet.radiusKm*1000) * (planet.radiusKm*1000))) / 9.81 : 0;
        if (surfaceGravityG > 0) {
            factors.gravity = scoreFromPlateau(surfaceGravityG, 0.5, 1.5, 0.6);
        }
        score += factors.gravity * 15;
        const surfaceScore = score; // the instantaneous surface habitability, before long-term modifiers

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
        let superBonus = 0;
        if (surfaceGood && regime === 'plate-tectonics') {
            const massMe = (planet.massKg ?? 0) / EARTH_MASS_KG;
            if (massMe >= 1.3 && massMe <= 3.5) superBonus += 6;   // more land area + longer-lived tectonics
            if (this.systemAgeGyr >= 5 && this.systemAgeGyr <= 9) superBonus += 4; // mature, stable, time for biodiversity
            const t = planet.temperatureK ?? 0;
            if (t >= 290 && t <= 298 && (planet.hydrosphere?.coverage ?? 0) > 0.5) superBonus += 4; // warm, wet optimum
        }
        score += superBonus;

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
        const isAlienHabitable = planet.habitabilityScore > 40 && factors.solvent > 0; // needs SOME usable solvent
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

        // Store the AUTHORITATIVE breakdown so the Bio tab shows exactly this (one calc, not three):
        // the rebalanced surface factors AND the long-term geology/magnetism modifiers that the old
        // tab never saw — which is why a "good surface" can still score low.
        const tC = Math.round((planet.temperatureK ?? 0) - 273.15);
        const tempIdeal = planet.hydrosphere?.composition === 'methane' ? '−162 °C ±30'
            : planet.hydrosphere?.composition === 'ammonia' ? '−55 °C ±30' : '10–25 °C';
        const modifiers: { label: string; delta: number }[] = [];
        if (regime === 'stagnant-lid') modifiers.push({ label: 'Stagnant lid (runaway-greenhouse risk)', delta: -25 });
        else if (regime === 'tidal-volcanic') modifiers.push({ label: 'Tidal volcanism (resurfaced)', delta: -20 });
        else if (regime === 'inactive') modifiers.push({ label: 'Geologically inactive (no recycling)', delta: -10 });
        if (planet.magnetism && !planet.magnetism.intrinsic && planet.magnetism.source === 'none') modifiers.push({ label: 'No magnetosphere (atmosphere stripping)', delta: -8 });
        if (superBonus > 0) modifiers.push({ label: 'Super-habitable bonus', delta: superBonus });
        if (subsurfaceHabitable) modifiers.push({ label: 'Subsurface-ocean niche (floor)', delta: SUBSURFACE_NICHE_SCORE - Math.round(surfaceScore + geoMod) });
        planet.habitabilityBreakdown = {
            factors: [
                { label: 'Temperature', points: +(factors.temp * 25).toFixed(1), max: 25, value: `${Math.round(planet.temperatureK ?? 0)} K (${tC} °C)`, ideal: tempIdeal,
                  range: { value: Math.round(planet.temperatureK ?? 0), lo: tempIdealLo - tempFall, idealLo: tempIdealLo, idealHi: tempIdealHi, hi: tempIdealHi + tempFall, unit: 'K' } },
                { label: 'Liquid solvent', points: +(factors.solvent * 25).toFixed(1), max: 25, value: hasSurfaceLiquid ? `${Math.round((planet.hydrosphere?.coverage ?? 0) * 100)}% ${planet.hydrosphere?.composition}` : 'no surface liquid (frozen?)', ideal: 'liquid water best' },
                { label: 'Pressure', points: +(factors.pressure * 18).toFixed(1), max: 18, value: `${(planet.atmosphere?.pressure_bar ?? 0).toFixed(2)} bar`, ideal: '0.5–2 bar',
                  range: { value: +(planet.atmosphere?.pressure_bar ?? 0).toFixed(2), lo: 0, idealLo: 0.5, idealHi: 2.0, hi: 4.0, unit: 'bar' } },
                { label: 'Radiation', points: +(factors.radiation * 17).toFixed(1), max: 17, value: `${(planet.surfaceRadiation ?? 0).toFixed(2)} mSv`, ideal: '< 5 mSv',
                  range: { value: +(planet.surfaceRadiation ?? 0).toFixed(2), lo: 0, idealLo: 0, idealHi: 5, hi: 25, unit: 'mSv' } },
                { label: 'Gravity', points: +(factors.gravity * 15).toFixed(1), max: 15, value: `${surfaceGravityG.toFixed(2)} g`, ideal: '0.5–1.5 g',
                  range: { value: +surfaceGravityG.toFixed(2), lo: 0, idealLo: 0.5, idealHi: 1.5, hi: 2.1, unit: 'g' } }
            ],
            surfaceScore: Math.round(surfaceScore),
            modifiers,
            finalScore: Math.round(planet.habitabilityScore),
            tier
        };

        // --- Biosphere Generation ---
        if (planet.habitabilityScore > 10 && !planet.biosphere) {
             // Future logic: Conditional procedural spawning
        }
    }
}

export const systemProcessor = new SystemProcessor();
