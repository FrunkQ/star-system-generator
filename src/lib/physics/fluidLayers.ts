// Derives a body's fluid LAYERS (proposal §2c): surface ocean, subsurface (under-ice) ocean,
// atmospheric cloud decks, and deep interior conductive fluids. Layers feed classification
// (subsurface-ocean), apparent colour (clouds), and the magnetic dynamo (§2d interior layers).
import type { CelestialBody, RulePack, FluidLayer } from '$lib/types';
import { EARTH_MASS_KG, HYDROSTATIC_MIN_RADIUS_KM } from '$lib/constants';
import { makeupFractions } from './makeup';
import { isLiquidAtP, liquidDef } from './liquids';

// NOTE: cloud decks moved OUT of this module — `physics/cloudDecks.ts` is the single evaluation,
// driven by rule-pack data (a gas's `cloud` block names its condensate; the liquid carries the
// look). The old GAS_CLOUD / CLOUD_COLOUR tables that lived here are that data now.

export function deriveFluidLayers(body: CelestialBody, pack?: RulePack): FluidLayer[] {
  const layers: FluidLayer[] = [];
  const surfT = body.temperatureK ?? body.equilibriumTempK ?? 0;
  const interiorWarmth = (body.tidalHeatK ?? 0) + (body.radiogenicHeatK ?? 0) + (body.internalHeatK ?? 0);
  const mk = makeupFractions(body);
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;

  // --- Surface liquid: hydrosphere coverage that is actually LIQUID at the surface temperature
  //     (per the solvent's own melt/boil points — water is not special). If it's frozen the
  //     "coverage" is surface ice (handled as an icy shell / polar ice); if it's boiled away there
  //     is no surface liquid. The liquid carries its own colour for the apparent-colour model. ---
  const hydroComp = body.hydrosphere?.composition;
  const coverage = body.hydrosphere?.coverage ?? 0;
  // Pressure-aware: a standing surface liquid needs the solvent to be LIQUID at the surface
  // temperature AND pressure — below its triple pressure it sublimates (no sea on an airless
  // warm world), and a thick atmosphere raises its boiling point (a deep-pressure ocean stays
  // liquid far past its 1-atm boil). Falls back to 1-atm when no pressure is recorded.
  const surfPbar = body.atmosphere?.pressure_bar;
  if (coverage > 0.01 && hydroComp && hydroComp !== 'none' && isLiquidAtP(hydroComp, surfT, surfPbar, pack)) {
    const def = liquidDef(hydroComp, pack);
    layers.push({ liquid: hydroComp, location: 'surface', coverage, colorHex: def?.colorHex });
  }

  // --- Subsurface ocean: an icy/water world, frozen at the surface, but interior heat
  //     (tidal + radiogenic) keeps a liquid layer under the ice. Salty → conductive (induced field). ---
  const wateryMakeup = mk.ice > 0.1;
  const wateryHydro = body.hydrosphere?.composition === 'water' || body.hydrosphere?.composition === 'water-ammonia';
  const hasSurfaceWater = (body.hydrosphere?.coverage ?? 0) > 0.01 && surfT >= 273;
  // Heat that can keep an under-ice ocean liquid: active tidal flexing (capped but real) or
  // substantial radiogenic/primordial heat in a larger icy body. A static, cold ice world with
  // none of these stays frozen through — no subsurface ocean.
  const activeHeating = (body.tidalHeatK ?? 0) > 1 || (body.radiogenicHeatK ?? 0) > 2 || (body.internalHeatK ?? 0) > 4;
  // A body must be large enough to differentiate + hold an interior ocean (the ~200 km round limit).
  // Below it (Phobos/Deimos-scale) tidal stress shreds the body rather than sustaining a melt layer.
  const bigEnoughForOcean = (body.radiusKm ?? 0) >= HYDROSTATIC_MIN_RADIUS_KM;
  if ((wateryMakeup || wateryHydro) && surfT < 273 && activeHeating && massMe < 8 && bigEnoughForOcean && !hasSurfaceWater) {
    layers.push({ liquid: 'salty-water', location: 'subsurface', conductive: true, colorHex: '#3a6ea5' });
  }

  // (Cloud decks are no longer derived here — physics/cloudDecks.ts owns them, publishing tags
  // rather than layers. This module keeps the layers that feed PHYSICS: surface/subsurface oceans
  // for classification & habitability, interior conductive fluids for the dynamo.)

  // --- Deep interior conductive fluid (the dynamo source for §2d) ---
  if (mk.gas > 0.5) {
    layers.push(massMe > 50
      ? { liquid: 'metallic-hydrogen', location: 'interior', conductive: true }   // gas giant
      : { liquid: 'superionic-water', location: 'interior', conductive: true });  // ice giant
  } else if (mk.metal > 0.1 && massMe > 0.3) {
    // Rocky world with a metal core → (partially) molten, convecting iron → dynamo.
    layers.push({ liquid: 'molten-iron', location: 'interior', conductive: true });
  }

  return layers;
}
