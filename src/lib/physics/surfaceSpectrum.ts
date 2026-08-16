// THE SURFACE SPECTRUM — the star's light, filtered by the sky, as it arrives at the ground.
//
// ONE QUANTITY, TWO CONSUMERS (inbox B54). The pigment model reads its PHOTON COUNTS; the
// presentation layer reads its COLOUR. Both come from this one derivation, which is why "its sun is
// red AND its sky eats what is left" is a sentence the engine can actually justify rather than a
// slogan. It lives in physics/ because transmitted light is a physical quantity; a renderer that
// derived its own would be a second authority on it.
//
// WHY NOT KEY ON THE STAR'S SPECTRUM, WHICH IS WHAT EVERY REFERENCE CHART DOES: plants see the light
// that reaches the GROUND. Under a thick or hazy sky the two differ materially, and a filtered
// spectrum has NOTCHES where the atmosphere and cloud decks have eaten bands. Those notches are the
// interesting part — a pigment evolves to exploit a window its sky leaves open. Reduce the spectrum
// to its peak and select on that and you have done the work and thrown away the result.
//
// WHAT THIS MODEL DOES NOT DO, said plainly because /physics claims to show the working:
//   - Scattering is treated as EXTINCTION, so the sky's own glow is not added back to the ground.
//     Real diffuse skylight puts some of the scattered blue back; the cloud floor below is the only
//     place any of it is returned.
//   - Absorption bands are Gaussians at authored centres, not line-by-line radiative transfer.
//   - There is one column, straight up. No air mass, no zenith angle, no seasons.
// All three are simplifications of degree, not of kind, and none of them changes which band survives.
import type { CelestialBody, RulePack, SurfaceSpectrum, SurfaceSpectrumCurves, PigmentBand } from '$lib/types';
import { GRID_NM, blackbodySpectrum, gridShare, integrate, photonFlux, peakNm, spectrumToHex, type Spectrum } from './spectrum';
import { makeupFractions } from './makeup';
import { decksFromTags } from './cloudDecks';
import { liquidDef } from './liquids';
import { AVOGADRO, SOLAR_CONSTANT_WM2, EARTH_GRAVITY } from '$lib/constants';

// Earth's zenith Rayleigh optical depth at 550 nm — the ONE calibration anchor in the chain, and it
// is used as an anchor rather than a target: every other atmosphere is scaled from its own column
// density and gas mix, not fitted.
const EARTH_TAU_RAYLEIGH_550 = 0.0973;
// Earth's sea-level column number density, molecules per m². P/(m·g) with dry air's 0.02896 kg/mol.
const EARTH_COLUMN_M2 = (101325 / ((0.02896 / AVOGADRO) * EARTH_GRAVITY));

/** Gaussian band profile — shared by gas absorption and pigment absorption, because they are the
 *  same shape and a second copy would drift. */
export function bandAbsorbance(nm: number, bands: PigmentBand[] | undefined): number {
  let a = 0;
  for (const b of bands ?? []) {
    if (!(b.widthNm > 0)) continue;
    const t = (nm - b.centreNm) / b.widthNm;
    a += b.strength * Math.exp(-0.5 * t * t);
  }
  return a;
}

function surfaceGravityMs2(body: CelestialBody): number {
  const g = body.calculatedGravity_ms2;
  return g && g > 0 ? g : EARTH_GRAVITY;
}

/** Atmospheric column number density, molecules·m⁻². N = P/(m·g), with m the mean molecular mass. */
function columnDensity(body: CelestialBody): number {
  const pBar = body.atmosphere?.pressure_bar ?? 0;
  if (!(pBar > 0)) return 0;
  const molarKg = body.atmosphere?.molarMassKg ?? 0.02896;
  const mMolecule = molarKg / AVOGADRO;
  return (pBar * 1e5) / (mMolecule * surfaceGravityMs2(body));
}

/**
 * The star's spectrum at the top of the atmosphere.
 *
 * The star's bolometric flux comes from the SAME luminosity the radiation model reads
 * (`radiationOutput`, in L☉) over the same inverse square — no second sum of a quantity that
 * already has one (PHY-8). Only the SHAPE is Planck; the total is anchored on the solar constant.
 */
export function topOfAtmosphereSpectrum(starTempK: number, luminositySolar: number, distanceAU: number): Spectrum {
  if (!(starTempK > 0) || !(distanceAU > 0)) return GRID_NM.map(() => 0);
  const bolometricWm2 = (SOLAR_CONSTANT_WM2 * Math.max(0, luminositySolar)) / (distanceAU * distanceAU);
  // A cool star puts most of its power outside the grid entirely; only the in-grid share is ours.
  return blackbodySpectrum(starTempK, bolometricWm2 * gridShare(starTempK));
}

export interface SurfaceSpectrumInputs {
  starTempK: number;
  luminositySolar: number;
  distanceAU: number;
}

/**
 * Derive the spectrum reaching this body's reference level.
 *
 * THE LEVEL IS NAMED, NOT ASSUMED. A world with a solid surface gets 'surface'; a gas-dominated one
 * gets '1 bar', which is a LEVEL and not a surface — having a level was once mistaken for having a
 * surface and scored a gas giant full marks on three surface factors (inbox B18/B22). Nothing here
 * re-enables a surface-requiring claim; the caller still gates on makeup.
 */
export interface SurfaceSpectrumResult {
  /** The scalars. This is what goes on the body. */
  summary: SurfaceSpectrum;
  /** The sampled curves. Used in the same pass and then dropped — see SurfaceSpectrumCurves. */
  curves: SurfaceSpectrumCurves;
}

export function deriveSurfaceSpectrum(
  body: CelestialBody,
  inputs: SurfaceSpectrumInputs,
  pack?: RulePack | null
): SurfaceSpectrumResult | undefined {
  const { starTempK, luminositySolar, distanceAU } = inputs;
  if (!(starTempK > 0) || !(distanceAU > 0) || !(luminositySolar > 0)) return undefined;

  const top = topOfAtmosphereSpectrum(starTempK, luminositySolar, distanceAU);
  const totalTopWm2 = integrate(top);
  if (!(totalTopWm2 > 0)) return undefined;

  const attenuators: { label: string; strength: number }[] = [];
  // Optical depth per bin, accumulated from every attenuator. Transmission = exp(−τ) at the end, so
  // the attenuators compose multiplicatively without any of them knowing about the others.
  const tau = GRID_NM.map(() => 0);

  const comp = body.atmosphere?.composition ?? {};
  const column = columnDensity(body);
  const columnRatio = EARTH_COLUMN_M2 > 0 ? column / EARTH_COLUMN_M2 : 0;

  if (columnRatio > 0) {
    // RAYLEIGH — the λ⁻⁴ that makes a sky blue and takes the blue end away from the ground. Scaled
    // from Earth's own zenith optical depth by column density and by the gas mix's relative
    // cross-section, which is pack DATA (`rayleigh`) rather than a constant per gas in code.
    let sigmaRel = 0, fracSum = 0;
    for (const [gas, frac] of Object.entries(comp)) {
      if (!(frac > 0)) continue;
      sigmaRel += frac * (pack?.gasPhysics?.[gas]?.rayleigh ?? 1);
      fracSum += frac;
    }
    sigmaRel = fracSum > 0 ? sigmaRel / fracSum : 1;
    const tau550 = EARTH_TAU_RAYLEIGH_550 * columnRatio * sigmaRel;
    for (let i = 0; i < GRID_NM.length; i++) tau[i] += tau550 * Math.pow(550 / GRID_NM[i], 4);
    if (tau550 > 0.005) attenuators.push({ label: 'Rayleigh scattering', strength: 1 - Math.exp(-tau550) });

    // PER-GAS ABSORPTION BANDS. A gas with no authored bands takes only its Rayleigh share, which
    // is the honest answer for N2, O2 and Ar. NOTE what is deliberately NOT read here: the per-gas
    // `colorHex`. That is a human-RGB value, and filtering a spectrum through one would put the
    // three human primaries back inside the derivation — the fault this whole chain exists to
    // remove (B54). Colour is the LAST step and it happens once, below.
    for (const [gas, frac] of Object.entries(comp)) {
      const bands = pack?.gasPhysics?.[gas]?.absorptionBands;
      if (!bands?.length || !(frac > 0)) continue;
      // Column of THIS species relative to Earth's whole column; band strength is per unit of that.
      const speciesColumn = columnRatio * frac;
      let peak = 0;
      for (let i = 0; i < GRID_NM.length; i++) {
        const t = bandAbsorbance(GRID_NM[i], bands) * speciesColumn;
        tau[i] += t;
        if (t > peak) peak = t;
      }
      if (peak > 0.02) attenuators.push({ label: `${gas} absorption`, strength: 1 - Math.exp(-peak) });
    }
  }

  // CLOUD DECKS — read from the deck TAGS, which is the processor's single evaluation of what
  // condenses (a GM's manual deck works identically). A deck is GREY: droplets far larger than the
  // wavelength scatter every colour alike, which is why an overcast day is dim rather than tinted.
  // It also SCATTERS rather than absorbs, so an overcast sky is still bright underneath — the floor
  // is what returns that, and without it a fully-clouded world would compute as pitch dark.
  const CLOUD_FLOOR = 0.12;
  for (const d of decksFromTags(body.tags, pack)) {
    const def = liquidDef(d.species, pack);
    const veil = Math.min(0.98, (def?.cloudOpacity ?? 0.5) * d.coverage * (1 - CLOUD_FLOOR));
    if (veil <= 0.005) continue;
    const t = -Math.log(1 - veil);
    for (let i = 0; i < GRID_NM.length; i++) tau[i] += t;
    attenuators.push({ label: `${d.species} cloud deck`, strength: veil });
  }

  const transmission = tau.map((t) => Math.exp(-t));
  const surface = top.map((v, i) => v * transmission[i]);
  attenuators.sort((a, b) => b.strength - a.strength);

  const mk = makeupFractions(body);
  const summary: SurfaceSpectrum = {
    level: mk.gas > 0.5 ? '1 bar' : 'surface',
    starTempK,
    distanceAU,
    totalTopWm2,
    totalSurfaceWm2: integrate(surface),
    photonFlux: photonFlux(surface),
    peakTopNm: peakNm(top),
    peakSurfaceNm: peakNm(surface),
    // The one place a human eye enters the derivation, and it enters as an OUTPUT: this is what the
    // light would look like standing there, which is the most useful sentence on the panel and a
    // claim about us, not about the physics.
    surfaceLightHex: spectrumToHex(surface),
    attenuators: attenuators.slice(0, 4)
  };
  return { summary, curves: { nm: GRID_NM, topOfAtmosphere: top, surface, transmission } };
}
