// "Show all the working" — reconstructs a body's PHYSICS TRACE from its finished derived state:
// each layer's key inputs → outputs, plus the provenance of every tag (which layer produced it,
// and why). Built post-hoc from the body (no processor instrumentation), so it's risk-free and
// always in sync with what's displayed. The Newton/Apple panel renders this; every layer deep-
// links to the matching /physics section. Educational + the primary debug surface.
import type { CelestialBody, Barycenter, RulePack } from '$lib/types';
import { deriveCloudDecks, effectiveComposition } from './cloudDecks';
import { KRAFT_BREAK_MSUN } from './stellarRotation';
import { atmosphereProfile } from './atmosphereProfile';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, G } from '$lib/constants';
import { makeupFractions, bulkDensityFromMakeup } from './makeup';
import { describeTag } from '$lib/tags/tagPresentation';
import { tagOrigin } from '$lib/tags/tagLifecycle';
import { auroraEmitter } from './aurora';
import { deriveAppearance } from '$lib/rendering/planetAppearance';
import { beltInnerEdgeRadii, radiationHazardBucket, lethalDoseTime, radiationPlace, orbitalRadiationPlace } from './radiation';

export interface TraceField { label: string; value: string; }
export interface TraceLayer {
  id: string;
  title: string;
  link: string;            // /physics#section
  inputs: TraceField[];
  outputs: TraceField[];
  notes: string[];
}
export interface TagProvenance { key: string; label: string; description: string; layer: string; color: string; }
export interface PhysicsTrace { layers: TraceLayer[]; tags: TagProvenance[] }

export interface TraceContext { ageGyr?: number; star?: CelestialBody | null; host?: CelestialBody | Barycenter | null; partner?: CelestialBody | null; pack?: RulePack | null }

const AU_KM = 1.495978707e8;

const n = (v: number | undefined | null, d = 2, unit = ''): string =>
  v == null || !isFinite(v) ? '—' : `${(+v).toFixed(d)}${unit ? ' ' + unit : ''}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;
// A blocking fraction, kept honest at the top of its range: Earth's air stops 99.937% of what
// reaches it and rounding that to '100%' reads as total, which it is not.
const pctFine = (v: number): string => (v > 0.99 && v < 1 ? `${(v * 100).toFixed(v > 0.999 ? 3 : 1)}%` : pct(v));

// A dose in mSv/yr, scaled ONCE to a unit a reader can hold. Same three-step scale the info block
// uses (A33) — a figure that runs to eight millisievert digits is not a figure anybody reads.
// A photon/particle PAIR on one scale, picked from whichever dominates.
const dosePair = (a: number, b: number): string => {
  const big = Math.max(a, b);
  const [div, unit] = big >= 3.65e6 ? [365000, 'Sv/day'] : big >= 10000 ? [1000, 'Sv/yr'] : [1, 'mSv/yr'];
  const f = (x: number) => (x / div).toLocaleString(undefined, { maximumFractionDigits: x / div < 10 ? 2 : 0 });
  return `${f(a)} / ${f(b)} ${unit}`;
};
const dose = (mSvYr: number | undefined | null): string => {
  const v = mSvYr ?? 0;
  if (!isFinite(v) || v <= 0) return '—';
  if (v >= 3.65e6) return `${(v / 365000).toLocaleString(undefined, { maximumFractionDigits: 1 })} Sv/day`;
  if (v >= 10000) return `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })} Sv/yr`;
  return `${v.toLocaleString(undefined, { maximumFractionDigits: v < 10 ? 2 : 0 })} mSv/yr`;
};

// Which gases in this air COULD form a cloud at all — the data's answer, before any temperature is
// considered. A gas with no `cloud` block simply is not cloud-forming, and saying so is half the
// explanation when a world's sky comes out empty.
function condensableSummary(comp: Record<string, number>, pack?: RulePack | null): string {
  const defs = pack?.gasPhysics ?? {};
  const able = Object.keys(comp).filter((g) => (comp[g] ?? 0) > 0 && defs[g]?.cloud);
  return able.length ? able.join(', ') : 'none in this mix';
}

// Which physics layer a tag namespace comes from.
const NS_LAYER: Record<string, string> = {
  structure: 'Fluid layers', geology: 'Geological activity', magnetic: 'Magnetism',
  thermal: 'Temperature & tidal heat',
  tidal: 'Temperature range & tidal heat', habitability: 'Habitability', atmosphere: 'Atmosphere',
  climate: 'Climate', hazard: 'Radiation / hazards', orbit: 'Orbit', origin: 'Generation',
  stability: 'Orbital stability', barycenter: 'Barycentres', shape: 'Rotational shape',
  ring: 'Rings', resonance: 'Orbital resonance', fate: 'Orbital stability', biodiversity: 'Biosphere',
  aurora: 'Magnetism',
  // "Reasons to visit" PoI categories — derived by the PoI rules pack, not a physics layer.
  resource: 'Reasons to visit', science: 'Reasons to visit', frontier: 'Reasons to visit', intrigue: 'Reasons to visit'
};
// Flat (non-namespaced) tag keys → their producing layer. All the kept gas-role tags come from
// the Atmosphere layer.
const ATMOSPHERE_TAGS = [
  'acid-rain', 'asphyxiant', 'breathable-human', 'breathable-human-hypoxic', 'contact-hazard',
  'corrosive', 'crushing-atmosphere', 'extreme-fire-hazard', 'fire-hazard', 'flammable',
  'greenhouse', 'haze-former', 'heavy-gas', 'high-humidity', 'highly-corrosive', 'highly-toxic',
  'hypergolic', 'inert', 'irritant', 'lifting-gas', 'organic-solvent', 'oxidizer',
  'oxygen-toxicity', 'ozone-depleter', 'prebiotic-precursor', 'reducing', 'solvent-hazard',
  'super-greenhouse', 'technosignature', 'toxic-human'
];
const FLAT_LAYER: Record<string, string> = Object.fromEntries(ATMOSPHERE_TAGS.map((t) => [t, 'Atmosphere']));

export function buildPhysicsTrace(body: CelestialBody, ctx: TraceContext = {}): PhysicsTrace {
  const layers: TraceLayer[] = [];
  const mk = makeupFractions(body);
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  const radiusRe = (body.radiusKm ?? 0) / EARTH_RADIUS_KM;
  const densityGcc = body.massKg && body.radiusKm
    ? (body.massKg / ((4 / 3) * Math.PI * Math.pow(body.radiusKm * 1000, 3))) / 1000 : 0;

  // A member of a binary orbits the BARYCENTRE at a tiny separation; the orbit that governs its
  // temperature AND stability (and reads sensibly) is the barycentre's HELIOCENTRIC orbit, not the
  // ~0.0001 AU pair orbit. Compute it once here so both layers agree. (ctx.host is the parent node.)
  const bary = ctx.host && ctx.host.kind === 'barycenter' ? (ctx.host as Barycenter) : null;
  const heliocentricEl = bary?.orbit?.elements ?? body.orbit?.elements;
  // Co-orbit partner separation (semi-major of the relative orbit = sum of each member's orbit
  // about the barycentre). Used to explain the small self-orbit distance in the panels.
  const partnerSepKm = bary && ctx.partner
    ? ((body.orbit?.elements.a_AU ?? 0) + (ctx.partner.orbit?.elements.a_AU ?? 0)) * AU_KM
    : null;

  // 0. Classification — WHY this type (headline). The winning fingerprint, the defining bands it
  //    matched (with the body's value + fit), and the runner-up it beat.
  if (body.classification) {
    const c = body.classification;
    const inputs: TraceField[] = c.fallback
      ? [{ label: 'No fingerprint matched', value: 'mass-based fallback' }]
      : c.bands.map((b) => ({ label: b.feature, value: `${b.value} ∈ [${b.band}] · fit ${b.fit}` }));
    const outputs: TraceField[] = [
      { label: 'Type', value: c.base.replace('planet/', '').replace(/-/g, ' ') },
      { label: 'Score (mean fit × specificity × weight)', value: n(c.baseScore, 2) }
    ];
    if (c.modifiers.length) outputs.push({ label: 'Modifiers', value: c.modifiers.map((m) => m.class.replace('planet/', '')).join(', ') });
    const notes: string[] = [];
    if (c.runnerUp) notes.push(`Beat the runner-up ${c.runnerUp.class.replace('planet/', '')} (${c.runnerUp.score}) — a type scores its MEAN band fit times a mild bonus for how many bands it defines, so a specific type wins when it fits cleanly, but padding a claim with barely-true bands no longer helps it.`);
    else if (!c.fallback) notes.push('The only type whose defining bands this body fell within.');
    // B16 — the ordering ABOVE the score, which the score line alone does not reveal. Without this a
    // reader comparing two candidates in the list below sees a smaller number winning and concludes
    // the panel is broken.
    notes.push('A COMPLETE MATCH BEATS A PARTIAL ONE, whatever the scores say. If this world falls inside every band a type defines, no type it falls outside of can win — the score only decides between types that all genuinely fit. Without that rule a heavily-weighted type could buy its way past a better-fitting rival on a single band it merely came close to.');
    // B25 — the eyeball fingerprints gained a PRECONDITION, and a precondition that is invisible
    // reads as an unexplained absence: "why is this locked, roasting world not a hot eyeball?"
    notes.push('Some types also carry GATES — preconditions that must hold or the type is ruled out entirely, and that earn no score if they do. The eyeballs are gated on having a solid surface, because a permanently-lit dayside is a statement about GROUND: a tidally locked gas giant is not an eyeball however hot it is. A gate is deliberately not a band, because a band that is true of everything which survives it would drag a poor defining band UP by averaging — rewarding the worst matches most.');
    layers.push({ id: 'classification', title: 'Classification — why this type', link: '/physics#classification', inputs, outputs, notes });
  }

  // 1. Interior makeup → density, radius
  layers.push({
    id: 'makeup', title: 'Interior makeup', link: '/physics#makeup',
    inputs: [
      { label: 'Mass', value: n(massMe, 3, 'M⊕') },
      { label: 'Makeup source', value: body.makeup ? 'explicit' : 'inferred from density' }
    ],
    outputs: [
      { label: 'Metal / Rock / Carbon', value: `${pct(mk.metal)} / ${pct(mk.rock)} / ${pct(mk.carbon)}` },
      { label: 'Ice / Gas', value: `${pct(mk.ice)} / ${pct(mk.gas)}` },
      { label: 'Bulk density', value: n(body.makeup ? bulkDensityFromMakeup(body.makeup) : densityGcc, 2, 'g/cc') },
      { label: 'Radius', value: n(radiusRe, 3, 'R⊕') }
    ],
    notes: []
  });

  // 2. Gravity / size
  const gravityG = body.massKg && body.radiusKm
    ? (G * body.massKg / Math.pow(body.radiusKm * 1000, 2)) / 9.81 : 0;
  layers.push({
    id: 'gravity', title: 'Gravity & size', link: '/physics#gravity',
    inputs: [{ label: 'Mass', value: n(massMe, 3, 'M⊕') }, { label: 'Radius', value: n(radiusRe, 3, 'R⊕') }],
    outputs: [
      { label: 'Surface gravity', value: n(gravityG, 2, 'g') },
      { label: 'Density', value: n(densityGcc, 2, 'g/cc') }
    ],
    notes: []
  });

  // 2b. SPIN — the axis and the period, and where each number CAME FROM (inbox B10, C3(c)). The
  //     trace had neither, which mattered because the seasonal term in the temperature range below
  //     is driven by the tilt: a reader could see a seasonal swing explained by nothing.
  const tiltDeg = (body as any).axial_tilt_deg as number | undefined;
  const rotH = body.rotation_period_hours;
  if (tiltDeg != null || rotH != null) {
    const tagKeys = (body.tags ?? []).map((t) => t.key);
    const axisInferred = tagKeys.includes('spin/axis-inferred');
    const periodInferred = tagKeys.includes('spin/period-inferred');
    const tipped = tagKeys.includes('spin/tipped');
    // The tilt and the period are OUTPUTS of the spin model, not inputs to it — which also keeps
    // the card from ever being empty, the invariant physicsTrace.spec asserts.
    const spinIn: TraceField[] = [];
    const spinOut: TraceField[] = [];
    if (tiltDeg != null) {
      spinOut.push({
        label: 'Axial tilt' + (axisInferred ? ' (inferred, not measured)' : ''),
        value: n(tiltDeg, 1, '°') + (tipped ? ' — tipped over by an impact' : '')
      });
    }
    if (rotH != null) {
      spinOut.push({
        label: 'Rotation period' + (periodInferred ? ' (inferred, not measured)' : (body as any).tidallyLocked ? ' (set by the tidal lock)' : ''),
        value: n(Math.abs(rotH), 2, 'h')
      });
    }
    const spinNotes: string[] = [];
    // A STAR'S SPIN IS DERIVED OR DRAWN, AND THE READER SHOULD BE ABLE TO TELL WHICH (inbox B43).
    // This module claims to SHOW THE WORKING, so a star that has just acquired a rotation — and
    // visibly flattened because of it — must not do so silently. The split is a real physical
    // boundary, not a modelling convenience, and it is the best teaching example the star model has:
    // it can be checked against stars the reader has heard of.
    if (body.roleHint === 'star' && rotH != null) {
      const mSolar = (body.massKg ?? 0) / 1.989e30;
      const braked = mSolar < KRAFT_BREAK_MSUN;
      spinIn.push({ label: 'Mass', value: n(mSolar, 2, ' M☉') });
      spinIn.push({ label: 'Kraft break', value: `${KRAFT_BREAK_MSUN} M☉ — ${braked ? 'BELOW: braked' : 'ABOVE: never brakes'}` });
      if (braked && ctx.ageGyr) spinIn.push({ label: 'System age', value: n(ctx.ageGyr, 2, ' Gyr') });
      spinNotes.push(braked
        ? `DERIVED, not drawn. Below about ${KRAFT_BREAK_MSUN} M☉ a star has a convective envelope, so it generates a magnetic field, so its magnetised wind carries angular momentum away — and it SPINS DOWN predictably. Period goes as the square root of age (Skumanich), with a mass term: at the same age, a redder star turns slower. The relation is anchored on the Sun, which is 25 days at 4.6 Gyr; Barnard's Star, far lighter and older, takes about 130 days.`
        : `DRAWN, and that is the honest tool here. Above about ${KRAFT_BREAK_MSUN} M☉ a star has a radiative envelope, generates no field for its wind to couple to, and so never brakes at all — it keeps roughly the rotation it was born with for its whole life. THAT is why Vega spins fast enough to be visibly squashed: not that it is young, but that nothing ever slowed it. Birth spin cannot be recovered after the fact, so it is drawn from the observed spread as a FRACTION OF BREAKUP rather than a speed — breakup varies enormously with mass, so a fraction is the only figure that means the same thing across the range.`);
      spinNotes.push('The flattening follows from the spin and the density with no further assumption: the same relation that squashes Jupiter and Saturn. A star at a large fraction of its breakup spin is a genuinely oblate spheroid, and both views draw it that way.');
    }
    // AND WHEN THERE IS NO PERIOD, SAY WHY. Silence would read as "this star does not turn", which is
    // never true — every one of these is "we could not work it out", and each has a different reason.
    if (body.roleHint === 'star' && rotH == null) {
      const cls = body.classes?.[0] ?? '';
      spinNotes.push(
        /star\/(WD|NS|BH|BH_active|magnetar)/.test(cls)
          ? 'NOT DERIVED, and deliberately so: the spin of a remnant comes from the collapse that made it, not from a main-sequence history, and a millisecond pulsar would break every assumption the stellar relation rests on.'
          : /star\/[OBAFGKM]-(I|III)/.test(cls)
          ? 'NOT DERIVED: gyrochronology is a MAIN-SEQUENCE relation, and this star has left it. Swelling to tens of times its old radius spreads the angular momentum over a vastly larger body and slows the star enormously — Arcturus turns once in about 500 days. Working that out needs the radius it had BEFORE it swelled, which is not recorded, so the spin is left unstated rather than guessed at.'
          : 'NOT DERIVED, because the age it would rest on is not known. The catalogue gives this system no measured age, and a rotation calculated from a borrowed figure would look exactly like one calculated from a real one. An unstated spin reads as no spin, so the star is drawn round.'
      );
    }
    if (axisInferred || periodInferred) {
      spinNotes.push('MARKED AS INFERRED, and that mark is a promise. A generated world\'s spin is a plausible value from the formation model, not a measurement — so it is tagged, and a figure WITHOUT that tag is one somebody actually observed. Earth\'s 23.4° and Uranus\'s 97.8° are known; a generated neighbour sitting beside them in the same starmap must not read as though it were.');
    }
    spinNotes.push('A world condenses from the same disc as its star, so it starts near the disc normal and is nudged from there. A late giant impact does not nudge an axis, it RE-POINTS it — which is why the tipped cases are drawn from an isotropic direction rather than a wider spread, and why they land where Uranus (on its side) and Venus (turning backwards) are rather than smearing everything toward 90°.');
    if (body.orbit && (body.roleHint === 'moon')) {
      const eclipticFramed = String((body.orbit as any).frame ?? '').toLowerCase() === 'ecliptic';
      spinIn.push({
        label: 'Orbit quoted in',
        value: eclipticFramed ? 'the SYSTEM plane' : "its parent's EQUATOR"
      });
      spinNotes.push(eclipticFramed
        ? 'This moon sits beyond its host\'s LAPLACE RADIUS, where the star\'s tide beats the host\'s equatorial bulge — so its orbit follows the system plane, not the host\'s equator. Our own Moon is the case: its 5.1° is quoted to the ecliptic, and to Earth\'s equator it wanders between 18.3° and 28.6° with no single number to give.'
        : 'This moon sits INSIDE its host\'s Laplace radius, where the host\'s equatorial bulge governs, so its inclination is quoted in the host\'s equator and it rides the host\'s tilt. That is why Saturn\'s inner moons sit in the ring plane rather than flat in the system — the rings are in that same equator.');
    }
    if (tiltDeg != null) {
      spinOut.push({
        label: 'Seasons',
        value: Math.min(Math.abs(tiltDeg), 180 - Math.abs(tiltDeg)) > 12
          ? 'yes — the tilt drives a seasonal swing in the range below'
          : 'negligible — too upright for a real season'
      });
    }
    // DESPUN HAS TWO END STATES AND THE TRACE MUST NOT STATE THE WRONG ONE (inbox B69). "One face
    // permanently toward its primary" is false of a captured resonance — Mercury turns three times
    // for every two orbits, so its whole surface sees the star.
    if ((body as any).tidallyLocked) {
      const res = ((body as any).tags ?? []).find((t: any) => t.key === 'orbit/spin-orbit-resonance')?.value;
      spinOut.push(res
        ? { label: 'Despun into a resonance', value: `${res} spin-orbit — no permanent face; the whole surface sees the star` }
        : { label: 'Tidally locked', value: 'one face permanently toward its primary' });
    }
    if (spinOut.length) {
      layers.push({
        id: 'spin', title: 'Spin axis & rotation', link: '/physics#spin',
        inputs: spinIn, outputs: spinOut, notes: spinNotes
      });
    }
  }

  // 3. Temperature (equilibrium → mean → range)
  const tempOut: TraceField[] = [
    { label: 'Equilibrium temp', value: n(body.equilibriumTempK, 0, 'K') },
    { label: 'Greenhouse Δ', value: n(body.greenhouseTempK, 0, 'K') },
    { label: 'Tidal heat Δ (capped)', value: n(body.tidalHeatK, 1, 'K') },
    { label: 'Radiogenic Δ', value: n(body.radiogenicHeatK, 1, 'K') },
    { label: 'Internal heat Δ', value: n(body.internalHeatK, 1, 'K') },
    // TWO temperatures, and saying which is which is the whole point of this layer. The composed
    // figure balances POWER — it is what the body radiates — and radiated power goes as T⁴, so a
    // world that bakes by day and freezes by night gives off as much as a uniformly warm one while
    // AVERAGING far below it. The mean below is the average of its day and night sides, which is what
    // a thermometer on the ground would read; they agree on anything well-mixed (inbox B63).
    { label: 'Radiating temp (power balance)', value: n(body.temperatureK, 0, 'K') }
  ];
  const selfLumTeff = (body as any).selfLuminousTeffK as number | undefined;
  if ((body as any).isSelfLuminous && selfLumTeff) {
    tempOut.splice(0, 0,
      { label: 'Self-luminous Teff (own heat)', value: n(selfLumTeff, 0, 'K') },
      { label: 'Own luminosity', value: `${(((body as any).internalLuminositySolar ?? 0) as number).toExponential(1)} L☉` }
    );
  }
  if (body.temperatureProfile) {
    const p = body.temperatureProfile;
    tempOut.push({ label: 'Mean surface temp (day/night average)', value: n(p.meanK, 0, 'K') });
    tempOut.push({ label: 'Total range', value: `${p.totalMinK}–${p.totalMaxK} K` });
    for (const c of p.components) tempOut.push({ label: c.label, value: `${c.lowK}–${c.highK} K` });
  } else if (body.temperatureRangeK) {
    tempOut.push({ label: 'Surface range', value: `${body.temperatureRangeK.min}–${body.temperatureRangeK.max} K` });
  }
  // 3b. ALBEDO — its own layer, because it is its own derivation and the working is the interesting
  //     part (inbox B5). It used to be a single line inside Temperature reading "0.256 — Cloud-free
  //     moderate oxide dust over bare ground", which states the answer and hides every step of it.
  //     Bare rock is DARK; brightness is what has settled on top. Mars is 0.105 as bare ground and
  //     0.252 once its oxide dust is counted, and those two numbers ARE the explanation.
  if (body.albedoBreakdown) {
    const ab = body.albedoBreakdown as any;
    const albInputs: TraceField[] = [
      {
        label: mk.gas > 0.5 ? 'Deep atmosphere (no surface)' : 'Bare ground, from the makeup',
        value: n(ab.bareAlbedo, 3)
      }
    ];
    if (ab.deposit) {
      albInputs.push({ label: `Deposit on the ground: ${ab.deposit}`, value: `${n(ab.bareAlbedo, 3)} → ${n(ab.surfaceAlbedo, 3)}` });
    }
    if ((ab.cloudCover ?? 0) > 0) {
      albInputs.push({
        label: `Top cloud deck${ab.cloudSpecies ? ` (${ab.cloudSpecies})` : ''}`,
        value: `reflects ${n(ab.cloudAlbedo, 2)} over ${pct(ab.cloudCover)} of the sky`
      });
    }
    layers.push({
      id: 'albedo', title: 'Albedo — how much light it throws back', link: '/physics#albedo',
      inputs: albInputs,
      outputs: [
        { label: 'Surface (ground + deposits)', value: n(ab.surfaceAlbedo, 3) },
        { label: 'Bond albedo (what the world reflects)', value: n(ab.albedo, 3) }
      ],
      notes: [
        'BARE ROCK IS DARK, and metal is darker than rock — a space-weathered iron regolith is about the darkest natural surface there is, which is why Mercury at 62% metal reflects 0.088 and is the darkest rocky body in the Solar System. What makes a world BRIGHT is what has settled on it.',
        'Three ways a surface stops being bare rock, all read from physics the engine already derived for other reasons. AGEING ICE: a frozen shell is bright when it is fresh and filthy when it is old, because a non-ice lag of infall and radiation-processed material builds on it until something resurfaces the world — Enceladus keeps laying new ice down with its plumes and reflects 0.81, while Callisto has sat untouched for four and a half billion years and reflects 0.11, the darkest ice in the solar system. One process, both ends. OXIDE DUST: the ferric fines that make Mars orange, graded from its iron fraction, how oxidising the air is and how long the surface has gone unrepaved. VOLATILE FROST: if the atmosphere\'s dominant gas is below ITS OWN freezing point at the surface it is not really an atmosphere, it is lying on the ground — Io\'s sulphur dioxide freezes at 198 K and Io\'s surface is near 100, which is the whole of its 0.63.',
        'The rust is worked out INSIDE the temperature solve, not before it, because it has to be: a surface is repaved quickly where there is liquid water and slowly where there is not, so how rusty a world is depends on its temperature and its temperature depends on how rusty it is. That closes a real feedback — colder, water freezes, the lid stops moving, the surface ages, more rust, brighter, colder — which is the same loop that gives Earth its snowball states, so the solve reports any world where it fails to settle instead of presenting a marginal answer as a firm one.',
        'And a change here propagates: darkening Mars correctly took its equilibrium temperature from 216.7 K to 209.8, which is below the 214.5 K its thin water-ice wisps need to condense — so Mars got its clouds back from an ALBEDO fix, with nothing in the cloud model touched. That chain, makeup → deposits → albedo → temperature → cloud, is the clearest case in the engine of physics driving appearance.'
      ]
    });
  }

  layers.push({
    id: 'temperature', title: 'Temperature & tidal heat', link: '/physics#temp-range',
    inputs: [
      {
        label: bary ? `Semi-major axis (to ${ctx.star?.name ?? 'star'}, as the ${bary.name || 'pair'})` : 'Semi-major axis',
        value: n(heliocentricEl?.a_AU, 3, 'AU')
      },
      { label: 'Eccentricity', value: n(heliocentricEl?.e, 3) },
      ...(partnerSepKm != null && ctx.partner ? [{
        label: `Co-orbit partner (${ctx.partner.name})`,
        value: `${n(partnerSepKm, 0, 'km')} apart`
      }] : []),
      { label: 'Star', value: ctx.star?.name ?? '—' },
      ...(ctx.host && (ctx.host as any).isSelfLuminous ? [{
        label: `+ self-luminous host (${ctx.host.name})`,
        value: `${n((ctx.host as any).selfLuminousTeffK, 0, 'K')} · ${(((ctx.host as any).internalLuminositySolar ?? 0) as number).toExponential(1)} L☉`
      }] : []),
      ...(body.albedoBreakdown ? [{
        label: 'Albedo (derived)',
        value: `${body.albedoBreakdown.albedo} — ${body.albedoBreakdown.note}`
      }] : [])
    ],
    outputs: tempOut,
    notes: [
      ...(ctx.host && (ctx.host as any).isSelfLuminous ? [`Warmed and irradiated by BOTH ${ctx.star?.name ?? 'the star'} AND its self-luminous host ${ctx.host.name} (a brown dwarf, ${n((ctx.host as any).selfLuminousTeffK, 0, 'K')}). Flux and radiation SUM over every luminous source (Σ Lᵢ / 4πdᵢ²), so a close-in moon of a brown dwarf is far warmer and more irradiated than its distance from the system star alone would imply.`] : []),
      ...((body as any).isSelfLuminous && selfLumTeff ? [`Self-luminous: a brown dwarf (~${n((body.massKg ?? 0) / 1.898e27, 0)} M♃) that radiates its OWN heat from gravitational contraction and early deuterium burning. Its surface sits at ~${n(selfLumTeff, 0, 'K')} regardless of the distant star, it cools with age (L→T→Y, floor ~250 K), and it warms & irradiates its moons like a mini-star.`] : []),
      ...(bary ? [`Equilibrium temperature is set by the distance to ${ctx.star?.name ?? 'the star'} — the ${bary.name || 'barycentre'}'s ${n(heliocentricEl?.a_AU, 1, 'AU')} orbit — not the small orbit ${ctx.partner ? `around its partner ${ctx.partner.name}` : 'within the pair'}.`] : []),
      ...((body.radiogenicHeatK ?? 0) > 0 ? [`Radiogenic heat (+${n(body.radiogenicHeatK, 1, 'K')}, a GM override) is summed into the mean surface temperature in flux space alongside greenhouse, tidal and internal heat — so it feeds the habitability temperature score. The same override also drives the world's geological vigour (tectonics/volcanism), independently of sunlight.`] : []),
      ...(body.temperatureRangeK && body.temperatureRangeK.max - body.temperatureRangeK.min > 5
        ? ['THE DAY AND NIGHT SIDES COME FROM THE ENERGY BALANCE AND THE MEAN FALLS OUT OF THEM, not the other way round. The sunlit side is bounded by the temperature at which the ground re-radiates the light falling straight down on it — √2 × the equilibrium figure, 110 °C for the Moon against a measured noon of about 120 °C — and the night side is held up by the heat the ground stored during the day, which is why a fast rotator freezes far less deeply than a slow one at the same distance. The range then adds latitude, season and localized (tidal-volcanic) hotspots.'] : [])
    ]
  });

  // 4. Fluid layers
  const fl = body.hydrosphere?.layers ?? [];
  layers.push({
    id: 'fluids', title: 'Fluid layers', link: '/physics#fluids',
    inputs: [
      { label: 'Hydrosphere', value: body.hydrosphere?.composition ? `${body.hydrosphere.composition} (${pct(body.hydrosphere.coverage ?? 0)})` : 'none' },
      { label: 'Atmosphere', value: body.atmosphere?.main ?? 'none' }
    ],
    outputs: fl.length
      ? fl.map((l) => ({ label: l.location, value: l.liquid + (l.conductive ? ' (conductive)' : '') }))
      : [{ label: 'Layers', value: 'none' }],
    notes: []
  });

  // 4b. Clouds — the layer that shows WHY a world's sky looks the way it does. Rebuilt from the
  //     body's own atmosphere rather than read off the tags, so it can show the working: how cold
  //     the sky gets, and where each substance crosses into condensing.
  {
    const pack = ctx.pack ?? null;
    const comp = effectiveComposition({ ...(body.atmosphere?.composition ?? {}) }, pack);
    const profile = atmosphereProfile(body, comp, pack);
    const decks = deriveCloudDecks(body, pack);
    if (profile) {
      const outputs: TraceField[] = decks.length
        ? decks.map((d) => ({
            label: d.species,
            value: `${d.bucket} — base ${d.baseBar! >= 0.01 ? n(d.baseBar, 2, ' bar') : d.baseBar!.toExponential(1) + ' bar'} at ${n(d.baseK, 0, ' K')}, ${d.precip}`
          }))
        : [{ label: 'Cloud layers', value: 'none — nothing in this air condenses before the sky stops cooling' }];
      layers.push({
        id: 'clouds', title: 'Clouds & weather', link: '/physics#clouds',
        inputs: [
          { label: 'Reference level', value: n(profile.pSurfBar, 3, ' bar') + ' at ' + n(profile.tSurfK, 0, ' K') },
          { label: 'Cooling with height', value: `${profile.kappa.toFixed(2)} (from the gases present)` },
          { label: 'Coldest sky', value: n(profile.tSkinK, 0, ' K') + ` — reached at ${profile.tropopauseBar >= 0.01 ? n(profile.tropopauseBar, 2, ' bar') : profile.tropopauseBar.toExponential(1) + ' bar'}` },
          { label: 'Condensable gases', value: condensableSummary(comp, pack) }
        ],
        outputs,
        notes: [
          'A gas condenses where its own pressure crosses the point it can no longer stay a gas. Rising air cools, but its gases thin out more slowly than it cools — so the two lines cross, and that crossing is the cloud base.',
          ...(decks.some((d) => d.precip === 'virga')
            ? ['Virga: what falls evaporates before it lands, so it recycles into the deck and the cover never clears.'] : []),
          'Only the atmosphere from the reference level UP is modelled — as far as you could see into it.'
        ]
      });
    }
  }

  // 5. Magnetism
  if (body.magnetism) {
    const m = body.magnetism;
    layers.push({
      id: 'magnetism', title: 'Magnetism', link: '/physics#magnetism',
      inputs: [
        { label: 'Rotation period', value: n(body.rotation_period_hours, 1, 'h') },
        { label: 'Conductive interior', value: fl.find((l) => l.location === 'interior')?.liquid ?? (fl.find((l) => l.location === 'subsurface') ? 'subsurface ocean' : 'none') }
      ],
      outputs: [
        { label: 'Dynamo source', value: m.source },
        { label: 'Geometry', value: `${m.geometry} · ${m.intrinsic ? 'intrinsic' : 'induced'}` },
        { label: 'Implied field', value: `${m.estimatedRangeGauss.min}–${m.estimatedRangeGauss.max} G` }
      ],
      notes: m.notes.slice(0, 1)
    });
  }

  // 5a. RADIATION — the whole quantity was MISSING from this trace (inbox D5). Fourteen layers
  //     explained a body and not one of them mentioned the dose a GM actually reads on the card, so
  //     for a Galilean moon the panel that claims to show the working showed everything EXCEPT the
  //     term that dominates the answer. Read post-hoc from the committed fields, like every other
  //     layer here, so it cannot disagree with what is displayed.
  if (body.roleHint !== 'star' && typeof body.surfaceRadiation === 'number') {
    const shieldMag = body.radiationShieldingMag ?? 0;
    const shieldAtmo = body.radiationShieldingAtmo ?? 0;
    const ph = (body as any).photonRadiation ?? 0;
    const pa = (body as any).particleRadiation ?? 0;
    const orbital = (body as any).orbitalRadiation as number | undefined;
    const ownEdge = (body as any).beltInnerEdgeRadii as number | undefined;
    const hostBody = ctx.host && ctx.host.kind === 'body' ? (ctx.host as CelestialBody) : null;
    const hostField = hostBody?.magneticField?.strengthGauss ?? 0;
    const hostRadiusKm = hostBody?.radiusKm ?? 0;
    const aAU = body.orbit?.elements.a_AU ?? 0;
    const rHost = hostRadiusKm > 0 && aAU > 0 ? (aAU * AU_KM) / hostRadiusKm : 0;

    const hostFieldPresent = !!hostBody && hostField >= 0.01 && rHost > 0;
    const inputs: TraceField[] = [
      // TWO figures because they are two questions, and on a moon inside a giant's magnetosphere
      // they differ by a factor of 700,000 (Io: 26,279 against 0.037). The field carrying the total
      // was called `stellarRadiation` until B34 renamed it for what it measures.
      { label: 'Starlight (Earth = 1)', value: n(body.starlightFlux, 3) },
      { label: 'Total incident flux (Earth = 1)', value: n(body.totalIncidentFlux, 3) + (hostFieldPresent ? ' — starlight AND the trapped belt' : '') }
    ];
    // The host's trapped belt — the dominant term for a close-in moon of a strong-field giant, and
    // the one this trace used to omit entirely.
    if (hostFieldPresent && hostBody) {
      // Falls back to the model's own constants when no pack is supplied — beltConstants reads
      // generation_parameters unguarded, and a trace must never be the thing that throws.
      const edge = beltInnerEdgeRadii(hostBody, (ctx.pack ?? {}) as RulePack);
      inputs.push({ label: `Inside ${hostBody.name ?? 'host'}'s belt`, value: `${n(rHost, 2)} host radii — belt starts at ${n(edge, 2)}` });
      inputs.push({ label: 'Host field × spin', value: `${n(hostField, 3, 'G')} · ${n(Math.abs(hostBody.rotation_period_hours ?? 0), 1, 'h')}` });
    }
    // A body inside its OWN belt. The inner edge comes from the atmosphere's scale height, and an
    // airless body has no absorber at all, so its belt reaches the ground.
    if (typeof ownEdge === 'number') {
      inputs.push({
        label: 'Own belt starts at',
        value: ownEdge <= 1.0001
          ? '1.00 body radii — airless, so nothing absorbs it before the ground'
          : `${n(ownEdge, 3)} body radii — 150 scale heights (${n(150 * (body.atmosphere?.scaleHeightKm ?? 0), 0, 'km')}) of absorbing air below it`
      });
    }
    inputs.push({ label: 'Magnetosphere deflects', value: `${pctFine(shieldMag)} of the particle channel` });
    inputs.push({ label: 'Atmosphere blocks', value: `${pctFine(shieldAtmo)} of what reaches it` });

    const band = radiationHazardBucket(body.surfaceRadiation, ctx.pack);
    const time = lethalDoseTime(body.surfaceRadiation, ctx.pack);
    // WHICH PLACE, from the shared helper rather than a third copy of the test (inbox B11). This
    // used to re-implement it inline — ring / gas>0.5 / else — beside the info block's version and
    // the processor's, which is exactly the duplication the standing rule is about. It also read
    // the raw makeup fraction, so an ICE giant fell through and reported a "surface" dose.
    const place = radiationPlace(body);
    const where = place.charAt(0).toUpperCase() + place.slice(1);
    const outputs: TraceField[] = [
      { label: where, value: `${dose(body.surfaceRadiation)} — ${band}` },
      { label: 'Time to a lethal dose', value: time ? `~${time}` : 'past 50 years — the acute model says nothing here; this is a chronic cancer risk, not radiation sickness' },
      // ONE unit for the pair, chosen from the larger — the A33 rule. Printing '17 mSv/yr / 36 Sv/day'
      // side by side is two figures a million-fold apart told apart by a suffix.
      { label: 'Photon / particle', value: dosePair(ph, pa) }
    ];
    // The SECOND figure names its own place too (inbox B27). "Above the atmosphere" read as "the
    // dose where a ship parks", and Earth's is quoted at the INNER EDGE OF THE BELTS — 1,262 km up,
    // where the figure is four thousand times what the ISS takes at 400 km, because low orbit sits
    // BENEATH the belts. The altitude is derived per body from where its own air stops absorbing.
    if (typeof orbital === 'number' && orbital > body.surfaceRadiation * 1.5) {
      const op = orbitalRadiationPlace(body);
      outputs.push({
        label: op.charAt(0).toUpperCase() + op.slice(1),
        value: `${dose(orbital)} — ${radiationHazardBucket(orbital, ctx.pack)}`
      });
    }

    layers.push({
      id: 'radiation', title: 'Radiation', link: '/physics#radiation',
      inputs, outputs,
      notes: [
        'Two channels, shielded differently. PHOTONS (UV, X-ray) are stopped by air alone; PARTICLES (stellar wind, flares, trapped belts) are deflected by a magnetosphere first and then absorbed by whatever air is left. That is why an airless world with a field and a world with air and no field fail in different ways.',
        'A TRAPPED BELT is not a light source and does not obey inverse square. Particles caught by the field of a giant and accelerated by its rotation form a population confined near the planet, so the dose falls off EXPONENTIALLY in host radii: Io and Callisto sit 4.4x apart in distance and five orders of magnitude apart in dose, which no power law fits. The belt is also cut off below an INNER EDGE, because a particle whose mirror point lies in dense air is absorbed within one bounce — without that edge the Van Allen belt around Earth would read at ground level and its surface would come out lethal.',
        'A body with no surface reports TWO figures rather than one, and the difference is the point: Jupiter is a few mSv/yr at its 1-bar reference level and hundreds of Sv/day in the space above it. One number cannot answer both "what does the ground take" and "what does a ship take".',
        'EACH FIGURE NAMES ITS OWN PLACE, and for the second one that matters more than it sounds. It is quoted at the INNER EDGE OF THE TRAPPED BELTS, which for Earth is about 1,262 km up — so Earth reads days-to-lethal while the ISS at 400 km takes roughly 150 mSv a year, because low orbit sits BENEATH the belts except over the South Atlantic Anomaly. Read it as "there is a hazardous shell around this world", not as "orbit is lethal here". An airless world has no absorbing layer, so its belt edge is its own surface and the two figures are the same number — which is why only one row shows for Io, Luna or Mercury. A RING reports the ring plane, once, for the same reason: no air to absorb and no field to deflect, so a fragment\'s surface and a ship crossing take the same dose.'
      ]
    });
  }

  // 5b. Aurora — why this colour, how strong. Needs all three: atmosphere gas to glow, a field to
  //     funnel particles to the poles, and an incident ionising flux to drive them.
  const auroraTag = (body.tags ?? []).find((t) => t.key.startsWith('aurora/'));
  if (auroraTag) {
    const em = auroraEmitter(body);
    layers.push({
      id: 'aurora', title: 'Aurora', link: '/physics#aurora',
      inputs: [
        { label: 'Atmosphere', value: `${n(body.atmosphere?.pressure_bar, 3, 'bar')} · ${em.gas}` },
        { label: 'Magnetosphere', value: body.magnetism ? (body.magnetism.intrinsic ? 'intrinsic' : body.magnetism.source) : 'none' },
        { label: 'Ionising flux, all sources (Earth=1)', value: n(body.totalIncidentFlux, 2) }
      ],
      outputs: [
        { label: 'Strength → tier', value: `${auroraTag.value ?? '—'} → ${describeTag(auroraTag.key).label}` },
        { label: 'Colour', value: `${em.colour} — ${em.gas} glows` }
      ],
      notes: ['Ionising particles funnelled down the field lines to the magnetic poles excite the upper atmosphere; it glows the colour of whichever gas is struck, like a neon sign. Remove the air, the field, or the incident flux and the aurora goes with it.']
    });
  }

  // 6. Geological activity
  if (body.geoActivity) {
    const g = body.geoActivity;
    layers.push({
      id: 'geology', title: 'Geological activity', link: '/physics#geology',
      inputs: [
        { label: 'Makeup / mass', value: `${pct(mk.metal + mk.rock + mk.carbon)} rocky · ${n(massMe, 2, 'M⊕')}` },
        { label: 'System age', value: n(ctx.ageGyr, 1, 'Gyr') },
        { label: 'Surface water', value: (body.hydrosphere?.composition === 'water' && (body.hydrosphere?.coverage ?? 0) > 0.1) ? 'yes' : 'no' }
      ],
      outputs: [
        { label: 'Regime', value: g.regime },
        { label: 'Volcanism', value: g.volcanism },
        { label: 'Geothermal vigor (Earth=1)', value: n(g.vigor, 2) },
        { label: 'Surface age', value: n(g.surfaceAgeGyr, g.surfaceAgeGyr < 0.1 ? 3 : 2, 'Gyr') },
        { label: 'Driver', value: g.driver }
      ],
      notes: g.notes.slice(0, 1)
    });
  }

  // 6b. Volatile-ice retention
  if (body.volatiles && body.volatiles.retained.length) {
    const v = body.volatiles;
    layers.push({
      id: 'volatiles', title: 'Volatile-ice retention', link: '/physics#geology',
      inputs: [
        { label: 'Surface temp', value: n(body.temperatureK ?? 0, 0, 'K') },
        { label: 'Escape (Jeans λ)', value: Object.entries(v.lambda).map(([s, l]) => `${s} ${l}`).join(' · ') }
      ],
      outputs: [{ label: 'Retained as surface ice', value: v.retained.join(', ') }],
      notes: ['An ice survives on the surface only if it is cold enough to stay solid AND the body\'s gravity holds the vapour it sublimates (Jeans parameter λ above the retention floor). Cold, heavy species on small distant worlds are kept in a closed sublimate–recondense cycle; light species on warm or low-gravity worlds are lost to space.']
    });
  }

  // 6c. Surface features & weathering — how the physics turns into what the world WEARS (the shared
  // appearance model both renderers draw from).
  {
    const ap = deriveAppearance(body);
    const feats: string[] = [];
    if (ap.craters) feats.push(`craters — density ${pct(ap.craters.density)}${ap.craters.farSideBias > 0 ? `, far-side biased (${pct(ap.craters.farSideBias)}) — parent shields the near face` : ''}${ap.craters.rayed > 0 ? `, ${ap.craters.rayed} fresh rayed` : ''}`);
    if (ap.iceCracks) feats.push(`ice-fracture network — severity ${pct(ap.iceCracks.severity)}`);
    if (ap.rifts) feats.push('crustal rift (a frozen former ocean split the crust)');
    if (ap.regolith > 0) feats.push(`space-weathered regolith greying ${pct(ap.regolith)}`);
    if (ap.tholin) feats.push(`tholins — ${ap.tholin.atmospheric ? 'atmospheric haze' : 'surface'}, strength ${pct(ap.tholin.strength)}`);
    if (ap.frost) feats.push(`bright volatile frost — ${pct(ap.frost.coverage)} cover`);
    if (feats.length) {
      layers.push({
        id: 'surface', title: 'Surface features & weathering', link: '/physics#surface',
        inputs: [
          { label: 'Surface age', value: n(body.geoActivity?.surfaceAgeGyr ?? 0, 2, 'Gyr') },
          { label: 'Irradiation dose', value: n(body.irradiationDose ?? 0, 2) }
        ],
        outputs: feats.map((f, i) => ({ label: i === 0 ? 'Shows' : '·', value: f })),
        notes: ['What a world wears follows from its physics: an old surface accumulates impact CRATERS (an icy crust FRACTURES instead of holding them); a tidally-locked world is cratered harder on its leading (apex) face; airless silicate regolith GREYS as space-weathering dose matures it (Moon/Mercury); irradiated organic ices redden into THOLINS; and retained volatiles FROST the surface bright.']
      });
    }
  }

  // 6d. Surface light — the star's spectrum after the sky took its cut. Runs before the colour and
  //     biosphere layers because both consume it.
  if (body.surfaceSpectrum) {
    const s = body.surfaceSpectrum;
    layers.push({
      id: 'surface-light', title: 'Surface light — what reaches the ground', link: '/physics#surface-light',
      inputs: [
        { label: 'Star', value: `${Math.round(s.starTempK)} K at ${s.distanceAU < 1 ? s.distanceAU.toFixed(3) : s.distanceAU.toFixed(2)} AU` },
        { label: 'Above the atmosphere', value: `${n(s.totalTopWm2, 0, 'W/m²')} · peak ${s.peakTopNm} nm` },
        { label: 'The sky takes', value: s.attenuators.length
          ? s.attenuators.map((a) => `${a.label} ${pct(a.strength)}`).join(' · ')
          : 'nothing — no atmosphere' }
      ],
      outputs: [
        { label: `At the ${s.level}`, value: `${n(s.totalSurfaceWm2, 0, 'W/m²')} (${pct(s.totalTopWm2 > 0 ? s.totalSurfaceWm2 / s.totalTopWm2 : 0)} of it)` },
        { label: 'Ground peak', value: `${s.peakSurfaceNm} nm` },
        { label: 'Daylight colour', value: `${s.surfaceLightHex} — as human eyes would see it` }
      ],
      notes: [
        'The star\'s Planck curve, scaled by the same luminosity the radiation model reads over the same inverse square, then filtered: Rayleigh scattering from the atmosphere\'s own column density (which is why the blue end goes first), each gas\'s authored absorption bands, and a GREY cut from any cloud deck. The peak quoted is the peak per unit WAVELENGTH — the peak per unit frequency of the same curve sits about 1.76 times further out, and the two are different numbers.',
        'In the plot below, the gap between the two lines IS the atmosphere, and the notches in the lower one are the bands this world\'s gases ate. The coloured ribbon under the axis fades to black at both ends because that is where your eye stops — most of the axis is light you cannot see, so a world can be drenched in near-infrared and still look dim.',
        'This same spectrum colours the ground and the sea, not just the life: each material\'s colour is treated as a reflectance spectrum and this light is filtered through it. The atmospheric haze, the cloud decks and a giant\'s chemistry are still combined as plain colours rather than spectra — that work is not finished.',
        `The LEVEL is named rather than assumed: this reading is at the ${s.level}. A world with no solid surface has a 1-bar level, not a surface, and nothing here turns one into the other.`
      ]
    });
  }

  // 6e. Life, and what colour it takes from that light.
  if (body.vegetation) {
    const v = body.vegetation;
    const viable = v.ranked.filter((r) => r.viable);
    layers.push({
      id: 'biosphere', title: 'Biosphere — pigment and cover', link: '/physics#biosphere',
      inputs: [
        { label: 'Energy source', value: body.biosphere?.energy_source ?? '—' },
        { label: 'Morphologies', value: v.layers.map((l) => `${l.label} ${pct(l.coverage)}`).join(' · ') || '—' },
        { label: 'Solvent', value: body.hydrosphere?.composition ?? 'none' }
      ],
      outputs: [
        { label: 'Dominant pigment', value: v.pigmentLabel
          ? `${v.pigmentLabel}${viable.length > 1 ? ` (drawn from ${viable.length} viable)` : ''}`
          : 'none — this biosphere does not photosynthesise' },
        ...(viable.length > 1 ? [{ label: 'Also viable', value: viable.filter((r) => r.key !== v.pigment).map((r) => `${r.label} ${pct(r.drawWeight)}`).join(' · ') }] : []),
        { label: 'Life on the land', value: `${pct(v.visibleCover)} — the union of the layers, not their sum` },
        { label: 'Clusters at', value: `${Math.round(Math.max(0, v.bandCentreDeg - v.bandWidthDeg))}–${Math.round(Math.min(90, v.bandCentreDeg + v.bandWidthDeg))}° latitude` }
      ],
      notes: [
        'A pigment is NOT chosen by maximising captured energy — Earth falsifies that directly, since the Sun peaks in the green and chlorophyll reflects green. Three competing pressures are scored together and multiplied, so each switches itself off where it stops applying: how far what it absorbs reaches the flux a photosystem can process (it saturates), how much overload and wasted photon energy it avoids, and whether it feeds off the steep flanks of the spectrum rather than its summit. Under a dim sky the broadband absorber wins and vegetation reads black; under a generous one everything has enough and the other two pressures decide.',
        'Several pigments are usually viable, so the dominant is a WEIGHTED DRAW over the scored set, seeded on this body. That contingency is the model, not a placeholder: without an evolutionary history a real biosphere\'s outcome genuinely is contingent, and a similar world next door can legitimately grow a different colour. This world always gives the same answer.',
        'Coverage is of the LAND and the layers stack painter-style in list order, so they are independent and may total past 100%. Where life sits is derived from where the biosphere\'s OWN solvent stays liquid across the latitude profile — the poles emptying out on an Earth-like world is a consequence, not a rule.'
      ]
    });
  }

  // 7. Apparent colour
  if (body.apparentColor) {
    layers.push({
      id: 'colour', title: 'Apparent colour', link: '/physics#colour',
      inputs: [{ label: 'Makeup + clouds + temp', value: 'see above' }],
      outputs: [
        { label: 'Flattened hex', value: body.apparentColor.hex },
        { label: 'Palette', value: body.apparentColor.palette.map((p) => p.label || p.role).join(', ') || '—' },
        ...(body.apparentColor.banding ? [{ label: 'Banding', value: `${body.apparentColor.banding} bands` }] : [])
      ],
      notes: []
    });
  }

  // 8. Habitability
  if (body.habitabilityScore != null) {
    const tier = (body.tags || []).find((t) => t.key.startsWith('habitability/'));
    layers.push({
      id: 'habitability', title: 'Habitability', link: '/physics#habitability',
      inputs: [
        { label: 'Geology regime', value: body.geoActivity?.regime ?? '—' },
        { label: 'Magnetosphere', value: body.magnetism ? (body.magnetism.intrinsic ? 'intrinsic' : body.magnetism.source) : '—' }
      ],
      outputs: [
        { label: 'Score (Earth=100)', value: n(body.habitabilityScore, 0) },
        { label: 'Tier', value: tier ? describeTag(tier.key).label : '—' }
      ],
      notes: ['Geology + magnetism modifiers are heuristic guesswork — see /physics.']
    });
  }

  // 9. Orbital stability — WHY the orbit is stable or not, and how a mean-motion resonance can shepherd
  //    a crossing orbit (Pluto/Neptune) into metastability rather than doom.
  if (body.orbit) {
    const stabLabel = (body as any).orbitalStability as string | undefined;
    const stabDetails = (body as any).orbitalStabilityDetails as string | undefined;
    const fateTag = (body.tags ?? []).find((t) => t.key.startsWith('fate/'));
    // Binary members are judged on the barycentre's HELIOCENTRIC orbit (computed once, above),
    // not the ~0.0001 AU pair orbit.
    const orbEl = heliocentricEl ?? body.orbit.elements;
    const eN = orbEl?.e ?? 0;
    const aN = orbEl?.a_AU ?? 0;
    layers.push({
      id: 'stability', title: 'Orbital stability', link: '/physics#resonance',
      inputs: [
        { label: bary ? `Orbit (as the ${bary.name || 'pair'})` : 'Orbit', value: `${n(aN, 3, 'AU')} · e ${n(eN, 3)}` },
        { label: 'Perihelion → aphelion', value: `${n(aN * (1 - eN), 3)}–${n(aN * (1 + eN), 3)} AU` }
      ],
      outputs: [
        { label: 'Assessment', value: stabLabel ?? 'Stable' },
        ...(fateTag ? [{ label: 'Predicted fate', value: describeTag(fateTag.key).label }] : [])
      ],
      notes: [
        ...(bary ? [`Orbits the ${bary.name || 'barycentre'} — a member of a binary/multiple, so stability is judged on the pair's shared orbit around the star, not the small orbit within the pair.`] : []),
        stabDetails ?? 'No orbit-crossing neighbour or loose binding found — a well-spaced, stable orbit.'
      ]
    });
  }

  // --- Tag provenance ---
  const tags: TagProvenance[] = (body.tags ?? []).map((t) => {
    const info = describeTag(t.key);
    const ns = t.key.split('/')[0];
    // PROVENANCE FIRST, namespace second (inbox A44). This panel's whole claim is that it shows the
    // working, so attributing a tag to a physics layer that did not produce it is the worst error it
    // can make. A hand-added override and a generator's own claim both live in physics namespaces and
    // neither is derived by the layer that owns the namespace — say so instead of guessing from the key.
    const origin = tagOrigin(t);
    const layer = origin === 'manual'
      ? 'GM override — not derived'
      : origin === 'authored'
        ? 'Recorded at generation — not re-derived'
        : (t.key.includes('/') ? (NS_LAYER[ns] ?? 'Other') : (FLAT_LAYER[t.key] ?? 'Other'));
    return { key: t.key, label: info.label, description: info.description, layer, color: info.color };
  });

  return { layers, tags };
}
