// Bond albedo, DERIVED from what the world is made of rather than dialled in by hand: the surface
// (makeup → rock/ice/ocean reflectivity) plus the cloud decks that condense at its temperature
// (water/sulfuric/CO₂/ammonia clouds each reflect differently). This couples clouds → albedo →
// temperature, so it's solved as a quick fixed point (albedo ⇄ equilibrium temp) and is the reason
// a manual albedo slider is no longer needed — tweak the makeup/atmosphere and the albedo follows.
import type { CelestialBody, RulePack } from '$lib/types';
import { makeupFractions } from './makeup';
import { phaseAt } from './liquids';

// Surface reflectivity by makeup component.
const SURF_ALBEDO = { metal: 0.18, rock: 0.15, carbon: 0.05, ice: 0.62, gas: 0.30 };
const OCEAN_ALBEDO = 0.06;   // dark liquid water
const WATER_ICE_ALBEDO = 0.62;

// Cloud-deck reflectivity by the condensing species.
const CLOUD_ALBEDO: Record<string, number> = {
  H2O: 0.50, H2SO4: 0.75, NH3: 0.55, CO2: 0.70, SO2: 0.55, CH4: 0.30, // CH4 = haze (dark)
  Na: 0.40, K: 0.40, Fe: 0.40, SiO: 0.45
};
// Boiling points (K) for the condensables — a gas forms clouds when it's cool enough to condense.
const CONDENSE_BOIL: Record<string, number> = {
  H2O: 373, H2SO4: 610, NH3: 240, CO2: 195, SO2: 263, CH4: 112, Na: 1156, K: 1032, Fe: 3134, SiO: 2230
};

export interface AlbedoBreakdown {
  albedo: number;
  surfaceAlbedo: number;
  cloudAlbedo: number;
  cloudCover: number;       // 0..1
  cloudSpecies?: string;
  note: string;
}

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

// Gas/ice giants: no surface, cloud-dominated; reflectivity tracks the cloud chemistry by temp.
function giantAlbedo(teqK: number, ch4: number, massMe: number, isIceGiant: boolean): number {
  if (isIceGiant) return 0.30;
  if (teqK < 150) return 0.34;           // ammonia clouds (Jupiter/Saturn)
  if (ch4 > 0.01 && teqK < 250) return 0.29;
  if (teqK > 1200) return 0.10;          // hot, cloud-stripped
  return 0.32;
}

export function deriveAlbedo(body: CelestialBody, teqK: number, pack?: RulePack | null): AlbedoBreakdown {
  // F-OVR: a GM-pinned albedo (body.overrides.albedo) wins and is fed straight into the temperature
  // solve; the legacy body.albedo is honoured too. Otherwise the albedo is derived below.
  const pinned = body.overrides?.albedo ?? (typeof body.albedo === 'number' ? body.albedo : undefined);
  if (typeof pinned === 'number' && pinned >= 0 && pinned <= 1) {
    return { albedo: pinned, surfaceAlbedo: pinned, cloudAlbedo: 0, cloudCover: 0, note: 'Manually set (GM override).' };
  }
  const mk = makeupFractions(body);
  const massMe = (body.massKg ?? 0) / 5.972e24;
  const comp = body.atmosphere?.composition ?? {};
  const P = body.atmosphere?.pressure_bar ?? 0;

  if (mk.gas > 0.5) {
    const a = giantAlbedo(teqK, comp['CH4'] ?? 0, massMe, body.classes?.some((c) => c.includes('ice-giant')) ?? false);
    return { albedo: a, surfaceAlbedo: a, cloudAlbedo: a, cloudCover: 1, note: 'Cloud-topped giant.' };
  }

  // --- Surface reflectivity from makeup, then overridden by ocean / ice where there's a hydrosphere.
  //     The ocean/ice split uses a GREENHOUSE-tolerant threshold: a water world is only "frozen" if
  //     its equilibrium temp is well below freezing (< 230 K), since greenhouse warms the surface
  //     above the bare equilibrium value (Earth: T_eq 255 K but 288 K surface). Avoids a snowball.
  let surf = mk.metal * SURF_ALBEDO.metal + mk.rock * SURF_ALBEDO.rock + mk.carbon * SURF_ALBEDO.carbon
    + mk.ice * SURF_ALBEDO.ice + mk.gas * SURF_ALBEDO.gas;
  const hydroCov = body.hydrosphere?.coverage ?? 0;
  const hydroComp = body.hydrosphere?.composition;
  const liquidOcean = hydroComp === 'water' && hydroCov > 0.05 && teqK >= 230;
  const frozenOcean = hydroComp === 'water' && hydroCov > 0.05 && teqK < 230;
  if (liquidOcean) surf = surf * (1 - hydroCov) + OCEAN_ALBEDO * hydroCov;
  else if (frozenOcean) surf = surf * (1 - hydroCov) + WATER_ICE_ALBEDO * hydroCov;

  // --- Cloud cover + reflectivity. A liquid ocean makes its OWN water clouds (evaporation), which
  //     is what gives Earth its albedo even when water vapour isn't listed as an atmospheric gas.
  //     Atmospheric condensables (CO₂, sulfuric, ammonia…) add or override. ---
  let cloudAlbedo = 0, cloudSpecies: string | undefined, cloudCover = 0;
  if (liquidOcean) { cloudSpecies = 'H2O'; cloudAlbedo = CLOUD_ALBEDO.H2O; cloudCover = clamp(hydroCov * 0.7, 0.2, 0.8); }

  let topFrac = liquidOcean ? 0.05 : 0;       // a real atmospheric deck must beat the ocean's clouds
  for (const [gas, frac] of Object.entries(comp)) {
    const boil = CONDENSE_BOIL[gas];
    if (boil === undefined || (frac as number) < 0.02) continue;
    if (teqK < boil * 1.6 && (frac as number) > topFrac) {      // cool enough to condense at altitude
      topFrac = frac as number;
      cloudAlbedo = CLOUD_ALBEDO[gas] ?? 0.5;
      cloudSpecies = gas;
      cloudCover = clamp(P / (P + 1.0), 0.15, 0.98);
    }
  }

  const albedo = clamp(surf * (1 - cloudCover) + cloudAlbedo * cloudCover, 0.02, 0.95);
  return {
    albedo: +albedo.toFixed(3),
    surfaceAlbedo: +surf.toFixed(3),
    cloudAlbedo: +cloudAlbedo.toFixed(3),
    cloudCover: +cloudCover.toFixed(2),
    cloudSpecies,
    note: cloudSpecies ? `${cloudSpecies} cloud deck over a ${surf < 0.1 ? 'dark' : surf > 0.4 ? 'bright' : 'mid-tone'} surface.` : 'Cloud-free surface.'
  };
}
