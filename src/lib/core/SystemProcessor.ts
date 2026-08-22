import type { ISystemProcessor } from './interfaces';
import type { System, RulePack, CelestialBody, Barycenter, SurfaceSpectrumCurves, Tag } from '../types';
import { G, AU_KM, EARTH_MASS_KG, EARTH_RADIUS_KM, SOLAR_MASS_KG, HYDROSTATIC_MIN_RADIUS_KM } from '../constants';
import { calculateEquilibriumTemperature, calculateDistanceToStar, calculateEquilibriumTemperatureRange, composeBodySurfaceTemperature, composeModelledSurfaceTemperature, estimateInternalHeatK, solveThermalState } from '../physics/temperature';
import { calculateSurfaceRadiation, calculateTotalStellarRadiation, deriveIrradiationDose, radiationHazardBucket, radiationPlace } from '../physics/radiation';
// The annual-dose hazard tag. Its key is serialised, so it lives beside the other tag constants.
const RADIATION_HAZARD_TAG = 'hazard/radiation';

/**
 * How much does this body's distance to its STAR vary over its year, expressed as an eccentricity?
 *
 * NOT `orbit.elements.e`, which is the orbit about the body's immediate host — the barycentre for a
 * barycentre member, the planet for a moon. Derived instead from the equilibrium-temperature range,
 * which `calculateEquilibriumTemperatureRange` has already computed by walking the whole chain to
 * the star: T scales as d^(-1/2), so d_max/d_min = (T_max/T_min)^2 and e = (d_max−d_min)/(d_max+d_min).
 * A plain planet gets its own eccentricity back exactly; a barycentre member gets its barycentre's.
 *
 * Falls back to the stored element when the range is unavailable (no star, or nothing committed yet).
 */
export function effectiveOrbitEccentricity(body: any): number | undefined {
  const tMin = body.equilibriumTempMinK, tMax = body.equilibriumTempMaxK;
  if (!(tMin > 0) || !(tMax > 0) || tMax < tMin) return body.orbit?.elements.e;
  const ratioSq = (tMax / tMin) ** 2;                       // = d_max / d_min
  return (ratioSq - 1) / (ratioSq + 1);
}
const ORBITAL_RADIATION_TAG = 'hazard/orbital-radiation';
const ASCENT_TAG = 'flight/ascent';
import { classifyBody, explainClassification } from '../system/classification';
import { makeupFractions, derivedPorosity, reconcileGiantMakeup, hasSolidSurface } from '../physics/makeup';
import { surfaceTempProfile, meanSurfaceTempK } from '../physics/surfaceTemperature';
import { deriveFluidLayers } from '../physics/fluidLayers';
import { deriveCloudDecks, applyCloudDeckTags, deriveWeather, deriveOxidation, CLOUD_DECK_TAG, PRECIPITATION_TAG,
  LIGHTNING_TAG, DUST_STORM_TAG, MONSOON_TAG, OXIDISED_TAG } from '../physics/cloudDecks';
import { phaseAtP, liquidDef, biosolventScore, solventCoverageWeight } from '../physics/liquids';
import { deriveMagnetism, magneticShieldingTag } from '../physics/magnetism';
import { deriveAurora, resolveAuroraEmitters } from '../physics/aurora';
import { rotationalDeform } from '../physics/rotation';
import { deriveGeoActivity } from '../physics/geoActivity';
import { deriveVolatileRetention } from '../physics/volatileRetention';
import { deriveApparentColorParts } from '../rendering/apparentColor';
import { deriveSurfaceSpectrum } from '../physics/surfaceSpectrum';
import { deriveVisibility, distanceWords } from '../physics/visibility';
import { deriveVegetation } from '../physics/vegetation';
import { calculateOrbitalBoundaries, type PlanetData, calculateDeltaVBudgets, ascentBudgetApplies } from '../physics/orbits';
import { calculateMolarMass, recalculateAtmosphereDerivedProperties, applyAtmosphericEscape } from '../physics/atmosphere';
import { flareActivity, photosphereTempK } from '../physics/stellar-evolution';
import { STELLAR_ACTIVITY_TAG, stellarActivityBucket } from '../physics/stellarActivity';
import { STELLAR_JETS_TAG, STELLAR_SHEDDING_TAG, starJetBucket, starSheddingBucket } from '../physics/stellarOutflows';
import { starImplausibilities, STAR_IMPLAUSIBLE_TAG } from '../physics/starPlausibility';
import { applyActivityScatter, activityFromFieldExcess } from '../physics/ionisingOutput';
import { starStatTemplate } from '../generation/star';
import { predictTidalLock, lockedSpin } from '../physics/tidalLock';
import { brownDwarfThermal } from '../physics/substellar';
import { HYDROGEN_BURNING_LIMIT_SOLAR } from '../physics/starPlausibility';
/** The coolest a fusing star gets. The M/L overlap sits here — see the ignition note below. */
const STELLAR_FLOOR_K = 1900;

// Planets are assumed to coalesce a few Myr into the system's life — the baseline for age-integrated
// processes (atmospheric escape, etc.). Negligible vs Gyr ages but makes the assumption explicit.
const FORMATION_DELAY_GYR = 0.005;

// Deterministic 0..1 hash of a string — for procedural features that must be STABLE across
// re-processing (they key off the body id, not the shared per-run RNG whose stream depends on
// iteration order).
function hash01(s: string): number {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return ((h >>> 0) % 100000) / 100000;
}

// Old friendly-label tags that duplicate physics-derived ones — dropped on load (the physics
// re-adds the correct namespaced versions). Explicit so user free-text tags are never touched.
// A few friendly-label duplicates of CURRENT physics tags (the new label differs from the key).
const LEGACY_DUPLICATE_TAGS = new Set<string>([
  'Active Volcanism', 'Active Volcano', 'Tidal Volcanism', 'Tidal Hotspots', 'Rings'
]);
import { SeededRNG } from '../rng';
// The one authority on which tags a re-derive pass may delete. Every strip below goes through it, so
// a hand-added tag survives the pass that would otherwise have silently deleted it.
import { stripForReprocess, survivesRederive, emit, canonicalTagKey } from '../tags/tagLifecycle';
import { OVERRIDE_DEFS } from '../physics/overrides';
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
            b.tags = b.tags.filter((t) => survivesRederive(t) || (!LEGACY_DUPLICATE_TAGS.has(t.key) && !isLegacyTag(t.key)));
        }

        // Stellar flare activity (drives the flare particle dose on planets) — derived for every star
        // from its class + the system age, so imported systems get it too. Re-targets the hazard/flaring
        // tag to the physically-active stars (young / M-K dwarfs), not just luminous ones.
        for (const node of allNodes) {
            const s = node as CelestialBody;
            if (s.kind !== 'body' || s.roleHint !== 'star') continue;
            // IONISING OUTPUT IS NOT BRIGHTNESS. Derived from class and age, but a GM may pin it:
            // stars flare with almost no change in luminosity and a great deal of ionising
            // radiation, so the lever for "make this one dangerous" must not be the lever for "make
            // this one brighter". F-OVR: a present key means the GM pinned it.
            // ...and a SEEDED SPREAD around it, because stars of one class and age genuinely scatter
            // by about half a decade in X-ray output - rotation at birth varies and the dynamo follows
            // rotation. A model with no scatter is the unphysical one. Seeded from the star's id, so
            // it is stable across re-processing and identical for everyone.
            const baseActivity = flareActivity(s.classes?.[0], this.systemAgeGyr, (s as any).accretionEddington);
            // THE FIELD IS ALSO THE FLARING LEVER, now that the separate activity slider is gone.
            // Flaring IS the dynamo and the field is the dynamo's output, so a star wound well above
            // its class's typical field is more active — and one sitting inside its own band is
            // exactly as active as class and age say, which is why this changes nothing for an
            // ordinary star. Only a GM deliberately raising the field moves it.
            const typicalGauss = (starStatTemplate(rulePack, s.classes?.[0] ?? '')?.mag_gauss ?? []) as number[];
            const fieldDriven = activityFromFieldExcess(
                s.magneticField?.strengthGauss,
                typicalGauss.length === 2 ? (typicalGauss[0] + typicalGauss[1]) / 2 : undefined
            );
            s.flareActivity = s.overrides?.flareActivity
                ?? Math.max(applyActivityScatter(baseActivity, (s as any).activityScatter), fieldDriven);
            s.tags = stripForReprocess(s.tags, ['hazard/flaring', STELLAR_ACTIVITY_TAG]);
            if (s.flareActivity > 0.4) emit(s.tags, { key: 'hazard/flaring' });
            // MAGNETIC ACTIVITY, bucketed — the one judgement behind everything a star's surface
            // shows: spot count and darkness, facular brightening, and how often it flares. Both
            // renderers read this tag rather than re-deriving from the raw number.
            // …BUT ONLY WHERE THERE IS A FUSING PHOTOSPHERE TO SPOT. Below the fusion floor the
            // atmosphere is largely neutral, the magnetic field decouples from it, and an L/T dwarf's
            // variability is CLOUD rather than starspots. Emitting this on a T dwarf is what put
            // sunspots on Epsilon Indi Bb.
            //
            // GATED ON MASS, NOT TEMPERATURE, and the idempotence test is why: this block runs BEFORE
            // the substellar pass, which then overwrites `temperatureK` with the dwarf's Teff — so a
            // temperature gate read one value on the first pass and another on the second, and the tag
            // appeared then vanished. Mass and radius are INPUTS, so the same question gets the same
            // answer whenever it is asked.
            if (!brownDwarfThermal(s.massKg || 0, this.systemAgeGyr, s.radiusKm || 0).isSubstellar) {
                emit(s.tags, { key: STELLAR_ACTIVITY_TAG, value: stellarActivityBucket(s.flareActivity) });
            }
            // WHAT THE STAR THROWS OFF (inbox G26): jets and a shed wind, derived in
            // physics/stellarOutflows from mass, radius, field, feed and luminosity — all INPUTS at this
            // point, none written by a later pass, so the answer is the same on every run. Both
            // starmaps and the system view draw what these tags say and nothing else; a renderer
            // deciding for itself which star jets is the fault the architecture rule exists to stop.
            // This pass OWNS both keys and clears them first (TAG-6), so a star edited out of a jet
            // loses its mark.
            s.tags = stripForReprocess(s.tags, [STELLAR_JETS_TAG, STELLAR_SHEDDING_TAG]);
            const jets = starJetBucket(s as any);
            if (jets) emit(s.tags, { key: STELLAR_JETS_TAG, value: jets });
            const shed = starSheddingBucket(s as any);
            if (shed) emit(s.tags, { key: STELLAR_SHEDDING_TAG, value: shed });

            // WHY THIS STAR IS NOT A VALID STAR (owner, 2026-08-15). REFUSE TO PRODUCE, NEVER REFUSE
            // TO ACCEPT: the engine will not GENERATE an impossible star, but a GM may author one and
            // gets it, with a tag naming WHICH LAW it breaks rather than the word "invalid". This pass
            // OWNS the namespace and clears it first (TAG-6), so a fixed star loses its complaint.
            s.tags = stripForReprocess(s.tags, [STAR_IMPLAUSIBLE_TAG]);
            for (const bad of starImplausibilities(s, rulePack)) {
                emit(s.tags, { key: STAR_IMPLAUSIBLE_TAG, value: bad.law });
            }
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

        // 1c. Substellar self-luminosity — a brown-dwarf-MASS body (~8–80 M_jup) radiates its own heat
        //     (contraction + deuterium burning), so it self-heats AND becomes a light/radiation source
        //     for its moons. Computed BEFORE the environment pass so a moon's temperature/radiation can
        //     see its luminous host. Idempotent: clears the flags on anything no longer substellar.
        //     ROLE IS NOT THE TEST — MASS IS. A brown dwarf is filed as a star as often as not, and
        //     skipping star-role bodies meant the one class of object this pass exists for never
        //     reached it: Epsilon Indi Bb, a T6 dwarf, got no self-luminosity and no glow, and fell
        //     through to the stellar colour table which bottomed out at bright orange. The else branch
        //     below already protects a real star's radiationOutput, so running it over everything is
        //     safe — anything outside the substellar window simply takes that branch.
        for (const node of allNodes) {
            if (node.kind === 'body') this.applySubstellarSelfLuminosity(node as CelestialBody);
        }

        // 2. Second Pass: Environment (Radiation, Temperature, Atmosphere Retention)
        // Requires basics to be set (like distance)
        for (const node of allNodes) {
            if (node.kind === 'body') {
                this.processEnvironment(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 2b. Interior fluid layers + MAGNETISM. Split out of the classification pass, where it used
        //     to sit, for one reason: radiation reads a body's field and used to run a whole pass
        //     BEFORE that field was derived, so the dose a GM saw depended on how many times the
        //     system had been through process() (inbox B13). Everything this needs — makeup, mass,
        //     the reconciled spin, the solved temperatures — is committed by the end of 2a.
        //     PARENT BEFORE CHILD, because a moon's induced field asks whether it sits inside its
        //     host's magnetosphere, and the belt term in 2c asks the host for its field and spin.
        //     Iterating in node order made both answers depend on the order bodies happen to appear
        //     in the file.
        for (const node of this.parentFirstOrder(allNodes)) {
            if (node.kind === 'body') {
                this.processInterior(node as CelestialBody, allNodes, rulePack);
            }
        }

        // 2c. Radiation — its own pass, after EVERY body has its field, its spin and its atmospheric
        //     scale height. A body's dose depends on its host's magnetosphere as well as its own, so
        //     there is no per-body order that can satisfy it; it has to follow the whole of 2b.
        for (const node of allNodes) {
            if (node.kind === 'body' && (node as CelestialBody).roleHint !== 'star') {
                const b = node as CelestialBody;
                b.surfaceRadiation = calculateSurfaceRadiation(b, allNodes, rulePack);
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

        // 7. ANOMALY pass (G37) — the GM's stated REASON for each value they have pinned, published
        //    as a tag so a player can see WHAT is odd about a world rather than only that something
        //    is. Last, because the tag's value names the overrides it accounts for and nothing else
        //    reads it; and per body rather than per system, because an anomaly belongs to a place.
        for (const node of allNodes) {
            if (node.kind === 'body') this.applyAnomalyTags(node as CelestialBody);
        }

        return processedSystem;
    }

    /**
     * Publish `anomaly/*` from `body.overrides.anomalies` — the GM's stated reason for each pin.
     *
     * DERIVED EVERY PASS FROM AUTHORED DATA, which is what keeps it idempotent: the assignment map is
     * saved, the tag is not, and re-running the processor rebuilds exactly the same tags.
     *
     * THE VALUE IS THE FEATURE, and it is the owner's ask in so many words: "the tag really needs to
     * be informative as to what it is impacting so players can see WHAT is anomalous". So one reason
     * used for several pins produces ONE tag naming all of them — `Alien Technology: Magnetosphere,
     * Surface temperature` — rather than a bare label that says only that something is wrong.
     *
     * THE CLEAR IS IN TWO PARTS, and both are needed (TAG-6: one clear, at the top of the pass that
     * owns the namespace).
     *
     *   1. `stripForReprocess` over the whole `anomaly/` namespace removes what THIS pass emitted
     *      last time and spares a hand-added `anomaly/legend` the GM put on the Tags tab with no
     *      override behind it — a legitimate thing to want, which the program does not stop. Without
     *      this half, resetting the last override on a body leaves its reason tag stranded, because
     *      there would be no bound key left to strip it by. A test caught exactly that.
     *   2. A manual TWIN of a bound key is removed as well, or the guard that spares hand-added tags
     *      would keep the bare `anomaly/magic` and this pass's informative one would never be added.
     *      The binding is the more specific statement and it came from the same GM.
     */
    private applyAnomalyTags(body: CelestialBody) {
        const assignments = body.overrides?.anomalies;
        // Which quantities each reason is accounting for, in roster order so the list is stable.
        const quantities = new Map<string, string[]>();
        for (const def of OVERRIDE_DEFS) {
            const a = assignments?.[def.key];
            // A reason only counts while the override it explains is still pinned. Reset deletes the
            // assignment (`clearOverride`), so this is a belt-and-braces guard against a hand-edited
            // save, not a second lifecycle.
            if (!a?.tag || (body.overrides as Record<string, unknown> | undefined)?.[def.key] === undefined) continue;
            const key = canonicalTagKey(a.tag);
            if (!quantities.has(key)) quantities.set(key, []);
            quantities.get(key)!.push(def.label);
        }
        const bound = new Set(quantities.keys());
        body.tags = stripForReprocess(body.tags, ['anomaly/'])
            .filter((t) => !bound.has(canonicalTagKey(t.key)));
        if (!bound.size) return;
        for (const [key, labels] of quantities) {
            const secret = OVERRIDE_DEFS.some((d) => {
                const a = assignments?.[d.key];
                return a && canonicalTagKey(a.tag) === key && a.secret;
            });
            // SECRET IS PER ASSIGNMENT and any secret assignment makes the whole tag secret: the tag
            // is one object on the body, and half-redacting it would tell the player the reason while
            // hiding which pin it covers, which is the wrong half to keep.
            // "Anomalous bond albedo", not "Bond albedo" (owner, 2026-08-22). The pill is read
            // BESIDE its reason — "Experimental Terraforming: Anomalous bond albedo" — and the bare
            // label there reads as a heading for the quantity rather than a claim about it. One
            // "Anomalous" leads the whole list, so two pinned figures read "Anomalous magnetosphere,
            // surface temperature" rather than repeating the word.
            const listed = labels.map((l) => l.charAt(0).toLowerCase() + l.slice(1));
            body.tags.push({
                key,
                value: `Anomalous ${listed.join(', ')}`,
                ...(secret ? { secret: true } : {})
            } as Tag);
        }
    }

    private processBarycenters(system: System) {
        const barycenters = system.nodes.filter(n => n.kind === 'barycenter') as Barycenter[];
        const nodesById = new Map(system.nodes.map(n => [n.id, n]));

        // EFFECTIVE MASSES FIRST, DEEPEST BARYCENTRE FIRST — a nested barycentre is a member of the
        // one above it, so the outer one's total is only right once the inner one's is. The single
        // loop below used to do this in file order, and Alpha Centauri lists the OUTER barycentre
        // first: on a fresh load the system barycentre summed Proxima plus a stale AB total (2.43e29
        // against the true 4.20e30), which then moved every orbit in the system and flipped both
        // primaries from no stability verdict at all to "Very Unstable" on the second pass. Splitting
        // the masses out also breaks the genuine circularity in doing it in one pass: an inner
        // barycentre needs its PARENT's mass for its own orbit, while the parent needs the inner
        // one's mass for its total. (inbox B13)
        for (const bary of this.parentFirstOrder(barycenters).reverse() as Barycenter[]) {
            if (!bary.memberIds || bary.memberIds.length < 2) continue;
            let totalMass = 0;
            for (const id of bary.memberIds) {
                const member = nodesById.get(id);
                if (!member) continue;
                totalMass += (member.kind === 'body'
                    ? (member as CelestialBody).massKg
                    : (member as Barycenter).effectiveMassKg) || 0;
            }
            bary.effectiveMassKg = totalMass;
        }

        for (const bary of barycenters) {
            if (!bary.memberIds || bary.memberIds.length < 2) continue;

            // Keep barycenter parent-orbit dynamics consistent with current parent mass.
            // NOT when this barycentre is itself a MEMBER of another one: that parent's own member
            // loop and binary coupling below already own this orbit, and they derive the mean motion
            // from the pair's SEPARATION rather than from this member's semi-major axis alone. Two
            // writers, two formulas, one field — mathematically the same answer, one unit in the last
            // place apart, and whichever ran last won. Algol's inner barycentre changed its mean
            // motion between the first process() and the second for exactly that reason (inbox B13).
            const parentNode = bary.parentId ? nodesById.get(bary.parentId) : undefined;
            const ownedByParentPair = parentNode?.kind === 'barycenter'
                && ((parentNode as Barycenter).memberIds || []).includes(bary.id);
            if (bary.orbit && bary.parentId && !ownedByParentPair) {
                const parent = parentNode as CelestialBody | Barycenter | undefined;
                const parentMass = parent?.kind === 'barycenter'
                    ? (parent.effectiveMassKg || 0)
                    : ((parent as CelestialBody | undefined)?.massKg || 0);
                if (parentMass > 0) {
                    bary.orbit.hostMu = G * parentMass;
                    const aMeters = (bary.orbit.elements.a_AU || 0) * AU_KM * 1000;
                    if (aMeters > 0) {
                        bary.orbit.n_rad_per_s = this.settled(bary.orbit.n_rad_per_s, Math.sqrt((G * parentMass) / Math.pow(aMeters, 3)));
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
                        member.orbit.elements.a_AU = this.settled(
                            member.orbit.elements.a_AU, separationAU * ((otherMass || 0) / totalMass)
                        );
                    }
                }

                // Update Physics
                member.orbit.hostMu = G * totalMass;
                member.orbit.n_rad_per_s = this.settled(member.orbit.n_rad_per_s, n_rad_per_s);
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
                        // MASS IS THE WRONG TIE-BREAK WHEN ONE ORBIT IS A PLACEHOLDER. The pair's
                        // shape — e, inclination, node, periapsis — is copied from the reference onto
                        // BOTH members, so choosing a member that never had an orbit of its own
                        // overwrites the one that did with a ring of zeroes.
                        //
                        // That is exactly what happened to Alpha Centauri: the importer gives the
                        // COMPANION the orbit and the primary none, the primary is heavier, so it won
                        // the tie-break and its synthesised e = 0 flattened Toliman's derived 0.574
                        // into a perfect circle. The real pair is e = 0.524.
                        //
                        // A zero here is an ABSENCE, not a measurement — the same distinction that
                        // runs through B39 (no rotation is not zero rotation) and B44. So an orbit
                        // that states a shape beats one that states nothing, and mass only decides
                        // when both do or neither does.
                        const shaped0 = (m0.orbit.elements.e || 0) > 0;
                        const shaped1 = (m1.orbit.elements.e || 0) > 0;
                        if (shaped0 !== shaped1) reference = shaped0 ? m0.orbit : m1.orbit;
                        else reference = mass0 >= mass1 ? m0.orbit : m1.orbit;
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

                    m0.orbit.elements.a_AU = this.settled(m0.orbit.elements.a_AU, a0);
                    m1.orbit.elements.a_AU = this.settled(m1.orbit.elements.a_AU, a1);

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
                    // The REFERENCE member keeps its own argument of periapsis and the OTHER one is
                    // put opposite it. Assigning the flip to m1 unconditionally meant that whenever
                    // m1 WAS the reference (heavier, or more recently edited) it flipped its own
                    // angle by 180 degrees on every pass — a period-2 limit cycle that never
                    // settles, so process() could never be idempotent on a binary. Zeta Reticuli
                    // oscillated 0 / 180 / 0 / 180 forever (inbox B13).
                    const refIsM0 = reference === m0.orbit;
                    const oppositeArgPeri = (coupledArgPeri + 180) % 360;
                    m0.orbit.elements.omega_deg = refIsM0 ? coupledArgPeri : oppositeArgPeri;
                    m1.orbit.elements.omega_deg = refIsM0 ? oppositeArgPeri : coupledArgPeri;

                    m0.orbit.elements.M0_rad = refM0;
                    m1.orbit.elements.M0_rad = refM0;

                    m0.orbit.hostMu = G * totalMass;
                    m1.orbit.hostMu = G * totalMass;
                    m0.orbit.n_rad_per_s = this.settled(m0.orbit.n_rad_per_s, n_rad_per_s);
                    m1.orbit.n_rad_per_s = this.settled(m1.orbit.n_rad_per_s, n_rad_per_s);
                }
            }
        }
    }

    // Keep the stored value when the newly computed one is the same number to within double
    // precision. The barycentre split is a ROUND TRIP — the separation is the SUM of the members'
    // semi-major axes, and each member's axis is then re-derived from that sum — and in floating
    // point that trip lands one unit in the last place away from where it started, on every pass,
    // for ever. Nothing physical moves; the number simply never settles, and never settling is
    // enough on its own to make process() non-idempotent (Luyten 726-8, inbox B13). A relative
    // change of a part in 1e-12 is not a change.
    private settled(current: number | undefined, next: number): number {
        if (current === undefined || !Number.isFinite(current) || current === 0) return next;
        return Math.abs(next - current) <= Math.abs(current) * 1e-12 ? current : next;
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

    // Flag a brown-dwarf-mass body as self-luminous and give it a photosphere temperature + luminosity
    // + radiationOutput, so (a) its own surface reads ≈ its Teff and (b) it irradiates its moons. Runs
    // before the environment pass. Fully idempotent — clears the markers if the body is no longer in the
    // substellar mass window (e.g. the GM edited its mass down).
    private applySubstellarSelfLuminosity(body: CelestialBody) {
        const bd = brownDwarfThermal(body.massKg || 0, this.systemAgeGyr, body.radiusKm || 0);
        body.tags = stripForReprocess(body.tags, ['thermal/self-luminous']);
        if (bd.isSubstellar) {
            (body as any).isSelfLuminous = true;
            (body as any).selfLuminousTeffK = bd.teffK;
            (body as any).internalLuminositySolar = bd.luminositySolar;
            // radiationOutput is the luminosity the radiation model reads for a source (L☉).
            body.radiationOutput = bd.luminositySolar;
            // Provisional surface temp so a moon processed before this body still sees ~Teff; this body's
            // own environment pass recomputes it (to ≈ the same value) via the self-luminous flux term.
            body.temperatureK = bd.teffK;
            // Tag it (value = Teff) — surfaces in Find-by-tag/reports and drives the self-luminous disc glow.
            emit(body.tags, { key: 'thermal/self-luminous', value: Math.round(bd.teffK).toString() });
        } else {
            (body as any).isSelfLuminous = false;
            delete (body as any).selfLuminousTeffK;
            delete (body as any).internalLuminositySolar;
            // Only stars keep a radiationOutput — a downgraded body must stop irradiating others.
            if (body.roleHint !== 'star') delete (body as any).radiationOutput;
            // IGNITION MUST NOT MAKE A BODY COLDER OR DARKER.
            //
            // The substellar track stops dead at the fusion limit: 79.99 M_jup derives 1947 K, and
            // 80.00 derives nothing at all. A body nudged across that line therefore KEPT its old
            // brown-dwarf temperature — and since the colour ramp now takes anything under 2400 K to
            // near-black, it would ignite and go DARKER, which is the one thing crossing that line
            // cannot do.
            //
            // Physically the boundary is not a brightness cliff: an object at the hydrogen-burning
            // limit sits around 1900-2100 K whether or not it has just started fusing, which is why
            // the coolest M dwarfs and the hottest L dwarfs overlap. So a star is held at or above
            // the floor. Only ever raises, and only ever a star that is below it, so nothing that
            // already had a sane temperature moves.
            if (body.roleHint === 'star' && (body.temperatureK ?? 0) > 0
                && (body.temperatureK as number) < STELLAR_FLOOR_K
                && (body.massKg || 0) >= HYDROGEN_BURNING_LIMIT_SOLAR * SOLAR_MASS_KG) {
                body.temperatureK = STELLAR_FLOOR_K;
            }
        }
    }

    private processEnvironment(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack) {
        // Skip Stars for environment processing as they generate their own physics (Temp, Radiation)
        if (body.roleHint === 'star') return;

        // Escape Velocity
        const escapeVelocity = Math.sqrt(2 * G * (body.massKg || 0) / ((body.radiusKm || 1) * 1000)) / 1000; // in km/s

        // Reconcile an inconsistent makeup HERE as well as in processClassification. A body at giant
        // mass and giant density cannot be the ice world its authored makeup claims, and everything
        // below reads that makeup — a giant is optically its cloud stack over a deep atmosphere,
        // a rock/ice world is a surface. Only classification used to make the correction, one pass
        // too late: the first process() ran the temperature model against the authored makeup and
        // the second against the corrected one, so the same file gave two different temperatures
        // depending on how many times it had been loaded. Idempotent (a gas-dominated makeup is
        // returned unchanged), so running it in both places costs nothing.
        const earlyGiantFix = reconcileGiantMakeup(body);
        if (earlyGiantFix) body.makeup = earlyGiantFix;

        // Temperature Components
        const allStars = allNodes.filter(n => n.kind === 'body' && n.roleHint === 'star') as CelestialBody[];
        let equilibriumTempK = 0;

        // --- Heat terms that do NOT depend on temperature, committed FIRST. ---
        // The thermal solve below composes the surface temperature from every heat term on the body,
        // so these have to be on it before it runs. They read mass, orbit and age only — nothing
        // downstream of albedo — so computing them here costs nothing and closes a real hole: they
        // used to be committed AFTER the albedo pass, which meant the clouds and the albedo were
        // being judged against last run's leftovers on a re-process, or against nothing at all on
        // the first.

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
                body.tags = stripForReprocess(body.tags, ['tidal/hotspots']);
                if (hasHotspots) {
                    emit(body.tags, { key: 'tidal/hotspots' });
                }
            }
        }
        body.tidalHeatK = tidalHeatingK;

        // Radiogenic Heating — a GM OVERRIDE (body.overrides.radiogenicHeatK), re-derived from it each run
        // so it survives save/load. Default 0 (radiogenic surface heat is negligible vs sunlight for most
        // worlds). When the GM sets it, it adds surface heat AND boosts the geological vigor (see geology).
        const radiogenicHeatK = body.overrides?.radiogenicHeatK ?? 0;
        body.radiogenicHeatK = radiogenicHeatK;
        body.internalHeatK = estimateInternalHeatK(body, pack, this.systemAgeGyr);

        // Tidal locking — derived from the despinning timescale vs the system age (a moon locks to
        // its planet, a planet to its star/barycentre). DYNAMIC by default; the body editor's
        // checkbox pins it (tidalLockManual) and skips this assessment.
        // WHAT it locks to matters for the renderer, and the renderer (a pure function of one body)
        // can't see the parent chain — so we surface it here as tags: orbit/locked-star (a planet with a
        // PERMANENT substellar face → an eyeball world) vs orbit/locked-planet (a moon; its whole surface
        // still cycles through stellar day/night, so NO eyeball — but its cratering still skews to its
        // orbital leading face).
        // RUNS BEFORE THE THERMAL SOLVE, and that is deliberate: the solve's surface-temperature
        // profile reads `tidallyLocked` and the rotation period, so under the old placement — after
        // the solve — it was reading whatever the PREVIOUS process() left behind, or nothing at all
        // on a fresh import. Nothing here is thermal (despinning is mass, radius, distance and age),
        // so there is no circularity in moving it up, only a stale read removed. Same rule as the
        // v2.1.282 thermal unification: anything the solve reads is committed before it runs.
        const lockParent = allNodes.find((n) => n.id === body.parentId);
        const orbitsStar = !!lockParent && (
            (lockParent.kind === 'body' && (lockParent as CelestialBody).roleHint === 'star') ||
            (lockParent.kind === 'barycenter' && ((lockParent as Barycenter).memberIds || []).some((mid) => {
                const m = allNodes.find((n) => n.id === mid); return m?.kind === 'body' && (m as CelestialBody).roleHint === 'star';
            }))
        );
        if (!(body as any).tidalLockManual && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
            const lockHostMass = lockParent
                ? (lockParent.kind === 'barycenter' ? (lockParent as Barycenter).effectiveMassKg : (lockParent as CelestialBody).massKg)
                : 0;
            body.tidallyLocked = predictTidalLock(
                body.orbit?.elements.a_AU || 0, body.radiusKm || 0, body.massKg || 0,
                lockHostMass || 0, this.systemAgeGyr
            );
        }
        body.tags = stripForReprocess(body.tags, ['orbit/tidally-locked', 'orbit/locked-star', 'orbit/locked-planet', 'orbit/spin-orbit-resonance']);

        // B7: reconcile the SPIN with the lock, so the two cannot contradict each other. A locked
        // body's sidereal rotation period is its orbital period — surfaceTempProfile below has
        // always assumed exactly that (it uses orbitalPeriodHours for a locked body and ignores the
        // stored spin), while the stat block, the dynamo's rotation factor and the oblateness model
        // all read the stored number. One question, two answers. The lock now sets the number, and
        // because the assessment above is DERIVED every pass, a hand-pinned lock reconciles too.
        // The exception is a captured spin-orbit resonance — Mercury's 3:2 — which keeps its own
        // measured period and says which resonance it is instead of claiming to be synchronous.
        //
        // AND THE SPIN IS RESOLVED BEFORE THE LOCK FLAG IS PUBLISHED, WHICH IS THE WHOLE OF B69.
        // `predictTidalLock` answers "has this body despun", and despinning has TWO end states: a
        // permanent face, or a captured resonance. The flag used to follow the DESPIN verdict, so
        // Mercury — which the very next lines correctly resolve to 3:2 and 1407.6 h — was published
        // as having a permanent substellar face, and the classifier's own record called it a HOT
        // EYEBALL (score 1.56, beating terrestrial at 1.2). A resonance is the opposite of a
        // permanent face: the whole surface still sees the star, which is why the temperature model
        // already refused to believe the flag and derived Mercury's real 176-day solar day instead.
        let spinKind: 'synchronous' | 'resonant' = 'synchronous';
        if (body.tidallyLocked && (body.orbital_period_days ?? 0) > 0) {
            const spin = lockedSpin(
                (body.orbital_period_days as number) * 24,
                body.rotation_period_hours,
                body.orbit?.elements.e ?? 0
            );
            spinKind = spin.kind;
            body.rotation_period_hours = spin.rotationHours;
            body.calculatedRotationPeriod_s = Math.abs(spin.rotationHours) * 3600;
            if (spin.kind === 'resonant') emit(body.tags, { key: 'orbit/spin-orbit-resonance', value: spin.ratio as string });
        }
        body.starTidallyLocked = !!body.tidallyLocked && orbitsStar && spinKind === 'synchronous';
        // Surface the lock TARGET as its own tag (both are registered so they survive tag sanitising):
        // locked-star = a permanent substellar face (eyeball candidate); locked-planet = a moon whose
        // whole surface still cycles through stellar day/night.
        //
        // A RESONANT BODY GETS NEITHER, AND NOT `orbit/tidally-locked` EITHER. Both of those tags
        // state synchrony in so many words — "one face permanently toward its host", "its day length
        // is therefore its orbital period" — and neither is true of Mercury. `orbit/locked-planet`
        // would be the worse of the two on a body that orbits a star. The resonance tag says what
        // actually happened, and it is the only one that should.
        if (body.tidallyLocked && spinKind === 'synchronous') {
            emit(body.tags, { key: 'orbit/tidally-locked' });
            emit(body.tags, { key: body.starTidallyLocked ? 'orbit/locked-star' : 'orbit/locked-planet' });
        }

        // THE PRIMORDIAL BASELINE IS CAPTURED BEFORE THE PIN CAN TOUCH THE AIR, and the ordering is
        // the whole of it (G37). `atmosphere0` is what atmospheric escape erodes FROM, snapshotted
        // the first time an opted-in world is processed — and the pressure pin below writes into
        // `atmosphere.pressure_bar`. Left in the escape block where it used to live, the snapshot
        // ran AFTER the pin, so pinning 40 bar on a world whose authored baseline was 1 bar recorded
        // 40 bar as that world's own history: the baseline was gone from every save from then on,
        // and resetting the pin eroded from the pinned figure for ever. Moved, not duplicated — the
        // escape block still reads it.
        if ((body.roleHint === 'planet' || body.roleHint === 'moon') && body.evolveAtmosphere
            && !body.atmosphere0 && body.atmosphere) {
            body.atmosphere0 = JSON.parse(JSON.stringify(body.atmosphere));
        }

        // F-OVR (G37): a PINNED surface pressure, applied BEFORE anything reads the air. One helper,
        // called twice — here and again after atmospheric escape — because escape is the model the
        // pin exists to overrule, and a pin that only survived until the erosion pass would be a pin
        // in name only. It is not a poke into derived output: `atmosphere.pressure_bar` is authored
        // input (the GM types it on the Atmo tab), and this restates the GM's own answer over the
        // top of a model that would otherwise take it away.
        const applyPressurePin = () => {
            const pin = body.overrides?.pressureBar;
            if (typeof pin !== 'number' || !Number.isFinite(pin) || pin < 0) return;
            if (!body.atmosphere) return;   // nothing to pressurise; the GM must give it air first
            body.atmosphere.pressure_bar = pin;
        };
        applyPressurePin();

        // --- THE thermal fixed point: albedo ⇄ equilibrium temp ⇄ greenhouse ⇄ surface temp ⇄
        //     cloud decks ⇄ albedo (physics/temperature.ts solveThermalState, which explains why it
        //     terminates). The clouds it reads are deriveCloudDecks' — the same single evaluation
        //     published as tags in processClassification — so the albedo model and the deck model
        //     can no longer disagree about what is in this world's sky. A manually-pinned
        //     body.albedo / overrides.albedo short-circuits the albedo half of it.
        const commitThermal = () => {
            const solved = solveThermalState(body, allNodes, pack, this.systemAgeGyr);
            equilibriumTempK = solved.equilibriumTempK;
            body.equilibriumTempK = equilibriumTempK;
            body.albedoBreakdown = solved.albedoInfo;
            body.greenhouseTempK = solved.greenhouseTempK;
            // Commit the solved SURFACE temperature too, not just the equilibrium one. The greenhouse
            // reads it (an ocean only feeds water vapour into the sky between freezing and boiling),
            // so leaving the previous run's value here meant recalculateAtmosphereDerivedProperties
            // below re-derived the greenhouse against stale history: a world processed once and
            // processed twice came out at two different temperatures. It now reproduces exactly what
            // the solve already converged on.
            body.temperatureK = solved.surfaceTempK;
            const eqRange = calculateEquilibriumTemperatureRange(body, allNodes, solved.albedoInfo.albedo);
            (body as any).equilibriumTempMinK = eqRange.minK;
            (body as any).equilibriumTempMaxK = eqRange.maxK;
        };
        if (allStars.length > 0) commitThermal();
        body.equilibriumTempK = equilibriumTempK;

        // Atmospheric escape over the system's age — thins/strips the atmosphere BEFORE greenhouse &
        // radiation read it (so a stripped world loses its greenhouse + shielding). Planets are assumed
        // to form a few Myr into the system's life (FORMATION_DELAY_GYR), so they erode for ~that long.
        // OPT-IN per body (evolveAtmosphere): hand-authored, imported and picker-placed worlds carry
        // END-STATE atmospheres the GM chose — re-aging them deletes every deliberate trace exosphere.
        // Opted-in bodies erode a COPY of their primordial baseline (atmosphere0, snapshotted on first
        // run) so re-processing — which happens on every load and edit — never compounds the loss.
        if ((body.roleHint === 'planet' || body.roleHint === 'moon') && body.evolveAtmosphere) {
            // (The snapshot itself now happens further up, before the pressure pin can reach the
            //  air — see the note there. This still restores from it before eroding.)
            if (body.atmosphere0) body.atmosphere = JSON.parse(JSON.stringify(body.atmosphere0));
            const magG = body.magneticField?.strengthGauss || 0;
            const magShield = magG > 0 ? Math.min(0.99, (Math.log10(magG + 0.01) + 2) / 3) : 0;
            const stellarFluxRel = calculateTotalStellarRadiation(body, allNodes);
            const planetAgeGyr = Math.max(0, this.systemAgeGyr - FORMATION_DELAY_GYR);
            const pressureBefore = body.atmosphere?.pressure_bar ?? 0;
            applyAtmosphericEscape(body, equilibriumTempK, planetAgeGyr, stellarFluxRel, magShield, pack);
            // Escape changed the air the clouds condense out of, so the fixed point has to be solved
            // again against what is actually left. Only these opted-in bodies pay for it, and only
            // when something was really lost.
            // THE PIN OUTRANKS THE EROSION. Escape has just decided how much air this world should
            // have lost over its lifetime; a GM who pinned the pressure has said that it did not.
            applyPressurePin();
            if (allStars.length > 0 && (body.atmosphere?.pressure_bar ?? 0) !== pressureBefore) commitThermal();
        }

        // (Radiation used to sit here, and that was the whole of inbox B13: it read this body's
        //  magnetic field a full pass before the field was derived, and its belt inner edge read an
        //  atmospheric scale height written 58 lines further down this same method. It is now its
        //  own pass, 2c, after every body's field, spin and scale height are committed.)

        // V1.4.0 Unified Atmospheric Physics — molar mass, scale height and the gas tags, plus a
        // recompute of the greenhouse the thermal solve already committed (idempotent: it lands on
        // the same value, now that the surface temperature it reads is this pass's).
        recalculateAtmosphereDerivedProperties(body, allNodes, pack);

        // Total temperature from flux-space composition (avoids direct +K stacking artifacts). All heat
        // terms are already committed on the body above (greenhouse, tidal, radiogenic, internal,
        // self-luminous) — compose them through the shared helper so this matches every other path.
        body.temperatureK = composeBodySurfaceTemperature(body, equilibriumTempK);

        // Surface temperature DECOMPOSED by cause (latitude / seasonal / day-night / locked faces /
        // tidal hotspots) — the whole picture, not one opaque min/max.
        body.tags = body.tags || [];
        body.tags = stripForReprocess(body.tags, ['tidal/volcanism', 'tidal/lava-flows']);
        // THE ONE READER THAT CANNOT USE THE MEAN, AND THE REASON IS ORDERING (inbox B71). This flag
        // is an INPUT to the profile below — an ocean redistributes heat, which is what sets the
        // day/night split — so the mean does not exist yet and asking for it would be circular. It is
        // also the case where the two figures barely differ: a world with a standing ocean has the
        // damping that makes them agree. Reading last pass's mean instead would break PHY-1.
        const surfaceLiquidWater = (body.hydrosphere?.composition === 'water')
            && (body.hydrosphere?.coverage ?? 0) > 0.2 && (body.temperatureK ?? 0) >= 273;
        // THE PROFILE IS BUILT THROUGH THE *MODELLED* COMPOSER, NOT THE PINNED ONE (G37), and the
        // reason is PHY-19: this function derives the day and night sides from the energy balance and
        // lets the MEAN FALL OUT OF THEM. A composer that answered with the GM's pin at every
        // equilibrium temperature would hand it two identical hemispheres and flatten an eyeball
        // world into an isothermal one. So the profile is composed from the model, its mean is
        // measured, and — when a pin is present — the whole thing is rebuilt with the composer scaled
        // by `pin / thatMean`. ONE CLOSED-FORM FACTOR, NOT AN ITERATION: the mean is linear in the
        // scale, so the mean of the two scaled hemispheres is exactly the pin while their RATIO, and
        // every swing derived from it, is untouched. Only a pinned body pays for the second pass.
        const buildProfile = (compose: (teqK: number) => number) => surfaceTempProfile({
            meanK: body.temperatureK ?? equilibriumTempK,
            equilibriumK: equilibriumTempK,
            // The sunlit ceiling is (S(1−A)/σ)^¼ and a body reaches it at CLOSEST approach, so the
            // hot side is bounded on the peri-astron equilibrium temperature rather than the mean-
            // distance one. `commitThermal` above wrote it this pass from the same chain walk to the
            // star that B42 recovered the seasonal eccentricity from — not a second model.
            equilibriumMaxK: (body as any).equilibriumTempMaxK,
            // Day, night and peak are derived in EQUILIBRIUM space and mapped to the surface here, so
            // the greenhouse, tidal, radiogenic, internal and self-luminous terms are added by the one
            // function that owns them instead of being re-implemented against a scaled amplitude.
            composeSurfaceAt: compose,
            pressureBar: body.atmosphere?.pressure_bar ?? 0,
            rotationHours: body.rotation_period_hours,
            tidallyLocked: body.tidallyLocked,
            starTidallyLocked: body.starTidallyLocked,
            orbitalPeriodHours: (body.orbital_period_days ?? 0) * 24,
            // The eccentricity that drives SEASONS is the one that moves the body relative to its
            // STAR, which is not the same as `orbit.elements.e` — that describes the orbit about the
            // body's IMMEDIATE HOST. For a barycentre member that host is the barycentre, so Pluto
            // was handed its 6-day mutual orbit about Charon instead of its 248-year one about the
            // Sun, and Rocheworld's two lobes (own e = 0, on a barycentre at e = 0.25) got no
            // eccentric term at all. A moon had the same fault more mildly: Luna was handed its
            // orbit about Earth rather than Earth's about the Sun.
            //
            // The engine already knows the right answer and computes it a few lines above:
            // `calculateEquilibriumTemperatureRange` walks the whole chain to the star
            // (`distanceRangeBetweenNodes`) and gives the true peri/apo flux. Recover the effective
            // eccentricity from it rather than adding a second walk — T scales as d^(-1/2), so
            // d_max/d_min = (T_max/T_min)^2, and e = (d_max - d_min)/(d_max + d_min). For a plain
            // planet this returns its own eccentricity exactly.
            eccentricity: effectiveOrbitEccentricity(body),
            // ONE FIELD. `axial_tilt_deg` is the axial tilt everywhere else — 77 sites, including the
            // editor, the renderers and `satelliteFrame`'s moon-plane rule — while `obliquity_deg` was
            // a second name for the same quantity read ONLY here. The bundled data sets only the
            // first, so this read was undefined for every body in both maps and the seasonal term fell
            // back to its 25° default: Earth's seasons computed at 25° rather than 23.44, Uranus's at
            // 25° rather than 97.77, Venus's at 25° rather than 177.36. Meanwhile the ubox importer
            // set only `obliquity_deg`, so ITS bodies had seasons but no visible tilt and no satellite
            // framing — the same split, landing the other way up. `importFixup` recovers the legacy
            // field into this one on load, so nothing already saved loses its tilt.
            obliquityDeg: body.axial_tilt_deg,
            hasLiquidOcean: surfaceLiquidWater,
            tidalRawIndex,
            iceFrac: makeupFractions(body).ice
        });
        const modelledCompose = (teqK: number) => composeModelledSurfaceTemperature(body, teqK);
        let { profile, tags: tempTags, meanExactK } = buildProfile(modelledCompose);
        const surfacePin = body.overrides?.surfaceTempK;
        if (typeof surfacePin === 'number' && Number.isFinite(surfacePin) && surfacePin >= 0 && meanExactK > 0) {
            const scale = surfacePin / meanExactK;
            ({ profile, tags: tempTags } = buildProfile((teqK: number) => modelledCompose(teqK) * scale));
        }
        for (const key of tempTags) emit(body.tags, { key });
        body.temperatureProfile = profile;
        body.temperatureRangeK = { min: profile.totalMinK, max: profile.totalMaxK };

        // NO ATMOSPHERE-RETENTION CHECK HERE, DELIBERATELY, AND THIS COMMENT IS THE POINT.
        // A block here computed `retainsAtmosphere` from magnetic field against stellar flux — and
        // NOTHING READ THE RESULT. It had been dead since whenever the real model landed, and it was
        // convincing enough that I first "fixed" it by adding belt flux to it before noticing the
        // variable was never used. Deleted rather than fixed.
        //
        // The LIVE model is `physics/atmosphere.ts`, which does the same job properly: thermal (Jeans)
        // escape plus non-thermal XUV and stellar-wind erosion, scaled by magnetic shielding. That is
        // where an atmosphere-stripping question belongs, and where belt bombardment should go if it
        // is ever modelled as a stripping term (it is a real mechanism — see PHY-15 — but adding it
        // to a dead branch would have looked like progress and changed nothing).
    }

    // Nodes ordered so that a parent always comes before its children. Used by pass 2b, where a
    // moon asks its host whether it sits inside a magnetosphere — a question that must not be
    // answered from the host's PREVIOUS field. Depth is capped so a malformed parent cycle in
    // imported data degrades to "order unchanged" rather than recursing forever.
    private parentFirstOrder(nodes: (CelestialBody | Barycenter)[]): (CelestialBody | Barycenter)[] {
        const byId = new Map(nodes.map((n) => [n.id, n]));
        const cache = new Map<string, number>();
        const depthOf = (node: CelestialBody | Barycenter, guard: number): number => {
            const seen = cache.get(node.id);
            if (seen !== undefined) return seen;
            const parent = node.parentId ? byId.get(node.parentId) : undefined;
            const d = !parent || guard >= 24 ? 0 : depthOf(parent, guard + 1) + 1;
            cache.set(node.id, d);
            return d;
        };
        // Stable sort, so bodies at the same depth keep their file order.
        return [...nodes].sort((a, b) => depthOf(a, 0) - depthOf(b, 0));
    }

    // PASS 2b — interior fluid layers and the magnetism they drive.
    //
    // This used to live inside processClassification (pass 3), one whole pass after the radiation
    // model that reads its output. That was inbox B13: the first process() shielded a body with
    // whatever field was authored or left over, every later one shielded it with the derived field,
    // and since process() runs on load AND after every edit the dose a GM read depended on how many
    // times the system had been through.
    //
    // It is safe HERE and nowhere earlier. deriveFluidLayers reads the composed surface temperature
    // and the heat terms, and deriveMagnetism reads the reconciled spin and the equilibrium
    // temperature (the giant helium-rain factor) — all of them committed by the end of pass 2a, none
    // of them written later. It is NOT safe before the thermal solve: the solve produces the
    // temperature the layers are judged at, so moving it up would be a circular read, not an
    // ordering tweak. See the entry for the one edge that remains (atmospheric escape).
    private processInterior(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack) {
        if (body.roleHint !== 'planet' && body.roleHint !== 'moon') return;

        // Fluid layers (surface/subsurface oceans, interior conductive) — feed classification
        // (subsurface-ocean), apparent colour and the §2d dynamo below.
        // Write the derived layers ALWAYS, including an empty set. Guarding on `.length` meant that
        // when a body stopped having any fluid layer, the previous pass's layers were left on it.
        body.hydrosphere = { ...(body.hydrosphere || {}), layers: deriveFluidLayers(body, pack) };

        // Magnetism profile (§2d) — descriptive read of the dynamo from interior conductive layers
        // + rotation. A salty subsurface ocean only induces a field when the moon sits inside a
        // giant host's magnetosphere, so this asks the host — hence the parent-first iteration.
        let insideHostMagnetosphere = false;
        if (body.roleHint === 'moon' && body.parentId) {
            const host = allNodes.find((n) => n.id === body.parentId) as CelestialBody | undefined;
            if (host && host.kind === 'body') {
                const hostMassMe = (host.massKg ?? 0) / EARTH_MASS_KG;
                insideHostMagnetosphere =
                    hostMassMe > 50 || makeupFractions(host).gas > 0.5 || (host.magneticField?.strengthGauss ?? 0) >= 1;
            }
        }
        body.magnetism = deriveMagnetism(body, { insideHostMagnetosphere });
        // The field STRENGTH derives from the model (rotation + composition + core size) unless the GM
        // has pinned one (F-OVR: `overrides.magneticFieldGauss`). So spinning a world up or making it
        // metal-rich changes its field, and a small iron-cored world like Mercury gets a tenuous field
        // instead of nothing. A pinned value is committed verbatim and overrides the tag below.
        //
        // G37: this used to test `magneticField.manual`, a flag that said the same thing as an
        // `overrides` key in a second vocabulary — so the one pinned value in the engine that did not
        // live in `body.overrides` was invisible to everything that enumerates what a GM has pinned.
        // The pin is now re-read from the override on every pass, which also makes the committed field
        // a purely DERIVED value that the save strip can drop.
        const pinnedGauss = body.overrides?.magneticFieldGauss;
        body.magneticField = {
            strengthGauss: typeof pinnedGauss === 'number' && Number.isFinite(pinnedGauss)
                ? pinnedGauss
                : +body.magnetism.nominalGauss.toFixed(4)
        };
        body.tags = stripForReprocess(body.tags, ['magnetic/']);
        // The shielding tag reconciles with the field the GM sees: 0 → unshielded, a whisker → tenuous
        // (Mercury), induced ocean → induced, a manual field with no interior source → anomalous, else a
        // dynamo. A manual value overrides the derived one.
        // OUT OF CLASS IS A STATUS, NOT A REFUSAL (G37). A pinned field the interior model could
        // never produce — the owner's 70 tesla terrestrial — is kept, saved and drives the shielding
        // exactly as a real one would, and it says so: `magnetic/anomalous` rather than
        // `magnetic/dynamo`, which would be the engine claiming an interior source it has not found.
        // The band is the dynamo's own `estimatedRangeGauss`, so this asks the model rather than a
        // constant, and a body whose interior genuinely could make that field keeps its dynamo tag.
        const magBand = body.magnetism.estimatedRangeGauss;
        const outOfClass = typeof pinnedGauss === 'number' && !!magBand
            && Number.isFinite(magBand.min) && Number.isFinite(magBand.max)
            && (pinnedGauss < magBand.min || pinnedGauss > magBand.max);
        const shieldTag = magneticShieldingTag(body.magnetism, body.magneticField, typeof pinnedGauss === 'number');
        emit(body.tags, {
            key: outOfClass && shieldTag === 'magnetic/dynamo' ? 'magnetic/anomalous' : shieldTag
        });
    }

    // THE RADIATION HAZARD TAGS, for every body whose dose describes a place you could actually be
    // (inbox B11). They used to sit inside the geology branch of processClassification, which meant
    // two gates neither of which was about radiation: the method returns early for anything that is
    // not a planet or a moon, and the branch itself requires a solid-surfaced rocky body. So a RING
    // carrying the loudest dose in its system — Jupiter's Rings at 360 Sv/day, above Io — came out
    // with no hazard tag at all, and nothing to filter or warn on.
    //
    // The gate is `radiationPlace`, which is B26's decision and is now the only copy of it: 'surface'
    // and 'in the ring plane' are real places and get the tag; 'at 1 bar' is a giant's notional level
    // and does not, which is B22's and B18's answer preserved exactly. Nothing here is a new
    // derivation — the doses were already computed for these bodies in pass 2c, and the bucketing is
    // radiationHazardBucket, the one B28 unified.
    private applyRadiationHazardTags(body: CelestialBody, pack: RulePack) {
        body.tags = stripForReprocess(body.tags, [RADIATION_HAZARD_TAG, ORBITAL_RADIATION_TAG]);
        if (radiationPlace(body) === 'at 1 bar') return;   // no place to stand: no hazard tag (B18/B22)

        // The VALUE is a time word — how long a character standing here survives — because sieverts
        // per year are unreadable at a table and "hours" is not (inbox B30). Derived (LD50 / dose
        // rate) rather than tabulated, and bucketed rather than left as a raw float.
        const surfaceBand = radiationHazardBucket(body.surfaceRadiation ?? 0, pack);
        if (!body.tags.some((t) => t.key === RADIATION_HAZARD_TAG)) {
            body.tags.push({ key: RADIATION_HAZARD_TAG, value: surfaceBand });
        }
        // ORBITAL radiation gets its own tag, but ONLY when it is news (inbox B31). Where do we park
        // is a real decision and nothing surfaced it: Earth's ground is background while the space
        // around it, inside the Van Allen belts, is days-to-lethal. Same gate the info block uses for
        // the second row, so a body whose two figures agree does not carry two tags saying the same
        // thing — which is also why a RING gets one tag and not two: for a ring the two places
        // coincide and the figures are identical to the last digit.
        const orbitalDose = (body as any).orbitalRadiation;
        const orbitalBand = typeof orbitalDose === 'number' ? radiationHazardBucket(orbitalDose, pack) : null;
        // News means a DIFFERENT WORD, not merely a bigger number. Titan's orbital dose is 2.8x its
        // surface one and both are background — a second tag saying "background" beside the first is
        // noise. Earth is the case worth carrying: background on the ground, days in the space above.
        if (orbitalBand && orbitalBand !== surfaceBand
            && (orbitalDose as number) > (body.surfaceRadiation ?? 0)
            && !body.tags.some((t) => t.key === ORBITAL_RADIATION_TAG)) {
            body.tags.push({ key: ORBITAL_RADIATION_TAG, value: orbitalBand });
        }
    }

    // Rotational deformation (E4), for ANY body that has a spin and a density — which includes stars
    // (inbox B43). A spinning body bulges at its equator; past the density-set breakup spin it would
    // shed mass into a ring. DERIVED dynamically from bulk density and rotation period, so it tracks
    // either changing. Stored (both renderers draw the oblate shape) and surfaced as progressive
    // `shape/*` tags. Returns the spin fraction, which the classifier rules key on.
    //
    // Absence of a period reads as NO SPIN, not infinite spin (inbox B39) — `spinFraction` returns 0
    // for a missing or zero period, so a body with no rotation data is spherical rather than toroidal.
    private applyRotationalShape(body: CelestialBody): number {
        // A BELT IS NOT A BODY THAT SPINS — it is a debris field on a billion separate orbits, and
        // "the flattening of its bulk density" means nothing. The gate this was hoisted above says so
        // in its own comment (B11's pile-sort), so the exclusion has to be carried across explicitly
        // or the hoist quietly reintroduces what that gate was protecting. The derived-output
        // baseline is what caught it: belts and rings picked up an `oblateness` field.
        if (body.roleHint === 'belt' || body.roleHint === 'ring') return 0;
        const radiusM = (body.radiusKm || 0) * 1000;
        const volumeM3 = radiusM > 0 ? (4 / 3) * Math.PI * radiusM ** 3 : 0;
        const density_gcc = volumeM3 > 0 ? ((body.massKg || 0) / volumeM3) / 1000 : 0;
        const deform = rotationalDeform(body.rotation_period_hours ?? 0, density_gcc);
        body.oblateness = deform.oblateness;
        body.tags = stripForReprocess(body.tags, ['shape/']);
        if (deform.shape !== 'spherical') emit(body.tags, { key: `shape/${deform.shape}` });
        return deform.fraction;
    }

    private processClassification(body: CelestialBody, allNodes: (CelestialBody | Barycenter)[], pack: RulePack, rng: SeededRNG) {
        // The radiation hazard tags are NOT part of classification and must not inherit its gate —
        // a belt and a ring have real doses at real places. Everything below this line genuinely is
        // planet/moon work: fingerprint classification, the tectonic regime, surface age and the
        // rotational deformation all need a coherent solid body, and a diffuse debris field is not
        // one. See B11 for the pile-sort of what applies to a belt and what does not.
        this.applyRadiationHazardTags(body, pack);

        // AND NEITHER IS ROTATIONAL SHAPE — the same hoist, for the same reason (inbox B43). A body's
        // flattening is geometry from its SPIN and its DENSITY, and a star has both. It used to sit
        // below the planet/moon gate, so no star ever reached it: Vega rotates near breakup and is
        // genuinely ~20% oblate, and the engine drew it as a sphere.
        //
        // NOTE FOR ANYONE FOLLOWING B43's OWN DIAGNOSIS: it names `processEnvironment`'s
        // `roleHint === 'star'` early return as the blocker. That return is real, but it is not this
        // one — `rotationalDeform` is called inside processCLASSIFICATION, behind the gate below.
        const spinFraction = this.applyRotationalShape(body);

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
        // orbitsStar: this body orbits a star / stellar barycentre (a planet), not a planet (a moon).
        // (processEnvironment computes the same for the lock target; this pass has its own scope.)
        const parentNode = allNodes.find((n) => n.id === body.parentId);
        const orbitsStar = !!parentNode && (
            (parentNode.kind === 'body' && (parentNode as CelestialBody).roleHint === 'star') ||
            (parentNode.kind === 'barycenter' && ((parentNode as Barycenter).memberIds || []).some((mid) => {
                const m = allNodes.find((n) => n.id === mid); return m?.kind === 'body' && (m as CelestialBody).roleHint === 'star';
            }))
        );

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
            orbitsStar: orbitsStar ? 1 : 0,
            age_Gyr: this.systemAgeGyr,
            stellarType,
            // STARLIGHT, not the total incident flux (inbox B34). Every rule written against this
            // feature means "how hard is the star shining on it" — the pack's chthonian rule reads
            // `stellarIrradiation > 1000` for a world stripped to its core. Since B17 the total also
            // carries the trapped-belt particles of whatever magnetosphere the body sits in, so Io
            // was being offered to that rule at 26,279 Earth-flux, against 0.037 of actual sunlight.
            stellarIrradiation: body.starlightFlux || 0, // the star alone, ~1 at Earth
            totalIncidentFlux: body.totalIncidentFlux || 0, // + trapped belt, for rules that want it
            radiation_flux: body.surfaceRadiation || 0,
            tidalHeating: body.tidalHeatK || 0,
            Teq_K: body.equilibriumTempK || 0,
            // THE SURFACE MEAN, NOT THE RADIATING FIGURE (inbox B71, the fourth consumer). Seventeen
            // fingerprints key on this and every one of them asks a SURFACE question — `planet/ocean`
            // 255-370, `planet/ice` 0-190, `planet/desert` 260-360, `planet/eyeball` 255-320 — so a
            // field named SurfaceTemp_K carrying the temperature the body RADIATES at was PHY-2 with
            // seventeen consumers. The two diverge only with the day/night swing (Venus and Earth are
            // identical; Luna is 270 against 214 and Mercury 440 against 310), and the failure mode is
            // a body NEAR a band edge: an airless slow rotator radiating at 280 K with a surface mean
            // of 220 K matched `planet/ocean` and should not.
            // `body.temperatureK` is UNCHANGED and still feeds the thermal fixed point and every
            // emitter — this moves the FEATURE, not the field (PHY-19).
            SurfaceTemp_K: meanSurfaceTempK(body),
            orbital_period_days: body.orbital_period_days || 0,
            rotation_period_hours: Math.abs(body.rotation_period_hours || 0),
            tidallyLocked: body.tidallyLocked ? 1 : 0,
            // Eyeball worlds need STAR-lock: a permanent substellar point facing the star. A moon is
            // tidally locked to its PLANET, not the star, so its far side still cycles through stellar
            // day/night — it can never be an eyeball. orbitsStar is 0 for moons (they orbit a planet /
            // planet-moon barycentre), so this is 0 for them even when tidallyLocked is 1.
            starTidallyLocked: body.starTidallyLocked ? 1 : 0
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
        // Phase-gated coverage (liquids L2): the recorded coverage counts for ocean-family
        // classification ONLY when the solvent is actually liquid at the surface T & P — a hot or
        // airless world stops classifying as an ocean world just because it carries stale hydro data.
        {
            const hc = body.hydrosphere?.composition;
            const st = body.temperatureK ?? body.equilibriumTempK ?? 0;
            const liquid = hc && hc !== 'none' && phaseAtP(hc, st, body.atmosphere?.pressure_bar, pack) === 'liquid';
            features['hydrosphere.liquidCoverage'] = liquid ? (body.hydrosphere?.coverage ?? 0) : 0;
        }

        // Physics corrects an inconsistent makeup: a body at giant mass + low density cannot be
        // gas-free (a rock/ice world that massive would be far denser), so re-infer a volatile
        // envelope. This makes the two "is it a giant?" definitions agree — makeup, rendersAsGiant,
        // porosity and classification all then see the gas. (Composition round 2, seam fix.)
        const giantFix = reconcileGiantMakeup(body);
        if (giantFix) body.makeup = giantFix;

        // Interior makeup fractions (explicit body.makeup, else inferred from density) — so the
        // composition types (iron/silicate/coreless/carbon) classify on COMPOSITION, not a
        // fragile density band. (§2a)
        const mk = makeupFractions(body);
        features['makeup.metal'] = mk.metal;
        features['makeup.rock'] = mk.rock;
        features['makeup.carbon'] = mk.carbon;
        features['makeup.ice'] = mk.ice;
        features['makeup.gas'] = mk.gas;
        // Macroporosity (derived from massKg + radiusKm vs the mix's compacted density) — lets
        // the rubble-pile modifier key on actual void fraction, not a proxy density band.
        features['porosity'] = derivedPorosity(body);

        // Fluid layers (surface/subsurface oceans, interior conductive) — derived and committed in
        // pass 2b, because the radiation pass needs the magnetism they drive. Read, not re-derived:
        // a second evaluation of one question is exactly what the architecture rule forbids, and the
        // TAGS below are re-derived from this array every pass either way.
        const fluidLayers = body.hydrosphere?.layers ?? [];
        features['hasSubsurfaceOcean'] = fluidLayers.some((l) => l.location === 'subsurface') ? 1 : 0;

        // Structural tags (surfaced for GMs): a frozen icy shell, polar ice, a subsurface ocean, a
        // discrete cloud deck. The freeze point comes from the SOLVENT, not hard-coded water — so
        // a nitrogen/methane/CO₂ surface freezes by its own melt point.
        const surfTForStruct = body.temperatureK ?? body.equilibriumTempK ?? 0;
        const surfPbar = body.atmosphere?.pressure_bar;
        const hydroComp = body.hydrosphere?.composition;
        const hydroCov = body.hydrosphere?.coverage ?? 0;
        const surfaceDef = liquidDef(hydroComp, pack);
        // Pressure-aware surface phase of the recorded volatile (liquids L2): the tag set below is
        // driven by the ACTUAL phase at surface T & P, so stale hydrosphere data reads honestly.
        const surfacePhase = hydroComp && hydroComp !== 'none' ? phaseAtP(hydroComp, surfTForStruct, surfPbar, pack) : undefined;
        // A frozen surface is named for its volatile; an icy shell from makeup-ice is water ice.
        // BOTH branches need the ice to actually be ice HERE. The makeup branch used to have no
        // temperature gate at all, so a body that inferred an ice-rich interior got a frozen crust
        // painted on it whatever its surface was doing — an icy shell on a 582 K world. Ice-rich
        // interior and icy SHELL are different claims: a warm volatile-rich world has its water as
        // steam or a supercritical envelope, and those already have their own tags.
        const makeupIceIsSolid = phaseAtP('water', surfTForStruct, surfPbar, pack) === 'solid';
        const icyShell = (mk.ice > 0.3 && makeupIceIsSolid) || (surfacePhase === 'solid' && hydroCov > 0.05);
        const iceLabel = surfacePhase === 'solid' ? (hydroComp as string) : 'water';
        // Cloud-deck + precipitation tags are OWNED by applyCloudDeckTags below (it strips its own
        // auto tags and keeps manual ones) — exempt them from this blanket strip or a GM's manual
        // deck would be deleted every pass.
        // survivesRederive() is the outer guard rather than a rewrite of the exemption list below,
        // because the two protect different things: the list exempts keys ANOTHER pass owns
        // (applyCloudDeckTags strips its own), while survivesRederive exempts tags NO pass can
        // re-create — a GM's hand-added `structure/*` among them.
        body.tags = (body.tags || []).filter((t) => survivesRederive(t)
            || (t.key === CLOUD_DECK_TAG || t.key === PRECIPITATION_TAG
             || t.key === LIGHTNING_TAG || t.key === DUST_STORM_TAG || t.key === MONSOON_TAG)
            || (!t.key.startsWith('structure/') && t.key !== 'climate/polar-ice'
                && !t.key.startsWith('hydrosphere/') && t.key !== 'climate/steam-world'
                && t.key !== 'activity/sublimating' && t.key !== 'activity/cryovolcanism'));
        if (icyShell) body.tags.push({ key: 'structure/icy-shell', value: iceLabel });
        if (fluidLayers.some((l) => l.location === 'subsurface')) body.tags.push({ key: 'structure/subsurface-ocean' });

        // Hydrosphere PHASE tags: what the recorded surface volatile actually is at this T & P.
        if (hydroComp && hydroComp !== 'none' && hydroCov > 0.01) {
            const conductive = fluidLayers.some((l) => l.location === 'surface' && l.liquid === hydroComp) && (surfaceDef?.conductive ?? false);
            if (surfacePhase === 'liquid') {
                body.tags.push({ key: conductive ? 'hydrosphere/brine' : 'hydrosphere/ocean', value: hydroComp });
            } else if (surfacePhase === 'solid') {
                body.tags.push({ key: 'hydrosphere/frozen', value: hydroComp });
            } else if (surfacePhase === 'supercritical') {
                body.tags.push({ key: 'structure/supercritical-envelope', value: hydroComp });
            } else if (surfacePhase === 'gas') {
                body.tags.push({ key: 'hydrosphere/boiled-off', value: hydroComp });
                // A boiled ocean still held aloft by real pressure reads as a steam world.
                if ((surfPbar ?? 0) >= 0.5 && (hydroComp === 'water' || hydroComp === 'salty-water')) {
                    body.tags.push({ key: 'climate/steam-world' });
                }
            }
        }

        // Sublimation: surface ices below their triple pressure, warming toward their melt point,
        // pass straight to vapour — the outgassing that raises a comet's coma. Keyed on an ice-rich
        // makeup or a frozen volatile in a near-vacuum, warm enough to be active.
        const subT = body.temperatureRangeK?.max ?? surfTForStruct;
        const iceSublimes = surfaceDef && (surfPbar ?? 0) < (surfaceDef.tripleBar ?? 0) && subT > surfaceDef.meltK * 0.6;
        if ((iceSublimes || (mk.ice > 0.3 && (surfPbar ?? 0) < 1e-4 && subT > 120)) && subT < (surfaceDef?.boilK ?? 400) + 200) {
            body.tags.push({ key: 'activity/sublimating' });
        }
        // Cryovolcanism: an icy, frozen-surfaced world with active interior heat driving melt eruptions.
        // Needs a solid, differentiated body: exclude gas/ice giants (no crust to vent through) and
        // sub-round lumps below the ~200 km limit (a tidally-shredded moonlet like Phobos can't cryovolcano).
        const cryoHeat = (body.tidalHeatK ?? 0) > 1 || (body.radiogenicHeatK ?? 0) > 2 || (body.internalHeatK ?? 0) > 4;
        if (mk.ice > 0.2 && surfacePhase !== 'liquid' && cryoHeat && hasSolidSurface(body) && (body.radiusKm ?? 0) >= HYDROSTATIC_MIN_RADIUS_KM) {
            body.tags.push({ key: 'activity/cryovolcanism' });
        }

        // Polar ice: liquid at the MEAN, but the cold extreme (poles / night side) dips below the
        // solvent's freezing point → partial frozen caps even on a temperate world (Earth, Mars).
        const meltK = surfaceDef?.meltK ?? 273;
        if (surfacePhase === 'liquid' && hydroCov > 0.1 && (body.temperatureRangeK?.min ?? surfTForStruct) < meltK) {
            body.tags.push({ key: 'climate/polar-ice', value: hydroComp as string }); // the surface liquid, frozen at the poles
        }
        // Geological activity (tectonics + volcanism by MECHANISM) — the biosphere keystone. Uses
        // makeup (radiogenic budget + iron core), mass/radius (cooling rate), system AGE (radiogenic
        // decay), surface water (mobile vs stagnant lid) and tidal tags (Io/Europa). Adds a
        // geology/* tag and feeds habitability (carbonate–silicate climate regulation).
        body.tags = stripForReprocess(body.tags, ['geology/']);
        // Gas/ice giants have no solid surface → no tectonic regime; skip them.
        if (hasSolidSurface(body) && (body.roleHint === 'planet' || body.roleHint === 'moon')) {
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
                teqK: body.equilibriumTempK,
                // A GM radiogenic-heat override boosts the geothermal vigor, so cranking the slider can
                // wake a dead world (or intensify an active one) and change its geology/* tag.
                radiogenicOverrideK: body.radiogenicHeatK ?? 0
            });
            for (const key of body.geoActivity.tags) emit(body.tags, { key });
            // Surface age (Gyr the visible surface has been exposed) drives cratering / weathering /
            // tholin build-up. Bucketed into a coarse tag for filtering; the number lives on geoActivity.
            body.tags = stripForReprocess(body.tags, ['surface/age']);
            const sAge = body.geoActivity.surfaceAgeGyr;
            const ageBucket = sAge < 0.1 ? 'young' : sAge < 1 ? 'moderate' : sAge < 3 ? 'old' : 'ancient';
            emit(body.tags, { key: 'surface/age', value: ageBucket });
            // Irradiation dose (space weathering) — stellar UV + cosmic-ray floor, unshielded, over the
            // surface's exposure time. Drives tholin darkening (with retained organics as the precursor).
            body.tags = stripForReprocess(body.tags, ['surface/irradiation']);
            body.irradiationDose = deriveIrradiationDose(
                body.equilibriumTempK ?? body.temperatureK ?? 0,
                body.radiationShieldingMag ?? 0,
                sAge
            );
            const doseBucket = body.irradiationDose < 0.05 ? 'low' : body.irradiationDose < 0.2 ? 'moderate' : 'high';
            emit(body.tags, { key: 'surface/irradiation', value: doseBucket });
            // RADIATION HAZARD — the bucketed ANNUAL DOSE, which is a different question from the
            // space-weathering total above and had no tag of its own at all. So a GM scanning or
            // filtering tags saw "Space weathering: low" on Io and nothing to say its surface takes
            // 36 Sv a DAY: an appearance driver standing in for a hazard reading (inbox B28). The
            // weathering figure is NOT changed — Io's 0 is correct for what it measures, because
            // volcanism resurfaces the world faster than anything can accumulate on it.
            // Only a body with a SOLID SURFACE gets this, for the reason B18 gave about habitability
            // and B22 about the row label: a giant has no ground, so its figure is a 1-bar reading
            // and a "surface hazard" tag would be the same category error. Giants are already
            // excluded by the branch this sits in.
            // The VALUE is a time word — how long a character standing here survives — because
            // sieverts per year are unreadable at a table and "hours" is not (inbox B30). It is
            // derived (LD50 / dose rate) rather than tabulated, and bucketed rather than left as a
            // raw float, which is the architecture doc's idiom and closes the tension [[A35]] flags.
            features['geoActive'] = body.geoActivity.active ? 1 : 0;
            features['plateTectonics'] = body.geoActivity.regime === 'plate-tectonics' ? 1 : 0;
        } else {
            body.geoActivity = undefined;
            features['geoActive'] = 0;
            features['plateTectonics'] = 0;
        }

        // GEOLOGY RUNS BEFORE THE WEATHER, and that ordering is load-bearing: deriveWeather's
        // lightning term reads geology/plate-tectonics and tidal/volcanism as its convection driver,
        // and those tags are emitted HERE. With geology below the weather it was reading the
        // PREVIOUS process() run's tags, so Earth's sky went from frequent lightning on a fresh
        // load to constant on the next pass (inbox B13).

        // CLOUD DECKS + PRECIPITATION — the single evaluation (physics→tags→visuals; see
        // docs/dev/cloud-decks-design.md). Which gases condense, what they condense into, and what
        // reacts to form what is all rule-pack DATA. Renderers read only the tags emitted here.
        // Gas giants keep their legacy look for now (E6 — they join the deck stack in their own
        // change), but their tags are still emitted so the data is ready.
        const cloudDecks = deriveCloudDecks(body, pack);
        body.tags = applyCloudDeckTags(body.tags, cloudDecks, deriveWeather(body, cloudDecks, pack));

        // POLAR VORTEX — a gas giant's geometric polar jet stream (Saturn's hexagon). Too emergent to
        // predict from bulk params, so spawn it procedurally: most giants develop one, side count 5–8
        // (6 = the Saturn hexagon, the commonest). Deterministic on the body id so it's stable across
        // re-runs. Re-derived → strip any prior auto copy but keep a user's manual one.
        body.tags = stripForReprocess(body.tags, ['feature/polar-vortex']);
        if (mk.gas > 0.5 && !body.tags.some((t) => t.key === 'feature/polar-vortex') && hash01(`${body.id}|vortex`) < 0.7) {
            const sides = [5, 6, 6, 6, 7, 8][Math.floor(hash01(`${body.id}|vsides`) * 6) % 6];
            body.tags.push({ key: 'feature/polar-vortex', value: String(sides) });
        }

        // Ring system — DERIVED from geometry (does the body host ring children?), not hand-tagged.
        // One ring → "ringed"; more than one → "multiple rings". Each ring's debris mass sorts it into
        // a light / medium / heavy tier (log scale, same as the orrery disc); the DISTINCT tiers present
        // are surfaced, so a heavy ring beside a faint one reads as both.
        body.tags = stripForReprocess(body.tags, ['ring/']);
        const ringChildren = allNodes.filter(
            (n) => n.kind === 'body' && (n as CelestialBody).roleHint === 'ring' && n.parentId === body.id
        ) as CelestialBody[];
        if (ringChildren.length) {
            emit(body.tags, { key: 'ring/system' });
            if (ringChildren.length > 1) emit(body.tags, { key: 'ring/multiple' });
            const tiers = new Set<string>();
            for (const r of ringChildren) {
                const me = (r.massKg ?? 0) / EARTH_MASS_KG;
                const d = me > 0 ? Math.max(0, Math.min(1, (Math.log(me) - Math.log(1e-5)) / (Math.log(1) - Math.log(1e-5)))) : 0.5;
                tiers.add(d < 1 / 3 ? 'light' : d < 2 / 3 ? 'medium' : 'heavy');
            }
            for (const tier of ['light', 'medium', 'heavy']) if (tiers.has(tier)) emit(body.tags, { key: `ring/${tier}` });
        }

        // (Magnetism used to be derived HERE, a whole pass after the radiation model that reads it.
        //  It now lands in pass 2b — see processInterior. Inbox B13.)

        // Rotational deformation is computed ABOVE the planet/moon gate now (see applyRotationalShape),
        // because a star flattens too. Its spin fraction is carried down for the classifier rules that
        // key on it — the ellipsoid and toroidal classes below.
        features['spinFraction'] = spinFraction;

        // Auroras (Phase G viz driver): atmosphere + magnetosphere + incident ionising flux → a polar
        // glow, graded faint→brilliant. Derived here (after magnetism + radiation + atmosphere are all
        // final); the numeric strength rides on the tag value so the renderer can scale the curtain.
        body.tags = stripForReprocess(body.tags, ['aurora/']);
        const aurora = deriveAurora(body);
        if (aurora.tier) emit(body.tags, { key: `aurora/${aurora.tier}`, value: aurora.strength.toFixed(2) });
        // Resolve the emission-colour bands from the pack's gas data (data-driven, editable) onto the
        // body so every renderer reads the same colours without needing the rule pack.
        body.auroraEmitters = body.atmosphere ? resolveAuroraEmitters(body, pack) : undefined;


        // Volatile-ice retention (which ices survive on the surface as frost/bright ice) — the physics
        // base for frost/tholin/bright-ice visuals. Cold trap (surface below the ice's melt point) +
        // gravity trap (Jeans λ holds the sublimated vapour). Solid surfaces only; giants excluded.
        // NOTE the pushes below are deliberately NOT guarded by emit(): `volatiles/ices` is one of the
        // keys a body legitimately carries several times (one per species), so a GM's manual ice sits
        // ALONGSIDE the derived ones rather than suppressing them.
        body.tags = stripForReprocess(body.tags, ['volatiles/']);
        if (hasSolidSurface(body) && (body.roleHint === 'planet' || body.roleHint === 'moon') && body.massKg && body.radiusKm) {
            body.volatiles = deriveVolatileRetention({
                massKg: body.massKg,
                radiusKm: body.radiusKm,
                surfaceTempK: body.temperatureK ?? body.equilibriumTempK ?? 0,
                equilibriumTempK: body.equilibriumTempK ?? body.temperatureK ?? 0,
                // Availability: a condensed-ice inventory (bulk ice / icy shell / hydrosphere) for the
                // water + supervolatiles; active silicate volcanism (Io) for the SO2 frost source.
                iceBearing: mk.ice > 0.05 || icyShell || (body.hydrosphere?.coverage ?? 0) > 0.05,
                volcanic: body.geoActivity?.regime === 'tidal-volcanic'
            }, pack);
            // ONE TAG PER SPECIES, not a delimited list in one value. "One tag, one value; no
            // delimited mini-formats" is the architecture doc's idiom, and a body legitimately
            // having several of a thing is exactly the case it sanctions emitting the key more than
            // once (structure/cloud-deck already does). A chip reading
            // "carbon-dioxide+nitrogen+water+methane" is also simply unreadable. (inbox B29)
            for (const species of body.volatiles.retained) {
                body.tags.push({ key: 'volatiles/ices', value: species });
            }
        } else {
            body.volatiles = undefined;
        }

        // Re-run Classification
        // Note: This might override manual class changes if not careful.
        // We should probably only classify if classes are empty or if we want to force update.
        // For now, we update to ensure consistency with physics.
        // Derived apparent (true) colour from makeup + atmosphere + cloud decks + temperature.
        // The host star's photosphere temperature drives liquid shades (#8) — walk up the parent
        // chain to the nearest star (fall back to the most massive star in the system).
        let hostStarTempK: number | undefined;
        let hostStar: CelestialBody | undefined;
        {
            let cur: any = body;
            for (let hops = 0; cur?.parentId && hops < 10; hops++) {
                cur = allNodes.find((n) => n.id === cur.parentId);
                if (cur && (cur as any).roleHint === 'star') { hostStar = cur as CelestialBody; hostStarTempK = photosphereTempK(cur as any); break; }
            }
            if (hostStarTempK === undefined) {
                const brightest = allNodes
                    .filter((n: any) => n.kind === 'body' && n.roleHint === 'star')
                    .sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0))[0] as any;
                hostStar = brightest;
                // NOT `brightest?.temperatureK` — a star with no stored temperature has its
                // photosphere temperature derived from its own luminosity and radius rather than
                // silently becoming the Sun. See photosphereTempK.
                hostStarTempK = photosphereTempK(brightest);
            }
        }
        // SURFACE OXIDATION — why Mars is red and the Moon, with the same iron and age but no
        // oxidiser, is grey. Must run AFTER geoActivity (it needs the surface AGE) and before the
        // apparent colour below, which reads the tag.
        body.tags = stripForReprocess(body.tags, [OXIDISED_TAG]);
        if (!body.tags.some((t) => t.key === OXIDISED_TAG)) {
            const rust = deriveOxidation(body);
            if (rust) body.tags.push({ key: OXIDISED_TAG, value: rust });
        }
        // SURFACE SPECTRUM + THE LOOK OF ITS LIFE. This is ONE derivation with TWO consumers: the
        // pigment model reads its photon counts, the presentation layer reads its colour. It runs
        // HERE — after the atmosphere and cloud decks are final (they are the filter) and BEFORE the
        // apparent colour, which consumes the vegetation tint. Nothing below it may write anything
        // it reads (PHY-1).
        //
        // TAG-6 — `biodiversity/` has exactly ONE owning pass and this is it, cleared once, here,
        // not per branch.
        // Read a GM's PINNED pigment before the clear — `stripForReprocess` keeps a manual tag, so
        // this survives anyway, but reading it first makes the override an INPUT to the derivation
        // rather than a second answer sitting beside it. Same shape as a manual cloud deck.
        const pinnedPigment = body.tags?.find((t) => t.key === 'biodiversity/pigment' && t.manual)?.value;
        body.tags = stripForReprocess(body.tags, ['biodiversity/']);
        body.surfaceSpectrum = undefined;
        body.vegetation = undefined;
        // The full sampled curves are used HERE and then dropped — only the summary rides on the
        // body. Three 113-element arrays per body is ten thousand lines on the Sol fixture and rides
        // every save and every broadcast, for a value the same function rebuilds on demand.
        let spectrumCurves: SurfaceSpectrumCurves | undefined;
        if (hostStar && hostStarTempK) {
            const distAU = calculateDistanceToStar(body, hostStar, allNodes);
            const spectrum = deriveSurfaceSpectrum(body, {
                starTempK: hostStarTempK,
                luminositySolar: hostStar.radiationOutput ?? 1,
                distanceAU: distAU
            }, pack);
            body.surfaceSpectrum = spectrum?.summary;
            spectrumCurves = spectrum?.curves;
        }
        if (body.biosphere && hasSolidSurface(body)) {
            // Seeded on the BODY ID, one stream per named purpose (DATA-G1) — the shared per-run rng
            // would move every saved seed's answer the moment anyone inserted a draw above it. The
            // draw itself is the MODEL, not a placeholder: without an evolutionary history a real
            // biosphere's outcome genuinely is contingent.
            body.vegetation = deriveVegetation(body, spectrumCurves, {
                roll: (purpose: string) => hash01(`${body.id}|veg|${purpose}`),
                pinnedPigment
            }, pack);
        }
        if (body.vegetation) {
            const veg = body.vegetation;
            // PHY-2 — WHAT each tag measures, WHERE, IN WHAT UNITS:
            //   biodiversity/pigment        the pigment the world SETTLED ON (a key, not a colour) —
            //                               the most extensive pigment-driven layer's
            //   biodiversity/land-cover     percent OF THE LAND showing any life colour — the UNION
            //                               of the painted layers, never the sum of the sliders
            // Only the pigment this world SETTLED ON. The rest of the viable set is still derived and
            // still rides on body.vegetation.ranked — the Bio tab's picker lists it — but it is not
            // worth six tags of clutter on every living world to say what a dropdown already says.
            if (veg.pigment) emit(body.tags, { key: 'biodiversity/pigment', value: veg.pigment });
            if (veg.visibleCover > 0.005) {
                emit(body.tags, { key: 'biodiversity/land-cover', value: `${Math.round(veg.visibleCover * 100)}%` });
            }
            // A world whose lit morphology has taken essentially all of its land is a planet-wide
            // city. It needs no rule of its own — it is the ordinary coverage number reaching its
            // end — but it deserves a name, because at that point the world IS the settlement.
            const lit = veg.layers.filter((l) => l.light > 0.001);
            if (lit.length) {
                const most = Math.max(...lit.map((l) => l.coverage));
                emit(body.tags, { key: 'biodiversity/settled', value: `${Math.round(most * 100)}%` });
                if (most >= 0.95) emit(body.tags, { key: 'biodiversity/ecumenopolis' });
            }
        }

        // HOW FAR YOU CAN SEE. The same optical depth the spectrum above just used, turned on its
        // side — a sky is dim overhead and a horizon is lost for the same reason. It runs here
        // because it needs the atmosphere AND the cloud decks final, which they are by now.
        //
        // TAG-6 — `visibility/` has exactly ONE owning pass and this is it.
        // Emitted ONLY when the air actually gets in the way, so the tag's PRESENCE means occlusion.
        // A clear sky and an airless rock are both "nothing between you and it", and tagging every
        // world in the map with that would be the clutter, not the information.
        body.tags = stripForReprocess(body.tags, ['visibility/']);
        const sight = deriveVisibility(body, pack);
        if (sight.band !== 'clear' && sight.band !== 'airless') {
            emit(body.tags, { key: `visibility/${sight.band}`, value: distanceWords(sight.rangeM) });
        }

        // The apparent colour is lit by the SAME spectrum the pigment model read — one derivation,
        // two consumers, which is the whole point of computing a surface spectrum at all.
        const apparent = deriveApparentColorParts(body, pack, {
            starTempK: hostStarTempK,
            surfaceLight: spectrumCurves?.surface,
            // Cloud tops and haze are lit by the light ABOVE the weather, not by what got through it.
            topLight: spectrumCurves?.topOfAtmosphere,
            // …and how much of the ground is visible at all follows from how much light gets down.
            transmission: body.surfaceSpectrum && body.surfaceSpectrum.totalTopWm2 > 0
                ? body.surfaceSpectrum.totalSurfaceWm2 / body.surfaceSpectrum.totalTopWm2
                : undefined
        });
        body.apparentColor = apparent;
        body.apparentColorHex = apparent.hex;

        // Expose the newly-derived subsystems as classifier FEATURES, so fingerprints can key on
        // them (biome worlds on a biosphere + climate, glaciated on ice + albedo, volcanic on the
        // geology regime, …). Still raw physics — no tag circularity.
        features['hasBiosphere'] = body.biosphere ? 1 : 0;
        // How far the most widespread LIT morphology has got, as a share of the land. Named for what
        // it measures rather than for `techno`, because the classifier must not know that a
        // particular morphology exists — a pack that adds a second lit kind gets this for free.
        features['settledCover'] = Math.max(0,
            ...((body.vegetation?.layers ?? []).filter((l) => l.light > 0.001).map((l) => l.coverage)));
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
        if (!hasSolidSurface(body)) {
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
                // THE FIELD SAYS SURFACE, SO IT IS HANDED THE SURFACE FIGURE (inbox B71). The profile
                // is committed several passes above this, so the mean is available here — unlike the
                // ocean gate, which produces it. Mercury's two answers are 130 K apart.
                surfaceTempKelvin: meanSurfaceTempK(body),
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

        // ASCENT COST, bucketed (inbox B31). It is arguably the single most actionable figure on a
        // rocky world — it decides whether a party can leave — and it had no tag, so it could not be
        // filtered or scanned for. Emitted HERE, in pass 4, because that is where the budget is
        // written; a tag in pass 3 would read the previous run's number, which is the whole of B13.
        // Solid surfaces only, for B18's reason: there is nothing to ascend FROM on a giant, and its
        // figure is measured from a notional 1-bar level.
        // Anchors: Luna 1.9 km/s trivial, Mars 4.1 moderate, Earth 10.4 hard, Venus 29.5 extreme.
        // The SAME predicate the info block, the report and the technical panel use (B37) -
        // this gate was the only one of the four that was already right, so it is now the one they
        // all share rather than the one that happens to agree.
        if (ascentBudgetApplies(body).applies) {
            body.tags = stripForReprocess(body.tags, [ASCENT_TAG]);
            const dv = body.loDeltaVBudget_ms ?? 0;
            if (dv > 0 && !body.tags.some((t) => t.key === ASCENT_TAG)) {
                const band = dv < 2000 ? 'trivial' : dv < 5000 ? 'moderate' : dv < 15000 ? 'hard' : 'extreme';
                body.tags.push({ key: ASCENT_TAG, value: band });
            }
        }
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

    // DELETED: a second copy of the flux sum. It spelled the same `radiationOutput / d^2` as
    // `calculateTotalStellarRadiation` in physics/radiation.ts, but was fed a DIFFERENT set of
    // sources - `roleHint === 'star'` here against `isLuminousSource` there, which also counts a
    // self-luminous brown dwarf. So a moon of a brown dwarf was irradiated for its temperature and
    // radiation and NOT for its atmosphere-retention check: the same question answered two ways.
    // There is now one function, and it owns the source set as well as the formula.

    private calculateHabitabilityAndBiosphere(planet: CelestialBody, rng: SeededRNG, pack: RulePack) {
        if (planet.roleHint !== 'planet' && planet.roleHint !== 'moon') return;

        // ONE clear, at the top of the pass that owns the namespace (inbox B38). It used to happen in
        // two places — the no-surface guard below and the main scoring path — which is how the two
        // branches came to disagree about hand-added tags: a rule applied to one was silently absent
        // from the other. The pass owns `habitability/*`, so the pass clears it, once, here.
        planet.tags = stripForReprocess(planet.tags, ['habitability/']);

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

        // --- THIS AXIS IS A SURFACE MODEL, so a body with no surface does not score on it (inbox
        //     B18). Every factor below is a surface condition — `surfaceScore` says so by name, and
        //     isEarthLike / isHumanHabitable all test what it is like to stand there. The proof that
        //     the model means "surface" is the SUBSURFACE NICHE further down: non-surface
        //     habitability is handled by ADDING an explicitly named niche with its own floor and its
        //     own tier, precisely because these factors cannot express it.
        //     A gas giant has no surface, and left to run it TRIVIALLY MAXIMISED the three factors
        //     that survive: its atmosphere.pressure_bar is pinned at the 1-bar cloud-top reference
        //     level (a deliberate simplification — see ARCHITECTURE.md), its "surface" radiation and
        //     "surface" gravity are evaluated at that same notional level, and its radius is the
        //     1-bar radius. Uranus, Neptune and Saturn each scored exactly 18 + 17 + 15 = 50 while
        //     scoring ZERO on temperature and solvent — the two factors worth half the total and the
        //     two that decide the question — putting them above Mars (8) and Enceladus (35).
        //     That is a category error, not a weighting problem; tuning the weights would have
        //     hidden it. Whether a giant's ENVELOPE deserves an aerial niche of its own, the way the
        //     subsurface ocean has one, is a separate design question and deliberately not answered
        //     here. Same gas test the geology model already uses, so the two agree on what a surface is.
        if (!hasSolidSurface(planet)) {
            planet.habitabilityScore = 0;
            emit(planet.tags, { key: 'habitability/none' });
            // The Bio tab still needs something to render, and "no surface to score" is a better
            // answer than a blank panel or a silent 50.
            planet.habitabilityBreakdown = {
                factors: [],
                surfaceScore: 0,
                modifiers: [{ label: 'No solid surface — surface habitability does not apply', delta: 0 }],
                finalScore: 0,
                tier: 'habitability/none'
            };
            return;
        }
    
        // REBALANCED weights (toward current astrobiology thinking): a liquid SOLVENT is the master
        // variable for life, with temperature gating it; atmosphere/radiation are retention/shielding
        // terms; GRAVITY is a weak direct constraint (life is robust across a wide range), so its
        // tolerance is widened and its weight trimmed. Weights still sum to 100 and Earth = 100.

        // Temperature (Max 25) — within the solvent's liquid range. Capture the band so the Bio tab
        // can show where this world sits (idealLo/idealHi = full marks, ±falloff = the score-zero edge).
        let tempIdealLo = 283, tempIdealHi = 298, tempFall = 40; // water default (10–25 °C)
        if (planet.hydrosphere?.composition === 'methane') { tempIdealLo = tempIdealHi = 111; tempFall = 30; }
        else if (planet.hydrosphere?.composition === 'ammonia') { tempIdealLo = tempIdealHi = 218; tempFall = 30; }
        // THE MEAN SURFACE TEMPERATURE, not the radiating one (inbox B71). "Is this world in the
        // solvent's liquid range" is a question about the ground, and the two figures diverge by 56 K
        // on Luna and 130 K on Mercury — a habitability score keyed on the wrong one is scoring a
        // world nobody could stand on.
        const surfaceMeanK = meanSurfaceTempK(planet);
        if (surfaceMeanK) {
            factors.temp = scoreFromPlateau(surfaceMeanK, tempIdealLo, tempIdealHi, tempFall);
        }
        score += factors.temp * 25;

        // Solvent (Max 25) — a standing LIQUID is the prerequisite, weighted by its BIO-SOLVENT
        // quality: water is ideal (1.0), hydrocarbons/ammonia are plausible alternatives (0.6),
        // everything else can't host life (0). Uses the fluid-layer model: a frozen ice cap is not
        // a surface solvent (its life potential is the subsurface ocean), so it scores 0 here.
        // Quality (water=1 / hydrocarbon-ammonia=0.6 / none=0) is weighted by a PRESENCE-first coverage
        // ramp: any standing liquid is high-value at once, so a little scores most of the marks and it
        // climbs to full by ~18% coverage — not a step where a 2% sea == a global ocean.
        const hasSurfaceLiquid = (planet.hydrosphere?.layers || []).some(l => l.location === 'surface');
        if (hasSurfaceLiquid) {
            factors.solvent = biosolventScore(planet.hydrosphere?.composition, pack)
                * solventCoverageWeight(planet.hydrosphere?.coverage ?? 0);
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
        if (regime === 'episodic') geoMod -= 25;              // catastrophic resurfacing + runaway greenhouse (Venus)
        else if (regime === 'stagnant-lid') geoMod -= 25;     // heat-trapping dry lid, no CO2 drawdown
        else if (regime === 'tidal-volcanic') geoMod -= 20;   // resurfaced too fast for surface life
        else if (regime === 'plutonic') geoMod -= 10;         // intrusive only → no surface outgassing/recycling
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
        const isHumanHabitable = factors.temp > 0.7 && factors.pressure > 0.6 && factors.solvent === 1 && planet.hydrosphere?.composition === 'water' && factors.radiation > 0.7 && factors.gravity > 0.6 && regime !== 'stagnant-lid' && regime !== 'episodic' && regime !== 'tidal-volcanic';
        const isAlienHabitable = planet.habitabilityScore > 40 && factors.solvent > 0; // needs SOME usable solvent
        const isSuperHabitable = planet.habitabilityScore > 100; // better-than-Earth (only super-habitable worlds)

        // (Cleared once at the top of the pass — B38.)

        let tier: string;
        if (isSuperHabitable) tier = 'habitability/super';
        else if (isEarthLike) tier = 'habitability/earth-like';
        else if (isHumanHabitable) tier = 'habitability/human';
        else if (subsurfaceHabitable) tier = 'habitability/subsurface';
        else if (isAlienHabitable) tier = 'habitability/alien';
        else tier = 'habitability/none';
        emit(planet.tags, { key: tier });

        // Store the AUTHORITATIVE breakdown so the Bio tab shows exactly this (one calc, not three):
        // the rebalanced surface factors AND the long-term geology/magnetism modifiers that the old
        // tab never saw — which is why a "good surface" can still score low.
        const tC = Math.round((planet.temperatureK ?? 0) - 273.15);
        const tempIdeal = planet.hydrosphere?.composition === 'methane' ? '−162 °C ±30'
            : planet.hydrosphere?.composition === 'ammonia' ? '−55 °C ±30' : '10–25 °C';
        const modifiers: { label: string; delta: number }[] = [];
        if (regime === 'episodic') modifiers.push({ label: 'Episodic resurfacing (runaway-greenhouse risk)', delta: -25 });
        else if (regime === 'stagnant-lid') modifiers.push({ label: 'Stagnant lid (no CO2 drawdown)', delta: -25 });
        else if (regime === 'tidal-volcanic') modifiers.push({ label: 'Tidal volcanism (resurfaced)', delta: -20 });
        else if (regime === 'plutonic') modifiers.push({ label: 'Plutonic (no surface outgassing)', delta: -10 });
        else if (regime === 'inactive') modifiers.push({ label: 'Geologically inactive (no recycling)', delta: -10 });
        if (planet.magnetism && !planet.magnetism.intrinsic && planet.magnetism.source === 'none') modifiers.push({ label: 'No magnetosphere (atmosphere stripping)', delta: -8 });
        if (superBonus > 0) modifiers.push({ label: 'Super-habitable bonus', delta: superBonus });
        if (subsurfaceHabitable) modifiers.push({ label: 'Subsurface-ocean niche (floor)', delta: SUBSURFACE_NICHE_SCORE - Math.round(surfaceScore + geoMod) });
        planet.habitabilityBreakdown = {
            factors: [
                { label: 'Temperature', points: +(factors.temp * 25).toFixed(1), max: 25, value: `${Math.round(planet.temperatureK ?? 0)} K (${tC} °C)`, ideal: tempIdeal,
                  range: { value: Math.round(planet.temperatureK ?? 0), lo: tempIdealLo - tempFall, idealLo: tempIdealLo, idealHi: tempIdealHi, hi: tempIdealHi + tempFall, unit: 'K' } },
                { label: 'Liquid solvent', points: +(factors.solvent * 25).toFixed(1), max: 25, value: hasSurfaceLiquid ? `${Math.round((planet.hydrosphere?.coverage ?? 0) * 100)}% ${planet.hydrosphere?.composition}` : 'no surface liquid (frozen?)', ideal: 'any surface liquid is high-value — presence matters more than amount; water scores best' },
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
