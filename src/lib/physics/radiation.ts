import type { CelestialBody, Barycenter, RulePack } from "$lib/types";
import { AU_KM, SOLAR_RADIUS_KM, RADIATION_UNSHIELDED_DOSE_MSV_YR } from "$lib/constants";
import { calculateDistanceRangeToStar, calculateDistanceToStar } from "./temperature";
import { isLuminousSource } from "./substellar";
import { makeupFractions, hasSolidSurface } from "./makeup";

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
// IS THERE GROUND HERE? MOVED TO `physics/makeup.ts` (inbox B36) — it is a question about
// COMPOSITION, so asking the RADIATION module for it made every other caller (the cloud model, the
// body editor, the habitability gate) depend on this file for no reason. Imported above and used
// below; there is no re-export, so there is exactly one import path for it. Its history — a stored
// field and a class regex, both wrong (inbox B11) — is recorded at the new home, along with the
// engine-map M2 warning about which callers may and may not use it.

// WHICH PLACE a body's primary radiation figure describes. One number cannot answer "what does the
// ground take" and "what does a ship take", so B22 gave every body two figures and named them; this
// names the FIRST one, and there are three kinds of body, not two (inbox B26).
// A RING has no surface to stand on — but unlike a giant's envelope, which has no place to stand at
// ALL, a ring is countless small bodies that each do have one. So the figure is genuinely meaningful
// and only its name was wrong: it is the dose in the RING PLANE, which is simultaneously what a
// fragment's surface takes and what a ship crossing the ring takes. That is why this is a label fix
// and not a deletion, where B18 answered the same category question about habitability by removing
// the score: there, the axis meant nothing for the body; here, the number means something and was
// being told to the reader as if it were somewhere else.
// For a ring the two places coincide, so the "in orbit" row correctly stays away — it is gated on
// the two figures genuinely differing, and for a ring they are the same number.
//
// MOVED HERE FROM catalogue/bodyFacts.ts (inbox B11). It had been a presentation helper, but the
// PROCESSOR needs the same answer to decide whether a body's dose deserves a hazard tag — and a
// second copy of "does this figure describe a real place" is exactly the duplication the standing
// rule is about. bodyFacts re-exports it, so the info block and the tag can never disagree.
export function radiationPlace(n: any): 'surface' | 'at 1 bar' | 'in the ring plane' {
  if (n?.roleHint === 'ring') return 'in the ring plane';
  return hasSolidSurface(n) ? 'surface' : 'at 1 bar';
}

// WHICH PLACE the SECOND figure describes (inbox B27), and the answer differs by body type in a way
// one label cannot carry.
//
// The number is not wrong — B22's physics stands, Earth's inner edge at 1.1982 R_E matches the
// measured ~1.2 — but "in orbit" reads as "the dose where a ship parks", and Earth's figure is
// 653 Sv/yr because it is evaluated AT THE BELT INNER EDGE. The ISS at 400 km takes about
// 150 mSv/yr, four thousand times less, because it flies BELOW the inner belt. A GM planning a
// station was being told the wrong thing by four orders of magnitude.
//
// SO THE FIGURE IS NAMED FOR WHERE IT IS, rather than moved or re-derived. That is [[B26]]'s
// answer to the same class of fault, and it is chosen over inventing a below-the-belt figure for a
// specific reason: the engine has no altitude parameter for "where the ship is", and its belt law is
// a single peak-and-scale-length fit. A LEO figure would be a NEW derivation with one anchor to
// calibrate against, and would swap a 4,000x overshoot for an undershoot — B27 itself says the
// physics is right and the question is where the figure is quoted. Naming it also satisfies what
// [[B20]] will need: every figure has to mean a definite place before it can be decomposed by cause.
//
//   airless body   the belt inner edge IS the surface, so the two coincide — 'in orbit', and the
//                  row is suppressed anyway because the figures are equal (Io, correctly)
//   giant          'above the cloud tops', B22's wording, unchanged
//   magnetised     'in the belts, from ~N km' — the altitude is derived, not a constant: it is
//   with air       (beltInnerEdgeRadii - 1) x the body's radius, which is 1,263 km for Earth
export function orbitalRadiationPlace(n: any): string {
  if (n?.roleHint === 'ring') return 'in the ring plane';
  if (!hasSolidSurface(n)) return 'above the cloud tops';
  const edge = n?.beltInnerEdgeRadii ?? 1;
  const radiusKm = n?.radiusKm ?? 0;
  if (edge > 1.001 && radiusKm > 0) {
    return `in the belts, from ~${Math.round((edge - 1) * radiusKm).toLocaleString()} km`;
  }
  return 'in orbit';
}

export function deriveIrradiationDose(teqK: number, magShield: number, surfaceAgeGyr: number): number {
  const uvRel = Math.pow(Math.max(0, teqK) / 255, 4);           // bolometric flux at orbit, Earth = 1
  const unshielded = 1 - Math.max(0, Math.min(0.99, magShield));
  const ageFactor = Math.max(0, Math.min(1.5, surfaceAgeGyr / 4.5)); // dose accumulates with exposure
  return +((uvRel + GCR_FLOOR) * unshielded * ageFactor).toFixed(3);
}


// THE HAZARD BUCKET — expressed as TIME TO HARM, because that is what a GM can act on. Sieverts per
// year are unreadable at a table; "hours" is not (inbox B30).
//
// It is DERIVED, not a table. A median lethal acute dose is about 5 Sv, so the time to accumulate one
// at a given rate is simply LD50 / dose rate. The constant is rule-pack DATA, so a campaign that
// wants tougher or softer characters can argue with it.
//
// THE HONESTY LIMIT, and it is the reason the ladder does not simply run out of time words. This is
// an ACUTE model: it describes radiation sickness, which is a thing that happens over a short
// exposure. At Earth's 2.3 mSv/yr the arithmetic says two thousand years, and that is arithmetic
// rather than a prediction — chronic low-level exposure kills by cancer risk, not by acute syndrome,
// and nobody lives to test the figure. So past 50 years the ladder STOPS quoting time and changes
// framing: `chronic` for a rate above the 20 mSv/yr occupational limit (a real long-term risk, no
// acute threat) and `background` for anything at or below it. That keeps B28's two measured anchors
// — the occupational limit and Curiosity's Mars figure — landing where they should.
//
//   hours       under a day        Io's surface: ~3 hours
//   days        under a week       Europa ~1.3 days; Earth ORBIT ~2.8 days, inside the Van Allen belts
//   weeks       under a month
//   months      under a year       Ganymede ~40 days
//   years       under 50 years     Mars ~23 years — a mission-planning problem, which is the real framing
//   chronic     past that, but above the 20 mSv/yr occupational limit — cancer risk, not acute
//   background  at or below the occupational limit — Earth, Venus, Titan, Triton, Pluto
export type RadiationHazard = 'hours' | 'days' | 'weeks' | 'months' | 'years' | 'chronic' | 'background';

const LD50_SV_DEFAULT = 5;            // median lethal acute whole-body dose
const OCCUPATIONAL_MSV_YR = 20;       // ICRP annual limit for radiation workers — the chronic/background line
const ACUTE_MODEL_LIMIT_YEARS = 50;   // past this the acute model means nothing; say so instead of quoting it

export function radiationLd50Sv(rulePack?: RulePack | null): number {
    const v = (rulePack as any)?.generation_parameters?.radiation_ld50_sv;
    return typeof v === 'number' && v > 0 ? v : LD50_SV_DEFAULT;
}

// YEARS to accumulate a median lethal dose at this rate. Infinite at zero, by construction.
export function yearsToLethalDose(mSvPerYear: number, rulePack?: RulePack | null): number {
    const rate = mSvPerYear || 0;
    if (!(rate > 0)) return Infinity;
    return (radiationLd50Sv(rulePack) * 1000) / rate;
}

export function radiationHazardBucket(mSvPerYear: number, rulePack?: RulePack | null): RadiationHazard {
    const years = yearsToLethalDose(mSvPerYear, rulePack);
    if (years > ACUTE_MODEL_LIMIT_YEARS) return (mSvPerYear || 0) > OCCUPATIONAL_MSV_YR ? 'chronic' : 'background';
    const days = years * 365;
    if (days < 1) return 'hours';
    if (days < 7) return 'days';
    if (days < 30) return 'weeks';
    if (days < 365) return 'months';
    return 'years';
}

// The time to a lethal dose, as SHORT as it can be said. Returns null once the acute model stops
// meaning anything, rather than quoting a number nobody lives to test. Deliberately coarse: this is
// a guide, not an engineering figure.
//
// TERSE BY DESIGN, and the reason is worth keeping. The row used to lead with the bucket WORD and end
// with a full sentence — "weeks · 213 Sv/y · lethal dose in ~8.6 days" — long enough to be truncated
// on a normal panel, and reading as self-contradictory because the word and the figure are two
// resolutions of one quantity sitting inches apart. The word belongs on the TAG, where it is a
// filterable bucket; the ROW carries the figure.
export function lethalDoseTime(mSvPerYear: number, rulePack?: RulePack | null): string | null {
    const years = yearsToLethalDose(mSvPerYear, rulePack);
    if (!Number.isFinite(years) || years > ACUTE_MODEL_LIMIT_YEARS) return null;
    const hours = years * 365 * 24;
    const round = (v: number) => (v < 10 ? Math.round(v * 10) / 10 : Math.round(v));
    if (hours < 48) return `${round(hours)} h`;
    const days = hours / 24;
    if (days < 60) return `${round(days)} d`;
    if (years < 2) return `${round(days / 30.44)} mo`;
    return `${round(years)} y`;
}

// The mark that says "this is a time to a LETHAL dose" without spending eleven characters saying it.
// U+2620 with the TEXT variation selector, so it stays a glyph drawn in the page's own ink rather
// than being substituted with a colour emoji — a player view runs through a CRT/phosphor filter, and
// a full-colour skull would be the one thing on screen the filter never touched.
export const LETHAL_MARK = '\u2620\uFE0E';

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
    // TWO figures, and they are not the same question (inbox B34). The total is everything arriving
    // at the reference level and is what a hazard reading needs; the starlight is the star alone and
    // is what a claim about IRRADIATION means. They agreed to four significant figures until B17 put
    // the trapped belt into the total, at which point Io's two answers separated by 700,000x.
    body.totalIncidentFlux = totalStellarRadiation;
    (body as any).totalIncidentFluxMin = totalStellarRadiationRange.min;
    (body as any).totalIncidentFluxMax = totalStellarRadiationRange.max;
    body.starlightFlux = calculateTotalStellarRadiation(body, allNodes);

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
