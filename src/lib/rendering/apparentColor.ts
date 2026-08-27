// Derived apparent (true) colour of a body — so the orrery/picker show Mars red, a sulfur
// world yellow, Neptune blue, a lava world orange, instead of one swatch per class. Composed
// from: surface makeup → ocean → tinted by the dominant coloured atmosphere/cloud gas (the
// per-gas colorHex already in the rulepack) + condensed cloud DECKS (hydrosphere.layers) →
// shifted toward incandescent when very hot. (proposal §2e)
//
// We compute BOTH a flattened single hex (authoritative — sequential mix, the proven look) and
// the un-mixed PALETTE of contributions, so a future sphere/shader renderer can draw Earth's
// ocean/land/cloud mix or Jupiter's bands without re-deriving anything.
import type { CelestialBody, RulePack, ApparentColor, ApparentColorStop } from '$lib/types';
import { makeupFractions, rendersAsGiant } from '$lib/physics/makeup';
import { phaseAtP, liquidDef } from '$lib/physics/liquids';
import { decksFromTags, condensateTint, oxidationStrength, spaceWeathering } from '$lib/physics/cloudDecks';
import { vegetationTint } from '$lib/physics/vegetation';
import { EARTH_MASS_KG, LIQUIDS } from '$lib/constants';
import { blackbodySpectrum, gridShare, materialUnderLight, reflectanceFromHex,
  reflectedHexUnderIlluminant, type Spectrum } from '$lib/physics/spectrum';

type RGB = [number, number, number];

function hexToRgb(hex: string): RGB {
  const h = hex.replace('#', '');
  const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
}
function rgbToHex([r, g, b]: RGB): string {
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
}
function mixWeighted(parts: Array<[RGB, number]>): RGB {
  let r = 0, g = 0, bl = 0, w = 0;
  for (const [c, wt] of parts) { r += c[0] * wt; g += c[1] * wt; bl += c[2] * wt; w += wt; }
  return w > 0 ? [r / w, g / w, bl / w] : [120, 120, 120];
}

// Representative surface colours per makeup component.
const SURF = {
  metal: hexToRgb('#6b5d52'), rock: hexToRgb('#9c7a5a'), carbon: hexToRgb('#2b2b30'),
  ice: hexToRgb('#d8ecff'), gas: hexToRgb('#c9b89a')
};

export function bdGlowColour(teff: number): string {
	const stops: [number, string][] = [
		[250, '#3a0f06'], [600, '#6e1808'], [1000, '#a3320c'], [1400, '#c85614'],
		[1800, '#e07d22'], [2300, '#f2a03e'], [2800, '#ffbf6e']
	];
	if (teff <= stops[0][0]) return stops[0][1];
	for (let i = 1; i < stops.length; i++) {
		if (teff <= stops[i][0]) {
			const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
			const f = (teff - t0) / (t1 - t0);
			const a = hexToRgb(c0), b = hexToRgb(c1);
			return rgbToHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f] as RGB);
		}
	}
	return stops[stops.length - 1][1];
}

/**
 * Star colour from photosphere temperature (compact blackbody-ish bands; G≈white-yellow, M≈red).
 *
 * BELOW ~2400 K THERE ARE NO STARS. Sustained hydrogen fusion gives out around 1800-2000 K, so
 * everything colder is an L, T or Y dwarf — and this table used to bottom out at #ff8a4a, an orange
 * handed identically to a 2399 K M dwarf and a 500 K T dwarf. It made Epsilon Indi Bb, a methane T6
 * about as warm as an oven, render as a small sun.
 *
 * The cold end now falls through to `bdGlowColour`, the substellar ramp, which had the right answer
 * sitting one branch away all along. The curves nearly meet at the crossover (#ffbf6e against
 * #ffb56c) so nothing warm moves, and the sequence becomes continuous through mass instead of
 * cliff-edged at a role boundary — which matters because giants radiate too, just far colder: at
 * Jupiter's 124 K this returns near-black, so a giant correctly shows no visible glow.
 */
export function starColorFromTempK(tempK?: number): RGB {
  // UNKNOWN IS NOT COLD. `?? ` catches null and undefined but NOT zero, and now that the cold end
  // goes to near-black rather than to orange, a body carrying 0 K would render invisible instead of
  // merely wrong. Sol itself stores no temperature, so this default is load-bearing.
  const t = tempK && tempK > 0 ? tempK : 5778;
  if (t < 2400) return hexToRgb(bdGlowColour(t));
  if (t >= 30000) return hexToRgb('#9bb0ff');
  if (t >= 10000) return hexToRgb('#aabfff');
  if (t >= 7500) return hexToRgb('#cad7ff');
  if (t >= 6000) return hexToRgb('#f8f7ff');
  if (t >= 5200) return hexToRgb('#fff4ea');
  if (t >= 3700) return hexToRgb('#ffd2a1');
  if (t >= 2400) return hexToRgb('#ffb56c');
  return hexToRgb('#ff8a4a');
}

// #8 — a liquid's APPARENT colour is the light that reaches it, filtered by its own absorption, plus
// a specular share of that same light reflected straight back off the surface. The specular share
// comes from the refractive index (Fresnel R = ((n−1)/(n+1))², amplified for glancing geometry), so
// water under a red dwarf is murky amber-grey rather than postcard blue and molten iron is mostly a
// mirror. One data point (n) covers every liquid.
//
// IT IS DONE SPECTRALLY NOW, and that is the point. The old version multiplied the star's RGB by the
// liquid's RGB — three human primaries filtering three human primaries, which gets the answer
// approximately right for a Sun-like star and increasingly wrong for anything else, and could not
// see an atmosphere at all. Filtering the ACTUAL arriving spectrum through a reflectance curve and
// converting once at the end is both better physics and less code, and it means a sea under a hazy
// sky is coloured by what got through the haze (inbox B54).
export function liquidApparentColor(liquidName: string, light: Spectrum, pack?: RulePack | null): RGB {
  const def = liquidDef(liquidName, pack) ?? LIQUIDS.find((l) => l.name === liquidName);
  const refl = reflectanceFromHex(def?.colorHex ?? '#8aa0b8');
  const n = def?.refractiveIndex ?? 1.33;
  const fresnel = Math.pow((n - 1) / (n + 1), 2);          // ~0.02 for water … ~0.24 molten iron
  const spec = Math.min(0.65, fresnel * 6);                 // glancing-angle boost, capped
  // Diffuse (filtered) plus specular (unfiltered) — both in spectral space, converted once.
  const out = light.map((v, i) => v * (refl[i] * (1 - spec) + spec));
  return hexToRgb(reflectedHexUnderIlluminant(out, light));
}

// (The old CLOUD_VEIL table is gone: how heavily a deck veils the surface is the LIQUID's own
// `cloudOpacity` in the rule pack, read via the cloud-deck TAGS — physics→tags→visuals.)

// Blackbody-ish incandescence for very hot worlds (lava / hot giants).
function incandescent(teqK: number): RGB {
  if (teqK >= 1800) return hexToRgb('#fff2d0'); // white-hot
  if (teqK >= 1400) return hexToRgb('#ffd24d'); // yellow
  if (teqK >= 1000) return hexToRgb('#ff7a2f'); // orange
  return hexToRgb('#c0381a');                    // dull red
}

function dominantGas(comp: Record<string, number>): string {
  return Object.entries(comp).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
}

// Gas-giant cloud-deck colour by temperature (the same T bands the classifier uses for cloud
// species) — the giants' colour comes from cloud chromophores, not the dominant H₂/He gas.
function gasGiantCloudColor(teqK: number): RGB {
  if (teqK < 150) return hexToRgb('#d8b48a');  // ammonia clouds — Jupiter/Saturn tan
  if (teqK < 280) return hexToRgb('#e6ecf2');  // water clouds — pale
  if (teqK < 360) return hexToRgb('#9fb6c8');  // clear/transition
  if (teqK < 900) return hexToRgb('#3a5a8c');  // cloudless — deep Rayleigh blue
  if (teqK < 1400) return hexToRgb('#d98a55'); // alkali-metal clouds — orange
  return hexToRgb('#9a8478');                   // silicate clouds — dusky (then incandescence)
}

// Banding: gas/ice giants and thick-atmosphere worlds organise their clouds into latitudinal
// bands; faster rotation drives more, tighter bands (Jupiter ~10 h → many; slow → mottled).
function bandCount(body: CelestialBody, gasFrac: number, iceGiant = false): number {
  if (iceGiant) return 3; // Uranus/Neptune: near-featureless, a couple of faint bands at most (ice giants have LOW gas)
  if (gasFrac < 0.3) return 0;
  const rotH = body.rotation_period_hours;
  if (!rotH || rotH <= 0) return 6;
  const n = Math.round(60 / rotH);          // 10 h → 6 bands, 24 h → ~3
  return Math.max(2, Math.min(18, n));
}

// Full derivation: flattened hex + un-mixed palette + banding. opts.starTempK lets the host star's
// light drive liquid colour (#8); omitted → Sun-like.
// CHROMOPHORE BANDING — the two authored numbers behind a giant's belts, and what they mean.
//
// BAND_FULL_COVER: the share of sky a deck must hold for the banding it takes part in to be fully
// developed. Half. It is a judgement, not a measurement, and it is written here rather than fitted:
// there is no observation of "how covered must an ammonia deck be before Jupiter looks like
// Jupiter", because we have exactly one Jupiter. What it must do is span the range smoothly and put
// the four giants where they already sit, and at 0.5 it does — Jupiter's ammonia deck holds 88% of
// its sky and saturates this comfortably, so Jupiter's belts are unchanged, while a deck that is
// only just condensing enters at a few percent of full strength instead of at all of it.
// A candidate for rule-pack data if a GM ever wants the lever; module constants are the codebase
// idiom for this kind of coefficient (DROPLET_RADIUS_M, TAU_OPAQUE in cloudDecks.ts).
const BAND_FULL_COVER = 0.5;
// The weight a FULLY developed chromophore band carries, from the giant's mass: a bigger world
// drives a deeper, better-organised circulation and bands harder. Unchanged from before B95 — it is
// only factored out so `planetTexture` can normalise a published band weight back to a 0..1 strength
// without duplicating the number. Jupiter (318 Me) tops it out at 0.7.
export const CHROMOPHORE_MAX_WEIGHT = 0.7;
export const CHROMOPHORE_FULL_WEIGHT_FOR = (massMe: number): number =>
  0.4 + (CHROMOPHORE_MAX_WEIGHT - 0.4) * Math.min(1, massMe / 318);

export function deriveApparentColorParts(
  body: CelestialBody,
  rulePack?: RulePack,
  opts?: { starTempK?: number; surfaceLight?: Spectrum; topLight?: Spectrum; transmission?: number }
): ApparentColor {
  const mk = makeupFractions(body);
  const palette: ApparentColorStop[] = [];
  // Lit hex -> the authored MATERIAL colour it came from, so the palette can carry both. The surface
  // view paints a scene from the MATERIAL and lights it itself; handed the appearance it would light
  // everything twice, and the "at home" side of that comparison would show the world under its own
  // sun instead of ours. Recorded here rather than threaded through twenty push() calls.
  const rawOf = new Map<string, string>();
  const push = (hex: string, role: ApparentColorStop['role'], weight: number, label?: string) => {
    if (weight > 0.02) {
      palette.push({ hex, role, weight: Math.min(1, weight), label, rawHex: rawOf.get(hex) ?? hex });
    }
  };
  const star = starColorFromTempK(opts?.starTempK);
  // THE LIGHT THIS WORLD IS ACTUALLY LIT BY. Handed in by the processor, which has already filtered
  // the star through this world's own sky. When it is absent — a standalone caller, a gallery
  // fixture — fall back to the star's unfiltered spectrum rather than to a different code path: a
  // world with no atmosphere is simply one whose transmission is 1 everywhere, so there is ONE
  // model and the fallback is a case of it rather than a rival to it.
  const starSpectrum = blackbodySpectrum(opts?.starTempK ?? 5778, 1000 * gridShare(opts?.starTempK ?? 5778));
  const light: Spectrum = opts?.surfaceLight ?? starSpectrum;
  // A CLOUD IS NOT LIT BY THE SURFACE SPECTRUM, and this is not a nicety — on Venus it is the whole
  // picture. The light that reaches the ground has already been through the entire atmosphere; the
  // light falling on the cloud TOPS has not, because the cloud is most of what did the filtering.
  // Lighting a deck with the surface spectrum means lighting it with light that only exists BELOW
  // it, and the deck ends up carrying the colour of its own shadow.
  //
  // Venus is where that showed: a cream sulphuric deck kept its daylight colour while the rock under
  // it turned deep red, and mixing the two made the planet PINK. Cloud tops take the unfiltered
  // starlight; the ground takes what got through.
  const topLight: Spectrum = opts?.topLight ?? starSpectrum;
  /** What a material of this authored colour looks like on the GROUND. */
  const under = (hex: string) => { const lit = materialUnderLight(hex, light); rawOf.set(lit, hex); return lit; };
  /** …and what it looks like ABOVE the weather, where a cloud top or a haze layer sits. */
  const underTop = (hex: string) => { const lit = materialUnderLight(hex, topLight); rawOf.set(lit, hex); return lit; };

  // 1. Surface base ("land") from makeup fractions.
  let col = mixWeighted([
    [SURF.metal, mk.metal], [SURF.rock, mk.rock], [SURF.carbon, mk.carbon],
    [SURF.ice, mk.ice], [SURF.gas, mk.gas]
  ]);
  let surfDom: string = (['rock', 'metal', 'carbon', 'ice', 'gas'] as const).sort((a, b) => mk[b] - mk[a])[0];
  // Differentiation: ices are the lightest solid, so they FLOAT — a body with a real ice fraction
  // wears it as its visible crust (Enceladus/Europa are near-white despite rock-dominated bulk).
  // The bulk mix above is what the interior looks like, not the surface. Giants excluded (their
  // look is cloud chemistry, step 3c).
  if (!rendersAsGiant(body) && mk.ice > 0.08) {
    const shell = Math.min(1, mk.ice * 3.5);
    col = mix(col, SURF.ice, shell);
    if (shell > 0.5) surfDom = 'ice';
  }
  // OXIDISED IRON — the reason Mars is red and the Moon, with the same iron and age but no oxidiser,
  // is grey. Bulk makeup alone made every rocky world the same brown; rust is surface chemistry, so
  // it arrives as a tag (see deriveOxidation) and tints the surface here.
  const rust = oxidationStrength(body.tags);
  if (rust > 0) col = mix(col, [168, 74, 38], rust);   // hematite red-ochre
  // SPACE WEATHERING — the other half of that sentence, and until now the unimplemented half. An
  // airless surface accumulates nanophase iron, which mutes the mineral colour and darkens it; that
  // is why the Moon is a dark warm grey rather than the plant-pot brown its bulk makeup alone gives.
  // Muting first, then darkening: they are two separate optical effects of the same coating, and
  // doing it the other way round loses the mute in the dark.
  // The nanophase iron a vacuum-exposed surface accumulates MUTES its mineral bands, which is why a
  // mature regolith reads as grey however warm the rock under it started. This is the same maturity
  // the renderers used to apply themselves at paint time; it now happens once, here, so the colour
  // chip beside a render agrees with it.
  //
  // DESATURATION ONLY, deliberately. Weathering does also lower the albedo — the Moon's is 0.12,
  // darker than asphalt — but how BRIGHT a body looks is the lighting's job and the renderers already
  // do it. Darkening the material colour as well would double-count it and hand back a charcoal
  // swatch for a world that plainly reads pale grey.
  const mature = rendersAsGiant(body) ? 0 : spaceWeathering(body);
  if (mature > 0) {
    const lum = 0.2126 * col[0] + 0.7152 * col[1] + 0.0722 * col[2];
    col = mix(col, [lum, lum, lum], mature);
  }
  // THE GROUND IS LIT BY THE SAME LIGHT AS EVERYTHING ELSE. The makeup mix above is the material's
  // own colour — what it would look like under daylight — so it goes through the spectral path too,
  // and a rocky world under a red dwarf reddens because of what its sky and star left rather than
  // because two hex values were multiplied.
  col = hexToRgb(under(rgbToHex(col)));
  push(rgbToHex(col), 'surface', 1, rust > 0 ? `oxidised ${surfDom} surface` : `${surfDom} surface`);

  // 1b. LIFE ON THE LAND. It goes here, between the bare ground and the ocean, because that is
  //     physically where it is: vegetation covers LAND, and the sea then covers its own fraction of
  //     the result. Nothing is derived in this file — `body.vegetation` was resolved from pack data
  //     in physics (see physics/vegetation.ts), the same move `auroraEmitters` already makes, so a
  //     renderer never needs the rule pack to draw it. That is the deliberate answer to C2's missing
  //     thread rather than a second one alongside it.
  const veg = vegetationTint(body.vegetation);
  if (veg && !rendersAsGiant(body)) {
    col = mix(col, hexToRgb(veg.hex), Math.min(0.92, veg.cover));
    push(veg.hex, 'vegetation', veg.cover,
      body.vegetation?.pigmentLabel ? `${body.vegetation.pigmentLabel} vegetation` : 'surface life');
  }

  // 2. Surface liquid — ANY liquid, proportional to coverage (#9): the disc is land×(1−cover) +
  //    liquid×cover, with the liquid's shade derived from starlight × refractive index (#8).
  //    Molten surfaces are left to the incandescence step. Phase-gated: we colour an ocean only
  //    where the DERIVED surface-liquid layer exists (deriveFluidLayers already checked the solvent
  //    is liquid at this T & P) — so a boiled-off or frozen world is not painted with a false sea.
  const teq = body.equilibriumTempK ?? 0;
  // Fast path: the derived surface-liquid layer (already phase-checked). Fallback for standalone
  // callers with no pre-derived layers: check the phase here from the surface temp & pressure, so a
  // boiled-off/frozen world is never painted with a false ocean either way.
  const surfaceLayer = body.hydrosphere?.layers?.find((l) => l.location === 'surface');
  const surfT = body.temperatureK ?? body.equilibriumTempK ?? 0;
  const rawComp = body.hydrosphere?.composition;
  const isLiquidSurface = surfaceLayer
    ? true
    : (!!rawComp && rawComp !== 'none' && phaseAtP(rawComp, surfT, body.atmosphere?.pressure_bar) === 'liquid');
  const surfaceLiquid = surfaceLayer?.liquid ?? rawComp;
  const hydro = surfaceLayer?.coverage ?? body.hydrosphere?.coverage ?? 0;
  const liquidFamily = LIQUIDS.find((l) => l.name === surfaceLiquid)?.family;
  if (isLiquidSurface && surfaceLiquid && hydro > 0.05 && liquidFamily !== 'molten') {
    const lc = liquidApparentColor(surfaceLiquid, light, rulePack);
    const cover = Math.min(0.85, hydro);
    col = mix(col, lc, cover);
    push(rgbToHex(lc), 'ocean', hydro, `${surfaceLiquid} ocean`);
  } else if (rawComp && rawComp !== 'none' && !rendersAsGiant(body)
      && phaseAtP(rawComp, surfT, body.atmosphere?.pressure_bar) === 'solid') {
    // Frozen hydrosphere: the solvent is SOLID at the surface — it's an ice sheet, not an ocean,
    // and it still covers (and brightens) the ground. Colour = the solvent's tint bleached heavily
    // toward frost (water → near-white; methane/nitrogen ices keep a faint cast).
    const cover = body.hydrosphere?.coverage ?? 0;
    if (cover > 0.05) {
      const intrinsic = hexToRgb(liquidDef(rawComp, rulePack)?.colorHex ?? '#8aa0b8');
      const frost = hexToRgb(under(rgbToHex(mix(intrinsic, [236, 243, 250], 0.78))));
      col = mix(col, frost, Math.min(0.9, cover));
      push(rgbToHex(frost), 'surface', cover, `${rawComp} ice sheet`);
    }
  }

  // 3. Atmosphere/cloud tint from the dominant coloured gas (thicker → more dominant). Gas
  // giants (no real surface) take their whole look from the atmosphere.
  const atm = body.atmosphere;
  if (atm?.composition && rulePack?.gasPhysics) {
    const g = dominantGas(atm.composition);
    const hex = rulePack.gasPhysics[g]?.colorHex;
    if (hex) {
      const thickness = Math.min(1, (atm.pressure_bar ?? 0) / 2);
      const opacity = mk.gas > 0.5 ? Math.max(0.6, thickness) : 0.2 + 0.6 * thickness;
      const lit = underTop(hex);
      col = mix(col, hexToRgb(lit), opacity);
      push(lit, 'atmosphere', opacity, `${g} haze`);
    }
  }

  // 3b. Condensed cloud DECKS — from the body's cloud-deck TAGS (the processor's single
  //     evaluation; a GM's manual tag works identically). Veil strength = the liquid's own
  //     cloudOpacity scaled by the deck's coverage bucket; colour = the liquid's colour lightened
  //     toward condensate white (a deck is droplets/crystals, not a sea — water reads white-ish,
  //     a sulphuric deck keeps its yellow cast). Strongest-veiling deck wins the flattened look.
  const deckTags = decksFromTags(body.tags, rulePack);
  if (deckTags.length && mk.gas <= 0.5) {
    const top = deckTags
      .map((d) => {
        const def = liquidDef(d.species, rulePack);
        return { d, def, veil: (def?.cloudOpacity ?? 0.5) * d.coverage };
      })
      .sort((a, b) => b.veil - a.veil)[0];
    if (top && top.veil > 0.02) {
      // Droplets, not bulk liquid — condensateTint owns that rule (see cloudDecks).
      const condensate = hexToRgb(underTop(condensateTint(top.def?.colorHex ?? '#c8d2dc', top.def?.cloudTintDistance)));
      // The cap used to be 0.85, which left a sixth of the ground showing through ANY deck however
      // thick. That is the same fault the giants already had fixed a few lines below (their comment
      // records that 0.85 "dragged every giant darker than it should"), and on Venus it is glaring:
      // a 92-bar sulphuric overcast that you can see the rock through. Nobody has ever seen Venus's
      // surface from orbit. The veil itself still decides — a thin water deck stays thin — this only
      // stops an arbitrary ceiling overriding it.
      col = mix(col, condensate, Math.min(0.985, top.veil));
      push(rgbToHex(condensate), 'cloud', top.veil, `${top.d.species} clouds`);
    }
  }

  // 3c. Gas-rich worlds take their look from their cloud chemistry, not the surface. The look is
  //     COMPOSITION-driven so the four giants diverge and the gas-mix sliders actually do something:
  //       methane (CH₄) is a strong red absorber → cyan→deep-blue with abundance + cold (Uranus vs
  //       Neptune); ammonia (NH₃) → warm tan/gold with chromophore bands (Jupiter vs paler Saturn).
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  let iceGiant = false;
  // A giant takes its whole look from its cloud chemistry. Gate on rendersAsGiant (NOT just gas > 0.5) so
  // an ICE giant — ice-dominated, low gas — reads as a smooth cool cloud-world, not a cratered iceball.
  if (rendersAsGiant(body)) {
    // A giant IS its cloud stack: you see the topmost deck, with the ones below showing through its
    // gaps. That stack is derived physics arriving as tags, so the colour now comes from the decks
    // the world actually has rather than from a temperature ramp — Jupiter's white ammonia over
    // brown ammonium hydrosulphide, an ice giant's methane on top. A giant with NO deck at all
    // (a hot Jupiter above every condensation point) still falls back to the thermal continuum,
    // which is the one case where there genuinely is nothing condensed to see.
    const giantDecks = decksFromTags(body.tags, rulePack);
    const comp = atm?.composition ?? {};
    const ch4 = comp['CH4'] ?? comp['methane'] ?? 0;
    let cloud = gasGiantCloudColor(teq); // warm thermal base (ammonia / water / alkali / silicate)
    if (giantDecks.length) {
      const stops: Array<[RGB, number]> = [];
      giantDecks.forEach((d, i) => {
        const hex = liquidDef(d.species, rulePack)?.colorHex;
        if (!hex) return;
        // Weight by DEPTH IN THE STACK, deepest heaviest. A deck that condenses warm forms far down
        // where the atmosphere is dense, so it holds enormously more material and is the optically
        // thick layer you actually see; a cold-condensing species on top is a thin high haze. This
        // is why Saturn is gold despite carrying more methane than ammonia — its ammonia deck is
        // deep and substantial while the methane above it is a veneer. Weighting the top deck
        // heaviest instead turned Saturn grey-blue.
        // Between the two extremes. A terrestrial's deck is thin droplets you see through, so it
        // pales to near-white (condensateTint); a giant's deck is optically thick and shows its
        // substance's own colour — but it is also a brightly sunlit high-albedo cloud top, not a
        // dark pool of the stuff. The liquid colours are ocean colours; used raw they made every
        // giant too dark, and fully paled they washed Jupiter's tan away entirely.
        stops.push([mix(hexToRgb(underTop(hex)), [255, 255, 255], 0.32), Math.max(0.04, d.coverage * Math.pow(0.35, i))]);
      });
      if (stops.length) cloud = mixWeighted(stops);
    }
    // Methane absorption follows BEER-LAMBERT, not a linear ramp: it SATURATES, so a couple of
    // percent over a deep atmosphere swallows essentially all the red light. Modelling it linearly
    // (ch4 × 6) gave Uranus's real 2.3% a mere 0.14 of tint, which left the ice giants grey — they
    // are cyan in life precisely because of that methane. Cold matters too: on a warm giant the
    // methane sits below a thick ammonia haze we never see through, which is why Jupiter and Saturn
    // stay gold at similar abundances.
    const coldFactor = teq < 80 ? 1 : teq < 110 ? 0.6 : 0.35;
    const methaneStrength = Math.min(0.92, (1 - Math.exp(-60 * ch4)) * coldFactor);
    if (methaneStrength > 0.06 && teq < 420) {
      // Colder → deeper blue: Neptune (≈46 K) sits below the threshold, Uranus (≈58 K) reads cyan.
      const methaneHue = teq < 52 ? [47, 107, 214] as RGB : [70, 176, 216] as RGB;
      cloud = mix(cloud, methaneHue, methaneStrength);
    }
    // An ice-dominated giant is an ICE GIANT even when the atmosphere carries no explicit methane readout
    // (its envelope IS ices — water/ammonia/methane): tint it cool by temperature so it reads Uranus/Neptune,
    // not a warm ammonia giant, and keep it smooth (faint bands, no chromophore stripes).
    if (mk.ice > mk.gas) {
      if (methaneStrength <= 0.32) {
        const iceHue: RGB = teq < 60 ? [47, 107, 214] : teq < 160 ? [70, 176, 216] : [124, 178, 208];
        cloud = mix(cloud, iceHue, 0.5);
      }
      iceGiant = true;
    } else {
      iceGiant = methaneStrength > 0.32;
    }
    // A giant has no surface to see, so the cloud IS the view — the old 0.85 left 15% of a rocky
    // "surface" colour showing through and dragged every giant darker than it should be.
    col = mix(col, cloud, 0.96);
    push(rgbToHex(cloud), 'cloud', 0.9, iceGiant ? 'methane haze' : 'ammonia cloud deck');
    // Chromophore stripes belong to warm ammonia giants (Jupiter's browns/oranges); ice giants are
    // near-featureless. Only emit band colours for the ammonia case → the renderer skips spots/stripes
    // on Uranus/Neptune.
    if (!iceGiant) {
      // Band colours from the giant's OWN condensates. A chromophore band is a DEEPER deck showing
      // through gaps in the one above it, so only the decks below the top contribute — and a giant
      // whose stack is a single species has nothing to show through. Such a giant still BANDS, in
      // its own cloud colour and at low contrast, but that happens downstream and not here: an
      // empty chromophore list IS the signal, and `planetTexture.render` reads it as "smooth".
      // (That relationship used to be invisible from this end, which made this comment look false —
      // `slice(0, -1)` on a one-deck stack is empty, so nothing is pushed and it read as if nothing
      // banded at all. Both halves are correct; only the hand-off was unwritten. See RENDER-S35.)
      // This is where NH4SH earns its keep: Jupiter's ammonia parts over the brown hydrosulphide
      // beneath and the belts are that brown.
      //
      // There used to be one more push here: a hardcoded brown keyed off temperature, which meant
      // ANY warm giant got Jovian belts whether or not it had the chemistry for them. It painted
      // brown bands and a red spot onto a giant made of nothing but hydrogen and methane. Deleted —
      // if a world has no coloured condensate, it has no chromophore.
      //
      // HOW STRONGLY a band shows is NOT all-or-nothing, and treating it as such was inbox B95: a
      // deck arriving with 1.5% of the sky was admitted at exactly the same strength as one with
      // 88%, so a giant flipped between banded and featureless on a 0.001-percentage-point
      // composition edit. Two published coverages bound it, and both are the same idea — you can
      // only see a band where there is something to see it THROUGH, and something to see:
      //   • the combined cover of everything ABOVE this deck. With no deck above, you are looking
      //     straight at this one everywhere and there is no contrast between belt and zone at all.
      //   • this deck's OWN cover. A hydrosulphide wisp cannot paint a strong brown belt.
      // Independent covers combine as 1 - prod(1 - c), which is just "the chance a given sight line
      // is blocked by at least one of them".
      giantDecks.slice(0, -1).forEach((d, i) => {
        const hex = liquidDef(d.species, rulePack)?.colorHex;
        if (!hex) return;
        const coverAbove = 1 - giantDecks.slice(i + 1).reduce((p, u) => p * (1 - u.coverage), 1);
        const strength = Math.min(1, coverAbove / BAND_FULL_COVER) * Math.min(1, d.coverage / BAND_FULL_COVER);
        push(underTop(hex), 'cloud', CHROMOPHORE_FULL_WEIGHT_FOR(massMe) * strength, `${d.species} band`);
      });
    }
  }

  // 3d. HOW MUCH OF THE GROUND YOU CAN SEE AT ALL.
  //
  // The cloud and haze steps above each veil by their own share, and between them they still let a
  // quarter of Venus's rock show — which is how a 92-bar sulphuric overcast came out PINK: crimson
  // ground bleeding through cream cloud. But we already derive the number that settles it. If the
  // sky passes 2% of the light on the way down, it is no more transparent on the way back up, so
  // essentially nothing you see from orbit is the ground.
  //
  // So the whole surface stack fades toward what is ABOVE it as transmission falls. It needs no new
  // quantity, no per-liquid tuning and no cap: a thin sky changes nothing, and an opaque one hides
  // its world without anybody having to say that Venus is a special case.
  // ONLY FOR A GENUINELY OPAQUE SKY, and the threshold is doing real work rather than being timid.
  // The transmission figure INCLUDES the cloud deck, and the deck has already veiled the ground a
  // few lines above — so applying it everywhere counts the same cloud twice and Earth loses its blue
  // to a second helping of its own weather. Below about a tenth getting down, no plausible share of
  // that is the deck alone, and the double-count is swamped by the fact that you can see nothing.
  const transmission = opts?.transmission;
  if (transmission !== undefined && transmission < 0.12 && !rendersAsGiant(body)) {
    const veilTop = palette.filter((p) => p.role === 'cloud' || p.role === 'atmosphere').slice(-1)[0];
    if (veilTop) {
      // Down and back up: what returns from the ground has crossed the sky twice.
      const seen = Math.max(0, Math.min(1, transmission * transmission));
      col = mix(hexToRgb(veilTop.hex), col, seen);
      // AND TELL THE PALETTE, not just the flattened swatch. The texture renderers paint the ground
      // from the `surface` STOP and then veil it with the deck — they never see the number above, so
      // fixing only `col` fixed the one-swatch view and left the drawn disc showing crimson rock
      // through an opaque sky. The stop's WEIGHT is how visible that ground is; the renderers read it.
      const surf = palette.find((p) => p.role === 'surface');
      if (surf) surf.weight = seen;
    }
  }

  // 4. Incandescence when very hot.
  if (teq > 800) {
    const t = Math.min(0.85, (teq - 800) / 1400);
    const inc = incandescent(teq);
    col = mix(col, inc, t);
    push(rgbToHex(inc), 'incandescent', t, 'thermal glow');
  }

  // Ice giants are smooth (a few faint bands); ammonia giants band strongly with rotation.
  return { hex: rgbToHex(col), palette, banding: bandCount(body, mk.gas, iceGiant) };
}

// Back-compat: callers/tests that just want the swatch.
export function deriveApparentColor(body: CelestialBody, rulePack?: RulePack, opts?: { starTempK?: number }): string {
  return deriveApparentColorParts(body, rulePack, opts).hex;
}
