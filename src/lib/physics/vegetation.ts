// THE LOOK OF A WORLD'S LIFE — one painter-ordered layer per morphology, with its colour already
// resolved from pack data so no renderer ever needs the rule pack.
//
// THE GOVERNING PRINCIPLE, and it outranks everything else in this file: THERE ARE NO SPECIAL RULES.
// Every morphology is one uniform record read by one code path. There is no `if (morphology ===
// 'sentient')` here and there must never be, and no notion of a render MODE, TYPE or CLASS of
// morphology. Flora having no lights is an EMPTY LIGHT RANGE in flora's definition. Fauna
// contributing nothing visible is TWO EMPTY RANGES in fauna's. Technological life being dark by day
// and lit by night is a dark tint range and a strong light range — it needed no code at all, which
// is the test that the principle is actually being honoured. If a difference cannot be expressed in
// the definition, the DEFINITION SCHEMA is missing a field; extend it, never add a branch.
//
// THE HIERARCHY IS A PAINTER'S ALGORITHM. Coverage per layer plus an order is exactly how you would
// render it: plant life covers fungal, fungal colours microbial, each more sophisticated biosphere
// gradually taking over the one before. That is also why the V4 time-evolution falls out for free —
// an epoch sets the coverages, and scrubbing time changes a world's colour with no new machinery.
//
// COVERAGE IS OF THE LAND, NOT A SHARE OF IT: the layers are independent and may sum past 100%.
import type {
  Biosphere, BiosphereLayer, CelestialBody, MorphologyDef, RulePack, SurfaceSpectrumCurves,
  Vegetation, VegetationLayerSpec
} from '$lib/types';
import { scorePigments, drawDominant } from './pigments';
import { liquidDef } from './liquids';
import MORPHOLOGIES_JSON from '$lib/data/morphologies.json';

const BUILT_IN = MORPHOLOGIES_JSON as unknown as MorphologyDef[];

/** Built-in defaults, overridable by a rule pack — the same shape `allLiquids` already uses. */
export function allMorphologies(pack?: RulePack | null): MorphologyDef[] {
  return pack?.morphologies && pack.morphologies.length ? pack.morphologies : BUILT_IN;
}
export function morphologyDef(key: string | undefined, pack?: RulePack | null): MorphologyDef | undefined {
  return key ? allMorphologies(pack).find((m) => m.key === key) : undefined;
}

/**
 * THE ONE READER of `Biosphere.morphologies`, normalising both stored forms.
 *
 * The field was a closed union of bare strings and is now an ordered list of {morphology, coverage}
 * records. Saved campaigns carry the old form, and a bare string simply means "present, at this
 * morphology's default coverage". Keeping ONE field and normalising here is the whole point: a
 * second `layers` array beside it would be two stores of one fact, which is this codebase's most
 * recurring fault by its own test — could these two answer the same question differently? They
 * could, and they would.
 *
 * ORDER IS SIGNIFICANT and is taken as given. A legacy list has no meaningful order, so anything
 * still in bare-string form is sorted by the pack's own `order` instead.
 */
export function biosphereLayers(bio: Biosphere | undefined, pack?: RulePack | null): BiosphereLayer[] {
  if (!bio?.morphologies?.length) return [];
  const allBare = bio.morphologies.every((m) => typeof m === 'string');
  const out = bio.morphologies.map((m) => {
    if (typeof m !== 'string') return { morphology: m.morphology, coverage: m.coverage, colorHex: m.colorHex };
    const def = morphologyDef(m, pack);
    // A legacy entry has no coverage of its own. Scale the definition's default by the biosphere's
    // single global coverage, which is what that field meant before this feature existed — so an
    // existing campaign keeps the extent it was authored with rather than jumping to full.
    return { morphology: m, coverage: (def?.defaultCoverage ?? 0.5) * (bio.coverage ?? 1) };
  });
  if (allBare) {
    out.sort((a, b) => (morphologyDef(a.morphology, pack)?.order ?? 0) - (morphologyDef(b.morphology, pack)?.order ?? 0));
  }
  return out;
}

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex(rgb: [number, number, number]): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
}

/**
 * Where on the globe life clusters, in degrees of latitude.
 *
 * NOT "skip the poles and the equator" as a rule — that is an Earth habit, and this DERIVES it
 * instead. The band is where the surface temperature sits inside THE BIOSPHERE'S OWN SOLVENT's
 * liquid range. On Earth the poles fall out because they are below water's melting point; on a
 * hotter world the equator falls out because it is above the boiling point; on a methane world the
 * band is somewhere else entirely and the code did not need to know that. A uniformly temperate
 * world gets the whole globe, which is also correct.
 *
 * T(lat) is taken as the first-order form T = T_pole + (T_equator − T_pole)·cos(lat), with the two
 * ends read off the temperature profile's LATITUDE component — the same decomposition the
 * temperature panel shows, not a second model of it.
 */
export function habitableLatitudeBand(
  body: CelestialBody,
  bio: Biosphere | undefined,
  pack?: RulePack | null
): { centreDeg: number; widthDeg: number } {
  const lat = body.temperatureProfile?.components?.find((c) => c.source === 'latitude');
  const solvent = body.hydrosphere?.composition;
  const def = liquidDef(solvent, pack);
  const mean = body.temperatureK ?? body.equilibriumTempK ?? 0;
  // No latitude swing or no solvent to bound it: nothing to narrow the band with, so it is global.
  // ONE convention throughout: the band covers |latitude| in [centre - width, centre + width], so
  // the WHOLE globe is centre 45, width 45 — not centre 0, width 90. Two spellings of one idea is
  // how a renderer ends up drawing a band nobody meant.
  const GLOBAL = { centreDeg: 45, widthDeg: 45 };
  if (!lat || !def || !(def.boilK > def.meltK)) return GLOBAL;

  const tEq = lat.highK, tPole = lat.lowK;
  if (!(Math.abs(tEq - tPole) > 0.5)) return GLOBAL;
  const tAt = (deg: number) => tPole + (tEq - tPole) * Math.cos((deg * Math.PI) / 180);

  const lo = def.meltK, hi = def.boilK;
  const ok: number[] = [];
  for (let d = 0; d <= 90; d += 1) if (tAt(d) >= lo && tAt(d) <= hi) ok.push(d);
  if (!ok.length) {
    // The solvent is liquid nowhere on the surface at these temperatures. Life is still tagged
    // (the GM said it is there); it simply has no preferred band, so do not invent one.
    return { centreDeg: mean > hi ? 90 : 0, widthDeg: 20 };
  }
  const centreDeg = (ok[0] + ok[ok.length - 1]) / 2;
  const widthDeg = Math.max(4, (ok[ok.length - 1] - ok[0]) / 2);
  return { centreDeg, widthDeg };
}

export interface VegetationInputs {
  /** A 0..1 draw from the CALLER's own id-seeded stream, one per named purpose. DATA-G1: never the
   *  shared per-run rng, whose position depends on how many draws ran before it. */
  roll: (purpose: string) => number;
  /** A pigment the GM has PINNED, by hand-adding `biodiversity/pigment`. It replaces the draw and
   *  nothing else: the set is still scored, the ranking is still shown, the other pigments are still
   *  reported as viable. A manual tag winning a key the engine also derives is the existing
   *  mechanism (cloud decks work exactly this way), and it is what a REAL body needs — Earth's
   *  pigment is a measurement, not a contingent outcome, and the honest way to say so is to state it
   *  rather than to tune the model until it guesses right. Unknown names are ignored. */
  pinnedPigment?: string;
}

/**
 * Resolve a world's whole life appearance. Returns undefined when there is nothing to draw.
 *
 * `energy_source` IS THE GATE for the star-colour half, and it is free and physically right: only
 * photosynthetic life has any reason to be the colour of its star. A chemosynthetic vent biosphere
 * does not care what the sky looks like, so it gets no pigment, and every morphology whose
 * definition is entirely pigment-driven then contributes no colour — which is the correct answer
 * for life that lives at a vent, arrived at without a single branch on the energy source.
 */
export function deriveVegetation(
  body: CelestialBody,
  spectrum: SurfaceSpectrumCurves | undefined,
  inputs: VegetationInputs,
  pack?: RulePack | null
): Vegetation | undefined {
  const bio = body.biosphere;
  if (!bio) return undefined;
  const entries = biosphereLayers(bio, pack);
  if (!entries.length) return undefined;

  const photosynthetic = bio.energy_source === 'photosynthesis' && !!spectrum;
  const ranked = photosynthetic ? scorePigments(spectrum!.surface, pack) : [];

  // EACH MORPHOLOGY DRAWS ITS OWN, from the same scored viable set, on its own seeded stream. A
  // world's microbial mats and its plants are different lineages that made the choice separately,
  // and the model's own claim is that several pigments work — so making them all take the same one
  // was throwing that away. This is what shipping a RANKED SET rather than a single winner bought.
  const drawFor = (key: string) =>
    ranked.length ? drawDominant(ranked, inputs.roll(`pigment|${key}`)) : undefined;

  const layers: VegetationLayerSpec[] = [];
  for (const entry of entries) {
    const def = morphologyDef(entry.morphology, pack);
    if (!def) continue;   // a morphology the pack no longer defines simply does not draw
    // NOT clamped to 1. Coverage is OF THE LAND, and a value above 1 means the morphology has
    // taken all of it and gone out over the water — how far it gets is its own `waterReach`.
    // Clamping here was invisible: the slider moved, the number moved, and the world did not.
    const coverage = Math.max(0, entry.coverage);

    // This morphology's own pigment. A pin replaces the draw for the layer the Bio tab NAMES — the
    // most extensive pigment-driven one — and leaves the others to their own draws, so pinning
    // "these plants are green" does not quietly repaint the microbial mats as well.
    const ownPigment = def.pigmentDriven > 0 ? drawFor(def.key) : undefined;
    const pigmentHex = ownPigment?.reflectedUnderStarHex ?? null;

    // ONE uniform arithmetic for every morphology. A tint list and a pigment drive are two ranges;
    // an empty range contributes zero weight, and a layer with no weight at all has no colour. That
    // is how fauna ends up invisible without anything in this file knowing what fauna is.
    const tintWeight = def.tints.length ? Math.max(0, 1 - def.pigmentDriven) : 0;
    const pigWeight = pigmentHex ? Math.max(0, def.pigmentDriven) : 0;
    const total = tintWeight + pigWeight;
    // AN AUTHORED COLOUR WINS OUTRIGHT. Somebody has said what this looks like; the model does not
    // then get a vote, and it must not blend its answer with theirs.
    let colorHex: string | null = entry.colorHex ?? null;
    if (!colorHex && total > 0) {
      const tintHex = def.tints.length
        ? def.tints[Math.floor(inputs.roll(`tint|${def.key}`) * def.tints.length) % def.tints.length]
        : '#000000';
      const a = hexToRgb(tintHex), b = hexToRgb(pigmentHex ?? '#000000');
      colorHex = rgbToHex([
        (a[0] * tintWeight + b[0] * pigWeight) / total,
        (a[1] * tintWeight + b[1] * pigWeight) / total,
        (a[2] * tintWeight + b[2] * pigWeight) / total
      ]);
    }

    const lightSpan = Math.max(0, def.light.max - def.light.min);
    const light = lightSpan > 0 || def.light.min > 0
      ? def.light.min + lightSpan * inputs.roll(`light|${def.key}`)
      : 0;

    layers.push({
      morphology: def.key,
      label: def.label,
      pigment: ownPigment?.key ?? null,
      pigmentLabel: ownPigment?.label ?? null,
      coverage,
      opacity: Math.max(0, Math.min(1, def.opacity)),
      colorHex,
      // The INTRINSIC brightness, NOT scaled by coverage. Coverage already decides how much of the
      // world is lit — it sets the band's area — so multiplying by it again dimmed a small
      // settlement's lights as well as shrinking them, and a 10% world came out invisible. A city is
      // as bright as a city whatever share of the planet it covers.
      light,
      lightHex: def.lightHex,
      waterReach: Math.max(0, Math.min(1, def.waterReach ?? 0.1))
    });
  }
  if (!layers.length) return undefined;

  // How much of the LAND ends up showing any life colour. The UNION under painter-order layering,
  // not the sum — the sliders are independent and may total well past 100%.
  // THE WORLD-LEVEL ANSWER is the most extensive pigment-driven layer's — what the Bio tab calls the
  // dominant pigment and what gets tagged. A pin replaces exactly that one.
  const pigmentLayers = layers.filter((l) => l.pigment);
  const leader = pigmentLayers.slice().sort((a, b) => b.coverage - a.coverage)[0];
  const pinned = inputs.pinnedPigment ? ranked.find((r) => r.key === inputs.pinnedPigment) : undefined;
  if (pinned && leader) {
    leader.pigment = pinned.key;
    leader.pigmentLabel = pinned.label;
    // Repaint that layer with the pinned pigment's colour, by the same arithmetic it was built with.
    const def = morphologyDef(leader.morphology, pack)!;
    const tintWeight = def.tints.length ? Math.max(0, 1 - def.pigmentDriven) : 0;
    const pigWeight = Math.max(0, def.pigmentDriven);
    const total = tintWeight + pigWeight;
    if (total > 0) {
      const tintHex = def.tints.length
        ? def.tints[Math.floor(inputs.roll(`tint|${def.key}`) * def.tints.length) % def.tints.length]
        : '#000000';
      const a = hexToRgb(tintHex), b = hexToRgb(pinned.reflectedUnderStarHex);
      leader.colorHex = rgbToHex([
        (a[0] * tintWeight + b[0] * pigWeight) / total,
        (a[1] * tintWeight + b[1] * pigWeight) / total,
        (a[2] * tintWeight + b[2] * pigWeight) / total
      ]);
    }
  }
  const dominant = leader ? { key: leader.pigment!, label: leader.pigmentLabel! } : undefined;

  let clear = 1;
  for (const l of layers) if (l.colorHex) clear *= 1 - l.coverage * l.opacity;
  const band = habitableLatitudeBand(body, bio, pack);
  // How much of the globe is land at all. Read from the DERIVED surface-liquid layer where there is
  // one (it has already been phase-checked), falling back to the authored hydrosphere coverage — the
  // same two sources the apparent-colour model reads, in the same order, so the disc and the swatch
  // cannot disagree about how much sea there is.
  const surfaceLayer = body.hydrosphere?.layers?.find((l) => l.location === 'surface');
  const sea = Math.max(0, Math.min(1, surfaceLayer?.coverage ?? body.hydrosphere?.coverage ?? 0));

  return {
    pigment: dominant?.key ?? null,
    pigmentLabel: dominant?.label ?? null,
    ranked,
    layers,
    visibleCover: 1 - clear,
    landFraction: 1 - sea,
    bandCentreDeg: band.centreDeg,
    bandWidthDeg: band.widthDeg
  };
}

/** The flattened colour of the life on a world's land — the painter's stack, resolved to one hex,
 *  plus how much of the land it covers. Used by the apparent-colour derivation and by any renderer
 *  that only wants one swatch. Returns null when nothing contributes colour. */
export function vegetationTint(veg: Vegetation | undefined): { hex: string; cover: number } | null {
  if (!veg?.layers?.length || !(veg.visibleCover > 0)) return null;
  // Paint the layers in order onto a running colour, weighting each by what it actually covers.
  let acc: [number, number, number] | null = null;
  let weight = 0;
  for (const l of veg.layers) {
    if (!l.colorHex) continue;
    const w = l.coverage * l.opacity;
    if (!(w > 0)) continue;
    const c = hexToRgb(l.colorHex);
    if (!acc) { acc = c; weight = w; continue; }
    // Later layers paint OVER earlier ones, so their share is what they cover of what is left.
    const t = w;
    acc = [acc[0] + (c[0] - acc[0]) * t, acc[1] + (c[1] - acc[1]) * t, acc[2] + (c[2] - acc[2]) * t];
    weight = Math.max(weight, w);
  }
  return acc ? { hex: rgbToHex(acc), cover: veg.visibleCover } : null;
}
