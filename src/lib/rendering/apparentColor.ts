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
import { EARTH_MASS_KG, LIQUIDS } from '$lib/constants';

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

// Star colour from photosphere temperature (compact blackbody-ish bands; G≈white-yellow, M≈red).
export function starColorFromTempK(tempK?: number): RGB {
  const t = tempK ?? 5778;
  if (t >= 30000) return hexToRgb('#9bb0ff');
  if (t >= 10000) return hexToRgb('#aabfff');
  if (t >= 7500) return hexToRgb('#cad7ff');
  if (t >= 6000) return hexToRgb('#f8f7ff');
  if (t >= 5200) return hexToRgb('#fff4ea');
  if (t >= 3700) return hexToRgb('#ffd2a1');
  if (t >= 2400) return hexToRgb('#ffb56c');
  return hexToRgb('#ff8a4a');
}

// #8 — a liquid's APPARENT colour is starlight filtered by its intrinsic absorption (colorHex),
// plus a specular share of raw starlight set by the refractive index (Fresnel R = ((n−1)/(n+1))²,
// amplified for glancing geometry). Water under a red dwarf is murky amber-grey, not postcard blue;
// molten iron is mostly a starlight mirror. One data point (n) covers every liquid.
export function liquidApparentColor(liquidName: string, star: RGB): RGB {
  const def = LIQUIDS.find((l) => l.name === liquidName);
  const intrinsic = hexToRgb(def?.colorHex ?? '#8aa0b8');
  // Diffuse: per-channel filter of the starlight through the liquid's absorption tint.
  const diffuse: RGB = [
    (star[0] / 255) * intrinsic[0],
    (star[1] / 255) * intrinsic[1],
    (star[2] / 255) * intrinsic[2]
  ];
  const n = def?.refractiveIndex ?? 1.33;
  const fresnel = Math.pow((n - 1) / (n + 1), 2);          // ~0.02 for water … ~0.24 molten iron
  const spec = Math.min(0.65, fresnel * 6);                 // glancing-angle boost, capped
  return mix(diffuse, star, spec);
}

// How heavily a condensed cloud deck of each liquid veils the surface below it. Water clouds are
// patchy (Earth stays blue); sulfuric/sulfur/alkali/silicate decks are opaque and dominate.
const CLOUD_VEIL: Record<string, number> = {
  'sulfuric-acid': 0.6, 'sulfur-dioxide': 0.5, 'sodium': 0.45, 'potassium': 0.45,
  'molten-iron': 0.4, 'molten-glass': 0.4, 'ammonia': 0.4, 'methane': 0.25, 'water': 0.15
};

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
export function deriveApparentColorParts(body: CelestialBody, rulePack?: RulePack, opts?: { starTempK?: number }): ApparentColor {
  const mk = makeupFractions(body);
  const palette: ApparentColorStop[] = [];
  const push = (hex: string, role: ApparentColorStop['role'], weight: number, label?: string) => {
    if (weight > 0.02) palette.push({ hex, role, weight: Math.min(1, weight), label });
  };
  const star = starColorFromTempK(opts?.starTempK);

  // 1. Surface base ("land") from makeup fractions.
  let col = mixWeighted([
    [SURF.metal, mk.metal], [SURF.rock, mk.rock], [SURF.carbon, mk.carbon],
    [SURF.ice, mk.ice], [SURF.gas, mk.gas]
  ]);
  const surfDom = (['rock', 'metal', 'carbon', 'ice', 'gas'] as const).sort((a, b) => mk[b] - mk[a])[0];
  push(rgbToHex(col), 'surface', 1, `${surfDom} surface`);

  // 2. Surface liquid — ANY liquid, proportional to coverage (#9): the disc is land×(1−cover) +
  //    liquid×cover, with the liquid's shade derived from starlight × refractive index (#8).
  //    Molten surfaces are left to the incandescence step.
  const teq = body.equilibriumTempK ?? 0;
  const hydro = body.hydrosphere?.coverage ?? 0;
  const surfaceLiquid = body.hydrosphere?.layers?.find((l) => l.location === 'surface')?.liquid
    ?? body.hydrosphere?.composition;
  const liquidFamily = LIQUIDS.find((l) => l.name === surfaceLiquid)?.family;
  if (hydro > 0.05 && surfaceLiquid && liquidFamily !== 'molten') {
    const lc = liquidApparentColor(surfaceLiquid, star);
    const cover = Math.min(0.85, hydro);
    col = mix(col, lc, cover);
    push(rgbToHex(lc), 'ocean', hydro, `${surfaceLiquid} ocean`);
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
      col = mix(col, hexToRgb(hex), opacity);
      push(hex, 'atmosphere', opacity, `${g} haze`);
    }
  }

  // 3b. Condensed cloud DECKS (hydrosphere.layers, location 'cloud'). For rocky worlds a strong
  //     chromophore deck (sulfuric/sulfur/alkali) opaquely veils the surface; water is patchy.
  const cloudLayers = (body.hydrosphere?.layers ?? []).filter((l) => l.location === 'cloud');
  if (cloudLayers.length && mk.gas <= 0.5) {
    // strongest-veiling deck wins the surface look
    const top = cloudLayers
      .map((l) => ({ l, veil: CLOUD_VEIL[l.liquid] ?? 0.3 }))
      .sort((a, b) => b.veil - a.veil)[0];
    if (top?.l.colorHex) {
      col = mix(col, hexToRgb(top.l.colorHex), top.veil);
      push(top.l.colorHex, 'cloud', top.veil, `${top.l.liquid} clouds`);
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
    const comp = atm?.composition ?? {};
    const ch4 = comp['CH4'] ?? comp['methane'] ?? 0;
    let cloud = gasGiantCloudColor(teq); // warm thermal base (ammonia / water / alkali / silicate)
    // Methane absorption: stronger with abundance and with cold (we see deeper, more absorbing air).
    const methaneStrength = Math.min(0.9, ch4 * 6 + (teq < 90 ? 0.22 : teq < 160 ? 0.08 : 0));
    if (methaneStrength > 0.06 && teq < 420) {
      const methaneHue = teq < 60 ? [47, 107, 214] as RGB : [70, 176, 216] as RGB; // Neptune deep blue ↔ Uranus cyan
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
    col = mix(col, cloud, 0.85);
    push(rgbToHex(cloud), 'cloud', 0.85, iceGiant ? 'methane haze' : 'ammonia cloud deck');
    // Chromophore stripes belong to warm ammonia giants (Jupiter's browns/oranges); ice giants are
    // near-featureless. Only emit band colours for the ammonia case → the renderer skips spots/stripes
    // on Uranus/Neptune.
    if (!iceGiant) {
      for (const l of cloudLayers) if (l.colorHex) push(l.colorHex, 'cloud', 0.4, `${l.liquid} band`);
      const chromo = teq < 200 ? '#a8642e' : teq < 400 ? '#c98a3e' : '#9a8478';
      push(rgbToHex(mix(cloud, hexToRgb(chromo), 0.55)), 'cloud', 0.4 + 0.3 * Math.min(1, massMe / 318), 'chromophore band');
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
