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
//
// ── THE DAY/NIGHT PAIR IS AN ENERGY BALANCE, AND THE MEAN FALLS OUT OF IT (inbox B63) ──────────────
// `equilibriumK` is a POWER balance: the single temperature at which a sphere radiates away exactly
// what it absorbs, (S(1−A)/4σ)^¼. IT IS NOT A MEAN SURFACE TEMPERATURE. Radiated power goes as T⁴,
// so a surface at 390 K noon and 100 K midnight radiates the same TOTAL as a uniform 270 K body while
// AVERAGING far below it. Deriving a mean from the equilibrium figure and hanging a symmetric ± swing
// off it therefore gets three things wrong at once — day too hot, night too cold, mean too high — and
// no value of the amplitude constant can fix it, because the fault is the SHAPE. So this model derives
// the two sides from the balance and lets the mean fall out of them:
//
//   f  = the fraction of the absorbed energy that reaches the night side (0 = none, 1 = isothermal)
//   day hemisphere radiates  (2−f)·σTeq⁴   →  T_day   = Teq·(2−f)^¼
//   night hemisphere         f·σTeq⁴       →  T_night = Teq·f^¼          (the two average to σTeq⁴)
//   sub-stellar point        (4−3f)·σTeq⁴  →  T_peak  = Teq·(4−3f)^¼     (f=0 → √2·Teq, the local
//                                                                        equilibrium; f=1 → Teq)
//   mean surface temperature = (T_day + T_night)/2  — below Teq by exactly the T⁴ penalty above
//
// The sunlit side cannot exceed its LOCAL equilibrium √2·Teq, which is where the ceiling comes from:
// the model can no longer "keep adding" (Luna's noon read 209 °C against a measured ~120 °C), and the
// night side asymptotes to a floor instead of falling linearly. Both bounds are physical, not tuned.
// NOTE the ceiling is computed from the BOND albedo and unit emissivity, so it runs ~10 K conservative
// against measurement: a real surface reflects less at normal incidence than it does over the sphere.
//
// f has two channels, and they compose (whatever the air does not carry, the ground still can):
//   1. BULK TRANSPORT by atmosphere and ocean — `damp` below, unchanged and calibrated: it is what
//      makes Venus a 700 K world with no day/night difference at all.
//   2. HEAT STORED IN THE GROUND through the day and given back at night, which is the standard
//      thermal parameter Θ = I·√ω / (σ·T_ss³): the surface's heat-storage rate against its radiative
//      loss rate. Θ → 0 (a slow rotator, or a hot one that radiates fast) gives a brutal night; Θ → ∞
//      (a fast rotator, or a cold one that cools feebly) gives a nearly isothermal body. This is where
//      rotation belongs — the old `rotFactor` scaled the AMPLITUDE by the day length and clamped at
//      2.5, which made every slow rotator identical (Ganymede and Callisto came out the same to the
//      kelvin despite a 2.3× difference in day length).
//
// Calibrated loosely to Earth / Mars / the Moon / Mercury; HEURISTIC, documented in /physics.
import { tidalHotspotPeakK } from './tidalThermal';
import { STEFAN_BOLTZMANN_CONSTANT } from '../constants';
import type { SurfaceTempProfile, TempComponent } from '$lib/types';

export interface SurfaceTempInputs {
  meanK: number;
  equilibriumK: number;
  equilibriumMaxK?: number;     // equilibrium temp at CLOSEST approach — the sunlit ceiling is reached there
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
  // Maps an equilibrium-space temperature to a SURFACE temperature by adding this body's other heat
  // terms (greenhouse, tidal, radiogenic, internal, self-luminous) in flux space. Supplied by the
  // caller so there is exactly one composition — `temperature.composeBodySurfaceTemperature`, whose
  // docstring already anticipates exactly this use ("pass equilibriumTempK when composing a variant").
  // Without it the profile falls back to the caller's own mean-minus-equilibrium offset.
  composeSurfaceAt?: (equilibriumK: number) => number;
}

const FLOOR_K = 3; // radiative floor — nothing in deep space sits at absolute zero

// Thermal inertia of a bare regolith surface, J m⁻² K⁻¹ s^-½. This is the MEASURED value for lunar
// and Mercurian regolith (~50) rather than a fitted one; solid rock is ~2000 and the difference is
// almost all porosity.
const REGOLITH_THERMAL_INERTIA = 50;
// Gas in the pore spaces conducts heat far better than vacuum does, and thermal inertia goes as √κ.
// The gain SATURATES once the mean free path drops below the pore size (the Knudsen transition, at
// roughly a millibar for a fine soil), so a whisper of air buys nearly all of it and a thick
// atmosphere buys no more — which is why Mars's ground holds its night far better than Luna's.
const PORE_GAS_CONDUCTIVITY_GAIN = 9;
const PORE_GAS_KNUDSEN_BAR = 1e-3;
// A PERMANENTLY dark face still is not at absolute zero: solid-body conduction from the day side and
// light scattered off dust and moons keep it at a few tens of kelvin (Mercury's polar craters sit at
// 50-100 K). Expressed as a floor on f rather than a temperature, so it scales with the star.
const DARK_FACE_RETENTION = 3e-4;

/**
 * The SOLAR day — the time between one noon and the next, which is what the surface actually cools
 * over. Not the sidereal spin: Venus turns in 243 days but its sun rises every 117, and Mercury's 3:2
 * resonance gives it a 176-day solar day out of an 88-day year.
 * Returns Infinity for a genuinely synchronous body (a permanent day face and a permanent night one).
 */
function solarDayHours(i: SurfaceTempInputs): number {
  const orbH = (i.orbitalPeriodHours ?? 0) > 0 ? (i.orbitalPeriodHours as number) : 0;
  // A moon locked to its PLANET turns relative to the star once per orbit about that planet, so its
  // month IS its solar day (Luna: 27.5 days here against a true 29.5 — the difference is Earth's own
  // motion around the sun, which this deliberately does not chase).
  if (i.tidallyLocked && !i.starTidallyLocked) return orbH || Math.abs(i.rotationHours || 24);
  const rot = i.rotationHours; // SIGNED — a retrograde spin shortens the solar day
  if (i.starTidallyLocked) {
    // The flag asserts synchronous rotation, so believe it unless the body's own numbers say
    // otherwise: `lockedSpin` deliberately keeps a CAPTURED RESONANCE's measured period instead of
    // claiming synchrony, and a resonance is not a permanent face.
    if (!rot || !orbH) return Infinity;
    const rel = Math.abs(1 / rot - 1 / orbH);
    return rel > 0 ? 1 / rel : Infinity;
  }
  if (!rot) return orbH || 24;
  if (!orbH) return Math.abs(rot);
  const relative = Math.abs(1 / rot - 1 / orbH);
  return relative > 0 ? 1 / relative : Infinity;
}

export function surfaceTempProfile(i: SurfaceTempInputs): { profile: SurfaceTempProfile; tags: string[] } {
  const Teq = i.equilibriumK || i.meanK;
  const TeqMax = Math.max(Teq, i.equilibriumMaxK ?? 0);
  const P = Math.max(0, i.pressureBar);
  // Everything below is derived in EQUILIBRIUM space and mapped to the surface through this, so the
  // greenhouse and every other heat term are added exactly once, by the one function that owns them.
  const compose = i.composeSurfaceAt ?? ((t: number) => Math.max(0, t + (i.meanK - Teq)));

  // Heat redistribution: thick atmosphere + oceans even out insolation swings.
  let damp = P / (P + 0.5);                                  // 0 (airless) → ~1 (thick)
  if (i.hasLiquidOcean) damp = Math.min(1, damp + 0.2);
  const insolationSpread = Math.max(0.05, 1 - 0.7 * damp);   // survives more when airless

  // --- The day/night energy balance (see the header). ---
  const subsolarK = Teq * Math.SQRT2;                        // (S(1−A)/σ)^¼ — the sunlit ceiling
  const solarDay = solarDayHours(i);
  const omega = Number.isFinite(solarDay) && solarDay > 0 ? (2 * Math.PI) / (solarDay * 3600) : 0;
  const thermalInertia = REGOLITH_THERMAL_INERTIA
    * Math.sqrt(1 + PORE_GAS_CONDUCTIVITY_GAIN * (P / (P + PORE_GAS_KNUDSEN_BAR)));
  const theta = subsolarK > 0 && omega > 0
    ? (thermalInertia * Math.sqrt(omega)) / (STEFAN_BOLTZMANN_CONSTANT * Math.pow(subsolarK, 3))
    : 0;
  const groundRetention = theta / (1 + theta);
  // The two channels compose: the ground carries what the air did not.
  const f = Math.min(1, Math.max(DARK_FACE_RETENTION, damp + (1 - damp) * groundRetention));

  const dayK = compose(Teq * Math.pow(2 - f, 0.25));
  const nightK = compose(Teq * Math.pow(f, 0.25));
  const peakK = compose(TeqMax * Math.pow(4 - 3 * f, 0.25));
  // THE MEAN FALLS OUT of the two hemispheres rather than being handed in. For a well-mixed world
  // (f → 1) this returns the composed equilibrium temperature and nothing moves; the bigger the
  // swing, the further the mean sits below it, which is the T⁴ penalty made visible.
  const mean = Teq > 0 ? (dayK + nightK) / 2 : i.meanK;

  const components: TempComponent[] = [];
  // Each swing is collected SEPARATELY and combined in quadrature at the end — see the note by
  // totalMin below. Adding them straight up treats "coldest possible" as pole AND midwinter AND
  // midnight all at full strength simultaneously, which is not how independent variations combine.
  const coldTerms: number[] = [], hotTerms: number[] = [];

  // --- Latitude: equator warm, poles cold (always present from geometry). ---
  const latAmp = 0.22 * Teq * insolationSpread;
  if (latAmp > 2) {
    components.push({ source: 'latitude', label: 'Latitude (equator ↔ pole)', lowK: mean - latAmp, highK: mean + latAmp });
    coldTerms.push(latAmp); hotTerms.push(latAmp);
  }

  // --- Seasonal: axial tilt + orbital eccentricity. ---
  const tilt = (i.obliquityDeg ?? 25) * Math.PI / 180;
  const e = i.eccentricity ?? 0;
  const seasAmp = Teq * (0.30 * Math.sin(tilt) + 0.6 * e) * insolationSpread;
  if (seasAmp > 2) {
    components.push({ source: 'seasonal', label: 'Seasonal (tilt + orbit)', lowK: mean - seasAmp, highK: mean + seasAmp });
    coldTerms.push(seasAmp); hotTerms.push(seasAmp);
  }

  // --- Day/night OR permanently-locked faces. ONLY a STAR-locked body has a permanent substellar face,
  //     and only while it is genuinely synchronous: a CAPTURED RESONANCE is not a lock in this sense —
  //     Mercury turns three times for every two orbits, so its sun still rises, just every 176 days.
  //     A moon locked to its PLANET keeps turning relative to the star over its orbit, so its whole
  //     surface still bakes and freezes on a slow day/night cycle — not a frozen far side.
  //     BOTH branches run the same energy balance; they differ only in whether the two sides are
  //     places or times. The old code gave the locked case its own asymmetric constants (0.40 day /
  //     0.60 night) and the cycling case a symmetric one, which is the asymmetry this now derives. ---
  const hotAmp = peakK - mean, coldAmp = mean - nightK;
  if (hotAmp > 2 || coldAmp > 2) {
    if (i.starTidallyLocked && !Number.isFinite(solarDay)) {
      components.push({ source: 'locked-day', label: 'Day side (locked)', lowK: mean, highK: peakK, note: 'Permanent sub-stellar face.' });
      components.push({ source: 'locked-night', label: 'Night side (locked)', lowK: nightK, highK: mean, note: 'Permanent dark face.' });
    } else {
      components.push({ source: 'diurnal', label: 'Day ↔ night', lowK: nightK, highK: peakK });
    }
    coldTerms.push(coldAmp); hotTerms.push(hotAmp);
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

  // Combine the swings in QUADRATURE, not by addition. They are independent variations, and adding
  // them makes "coldest" mean the pole AND midwinter AND midnight at full strength together — which
  // over-counts badly, and is not even self-consistent (at a winter pole there is no day/night cycle
  // to add). It put Mars at -205 °C to +93 °C against a real -143 °C to +35 °C; in quadrature it
  // lands on -143 °C to +32 °C. Root-sum-square is the standard way to combine independent spreads.
  // The TOTAL is deliberately not clamped at the sunlit ceiling above: that ceiling is a bound on the
  // globally-averaged energy balance, and a real surface beats it locally with dark ground and a
  // low-latitude summer noon. Luna measures 120 °C against a 110 °C ceiling, and lands on 121 °C here.
  const rss = (xs: number[]) => Math.sqrt(xs.reduce((s, x) => s + x * x, 0));
  const coldAmpTotal = rss(coldTerms), hotAmpTotal = rss(hotTerms);
  const totalMin = Math.max(FLOOR_K, mean - coldAmpTotal);
  const totalMax = Math.max(mean + hotAmpTotal, tidalPeak);

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
