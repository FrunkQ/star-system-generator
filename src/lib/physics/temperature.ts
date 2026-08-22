import type { CelestialBody, Barycenter, System, RulePack } from '../types';
import { SOLAR_RADIUS_KM, AU_KM, EARTH_MASS_KG, STEFAN_BOLTZMANN_CONSTANT } from '../constants';
import { GIANT_METALLIC_HYDROGEN_MIN_MASS_ME } from './fluidLayers';
import { isLuminousSource } from './substellar';
import { equivalentFluxDistanceAU } from './zones';
import { deriveAlbedo, type AlbedoBreakdown } from './albedo';
import { deriveCloudDecks, deriveOxidation, type CloudDeck } from './cloudDecks';
import { deriveFluidLayers } from './fluidLayers';
import { deriveGeoActivity } from './geoActivity';
import { makeupFractions } from './makeup';
import { EARTH_RADIUS_KM } from '../constants';
import { calculateGreenhouseEffect } from './atmosphere';

const JUPITER_MASS_KG = 1.898e27;

type DistanceRangeAU = { mean: number; min: number; max: number };

function getNodeById(allNodes: (CelestialBody | Barycenter)[], id: string | null | undefined): (CelestialBody | Barycenter) | undefined {
    if (!id) return undefined;
    return allNodes.find((n) => n.id === id);
}

function pathToRoot(node: CelestialBody | Barycenter, allNodes: (CelestialBody | Barycenter)[]): (CelestialBody | Barycenter)[] {
    const path: (CelestialBody | Barycenter)[] = [];
    let current: (CelestialBody | Barycenter) | undefined = node;
    let guard = 0;
    while (current && guard < 64) {
        path.unshift(current);
        current = getNodeById(allNodes, current.parentId);
        guard++;
    }
    return path;
}

function edgeRangeFromChildToParent(child: CelestialBody | Barycenter): DistanceRangeAU {
    if (!child.orbit) return { mean: 0, min: 0, max: 0 };
    const a = child.orbit.elements.a_AU || 0;
    const e = Math.max(0, Math.min(0.999, child.orbit.elements.e || 0));
    const min = a * (1 - e);
    const max = a * (1 + e);
    return { mean: a, min, max };
}

function distanceRangeBetweenNodes(
    a: CelestialBody | Barycenter,
    b: CelestialBody | Barycenter,
    allNodes: (CelestialBody | Barycenter)[]
): DistanceRangeAU {
    if (a.id === b.id) return { mean: 0, min: 0, max: 0 };

    const pathA = pathToRoot(a, allNodes);
    const pathB = pathToRoot(b, allNodes);
    if (pathA.length === 0 || pathB.length === 0) return { mean: 0, min: 0, max: 0 };

    let lca = -1;
    const lim = Math.min(pathA.length, pathB.length);
    for (let i = 0; i < lim; i++) {
        if (pathA[i].id === pathB[i].id) lca = i;
        else break;
    }
    if (lca < 0) return { mean: 0, min: 0, max: 0 };

    let mean = 0;
    let min = 0;
    let max = 0;

    for (let i = lca + 1; i < pathA.length; i++) {
        const r = edgeRangeFromChildToParent(pathA[i]);
        mean += r.mean;
        min += r.min;
        max += r.max;
    }
    for (let i = lca + 1; i < pathB.length; i++) {
        const r = edgeRangeFromChildToParent(pathB[i]);
        mean += r.mean;
        min += r.min;
        max += r.max;
    }

    return { mean, min, max };
}

/**
 * Calculates the equilibrium temperature of a body based on stellar flux.
 * Handles binary systems (P-Type and S-Type) and Moons correctly.
 */
/**
 * Calculates the effective distance (in AU) between a body and a star for flux calculations.
 * Handles binary configurations and moon hierarchies.
 */
export function calculateDistanceToStar(
    body: CelestialBody, 
    star: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[]
): number {
    const range = distanceRangeBetweenNodes(body, star, allNodes);
    if (range.mean <= 0) return range.mean;
    // 04.1: eccentric orbits receive a higher time-averaged flux, so the flux-equivalent
    // distance is a·(1−e²)^¼ (< a), not the mean a. Derive the dominant eccentricity from
    // the perihelion/aphelion spread — exact for a body directly orbiting the star; for
    // moons the planet's orbit dominates the spread, which is what we want.
    const ecc = range.max + range.min > 0 ? (range.max - range.min) / (range.max + range.min) : 0;
    return equivalentFluxDistanceAU(range.mean, ecc);
}

export function calculateDistanceRangeToStar(
    body: CelestialBody,
    star: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[]
): DistanceRangeAU {
    return distanceRangeBetweenNodes(body, star, allNodes);
}

function getMainGasFraction(body: CelestialBody, gas: string): number {
    return body.atmosphere?.composition?.[gas] || 0;
}

export function estimateBondAlbedo(body: CelestialBody): number {
    if (typeof body.albedo === 'number' && body.albedo >= 0 && body.albedo <= 1) {
        return body.albedo;
    }

    const pressure = body.atmosphere?.pressure_bar || 0;
    const co2 = getMainGasFraction(body, 'CO2');
    const h2 = getMainGasFraction(body, 'H2');
    const he = getMainGasFraction(body, 'He');
    const ch4 = getMainGasFraction(body, 'CH4');
    const h2He = h2 + he;
    const massMe = (body.massKg || 0) / 5.972e24;

    // Thick reflective CO2 cloud decks (Venus-like)
    if (pressure > 20 && co2 > 0.7) return 0.75;
    // H2/He giants
    if (pressure > 10 && h2He > 0.6) {
        if (body.classes?.some((c) => c.includes('ice-giant'))) return 0.30;
        if (massMe > 30) return 0.34;
        if (ch4 > 0.01) return 0.29;
        return 0.32;
    }
    // Thin CO2 rocky worlds (Mars-like)
    if (co2 > 0.7 && pressure < 0.1) return 0.25;
    // Earth-like mixed atmospheres
    if (pressure >= 0.5 && pressure <= 2.0 && getMainGasFraction(body, 'O2') > 0.1) return 0.30;
    // Airless/trace rocky default (Mercury/Luna-like)
    if (pressure < 0.01) return 0.12;

    return 0.30;
}

export function composeSurfaceTemperatureFromDeltaComponents(
    equilibriumTempK: number,
    greenhouseDeltaK: number,
    tidalDeltaK: number,
    radiogenicDeltaK: number,
    internalDeltaK: number = 0,
    // A self-luminous body (brown dwarf) sets its own photosphere temperature. Unlike the deltas above
    // (which "raise by ΔK"), this is an ABSOLUTE flux term (σ·Teff⁴) added directly, so the surface reads
    // ≈ its own Teff regardless of the faint equilibrium temperature from a distant star.
    selfLuminousTeffK: number = 0
): number {
    const teq = Math.max(0, equilibriumTempK || 0);
    const baseFlux = STEFAN_BOLTZMANN_CONSTANT * Math.pow(teq, 4);

    const deltaToFlux = (deltaK: number): number => {
        const d = Math.max(0, deltaK || 0);
        if (d <= 0) return 0;
        
        // If teq is 0, the delta IS the temperature component.
        // Flux = sigma * T^4
        if (teq <= 0) return STEFAN_BOLTZMANN_CONSTANT * Math.pow(d, 4);
        
        // If teq > 0, we calculate the flux required to RAISE the temp by deltaK.
        return STEFAN_BOLTZMANN_CONSTANT * (Math.pow(teq + d, 4) - Math.pow(teq, 4));
    };

    const selfLumFlux = selfLuminousTeffK > 0
        ? STEFAN_BOLTZMANN_CONSTANT * Math.pow(selfLuminousTeffK, 4)
        : 0;
    const totalFlux = baseFlux
        + deltaToFlux(greenhouseDeltaK)
        + deltaToFlux(tidalDeltaK)
        + deltaToFlux(radiogenicDeltaK)
        + deltaToFlux(internalDeltaK)
        + selfLumFlux;

    if (totalFlux <= 0) return 0;
    return Math.pow(totalFlux / STEFAN_BOLTZMANN_CONSTANT, 0.25);
}

/**
 * THE authoritative surface temperature of a body from its already-committed heat components.
 * Single source of truth so every compose site — the SystemProcessor, the single-body refresh below,
 * the editor's live preview, and UI range variants — produces the SAME value. Reads every heat term
 * off the body (greenhouse, tidal, radiogenic, giant-internal, brown-dwarf self-luminous), so no call
 * site can silently drop one (the self-luminous term in particular kept being dropped by 5-arg calls,
 * which made re-processing a brown dwarf appear to COOL it). Pass equilibriumTempK when composing a
 * variant (min/max, day/night) or a value not yet written back; otherwise it defaults to the body's.
 */
export function composeBodySurfaceTemperature(body: CelestialBody, equilibriumTempK?: number): number {
    // F-OVR (G37) AND THIS IS THE SOLVE'S SHORT-CIRCUIT. A pinned surface temperature is returned
    // outright, whatever equilibrium temperature it is handed, which is what makes the surface
    // INVARIANT across `solveThermalState`'s iteration: the bright-condensate feedback loop (colder,
    // so more frost, so brighter, so colder — B5's bistable trap) is cut at its temperature link,
    // and the cloud decks, the greenhouse and the geology all read the GM's figure instead of one
    // the model is still arguing with. What remains in the solve is the plain albedo/equilibrium
    // contraction, which is not bistable. The pin is never iterated TOWARD.
    //
    // The DAY, NIGHT and PEAK variants do NOT come through here when a pin is present — see
    // `composeModelledSurfaceTemperature` and the scaled composer the processor hands the profile,
    // which is what keeps a pinned world from going isothermal.
    const pin = body.overrides?.surfaceTempK;
    if (typeof pin === 'number' && Number.isFinite(pin) && pin >= 0) return pin;
    return composeModelledSurfaceTemperature(body, equilibriumTempK);
}

/**
 * The surface temperature the MODEL gives, ignoring any pin — the composition the pinned world is
 * scaled away from.
 *
 * It exists because the profile cannot use the short-circuit above. `surfaceTempProfile` derives the
 * day and night sides from the energy balance and lets THE MEAN FALL OUT OF THEM (PHY-19; the
 * profile's own comment says so in place), so a composer that answered with the pin at every
 * equilibrium temperature would hand it two identical hemispheres and flatten the world. The
 * processor therefore composes the profile through THIS, measures the mean it produces, and re-runs
 * with the composer scaled by `pin / thatMean` — one closed-form factor, not an iteration, and
 * linear in temperature, so the mean of the two scaled hemispheres is exactly the pin while their
 * ratio, and every swing derived from it, is untouched.
 */
export function composeModelledSurfaceTemperature(body: CelestialBody, equilibriumTempK?: number): number {
    return composeSurfaceTemperatureFromDeltaComponents(
        equilibriumTempK ?? body.equilibriumTempK ?? 0,
        body.greenhouseTempK || 0,
        body.tidalHeatK || 0,
        body.radiogenicHeatK || 0,
        body.internalHeatK || 0,
        (body as any).selfLuminousTeffK || 0
    );
}

// ── The thermal fixed point ──────────────────────────────────────────────────────────────────────
// A body's albedo, its temperature and its clouds are one problem, not three. The loop is:
//
//     albedo → equilibrium temp → greenhouse → surface temp → atmospheric profile → cloud decks → albedo
//
// and it closes. That circularity is why albedo.ts used to carry a cheap boiling-point test of its
// own: the decks genuinely do not exist yet at the moment the albedo is first needed. The answer is
// not to keep a second, worse cloud model upstream of the good one — it is to solve the loop.
//
// TERMINATION. The iteration count is hard-bounded (MAX_ITERATIONS), so this returns unconditionally
// whether or not it has settled; convergence is a quality of the answer, never a condition for
// getting one. Within that bound it is a fixed-point iteration on a single scalar — albedo, which
// deriveAlbedo bounds to [0.02, 0.95]. Equilibrium temperature varies as (1−A)^¼, so a step in
// albedo produces a much smaller step in temperature, and every term downstream of it is bounded:
// the map is a contraction over essentially the whole domain.
//
// Steps are taken in full while the correction keeps pointing the same way, which is what makes a
// body whose albedo does not depend on its temperature at all (an airless rock) land in two passes
// instead of grinding down a geometric series. It only damps when the correction REVERSES, and that
// case is real rather than numerical: cloud cover is not smooth in temperature, because a deck can
// cease to exist. A world sitting exactly on the edge of condensing something has two
// self-consistent states — bright-and-cold with the deck, dark-and-warm without it — and no amount
// of iterating will choose between them, because both are true. Halving the step each time it
// reverses collapses that oscillation onto the point between them, which is the honest reading of
// such a world: its cloud cover really is marginal. `converged` says whether it got there.
//
// Measured over every body in the bundled starmaps and the Solar System (260 of them): worst case
// 5 iterations, none unconverged.
const FIRST_GUESS_ALBEDO = 0.3;
const MAX_ITERATIONS = 12;
const ALBEDO_TOLERANCE = 0.002;   // ~0.05% in equilibrium temperature — well under any visible effect
const REVERSAL_DAMPING = 0.5;

export interface ThermalSolution {
    equilibriumTempK: number;
    albedoInfo: AlbedoBreakdown;
    greenhouseTempK: number;
    surfaceTempK: number;
    decks: CloudDeck[];
    iterations: number;
    residual: number;      // |albedo_out − albedo_in| on the final pass
    converged: boolean;
}

/**
 * Solve the albedo ⇄ temperature ⇄ cloud fixed point for one body. PURE: reads the body, mutates
 * nothing — evaluation runs against a shallow probe so the caller decides what to commit. Every heat
 * term other than the greenhouse (tidal, radiogenic, internal, self-luminous) is read off the body
 * as already-committed, so commit those BEFORE calling this.
 */
/**
 * How long this body's visible surface has been exposed, evaluated for a CANDIDATE thermal state
 * (inbox B5). Returns null for a body with no solid surface, which cannot rust.
 *
 * The whole point is that it takes a probe rather than the body: it must answer for the temperature
 * currently being tried, not for whatever a previous process() left behind. Everything it calls is
 * a pure function, so nothing here writes to the body.
 *
 * The tidal and resonance signals come from tags the earlier passes have already committed, and are
 * NOT thermal — tidal forcing is orbit and mass. `teqK` is passed through because deriveGeoActivity
 * takes it, but it drives one branch (the Triton solar-seasonal geyser at teqK < 60) and measurably
 * moves two bodies out of 366.
 */
function surfaceAgeOnProbe(
    probe: CelestialBody,
    systemAgeGyr: number,
    pack?: RulePack | null
): number | null {
    const mk = makeupFractions(probe);
    if (mk.gas > 0.5) return null;
    if (probe.roleHint !== 'planet' && probe.roleHint !== 'moon') return null;
    const layers = deriveFluidLayers(probe, pack ?? undefined);
    const tagKeys = (probe.tags ?? []).map((t) => t.key);
    return deriveGeoActivity({
        makeup: mk,
        massMe: (probe.massKg ?? 0) / EARTH_MASS_KG,
        radiusRe: (probe.radiusKm ?? 0) / EARTH_RADIUS_KM,
        ageGyr: systemAgeGyr,
        hasSurfaceWater: layers.some((l) => l.location === 'surface' && /water/.test(l.liquid)),
        hasSubsurfaceOcean: layers.some((l) => l.location === 'subsurface'),
        icyShell: tagKeys.includes('structure/icy-shell'),
        tidalHotspots: tagKeys.includes('tidal/hotspots') || tagKeys.includes('tidal/volcanism'),
        tidalLavaFlows: tagKeys.includes('tidal/lava-flows'),
        resonanceTidal: !!(probe as any).resonanceTidal,
        surfaceIce: (probe.hydrosphere?.coverage ?? 0) > 0.3,
        teqK: probe.equilibriumTempK,
        radiogenicOverrideK: probe.radiogenicHeatK ?? 0
    }).surfaceAgeGyr;
}

export function solveThermalState(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    pack?: RulePack | null,
    // The system's age, for the surface-age evaluation inside the loop (B5). It MUST be the same
    // figure the processor uses when it commits geology, or the albedo would be computed against a
    // different surface age than the one the body ends up carrying. Defaulted so the single-body UI
    // refresh and the existing specs keep their signatures.
    systemAgeGyr = 4.6
): ThermalSolution {
    // One full evaluation of the loop at a given albedo.
    const evaluate = (albedo: number) => {
        const equilibriumTempK = calculateEquilibriumTemperature(body, allNodes, albedo);
        // Shallow probe: deriveCloudDecks and calculateGreenhouseEffect both read the body's
        // temperatures, and both must see THIS pass's values rather than whatever a previous
        // process() run left on the object. Neither writes, so a shallow copy is enough.
        const probe = { ...body, equilibriumTempK, temperatureK: undefined } as CelestialBody;
        // Greenhouse in two steps: it reads the surface temperature (for the ocean-vapour term) and
        // also sets it. Starting from the equilibrium value and going round once is enough — the
        // term it feeds is a few kelvin — and it makes the result depend only on the inputs, never
        // on what the last run happened to leave behind.
        let greenhouseTempK = pack ? calculateGreenhouseEffect(probe, pack) : (body.greenhouseTempK || 0);
        probe.greenhouseTempK = greenhouseTempK;
        probe.temperatureK = composeBodySurfaceTemperature(probe, equilibriumTempK);
        if (pack) {
            greenhouseTempK = calculateGreenhouseEffect(probe, pack);
            probe.greenhouseTempK = greenhouseTempK;
        }
        const surfaceTempK = composeBodySurfaceTemperature(probe, equilibriumTempK);
        probe.temperatureK = surfaceTempK;
        // THE cloud evaluation — the same one the processor publishes as tags. Nothing here decides
        // for itself whether this world has clouds.
        const decks = deriveCloudDecks(probe, pack);
        // THE RUST EVALUATION (inbox B5), and the reason it is HERE. Oxide dust brightens a surface,
        // so albedo needs the rust grade; grading it needs the surface age; the surface age needs the
        // tectonic regime; and the regime turns on whether there is LIQUID water on the surface,
        // which is this solve's own output. Measured across all 366 bundled bodies, that one input
        // is the entire coupling — flipping it moves the surface age on 136 bodies — while teqK,
        // the input the ordering gate was written around, moves TWO.
        //
        // Nothing is dragged backwards across the solve to do this. All three derivations are PURE
        // (they return values; the processor is what assigns them), so they run against the same
        // shallow probe deriveCloudDecks and deriveAlbedo already use. The processor still COMMITS
        // geology in its own pass, from the converged temperature, and gets this same answer back —
        // which is what makes it idempotent rather than one pass behind.
        const geoAgeGyr = surfaceAgeOnProbe(probe, systemAgeGyr, pack);
        const oxidation = geoAgeGyr == null ? null
          : deriveOxidation({ ...probe, geoActivity: { surfaceAgeGyr: geoAgeGyr } } as CelestialBody);
        const albedoInfo = deriveAlbedo(probe, equilibriumTempK, decks, pack, oxidation, geoAgeGyr);
        return { equilibriumTempK, albedoInfo, greenhouseTempK, surfaceTempK, decks };
    };

    let albedo = FIRST_GUESS_ALBEDO;
    let state = evaluate(albedo);
    let iterations = 1;
    let delta = state.albedoInfo.albedo - albedo;
    let residual = Math.abs(delta);
    let step = 1;                       // full step until the correction reverses on itself
    while (residual >= ALBEDO_TOLERANCE && iterations < MAX_ITERATIONS) {
        const previous = delta;
        albedo += step * delta;
        state = evaluate(albedo);
        delta = state.albedoInfo.albedo - albedo;
        residual = Math.abs(delta);
        if (delta * previous < 0) step *= REVERSAL_DAMPING;   // overshot — close in on the midpoint
        iterations++;
    }
    const converged = residual < ALBEDO_TOLERANCE;
    // The committed temperature comes from the albedo that was fed IN; the breakdown reports what
    // came out. On convergence those agree to within the tolerance. When they do not, say so on the
    // body's own note rather than presenting a marginal world as a settled one.
    const albedoInfo = converged ? state.albedoInfo : {
        ...state.albedoInfo,
        note: `${state.albedoInfo.note} Cloud cover is marginal here — the world sits on the edge of condensing, and its albedo settles between the cloudy and clear states.`
    };
    return { ...state, albedoInfo, iterations, residual, converged };
}

/**
 * Recalculates the equilibrium and total surface temperature for ONE body, in place — the same
 * fixed point the SystemProcessor commits, exposed as a single-body refresh for live UI panels.
 * (The full pipeline is systemProcessor.process(); use that for anything beyond a display preview —
 * this helper deliberately duplicates no formulas, only orchestrates the shared ones.)
 */
export function calculateSurfaceTemperature(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    pack?: RulePack | null
) {
    // Radiogenic heat is a GM override — re-derive it BEFORE the solve, which reads it as committed.
    body.radiogenicHeatK = body.overrides?.radiogenicHeatK ?? body.radiogenicHeatK ?? 0;
    const solved = solveThermalState(body, allNodes, pack);
    const range = calculateEquilibriumTemperatureRange(body, allNodes, solved.albedoInfo.albedo);

    if (solved.equilibriumTempK > 0) {
        body.equilibriumTempK = solved.equilibriumTempK;
        body.albedoBreakdown = solved.albedoInfo;
        (body as any).equilibriumTempMinK = range.minK;
        (body as any).equilibriumTempMaxK = range.maxK;
        if (pack) body.greenhouseTempK = solved.greenhouseTempK;
        body.temperatureK = composeBodySurfaceTemperature(body, solved.equilibriumTempK);
    }
}

export function estimateInternalHeatK(body: CelestialBody, rulePack?: RulePack, ageGyr = 4.6): number {
    if (body.roleHint !== 'planet') return 0;
    const cfg = rulePack?.climateModel?.internalHeat;
    const h2 = getMainGasFraction(body, 'H2');
    const he = getMainGasFraction(body, 'He');
    if (h2 + he < (cfg?.minHydrogenHeliumFraction ?? 0.6)) return 0;
    // NOTE: there used to be a `pressure_bar >= 10` gate here as well, and it was silently doing all
    // the work. A giant has no surface, so its quoted pressure is whatever depth its author picked —
    // the app's own convention quotes the ~1 bar reference level, which failed the gate. Every giant
    // in the bundled Sol file, and every generated one, was getting ZERO internal heat because of a
    // number that carries no physical meaning for a body with no ground. Composition decides whether
    // this is a giant; pressure has no say.

    // Giants are still radiating the gravitational energy of their own formation, and they COOL as
    // they do it. That is why age is the dominant term and distance from the star is irrelevant:
    // Jupiter puts out 1.67x what it receives from the Sun, Saturn 1.78x, Neptune 2.6x. A young
    // giant is dramatically hotter — the directly imaged planets (HR 8799, Beta Pictoris b) sit at
    // 900-1600 K at 10-30 Myr purely because they are young.
    //
    // Kelvin-Helmholtz cooling goes as a power law in age, so: heat = reference x (age/4.6)^-alpha,
    // where the reference is TODAY'S solar system. That calibration is the point — whatever the
    // curve does when young, it has to still produce Jupiter's +52 K and Neptune's +24 K at 4.6 Gyr,
    // which pins it to something we can check rather than leaving it free.
    // WHICH KIND of giant is a COMPOSITION question, answered by the same mass split the interior
    // model uses (fluidLayers: metallic hydrogen above it, superionic water below). It used to read
    // `body.classes` for the word "ice-giant" — but the classifier runs a whole pass AFTER this, and
    // this feeds the temperature the classifier then reads. A freshly imported Neptune therefore
    // came out at +52 K on its first process() and +24 K on its second, taking its surface
    // temperature from 99 K to 72 K with it (inbox B13). A derived class is never a physics input.
    const isIceGiant = (body.massKg ?? 0) / EARTH_MASS_KG <= GIANT_METALLIC_HYDROGEN_MIN_MASS_ME;
    const referenceK = isIceGiant ? (cfg?.iceGiantHeatK ?? 24) : (cfg?.gasGiantHeatK ?? 52);
    const alpha = cfg?.coolingExponent ?? 0.62;
    const age = Math.max(cfg?.minAgeGyr ?? 0.005, ageGyr || 4.6);
    let heatK = referenceK * Math.pow(age / 4.6, -alpha);

    // MASS, but ONLY upward from Jupiter. A heavier giant formed with more gravitational energy to
    // shed and holds it longer. Below Jupiter mass we deliberately do NOT scale down, because the
    // per-class reference above is already the measured answer for a smaller giant: Saturn is a third
    // of Jupiter's mass and radiates essentially the same excess (+53 K against +55 K), and the ice
    // giants have their own constant. Scaling by mass on top of that double-counted it and cost
    // Saturn 23 K — the calibration catching a mistake, which is what it is for.
    const mJup = (body.massKg ?? 0) / JUPITER_MASS_KG;
    if (mJup > 1) heatK *= Math.pow(mJup, cfg?.massExponent ?? 0.45);

    // Above the substellar floor the brown-dwarf model takes over with its own Burrows/Baraffe
    // tracks and sets an absolute photosphere temperature, so stop here and let it lead rather than
    // double-counting the same contraction heat.
    return Math.max(0, Math.min(cfg?.maxHeatK ?? 2000, heatK));
}

export function calculateEquilibriumTemperature(
    body: CelestialBody, 
    allNodes: (CelestialBody | Barycenter)[],
    albedo: number = estimateBondAlbedo(body)
): number {
    const allStars = allNodes.filter(n => isLuminousSource(n as any)) as CelestialBody[];
    
    let totalLuminosityTimesArea = 0;
    
    for (const star of allStars) {
        const starTemp = star.temperatureK || 5778;
        const starRadius_m = (star.radiusKm || SOLAR_RADIUS_KM) * 1000;
        const starLuminosity = 4 * Math.PI * Math.pow(starRadius_m, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(starTemp, 4);

        const dist_au = calculateDistanceToStar(body, star, allNodes);

        if (dist_au > 0) {
            const dist_m = dist_au * AU_KM * 1000;
            totalLuminosityTimesArea += starLuminosity / (4 * Math.PI * Math.pow(dist_m, 2));
        }
    }

    if (totalLuminosityTimesArea > 0) {
        // ABSORBED FRACTION, FLOORED AT ZERO. G37 lets a GM pin an albedo outside [0, 1] on purpose:
        // below zero the world returns more than it receives (`1 − A` > 1, a real amplification, and
        // the formula handles it), and at or above one it absorbs nothing at all. Without the floor
        // the second case is `Math.pow(negative, 0.25)` — NaN, which would spread silently through
        // every downstream figure instead of saying the honest thing, which is that a perfect mirror
        // sits at the temperature its own internal heat gives it and no more.
        const absorbed = Math.max(0, 1 - albedo);
        return Math.pow(totalLuminosityTimesArea * absorbed / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25);
    }

    return 0;
}

export function calculateEquilibriumTemperatureRange(
    body: CelestialBody,
    allNodes: (CelestialBody | Barycenter)[],
    albedo: number = estimateBondAlbedo(body)
): { minK: number; maxK: number } {
    const allStars = allNodes.filter(n => isLuminousSource(n as any)) as CelestialBody[];
    let fluxMin = 0;
    let fluxMax = 0;

    for (const star of allStars) {
        const starTemp = star.temperatureK || 5778;
        const starRadius_m = (star.radiusKm || SOLAR_RADIUS_KM) * 1000;
        const starLuminosity = 4 * Math.PI * Math.pow(starRadius_m, 2) * STEFAN_BOLTZMANN_CONSTANT * Math.pow(starTemp, 4);
        const d = calculateDistanceRangeToStar(body, star, allNodes);

        if (d.max > 0) {
            const maxDistM = d.max * AU_KM * 1000;
            fluxMin += starLuminosity / (4 * Math.PI * Math.pow(maxDistM, 2));
        }
        if (d.min > 0) {
            const minDistM = d.min * AU_KM * 1000;
            fluxMax += starLuminosity / (4 * Math.PI * Math.pow(minDistM, 2));
        }
    }

    if (fluxMax <= 0) return { minK: 0, maxK: 0 };

    const absorbed = Math.max(0, 1 - albedo);   // see calculateEquilibriumTemperature: A >= 1 is 0 K, not NaN
    const minK = fluxMin > 0
        ? Math.pow(fluxMin * absorbed / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25)
        : 0;
    const maxK = Math.pow(fluxMax * absorbed / (4 * STEFAN_BOLTZMANN_CONSTANT), 0.25);
    return { minK, maxK };
}
