// THE OVERRIDE ROSTER — one record per quantity a GM may pin, and the ONLY place any of them is
// described. (G37.)
//
// THE MANTRA THIS FILE SERVES: a GM may author what they like, the program does not STOP them, it
// WARNS them it is not right. That is already the house rule for stars — "a star whose numbers break
// physics is kept and labelled rather than refused" — and this extends it to derived planetary
// physics. Nothing here clamps a value to a plausible band; `plausible()` exists to produce a
// SENTENCE, never a limit.
//
// WHY A REGISTRY RATHER THAN A ROW PER QUANTITY IN THE EDITOR. The overrides were four scattered
// implementations before this: albedo and radiogenic heat in BodyTemperatureTab, thermal inflation
// in BodyBasicsTab, the magnetosphere in BodyAtmosphereTab under a DIFFERENT convention of its own,
// and flareActivity with no editor at all. Each had its own seed, its own clamp, its own reset and
// its own wording, and the info panel listed a hand-written subset of them that had already drifted
// (radiogenic and flare were both missing). One record per quantity means the tab, the info-panel
// strip, the Newton trace and the warnings all read the SAME description, and a ninth override is a
// new record rather than a new copy of the pattern.
//
// F-OVR, restated: a key PRESENT in `body.overrides` means the GM pinned that value. It is authored
// INPUT — saved, and fed into the derivation INSTEAD of the computed default, BEFORE the solve runs.
// It is never a poke into derived output; `src/lib/system/idempotence.test.ts` is what enforces that.
// Reset DELETES the key (and its anomaly assignment with it), handing the quantity back to the physics.
//
// BOUNDS ARE DATA AND ARE MEANT TO BE WIDENED. `soft` is how far the slider travels — the range a GM
// will normally want. `hard` is how far a TYPED number may go, and it is deliberately absurd at both
// ends: a negative albedo (a surface that emits more than it receives) and a 70 tesla terrestrial
// magnetosphere are features, not mistakes. Owner, 2026-08-22: "Bounds should be reasonably numeric —
// within SOME bounds — maybe have them easily extended later if necessary." Widening one is a two-
// number edit here and nothing else changes.
import type { CelestialBody } from '$lib/types';
import { estimateBondAlbedo } from './temperature';
import { gasThermalInflationFactor, makeupFractions, normalizeMakeup, massMeFromRadiusMakeup, radiusReFromMassMakeup } from './makeup';
import { meanSurfaceTempK } from './surfaceTemperature';
import { editMass, densityGcc, radiusFromMassDensity, massFromRadiusDensity, trimEnvelope } from './bodyEdit';
import { EARTH_MASS_KG, EARTH_RADIUS_KM } from '$lib/constants';

export type OverrideKey =
  | 'albedo'
  | 'gasThermalInflation'
  | 'radiogenicHeatK'
  | 'flareActivity'
  | 'magneticFieldGauss'
  | 'surfaceTempK'
  | 'pressureBar'
  | 'densityGcm3';

export interface OverrideDef {
  key: OverrideKey;
  /** What the row, the badge and the trace call it. UK English. */
  label: string;
  /** Appended to the number everywhere it is shown. Empty for a dimensionless ratio. */
  unit: string;
  /** One line under the row: what pinning this actually does to the world. */
  hint: string;
  /** Roles this override is offered on. A star's magnetic field is authored input, not an override. */
  appliesTo: readonly CelestialBody['roleHint'][];
  /** Slider travel — the range a GM normally wants. */
  soft: readonly [number, number];
  /** How far a TYPED number may go. Absurd on purpose at both ends; nothing clamps below this. */
  hard: readonly [number, number];
  step: number;
  decimals: number;
  /** Log-scaled slider — for quantities that span decades (field strength, pressure). */
  log?: boolean;
  /**
   * The value the engine derives when nothing is pinned: the seed for a new pin, and what "reset"
   * would return to.
   *
   * IT MAY HONESTLY RETURN `undefined` WHILE THE KEY IS PINNED, and four of the eight do. A pin is
   * fed INTO the derivation, so for those the committed field a reader would consult (the albedo
   * breakdown, the star's flare activity, the surface profile, the atmosphere's pressure) now holds
   * the GM's own figure — asking it "what does the physics say" returns the pin back and the row
   * would print `The physics says 1100 K` beside a pin of 1100 K. The others answer from a model the
   * pin does not touch (the dynamo's nominal field, the inflation curve, radiogenic zero) and are
   * trustworthy either way. Recovering the suppressed figure would mean a second full solve per pin;
   * saying nothing is cheaper and true.
   */
  derived(body: CelestialBody): number | undefined;
  /** The band this quantity plausibly occupies FOR THIS BODY. Outside it the row warns (amber). */
  plausible(body: CelestialBody): readonly [number, number] | null;
  /** What being outside that band MEANS — the second half of every warning sentence. */
  absurd: string;
  /**
   * THE HARDER BAND: what is possible for ANY body, ever. Outside it the row goes RED, because the
   * figure does not merely lack a mechanism — it breaks conservation or contradicts the definition
   * of the quantity itself.
   *
   * OWNER, 2026-08-22: "highlight red what is TOTALLY IMPOSSIBLE (negative albedo) rather than
   * impossible (too high magnetic field)". The distinction is real and worth drawing: a 70 tesla
   * terrestrial has no known MECHANISM but breaks no law — magnetars reach far more — whereas a
   * surface returning more energy than arrives is inventing it. Both are still ALLOWED; the
   * difference is only what the row SAYS about them, never whether it accepts them.
   *
   * `null` (or omitted) means nothing about this quantity is impossible in principle.
   */
  possible?(body: CelestialBody): readonly [number, number] | null;
  /** What being outside the POSSIBLE band means. Give it whenever `possible` is given. */
  breaks?: string;
  /**
   * The Newton trace LAYERS whose number this pin sets, by layer id.
   *
   * `physicsTrace.ts` claims to SHOW THE WORKING, which makes it the worst surface in the product to
   * leave wrong: a hand-set figure printed as though the engine had derived it is a lie told by the
   * one panel that promises not to. So the trace walks this roster and marks every layer named here,
   * rather than each layer remembering to check for its own override — a scheme that would go stale
   * the moment a ninth pin was added, silently, which is exactly how this class of drift happens.
   */
  traceLayers?: readonly string[];
  /**
   * A CHOICE that belongs to this pin, rendered generically beside it and stored in `overrides`
   * under `key`. Density has the only one: the mass/radius/density relation has two degrees of
   * freedom, so pinning density pins the SECOND of them and the GM says which (owner Q1, "pin any
   * two"). Listed here rather than branched on in the tab, for the same reason everything else is.
   */
  choice?: {
    key: string;
    label: string;
    options: readonly { value: string; label: string }[];
    fallback: string;
  };
  /**
   * Other keys inside `overrides` that belong to this pin and are deleted with it. A choice's key
   * goes here; without it, resetting density would leave `densityHold` behind for ever and the
   * `overrides` object would never become empty enough to be dropped.
   */
  companionKeys?: readonly string[];
  /**
   * THE CONSEQUENCE THE PROCESSOR CANNOT APPLY, run whenever the pin is set, dragged or reset.
   *
   * Most pins are read by the engine on the next pass and need nothing here. A few move a quantity
   * that is AUTHORED INPUT rather than a derived field — thermal inflation sets the RADIUS, which
   * `process()` never recomputes — so the consequence has to be applied where the edit happens. It
   * lives on the record rather than in the editor so the tab stays free of per-quantity branches,
   * and it is handed the EFFECTIVE value (the pin when pinned, the derived figure after a reset), so
   * pinning and resetting take the same path.
   */
  commit?(body: CelestialBody, effective: number): void;
}

const clampToHard = (def: OverrideDef, v: number): number =>
  Math.max(def.hard[0], Math.min(def.hard[1], v));

/** The inflation a giant's radius is sized with — the pin when there is one, else the curve's. */
const effectiveInflation = (b: CelestialBody): number =>
  b.overrides?.gasThermalInflation ?? gasThermalInflationFactor(b.equilibriumTempK ?? 0);

/** The mass this world's COMPOSITION wants, given whichever of mass and radius the GM is holding. */
function curveMassMe(b: CelestialBody): number {
  const massMe = (b.massKg ?? 0) / EARTH_MASS_KG;
  const radiusRe = (b.radiusKm ?? 0) / EARTH_RADIUS_KM;
  const hold = (b.overrides as Record<string, unknown> | undefined)?.densityHold ?? 'radius';
  if (hold === 'mass' || !(radiusRe > 0)) return massMe;
  return massMeFromRadiusMakeup(radiusRe, normalizeMakeup(makeupFractions(b)), effectiveInflation(b));
}

/** The density that mass-and-composition pair sits at, with nothing pinned. */
function densityOnCompositionCurve(b: CelestialBody): number | undefined {
  const massMe = curveMassMe(b);
  if (!(massMe > 0)) return undefined;
  const hold = (b.overrides as Record<string, unknown> | undefined)?.densityHold ?? 'radius';
  const radiusRe = hold === 'mass'
    ? radiusReFromMassMakeup(massMe, normalizeMakeup(makeupFractions(b)), effectiveInflation(b))
    : (b.radiusKm ?? 0) / EARTH_RADIUS_KM;
  return radiusRe > 0 ? densityGcc(massMe, radiusRe) : undefined;
}

// ── THE ROSTER ───────────────────────────────────────────────────────────────────────────────────
export const OVERRIDE_DEFS: readonly OverrideDef[] = [
  {
    key: 'albedo',
    traceLayers: ['albedo'],
    label: 'Bond albedo',
    unit: '',
    hint: 'The share of arriving starlight the world throws straight back. Pinning it replaces the whole '
      + 'surface-and-cloud model and feeds the temperature solve directly.',
    appliesTo: ['planet', 'moon'],
    // NEGATIVE ALBEDO IS THE POINT AT THE BOTTOM END. A ≥ 1 reflects everything; A < 0 means the world
    // returns MORE energy than the star delivers, i.e. something is amplifying it. The equilibrium
    // temperature goes as (1 − A)^¼, so −5 is a factor of 6 in flux and about 1.57× in temperature —
    // absurd, allowed, and warned about.
    // OWNER, 2026-08-22: "Bond albedo goes from 0-1... I thought we were going to have a negative
    // one for playing with -1 0 1". The SLIDER now reaches -1; a typed figure still goes to -5.
    soft: [-1, 1],
    hard: [-5, 1.5],
    step: 0.01,
    decimals: 3,
    // `albedoBreakdown` holds the PIN once one is set (that is what `deriveAlbedo` returns), so the
    // committed figure cannot answer "what would the physics say" while pinned. `estimateBondAlbedo`
    // CAN: it is the coarse pre-cloud heuristic and it never reads the override. Coarser than the
    // cloud model, but a real answer from the model rather than the pin handed back — which is what
    // keeps the green mark on the slider meaningful while a GM is dragging it about.
    derived: (b) => (b.overrides?.albedo != null ? estimateBondAlbedo(b) : (b.albedoBreakdown?.albedo ?? estimateBondAlbedo(b))),
    plausible: () => [0, 1],
    absurd: 'below zero the world returns more energy than its star delivers, and above one it returns '
      + 'more light than falls on it — either way something unmodelled is supplying the difference.',
    // THE ONE RECORD WHERE THE TWO BANDS COINCIDE. An albedo outside [0, 1] is not a world nobody
    // has found yet; it is energy from nowhere.
    possible: () => [0, 1],
    breaks: 'a reflectivity outside 0 to 1 does not describe reflection at all — below zero the '
      + 'surface CREATES the light it returns, and above one it returns light that never arrived.'
  },
  {
    key: 'gasThermalInflation',
    traceLayers: ['makeup', 'gravity'],
    label: 'Thermal inflation',
    unit: '×',
    hint: 'How far insolation puffs a gas envelope beyond its cold radius. Pinning it fixes the radius '
      + 'the composition would otherwise set.',
    appliesTo: ['planet', 'moon'],
    soft: [0.5, 3],
    hard: [0.1, 10],
    step: 0.01,
    decimals: 2,
    derived: (b) => gasThermalInflationFactor(b.equilibriumTempK ?? 0),
    plausible: () => [0.9, 2.5],
    absurd: 'an envelope this far from its equilibrium size is not being held there by starlight.',
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'a negative inflation would turn the envelope inside out.',
    // Inflation is the one pin the PROCESSOR never reads: it sizes a body at generation and then the
    // radius is authored. So the pin has to move the radius itself, through the SAME mass/radius
    // chain the composition editor uses (hold mass and composition, let radius follow) rather than a
    // second copy of the relation.
    commit: (b, inflation) => {
      const massMe = (b.massKg ?? 0) / EARTH_MASS_KG;
      if (!(massMe > 0)) return;
      const next = editMass(
        { massMe, radiusRe: (b.radiusKm ?? 0) / EARTH_RADIUS_KM, makeup: normalizeMakeup(makeupFractions(b)) },
        massMe, null, undefined, inflation
      );
      b.radiusKm = next.radiusRe * EARTH_RADIUS_KM;
    }
  },
  {
    key: 'radiogenicHeatK',
    traceLayers: ['temperature', 'geology'],
    label: 'Radiogenic heat',
    unit: 'K',
    hint: 'Heat from decay in the interior, added to the surface temperature in flux space. It also '
      + 'drives the world’s geological vigour independently of sunlight.',
    appliesTo: ['planet', 'moon'],
    // The 1100 K moon that prompted G37 lives at the top of this range: past the habitable zone,
    // not tidal, and beyond any greenhouse. The slider must reach it without a typed number.
    soft: [0, 200],
    hard: [0, 5000],
    step: 1,
    decimals: 1,
    derived: () => 0,
    plausible: () => [0, 40],
    absurd: 'no ordinary decay inventory sustains this much heat over a system’s lifetime.',
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'a negative heat source cools a world by decaying, which is not a thing decay does.'
  },
  {
    key: 'flareActivity',
    traceLayers: ['radiation'],
    label: 'Magnetic activity',
    unit: '',
    hint: 'The ionising half of a star’s output — flares and X-rays — which is set by the dynamo, not by '
      + 'brightness. Pinning it makes a quiet giant flare without pretending it got brighter.',
    appliesTo: ['star'],
    soft: [0, 1],
    hard: [0, 5],
    step: 0.01,
    decimals: 2,
    derived: (b) => (b.overrides?.flareActivity != null ? undefined : (b as { flareActivity?: number }).flareActivity),
    plausible: () => [0, 1],
    absurd: 'past one the star is more magnetically active than any class-and-age model allows for.',
    // SATURATION IS A LAW HERE, not a preference: past a certain rotation rate a stellar dynamo
    // stops responding and X-ray output stops climbing (ionisingOutput.IONISING_FRACTION_SATURATED),
    // and `ionisingFraction` clamps accordingly. A figure above 1 would therefore change NOTHING —
    // the slider would be lying about having an effect — so 1 is the honest ceiling.
    possible: () => [0, 1],
    breaks: 'the dynamo saturates at 1: a star cannot be more active than fully saturated, and '
      + 'asking for more changes nothing at all.'
  },
  {
    key: 'magneticFieldGauss',
    traceLayers: ['magnetism', 'radiation', 'aurora'],
    label: 'Magnetosphere',
    unit: 'G',
    hint: 'Surface field strength. Pinning it governs the magnetic shielding tags — and the radiation '
      + 'that reaches the ground — instead of the interior dynamo read.',
    appliesTo: ['planet', 'moon'],
    // 70 T = 700 000 G on a terrestrial is an owner-stated FEATURE, so the hard ceiling clears it.
    soft: [0, 100],
    hard: [0, 1e7],
    step: 0.001,
    decimals: 4,
    log: true,
    derived: (b) => b.magnetism?.nominalGauss,
    // The band the interior model itself says this body could produce. Outside it the pin gets
    // GM-override STATUS: still allowed, still saved, but labelled as something the dynamo cannot do.
    plausible: (b) => {
      const r = b.magnetism?.estimatedRangeGauss;
      return r && Number.isFinite(r.min) && Number.isFinite(r.max) ? [r.min, r.max] : null;
    },
    absurd: 'this world’s interior cannot generate a field of that strength — nothing in its rotation, '
      + 'composition or core size supports it.',
    // NO UPPER IMPOSSIBILITY, deliberately, and this is the owner's own example of the distinction:
    // a 70 tesla terrestrial has no known mechanism but breaks no law — magnetars reach far more.
    // Implausible is not impossible and the row must not pretend otherwise.
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'a negative field strength is not a weaker field, it is a meaningless one — use zero.'
  },
  {
    key: 'surfaceTempK',
    traceLayers: ['temperature', 'clouds', 'habitability'],
    label: 'Surface temperature',
    unit: 'K',
    hint: 'Pins the MEAN surface temperature outright. The day and night sides keep their swing about '
      + 'it, and the clouds, phases, classification, habitability and biosphere all follow the pin.',
    appliesTo: ['planet', 'moon'],
    // The 1100 K moon that prompted G37 sits comfortably inside the slider. The ceiling clears a
    // lava world; the typed range clears a stellar photosphere, for a GM who wants one on a moon.
    soft: [0, 1500],
    hard: [0, 100000],
    step: 1,
    decimals: 1,
    // The MEAN, not the radiating figure — the two diverge by 56 K on Luna and 130 K on Mercury, and
    // `meanSurfaceTempK` is the one authority on which is which (surface-temperature-notes section 1).
    derived: (b) => (b.overrides?.surfaceTempK != null ? undefined : meanSurfaceTempK(b)),
    // There is no universal band for a surface temperature — the plausible one is whatever this
    // world's star, air and interior give it, which is precisely the figure being replaced. So the
    // warning fires on the DISTANCE from the engine's own answer rather than on an absolute range.
    // MEASURED AGAINST THE EQUILIBRIUM TEMPERATURE, NOT THE SURFACE ONE, because the surface figure
    // IS the pin once a pin exists and a band drawn round it could never be left. The equilibrium
    // temperature is what the star delivers and the pin does not touch it, so it stays an honest
    // reference. The window is generous — a real greenhouse can double it (Venus: 232 K equilibrium,
    // 737 K surface) — so the warning fires on genuinely unaccountable figures rather than on a
    // thick atmosphere.
    plausible: (b) => {
      const teq = b.equilibriumTempK ?? 0;
      return teq > 0 ? [teq * 0.4, teq * 3.5] : null;
    },
    absurd: 'the star, the greenhouse, the tides and the interior together do not account for this — '
      + 'the difference is being supplied by something the model knows nothing about.',
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'nothing is colder than absolute zero.'
  },
  {
    key: 'pressureBar',
    traceLayers: ['clouds', 'temperature'],
    label: 'Atmospheric pressure',
    unit: 'bar',
    hint: 'Pins the surface pressure. Atmospheric escape stops eroding it, so a world can hold air '
      + 'its gravity could never have retained.',
    appliesTo: ['planet', 'moon'],
    soft: [0, 100],
    hard: [0, 1000000],
    step: 0.001,
    decimals: 4,
    log: true,
    // While pinned, `atmosphere.pressure_bar` IS the pin — but an opted-in world keeps its
    // pre-erosion baseline in `atmosphere0`, which the pin never touches (see the ordering note in
    // SystemProcessor), and that is a genuine un-pinned answer to quote.
    derived: (b) => (b.overrides?.pressureBar != null
      ? b.atmosphere0?.pressure_bar
      : (b.atmosphere?.pressure_bar ?? 0)),
    // What this world could hold on to, from the ratio of its escape velocity to the thermal speed
    // of the gas it carries — the same physics `applyAtmosphericEscape` uses, read as a yes/no here
    // rather than re-derived: a body that retains nothing has no plausible column at all.
    plausible: (b) => {
      const g = b.calculatedGravity_ms2 ?? 0;
      if (!(g > 0)) return null;
      // Earth holds ~1 bar at 9.81 m/s^2; the ceiling scales with gravity and is generous, because
      // this is a WARNING threshold and Venus already sits at 92 bar on 8.87.
      return [0, Math.max(1, 200 * (g / 9.81))];
    },
    absurd: 'a column this heavy is not held down by this world’s gravity — it should have escaped '
      + 'long ago, and nothing in the model is keeping it here.',
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'a negative pressure is a vacuum pulling inwards, which is not what an atmosphere does.'
  },
  {
    key: 'densityGcm3',
    traceLayers: ['makeup', 'gravity'],
    label: 'Bulk density',
    unit: 'g/cm³',
    hint: 'Mass, radius and density are one relation with two degrees of freedom, so pinning density '
      + 'pins the SECOND of them: hold the radius and the mass follows (a hollow world looks the same '
      + 'size and weighs less), or hold the mass and the radius follows. Gravity, escape velocity and '
      + 'every barycentre then follow honestly. The COMPOSITION is never re-inferred — that is what '
      + 'makes the contradiction visible instead of explaining it away.',
    appliesTo: ['planet', 'moon'],
    soft: [0.05, 30],
    hard: [0.000001, 1000000],
    step: 0.01,
    decimals: 3,
    choice: {
      key: 'densityHold',
      label: 'Hold',
      // The brief's recommendation is the fallback: a hollow planet looks the same size, so the
      // radius is the thing a GM most often means to keep.
      options: [
        { value: 'radius', label: 'radius (mass follows)' },
        { value: 'mass', label: 'mass (radius follows)' }
      ],
      fallback: 'radius'
    },
    companionKeys: ['densityHold'],
    // THE DENSITY THIS COMPOSITION IMPLIES, MEASURED FROM THE QUANTITY THE GM IS HOLDING — which is
    // the only reading that makes "reset to calculated" land in one step. Held radius: invert the
    // mix's mass-radius curve for the mass that radius wants, and take the density of that pair.
    // Held mass: take the curve's own zero-trim radius. Both use the SAME curve the composition
    // editor draws its range bars from, not a second model.
    //
    // Measuring it from the CURRENT mass instead is wrong and was caught by a test: with the radius
    // held, resetting a hollow world set its mass from a density computed at the hollow mass, whose
    // compression is lower — so it landed at 4.35 g/cm3 against the 5.76 its composition implies, one
    // step short of the fixed point. Reading from the held quantity closes it exactly.
    derived: (b) => densityOnCompositionCurve(b),
    // The envelope's own bounds: macroporosity for a solid (voids), thermal inflation for a giant.
    // Inside it a density is a real world; outside it, something is holding the matter apart or
    // squeezing it together, which is exactly what the anomaly tag is for.
    plausible: (b) => {
      const massMe = curveMassMe(b);
      if (!(massMe > 0)) return null;
      const env = trimEnvelope(massMe, normalizeMakeup(makeupFractions(b)));
      return env.denLo > 0 && env.denHi > env.denLo ? [env.denLo, env.denHi] : null;
    },
    absurd: 'no arrangement of this world’s own composition reaches that density — it is either far '
      + 'more hollow than voids allow, or made of something denser than the matter it is said to be.',
    possible: () => [0, Number.MAX_VALUE],
    breaks: 'a negative density is negative mass in a positive volume.',
    // The relation, and NOTHING ELSE. `bodyEdit.editDensity` would also RE-INFER the makeup to match,
    // which is right for the composition editor and wrong here: re-inferring turns "a rocky world
    // that weighs a tenth of what rock weighs" into "a world made of gas", explaining away the very
    // contradiction the GM asked for. The composition holds; one of mass and radius holds; the third
    // follows from ρ = M/(4/3·π·R³). Gravity and escape velocity are DERIVED from the result and stay
    // derived (owner Q8) — a hollow world's low gravity falls out of its mass, honestly.
    commit: (b, density) => {
      const massMe = (b.massKg ?? 0) / EARTH_MASS_KG;
      const radiusRe = (b.radiusKm ?? 0) / EARTH_RADIUS_KM;
      if (!(density > 0)) return;
      const hold = (b.overrides as Record<string, unknown> | undefined)?.densityHold ?? 'radius';
      if (hold === 'mass') {
        if (!(massMe > 0)) return;
        b.radiusKm = radiusFromMassDensity(massMe, density) * EARTH_RADIUS_KM;
      } else {
        if (!(radiusRe > 0)) return;
        b.massKg = massFromRadiusDensity(radiusRe, density) * EARTH_MASS_KG;
      }
    }
  }
] as const;

const BY_KEY = new Map<OverrideKey, OverrideDef>(OVERRIDE_DEFS.map((d) => [d.key, d]));
export const overrideDef = (key: OverrideKey): OverrideDef | undefined => BY_KEY.get(key);

/** The overrides offered for a body, in roster order. */
export function overrideDefsFor(body: CelestialBody | null | undefined): OverrideDef[] {
  if (!body) return [];
  return OVERRIDE_DEFS.filter((d) => d.appliesTo.includes(body.roleHint)) as OverrideDef[];
}

/**
 * How far outside the physics a figure sits. Three states, because two were not enough (owner):
 *
 *   ok           inside every band — the engine would not blink at it.
 *   implausible  outside what THIS body could manage, but not outside what nature can do. Amber.
 *   impossible   outside what ANYTHING can do — it breaks conservation or the definition of the
 *                quantity. Red.
 *
 * NONE OF THE THREE IS A REFUSAL. The severity changes the colour and the sentence, never whether
 * the value is accepted, saved or fed into the derivation.
 */
export type OverrideSeverity = 'ok' | 'implausible' | 'impossible';

export function overrideSeverity(def: OverrideDef, body: CelestialBody, value: number): OverrideSeverity {
  if (!Number.isFinite(value)) return 'ok';
  const hard = def.possible?.(body);
  if (hard && (value < hard[0] || value > hard[1])) return 'impossible';
  const band = def.plausible(body);
  if (band && (value < band[0] || value > band[1])) return 'implausible';
  return 'ok';
}

export interface OverrideStatus {
  def: OverrideDef;
  pinned: boolean;
  /** The pinned figure when pinned, else the engine's own. */
  value: number | undefined;
  /** The engine's own figure, always — so a row can show what reset would return to. */
  derived: number | undefined;
  /** Set when the pinned figure is outside the plausible band: the warn-not-stop sentence. */
  warning: string | null;
  /** How far outside the physics it sits — drives the colour, never the acceptance. */
  severity: OverrideSeverity;
  /** The plausible band for this body, for a row that wants to draw it. */
  band: readonly [number, number] | null;
}

/** Format a figure the way its row, badge and trace line all agree to. */
export function formatOverrideValue(def: OverrideDef, v: number | undefined): string {
  if (v == null || !Number.isFinite(v)) return '—';
  const abs = Math.abs(v);
  const text = abs !== 0 && (abs >= 1e5 || abs < 1e-3)
    ? v.toExponential(2)
    : v.toFixed(def.decimals).replace(/\.?0+$/, '') || '0';
  return def.unit ? `${text} ${def.unit}`.trim() : text;
}

/** The one warning generator. A band is a band, never a limit — this returns prose, not a clamp. */
export function overrideWarning(def: OverrideDef, body: CelestialBody, value: number): string | null {
  if (!Number.isFinite(value)) return null;
  const severity = overrideSeverity(def, body, value);
  if (severity === 'ok') return null;
  // IMPOSSIBLE gets its own sentence, because "outside the plausible range" understates it: the
  // reader should be able to tell "nobody has found one" from "this cannot exist".
  if (severity === 'impossible') {
    const hard = def.possible!(body)!;
    return `${formatOverrideValue(def, value)} is IMPOSSIBLE, not merely unlikely — outside `
      + `${formatOverrideValue(def, hard[0])} to ${formatOverrideValue(def, hard[1])}, ${def.breaks ?? def.absurd}`;
  }
  const band = def.plausible(body)!;
  const side = value < band[0] ? 'below' : 'above';
  return `${formatOverrideValue(def, value)} is ${side} the plausible range `
    + `(${formatOverrideValue(def, band[0])} to ${formatOverrideValue(def, band[1])}) — ${def.absurd}`;
}

export function overrideStatus(body: CelestialBody, def: OverrideDef): OverrideStatus {
  const pinnedRaw = (body.overrides as Record<string, unknown> | undefined)?.[def.key];
  const pinned = typeof pinnedRaw === 'number' && Number.isFinite(pinnedRaw);
  const derived = def.derived(body);
  const value = pinned ? (pinnedRaw as number) : derived;
  return {
    def,
    pinned,
    value,
    derived,
    warning: pinned ? overrideWarning(def, body, pinnedRaw as number) : null,
    severity: pinned ? overrideSeverity(def, body, pinnedRaw as number) : 'ok',
    band: def.plausible(body)
  };
}

/** Every override actually pinned on a body, in roster order. Reads nothing but authored data. */
export function activeOverrides(body: CelestialBody | null | undefined): OverrideStatus[] {
  if (!body?.overrides) return [];
  return overrideDefsFor(body).map((d) => overrideStatus(body, d)).filter((s) => s.pinned);
}

// ── WRITES ───────────────────────────────────────────────────────────────────────────────────────
// Two functions, so no editor has to remember that an empty `overrides` object must be deleted or
// that an anomaly assignment is bound to its override's lifetime.

export function setOverride(body: CelestialBody, key: OverrideKey, value: number): void {
  const def = BY_KEY.get(key);
  if (!def || !Number.isFinite(value)) return;
  body.overrides = body.overrides || {};
  const v = clampToHard(def, value);
  (body.overrides as Record<string, unknown>)[key] = v;
  def.commit?.(body, v);
}

/**
 * Hand the quantity back to the physics. The anomaly assignment goes WITH the override — the tag was
 * that override's stated reason, and a reason with nothing to explain is clutter that would outlive
 * the thing it referred to.
 */
export function clearOverride(body: CelestialBody, key: OverrideKey): void {
  if (!body.overrides) return;
  const def = BY_KEY.get(key);
  delete (body.overrides as Record<string, unknown>)[key];
  for (const companion of def?.companionKeys ?? []) delete (body.overrides as Record<string, unknown>)[companion];
  const anomalies = body.overrides.anomalies;
  if (anomalies) {
    delete anomalies[key];
    if (Object.keys(anomalies).length === 0) delete body.overrides.anomalies;
  }
  if (Object.keys(body.overrides).length === 0) delete body.overrides;
  // Hand the consequence back too: whatever the pin was moving returns to the derived figure.
  const back = def?.derived(body);
  if (def?.commit && typeof back === 'number' && Number.isFinite(back)) def.commit(body, back);
}
