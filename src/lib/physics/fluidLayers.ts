// Derives a body's fluid LAYERS (proposal §2c): surface ocean, subsurface (under-ice) ocean,
// atmospheric cloud decks, and deep interior conductive fluids. Layers feed classification
// (subsurface-ocean), apparent colour (clouds), and the magnetic dynamo (§2d interior layers).
import type { CelestialBody, RulePack, FluidLayer } from '$lib/types';
import { EARTH_MASS_KG } from '$lib/constants';
import { makeupFractions } from './makeup';
import { isLiquidAt, liquidDef } from './liquids';

// Which liquid a condensable gas forms as a cloud, and its representative colour.
const GAS_CLOUD: Record<string, { liquid: string; colorHex: string }> = {
  H2O: { liquid: 'water', colorHex: '#eef2f8' },
  H2SO4: { liquid: 'sulfuric-acid', colorHex: '#efe6c0' },
  NH3: { liquid: 'ammonia', colorHex: '#d8b48a' },
  CH4: { liquid: 'methane', colorHex: '#9fb6c8' },
  SO2: { liquid: 'sulfur-dioxide', colorHex: '#ffffe0' },
  Na: { liquid: 'sodium', colorHex: '#ffd700' },
  K: { liquid: 'potassium', colorHex: '#ee82ee' },
  Fe: { liquid: 'molten-iron', colorHex: '#808080' },
  SiO: { liquid: 'molten-glass', colorHex: '#a9a9a9' }
};

// Friendly visible colour of a cloud deck by its condensed liquid — for the "what colour is the
// sky?" cloud-deck tag. Unknown liquids fall back to the liquid name.
const CLOUD_COLOUR: Record<string, string> = {
  water: 'white', 'sulfuric-acid': 'pale yellow', ammonia: 'tan', methane: 'blue',
  'sulfur-dioxide': 'yellow', sodium: 'orange', potassium: 'violet', 'molten-iron': 'grey',
  'molten-glass': 'grey'
};
export function cloudColourName(liquid: string): string {
  return CLOUD_COLOUR[liquid] ?? liquid.replace(/-/g, ' ');
}

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
  if (coverage > 0.01 && hydroComp && hydroComp !== 'none' && isLiquidAt(hydroComp, surfT, pack)) {
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
  if ((wateryMakeup || wateryHydro) && surfT < 273 && activeHeating && massMe < 8 && !hasSurfaceWater) {
    layers.push({ liquid: 'salty-water', location: 'subsurface', conductive: true, colorHex: '#3a6ea5' });
  }

  // --- Cloud decks: condensable cloud-forming gases present in the atmosphere. The set of
  //     cloud-forming species (and their liquid + colour) is owned HERE by GAS_CLOUD — this model
  //     supersedes the old rulepack "cloud-former" gas tag. ---
  const comp = body.atmosphere?.composition;
  if (comp) {
    for (const [gas, frac] of Object.entries(comp)) {
      if ((frac as number) < 0.001) continue;
      const m = GAS_CLOUD[gas];
      if (!m) continue;
      const phys = pack?.gasPhysics?.[gas];
      // condenses if the surface (or upper atmosphere) is below ~1.6× its boiling point
      if (surfT < (phys?.boilK ?? 999) * 1.6) {
        layers.push({ liquid: m.liquid, location: 'cloud', colorHex: m.colorHex });
      }
    }
  }

  // --- Deep interior conductive fluid (the dynamo source for §2d) ---
  if (mk.gas > 0.5) {
    layers.push(massMe > 50
      ? { liquid: 'metallic-hydrogen', location: 'interior', conductive: true }   // gas giant
      : { liquid: 'superionic-water', location: 'interior', conductive: true });  // ice giant
  } else if (mk.metal > 0.1 && massMe > 0.3) {
    // Rocky world with a metal core → (partially) molten, convecting iron → dynamo.
    layers.push({ liquid: 'liquid-iron', location: 'interior', conductive: true });
  }

  return layers;
}
