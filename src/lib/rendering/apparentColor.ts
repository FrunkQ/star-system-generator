// Derived apparent (true) colour of a body — so the orrery/picker show Mars red, a sulfur
// world yellow, Neptune blue, a lava world orange, instead of one swatch per class. Composed
// from: surface makeup → tinted by the dominant coloured atmosphere/cloud gas (the per-gas
// colorHex already in the rulepack) → shifted toward incandescent when very hot. (proposal §2e)
import type { CelestialBody, RulePack } from '$lib/types';
import { makeupFractions } from '$lib/physics/makeup';
import { EARTH_MASS_KG } from '$lib/constants';

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
const OCEAN = hexToRgb('#2b6cb0');

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

export function deriveApparentColor(body: CelestialBody, rulePack?: RulePack): string {
  const mk = makeupFractions(body);
  // 1. Surface base from makeup fractions.
  let col = mixWeighted([
    [SURF.metal, mk.metal], [SURF.rock, mk.rock], [SURF.carbon, mk.carbon],
    [SURF.ice, mk.ice], [SURF.gas, mk.gas]
  ]);

  // 2. Liquid water surface → blue, where temperate.
  const teq = body.equilibriumTempK ?? 0;
  const hydro = body.hydrosphere?.coverage ?? 0;
  if (hydro > 0.25 && body.hydrosphere?.composition === 'water' && teq > 250 && teq < 360) {
    col = mix(col, OCEAN, Math.min(0.7, hydro));
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
    }
  }

  // 3b. Gas-rich worlds take their look from cloud decks (by temperature), not the surface.
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  if (mk.gas > 0.5) {
    col = mix(col, gasGiantCloudColor(teq), 0.8);
    // Cold methane ice giants (≲ Neptune mass) are extra blue from their CH4.
    if (teq < 250 && massMe < 50 && (atm?.composition?.['CH4'] ?? 0) > 0.01) {
      col = mix(col, hexToRgb('#3b6fc4'), 0.5);
    }
  }

  // 4. Incandescence when very hot.
  if (teq > 800) col = mix(col, incandescent(teq), Math.min(0.85, (teq - 800) / 1400));

  return rgbToHex(col);
}
