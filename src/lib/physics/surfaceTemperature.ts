// Surface temperature DECOMPOSED by cause (the "whole picture"). A single mean — or even a single
// min/max — hides what a GM actually wants: how cold do the poles get in winter at night, how hot
// is the sub-stellar point, do tidal hotspots reach lava? We split the variation into independent,
// named sources, each reported as the swing it ALONE would produce around the mean:
//
//   - latitude      equator (hot) ↔ pole (cold) — geometry of insolation
//   - seasonal      axial tilt + orbital eccentricity — the annual swing
//   - diurnal       day ↔ night — rotation; large when airless / slow, small under a thick blanket
//   - locked-day/night  a tidally-locked body has permanent hot/cold faces instead of a day/night cycle
//   - tidal-hotspot localized volcanic peaks (capped mean, but lava at the vents) — see tidalThermal
//
// An ATMOSPHERE (and oceans) redistribute heat, shrinking every insolation-driven swing — that's the
// single biggest control, so a thick-atmosphere world is far more uniform than an airless one.
// Calibrated loosely to Earth / Mars / the Moon / Mercury; HEURISTIC, documented in /physics.
import { tidalHotspotPeakK } from './tidalThermal';
import type { SurfaceTempProfile, TempComponent } from '$lib/types';

export interface SurfaceTempInputs {
  meanK: number;
  equilibriumK: number;
  pressureBar: number;
  rotationHours?: number;
  tidallyLocked?: boolean;
  starTidallyLocked?: boolean;  // locked to the STAR (permanent substellar face). A moon locked to its
  orbitalPeriodHours?: number;  // planet is NOT — its whole surface still cycles day/night (over its orbit)
  eccentricity?: number;
  obliquityDeg?: number;        // axial tilt; default 25° when unknown
  hasLiquidOcean?: boolean;
  tidalRawIndex?: number;
  iceFrac?: number;
}

const FLOOR_K = 3; // radiative floor — nothing in deep space sits at absolute zero

export function surfaceTempProfile(i: SurfaceTempInputs): { profile: SurfaceTempProfile; tags: string[] } {
  const mean = i.meanK;
  const Teq = i.equilibriumK || mean;
  const P = Math.max(0, i.pressureBar);

  // Heat redistribution: thick atmosphere + oceans even out insolation swings.
  let damp = P / (P + 0.5);                                  // 0 (airless) → ~1 (thick)
  if (i.hasLiquidOcean) damp = Math.min(1, damp + 0.2);
  const insolationSpread = Math.max(0.05, 1 - 0.7 * damp);   // survives more when airless
  const diurnalSpread = Math.max(0.04, 1 - damp);            // day/night is even more atmosphere-sensitive

  const components: TempComponent[] = [];
  let coldAmp = 0, hotAmp = 0;

  // --- Latitude: equator warm, poles cold (always present from geometry). ---
  const latAmp = 0.22 * Teq * insolationSpread;
  if (latAmp > 2) {
    components.push({ source: 'latitude', label: 'Latitude (equator ↔ pole)', lowK: mean - latAmp, highK: mean + latAmp });
    coldAmp += latAmp; hotAmp += latAmp;
  }

  // --- Seasonal: axial tilt + orbital eccentricity. ---
  const tilt = (i.obliquityDeg ?? 25) * Math.PI / 180;
  const e = i.eccentricity ?? 0;
  const seasAmp = Teq * (0.30 * Math.sin(tilt) + 0.6 * e) * insolationSpread;
  if (seasAmp > 2) {
    components.push({ source: 'seasonal', label: 'Seasonal (tilt + orbit)', lowK: mean - seasAmp, highK: mean + seasAmp });
    coldAmp += seasAmp; hotAmp += seasAmp;
  }

  // --- Day/night OR permanently-locked faces. ONLY a STAR-locked body has a permanent substellar face
  //     (a Mercury-3:2 aside — we model synchronous). A moon locked to its PLANET keeps turning relative
  //     to the star over its orbit, so its whole surface still bakes and freezes on a slow day/night
  //     cycle (its rotation relative to the sun ≈ its orbital period) — not a frozen far side. ---
  if (i.starTidallyLocked) {
    const dayAmp = 0.40 * Teq * diurnalSpread;
    const nightAmp = 0.60 * Teq * diurnalSpread;
    if (dayAmp > 2 || nightAmp > 2) {
      components.push({ source: 'locked-day', label: 'Day side (locked)', lowK: mean, highK: mean + dayAmp, note: 'Permanent sub-stellar face.' });
      components.push({ source: 'locked-night', label: 'Night side (locked)', lowK: mean - nightAmp, highK: mean, note: 'Permanent dark face.' });
      coldAmp += nightAmp; hotAmp += dayAmp;
    }
  } else {
    // A planet-locked moon turns relative to the sun once per orbit → use its orbital period as the
    // effective solar-day length (slow → a big, but not permanent, swing).
    const effRotHours = i.tidallyLocked ? (i.orbitalPeriodHours || i.rotationHours || 24) : (i.rotationHours ?? 24);
    const rotFactor = Math.min(2.5, Math.max(0.5, effRotHours / 24)); // slow spin → bigger swing
    const diAmp = 0.30 * Teq * diurnalSpread * rotFactor;
    if (diAmp > 2) {
      components.push({ source: 'diurnal', label: 'Day ↔ night', lowK: mean - diAmp, highK: mean + diAmp });
      coldAmp += diAmp; hotAmp += diAmp;
    }
  }

  // --- Tidal hotspots (one-sided hot; can dwarf everything on an Io). ---
  const tags: string[] = [];
  let tidalPeak = mean;
  if ((i.tidalRawIndex ?? 0) > 80) {
    tidalPeak = tidalHotspotPeakK(i.tidalRawIndex!, mean, i.iceFrac ?? 0);
    if (tidalPeak > mean + 2) {
      components.push({ source: 'tidal-hotspot', label: 'Tidal hotspots', lowK: mean, highK: tidalPeak, note: 'Localized volcanic vents — far hotter than the average.' });
      if (tidalPeak >= 1300) tags.push('tidal/lava-flows');
      else if (tidalPeak >= 1000) tags.push('tidal/volcanism');
    }
  }

  const totalMin = Math.max(FLOOR_K, mean - coldAmp);
  const totalMax = Math.max(mean + hotAmp, tidalPeak);

  return {
    profile: {
      meanK: Math.round(mean),
      totalMinK: Math.round(totalMin),
      totalMaxK: Math.round(totalMax),
      components: components.map((c) => ({ ...c, lowK: Math.round(c.lowK), highK: Math.round(c.highK) }))
    },
    tags
  };
}
