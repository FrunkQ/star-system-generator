import type { CelestialBody, Barycenter, RulePack } from "$lib/types";
import { AU_KM, SOLAR_RADIUS_KM, RADIATION_UNSHIELDED_DOSE_MSV_YR } from "$lib/constants";
import { calculateDistanceRangeToStar, calculateDistanceToStar } from "./temperature";
import { isLuminousSource } from "./substellar";

const FLARE_PARTICLE_WEIGHT = 0.5;   // how much a star's flare activity adds to the particle dose

// Cumulative high-energy IRRADIATION DOSE a surface has taken (relative, Earth-unshielded-young ≈ its
// low value) — the driver of THOLIN darkening (docs/dev/geo-foundations.md §Foundation 4). Space
// weathering reddens/darkens organic ices in proportion to how much radiation reaches the ground and
// for how long: stellar UV (∝ bolometric flux, from equilibrium temperature vs Earth's 255 K) plus a
// galactic-cosmic-ray FLOOR so distant, dimly-lit worlds still redden over Gyr (Pluto's tholins are
// GCR/solar-wind aged, not sunlight); times the unshielded fraction (a magnetosphere deflects the
// charged component); times how long the surface has been exposed (surface age). Necessary but not
// sufficient for tholins — the visual also needs the organic precursors (retained CH4/N2 ice).
const GCR_FLOOR = 0.15;              // galactic cosmic-ray / solar-wind background, relative to Earth UV
export function deriveIrradiationDose(teqK: number, magShield: number, surfaceAgeGyr: number): number {
  const uvRel = Math.pow(Math.max(0, teqK) / 255, 4);           // bolometric flux at orbit, Earth = 1
  const unshielded = 1 - Math.max(0, Math.min(0.99, magShield));
  const ageFactor = Math.max(0, Math.min(1.5, surfaceAgeGyr / 4.5)); // dose accumulates with exposure
  return +((uvRel + GCR_FLOOR) * unshielded * ageFactor).toFixed(3);
}


// THE HAZARD BUCKET — how dangerous the annual dose actually is, in mSv per year, at the level the
// figure describes (a solid surface, or a giant's 1-bar reference). This is the bucketed form of
// `surfaceRadiation`, and it is a DIFFERENT QUESTION from `deriveIrradiationDose` above: that one is
// a cumulative space-weathering total driving tholins, and Io reads 0 on it because volcanism
// resurfaces it faster than anything can accumulate. Zero is the right answer to that question and
// a lethal answer to this one, which is exactly why they need separate names and separate tags
// (inbox B28). ONE function so the tag and the info-block band cannot disagree.
//
// The boundaries are real reference points rather than round numbers:
//   background  < 10       Earth's natural background is ~2.4 mSv/yr; Venus, Titan and Triton sit here
//   elevated    10-100     past the 20 mSv/yr occupational limit for radiation workers
//   high        100-1000   a real mission dose — Mars's surface is ~214 (Curiosity RAD), Luna ~512
//   severe      1e3-1e5    a lethal cumulative dose in weeks to months — Mercury 3,484, Ganymede 45,054
//   lethal      >= 1e5     100 Sv/yr and up: lethal in days or less — Europa ~1.3 days, Io ~3 hours
export type RadiationHazard = 'background' | 'elevated' | 'high' | 'severe' | 'lethal';
export function radiationHazardBucket(mSvPerYear: number): RadiationHazard {
  const v = mSvPerYear || 0;
  if (v < 10) return 'background';
  if (v < 100) return 'elevated';
  if (v < 1000) return 'high';
  if (v < 100000) return 'severe';
  return 'lethal';
}

// Photon (UV/visible/IR) vs particle (stellar wind / protons / flares) split by spectral
// class. Cool dwarfs are wind/flare-dominated, so their particle fraction is much higher —
// which matters because magnetospheres shield particles but not photons. (Phase 04.4)
export function photonParticleSplit(star: CelestialBody): { ph: number; pa: number } {
    // A self-luminous brown dwarf is a cool, wind- and (when young) flare-dominated source — treat it
    // like a late-M/L dwarf: particle-heavy, so a moon needs a magnetosphere to be shielded from it.
    if ((star as any).isSelfLuminous) return { ph: 0.75, pa: 0.25 };
    const cls = star.classes?.[0]?.split('/')[1]?.[0] || 'G';
    switch (cls) {
        case 'O':
        case 'B': return { ph: 0.95, pa: 0.05 };
        case 'A':
        case 'F': return { ph: 0.93, pa: 0.07 };
        case 'G': return { ph: 0.90, pa: 0.10 };
        case 'K': return { ph: 0.86, pa: 0.14 };
        case 'M': return { ph: 0.78, pa: 0.22 };
        default:  return { ph: 0.90, pa: 0.10 };
    }
}

// --- TRAPPED-PARTICLE BELT around a magnetised, rotating host (inbox B17) -----------------------
// A close-in moon of a strong-field giant is not lit by its host, it is BOMBARDED by particles the
// host's field has trapped and its rotation has accelerated. Io takes ~36 Sv/DAY where the stellar
// model alone gave it 21 mSv/YEAR, and the giveaway was Io and Europa agreeing to four significant
// figures because solar distance was the only term either of them had.
//
// This is a TERM, not an emitter, and the distinction is forced by the anchors rather than chosen.
// An emitter at a distance is inverse-square; the Galileans demand r^-4 from Io to Europa and
// r^-8.6 from Io to Callisto, and no single power law fits both. A belt is not a point source: it
// is a population confined by the field, so it falls off EXPONENTIALLY in host radii, and that one
// change fits the whole family. Calibrated on Io and Callisto only — the two Galileans with no
// field of their own, so no self-shielding is baked into the law (Ganymede is deliberately left as
// a prediction; see the inbox entry).
//
//   dose(r) = D0 · (B/B_ref)² · (Ω/Ω_ref) · exp(−r / λ),   λ = λ_ref · (B/B_ref)^(1/3)
//
// The exponents are reasoned, not fitted — there is only one calibrated system, so fitting them
// would be overfitting. B² is the magnetic energy density available to trap; Ω is the corotation
// drive that energises the particles; and the magnetopause standoff of a dipole against a wind goes
// as B^(1/3), so a weaker host holds a tighter belt as well as a fainter one. That compounding is
// why Saturn comes out far below Jupiter rather than merely 18× below it.
//
// Everything it reads is already derived; nothing is authored for it. It returns 0 whenever the
// host has no meaningful field, which is almost every host, and 0 when the host's SPIN is unknown —
// an absent rotation is not a claim of a stationary host, and inventing a hazard from a missing
// input is worse than omitting one (see B9a).
// The belt profile itself, shared by the host case and the self case below.
function beltConstants(rulePack: RulePack) {
    const gp: any = (rulePack as any).generation_parameters ?? {};
    return {
        B_REF: gp.belt_ref_field_gauss ?? 4.32,
        OM_REF_H: gp.belt_ref_rotation_hours ?? 9.925,
        D0_SV_DAY: gp.belt_peak_dose_sv_per_day ?? 1451.1,
        LAMBDA_REF: gp.belt_scale_length_host_radii ?? 1.6324,
        MIN_B: gp.belt_min_host_field_gauss ?? 0.01,
        INNER_H: gp.belt_inner_edge_scale_heights ?? 150
    };
}

function beltDoseSvPerDay(fieldGauss: number, spinHours: number, rHostRadii: number, c: ReturnType<typeof beltConstants>): number {
    if (!(fieldGauss >= c.MIN_B) || !(spinHours > 0) || !(rHostRadii > 0)) return 0;
    const fieldRel = fieldGauss / c.B_REF;
    const lambda = c.LAMBDA_REF * Math.cbrt(fieldRel);
    if (!(lambda > 0)) return 0;
    const d = c.D0_SV_DAY * fieldRel * fieldRel * (c.OM_REF_H / spinHours) * Math.exp(-rHostRadii / lambda);
    return Number.isFinite(d) ? Math.max(0, d) : 0;
}

const svPerDayToFlux = (svDay: number) => (svDay * 365 * 1000) / RADIATION_UNSHIELDED_DOSE_MSV_YR;

// --- THE BELT'S INNER EDGE (inbox B22) ----------------------------------------------------------
// A bare exp(-r/lambda) has no lower boundary, so asked about a body's OWN belt it reports the belt
// PEAK at the centre of the planet. Run on Earth that gives 2.31 Sv/day at the ground — about 300x
// the real background, on the best-calibrated body in the engine.
// Real belts stop well above the surface because the ATMOSPHERE absorbs trapped particles into the
// loss cone: a particle whose mirror point lies in dense air is gone within one bounce, not merely
// attenuated. So the boundary is a property of the atmosphere, and the engine already derives the
// only quantity it needs — `atmosphere.scaleHeightKm` (H = RT/gM). The inner edge sits a fixed
// number of SCALE HEIGHTS above the reference level, which makes it scale with the atmosphere
// rather than with the planet: a puffy hot atmosphere pushes its belt further out, a thin one lets
// it come closer, and an AIRLESS body has no absorber at all so its belt reaches the ground (which
// is why Ganymede's poles are scoured by precipitating particles).
// The scale-height count is calibrated on the one inner edge that is well measured — Earth's inner
// belt begins near 1.2 R_E — and is rule-pack DATA. Jupiter is then a check rather than a fit:
// 150 H puts its edge at 1.048 R_J and the dose there at 764 Sv/day, about 21x Io, which is the
// right region for the harshest environment in the Solar System.
export function beltInnerEdgeRadii(body: CelestialBody, rulePack: RulePack): number {
    const c = beltConstants(rulePack);
    const R = body.radiusKm ?? 0;
    const H = body.atmosphere?.scaleHeightKm ?? 0;
    if (!(R > 0) || !(H > 0)) return 1; // no atmosphere, no absorber: the belt reaches the surface
    return 1 + (c.INNER_H * H) / R;
}

// Belt dose from the body's HOST, at the body's own orbital distance in HOST radii.
export function beltParticleFlux(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    rulePack: RulePack,
    where: 'current' | 'near' | 'far' = 'current'
): number {
    const c = beltConstants(rulePack);
    const host = allNodes.find((n) => n.id === body.parentId);
    if (!host || host.kind !== 'body') return 0;
    const h = host as CelestialBody;
    const hostRadiusKm = h.radiusKm ?? 0;
    if (!(hostRadiusKm > 0)) return 0;
    const e = body.orbit?.elements.e ?? 0;
    const aAU = body.orbit?.elements.a_AU ?? 0;
    if (!(aAU > 0)) return 0;
    const distAU = where === 'near' ? aAU * (1 - e) : where === 'far' ? aAU * (1 + e) : aAU;
    const r = (distAU * AU_KM) / hostRadiusKm;
    // A body orbiting inside its host's inner edge is inside the absorbing atmosphere, not the belt.
    if (r < beltInnerEdgeRadii(h, rulePack)) return 0;
    return svPerDayToFlux(beltDoseSvPerDay(h.magneticField?.strengthGauss ?? 0, Math.abs(h.rotation_period_hours ?? 0), r, c));
}

// Belt dose from the body's OWN field, at `atRadii` of its own radii — 1 for the reference surface
// / 1-bar level, the inner edge for the cloud-top and orbital environment. Absorbed below the edge.
export function selfBeltParticleFlux(body: CelestialBody, rulePack: RulePack, atRadii: number): number {
    const c = beltConstants(rulePack);
    if (atRadii < beltInnerEdgeRadii(body, rulePack)) return 0;
    return svPerDayToFlux(beltDoseSvPerDay(body.magneticField?.strengthGauss ?? 0, Math.abs(body.rotation_period_hours ?? 0), atRadii, c));
}

// Sum each star's flux into photon/particle components using its own spectral split.
// total === photon + particle, so single-G-star systems match the old 90/10 behaviour.
//
// `where` picks WHICH distance to each star to evaluate at: the body's current one, or the near /
// far end of its orbital excursion. All three go through this one function on purpose (inbox B8).
// The range used to be built by a separate sum that had no flare term, so a flaring star's dose was
// in the mean but not in the endpoints, and the mean could sit up to 20% ABOVE its own maximum.
// Because every star's spectral split and flare weight are constants of the star, and flux falls
// monotonically with distance, going through one function makes min <= mean <= max hold BY
// CONSTRUCTION rather than by luck.
export function calculateStellarRadiationComponents(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    where: 'current' | 'near' | 'far' = 'current',
    rulePack?: RulePack
): { photon: number; particle: number; total: number } {
    let photon = 0;
    let particle = 0;
    const allStars = allNodes.filter(n => isLuminousSource(n as any)) as CelestialBody[];
    for (const star of allStars) {
        let dist_au: number;
        if (where === 'current') {
            dist_au = calculateDistanceToStar(body, star, allNodes);
        } else {
            const d = calculateDistanceRangeToStar(body, star, allNodes);
            dist_au = where === 'near' ? d.min : d.max;
        }
        if (dist_au > 0) {
            const flux = (star.radiationOutput || 1) / (dist_au * dist_au);
            const s = photonParticleSplit(star);
            photon += flux * s.ph;
            // Flares add an episodic PARTICLE/UV dose on top of the steady wind — strongest for active
            // (young / M-K dwarf) stars. Goes in the particle channel so a magnetosphere + atmosphere
            // shield against it (an unshielded close world bears the brunt).
            particle += flux * (s.pa + (star.flareActivity || 0) * FLARE_PARTICLE_WEIGHT);
        }
    }
    // A trapped-particle belt is a PURE particle-channel source with no photon component, so it
    // lands in the machinery the receiver's magnetosphere and atmosphere already attenuate.
    if (rulePack) {
        particle += beltParticleFlux(body, allNodes, rulePack, where);
        // The body's OWN belt, at its reference surface / 1-bar level. Zero for anything with an
        // atmosphere, because the reference level is below its own belt's inner edge (B22).
        particle += selfBeltParticleFlux(body, rulePack, 1);
    }
    return { photon, particle, total: photon + particle };
}

export function calculateTotalStellarRadiation(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[]
): number {
    let totalStellarRadiation = 0;

    // Find all stars in the system
    const allStars = allNodes.filter(n => isLuminousSource(n as any)) as CelestialBody[];

    if (allStars.length > 0) {
        for (const star of allStars) {
            const dist_au = calculateDistanceToStar(body, star, allNodes);
            if (dist_au > 0) {
                totalStellarRadiation += (star.radiationOutput || 1) / (dist_au * dist_au);
            }
        }
    }
    return totalStellarRadiation;
}

// (calculateTotalStellarRadiationRange lived here. It was the SECOND sum of the same quantity — the
// one with no flare term — and deleting it is the actual fix for B8. The range now comes from
// calculateStellarRadiationComponents at the near and far distances, so there is one model, and the
// mean cannot drift outside its own endpoints again.)

export function checkAtmosphereRetention(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    rulePack: RulePack
): boolean {
    // Uses the same logic as planet.ts generation
    const totalStellarRadiation = calculateTotalStellarRadiation(body, allNodes);
    const magneticFieldStrength = body.magneticField?.strengthGauss || 0;
    // Default retention factor to 100 if missing (same as planet.ts default)
    const atmosphereRetentionFactor = 100; // rulePack.generation_parameters?.atmosphere_retention_factor might be missing in types if optional
    // We should check if it exists in rulePack.generation_parameters
    // Actually rulePack.generation_parameters is defined as Record<string, any> or similar?
    // Let's check types.ts later, but assuming it's safe to access or fallback.
    
    const packFactor = (rulePack as any).generation_parameters?.atmosphere_retention_factor;
    const factor = typeof packFactor === 'number' ? packFactor : 100;

    return magneticFieldStrength * factor > totalStellarRadiation;
}

export function calculateSurfaceRadiation(
    body: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[], 
    rulePack: RulePack
): number {
    const components = calculateStellarRadiationComponents(body, allNodes, 'current', rulePack);
    const totalStellarRadiation = components.total;
    // The SAME component model at the near and far ends of the orbit — not a second sum with a
    // different set of terms in it (inbox B8).
    const totalStellarRadiationRange = {
        min: calculateStellarRadiationComponents(body, allNodes, 'far', rulePack).total,
        max: calculateStellarRadiationComponents(body, allNodes, 'near', rulePack).total
    };
    body.stellarRadiation = totalStellarRadiation;
    (body as any).stellarRadiationMin = totalStellarRadiationRange.min;
    (body as any).stellarRadiationMax = totalStellarRadiationRange.max;

    // Photon/particle components come from each star's spectral-class split (04.4). The raw
    // fractions also drive the min/max range below so it stays consistent.
    let photonFlux = components.photon;
    let particleFlux = components.particle;
    const rawPhotonFrac = totalStellarRadiation > 0 ? components.photon / totalStellarRadiation : 0.9;
    const rawParticleFrac = 1 - rawPhotonFrac;

    body.radiationShieldingAtmo = 0;
    body.radiationShieldingMag = 0;

    // 1. Magnetosphere Shielding (Shields Particles - Pre-Atmosphere)
    const magStrength = body.magneticField?.strengthGauss || 0;
    let magDeflection = 0;
    if (magStrength > 0) {
        magDeflection = Math.min(0.99, (Math.log10(magStrength + 0.01) + 2) / 3); 
    }
    body.radiationShieldingMag = magDeflection;
    particleFlux = particleFlux * (1 - magDeflection);

    // 2. Atmosphere Blocking (Shields Photons & Surviving Particles)
    let atmoTransmission = 1.0;
    if (body.atmosphere && body.atmosphere.name !== 'None' && body.atmosphere.composition) {
        let totalShielding = 0;
        let totalGas = 0;
        for (const [gas, amount] of Object.entries(body.atmosphere.composition)) {
            let coeff = rulePack.gasPhysics?.[gas]?.shielding ?? rulePack.gasShielding?.[gas] ?? 0.5;
            totalShielding += coeff * amount;
            totalGas += amount;
        }
        if (totalGas > 0) {
            const shieldingScore = totalShielding / totalGas;
            // Boost N2/O2 shielding slightly to match Earth calibration (~7.0 score for 1 bar)
            // Or just leave as is and accept ~7 mSv result. 
            // Let's stick to the defined coefficients but apply them to particles too.
            atmoTransmission = Math.exp(-shieldingScore * (body.atmosphere.pressure_bar || 0));
            body.radiationShieldingAtmo = 1 - atmoTransmission;
        }
    }
    
    photonFlux = photonFlux * atmoTransmission;
    particleFlux = particleFlux * atmoTransmission;

    body.photonRadiation = photonFlux * RADIATION_UNSHIELDED_DOSE_MSV_YR;
    body.particleRadiation = particleFlux * RADIATION_UNSHIELDED_DOSE_MSV_YR;
    
    // Base terrestrial background radiation (Radon, rocks) ~2.0 mSv/yr
    // Only applies to rocky bodies (Planets/Moons), not Constructs/Stars
    let terrestrialBackground = 0;
    if (body.roleHint === 'planet' || body.roleHint === 'moon') {
        terrestrialBackground = 2.0; 
    }

    body.surfaceRadiation = (photonFlux + particleFlux) * RADIATION_UNSHIELDED_DOSE_MSV_YR + terrestrialBackground;

    // Keep min/max consistent with the same component model used above:
    // photons (90%) are atmosphere-shielded; particles (10%) are magnetosphere + atmosphere-shielded.
    const atmoTransmissionApplied = atmoTransmission;
    const particleTransmissionApplied = (1 - magDeflection) * atmoTransmissionApplied;
    const fluxToDose = (incomingFlux: number) =>
        ((incomingFlux * rawPhotonFrac * atmoTransmissionApplied) + (incomingFlux * rawParticleFrac * particleTransmissionApplied)) * RADIATION_UNSHIELDED_DOSE_MSV_YR + terrestrialBackground;

    (body as any).surfaceRadiationMin = fluxToDose(totalStellarRadiationRange.min);
    (body as any).surfaceRadiationMax = fluxToDose(totalStellarRadiationRange.max);

    // --- THE SECOND FIGURE: the environment ABOVE the atmosphere (inbox B22) ---------------------
    // One number cannot answer both "what does the ground take" and "what does a ship take", and
    // collapsing them is what let Jupiter read 11.5 mSv/yr — a correct figure for its 1-bar
    // reference level, and a badly wrong one for the place anything actually goes. Both are now
    // reported and both are named. This is the general two-figure shape, not a giant special case:
    // EVERY body gets it, and it is just as true of Earth, whose orbital space contains the Van
    // Allen belts while its surface does not.
    // Above the atmosphere there is no atmospheric attenuation, and a body's own field does not
    // shield it from its own trapped belt — you are inside both. The magnetosphere still deflects
    // the incoming STELLAR particle component, so that term keeps its deflection.
    // `components.particle` ALREADY carries the belt terms, so they must be taken back out before
    // the stellar part is deflected and the orbital belt added — otherwise the host belt is counted
    // twice and every Galilean reads exactly double.
    const hostBelt = beltParticleFlux(body, allNodes, rulePack);
    const selfBeltAtSurface = selfBeltParticleFlux(body, rulePack, 1);
    const selfBeltAtEdge = selfBeltParticleFlux(body, rulePack, beltInnerEdgeRadii(body, rulePack));
    const stellarParticleOnly = Math.max(0, components.particle - hostBelt - selfBeltAtSurface);
    // A magnetosphere deflects the incoming STELLAR particle flux. It does not shield a body from
    // the belt its own field is holding in place, nor from the host belt it is orbiting inside.
    const orbitalFlux = components.photon + stellarParticleOnly * (1 - magDeflection) + hostBelt + selfBeltAtEdge;
    (body as any).orbitalRadiation = Math.max(0, orbitalFlux * RADIATION_UNSHIELDED_DOSE_MSV_YR);
    (body as any).beltInnerEdgeRadii = +beltInnerEdgeRadii(body, rulePack).toFixed(4);

    return Math.max(0, body.surfaceRadiation);
}
