// Interstellar transit physics — four models of increasing abstraction (Alex's spec, 2026-06-09):
//   1. realistic    — rocket equation; fuel-limited; must escape the star + brake at the far end.
//   2. massless     — same idea, but fuel is free/massless (drive thrust still sets the g-load).
//   3. relativistic — ship ignored; instant accel to a chosen fraction of c; time dilation.
//   4. jump         — abstract jump drive; you just pick how many days it takes.
// Everything reports an outside-observer time AND a ship-frame (proper) time, with a red/yellow/green
// feasibility status for the fuel-limited model. Approximations are deliberate (impulsive burns,
// Newtonian escape) — this is a GM tool, not an ephemeris.
import { C_MS, LY_M, PC_M, AU_KM, JULIAN_YEAR_S, G, EARTH_MASS_KG } from '../constants';

const AU_M = AU_KM * 1000;
const G0 = 9.80665;
const JUPITER_MASS_KG = 1.898e27;
const C2 = C_MS * C_MS;

// Crew-survival banding for a sustained acceleration (Alex's 2G/10G thresholds). Non-blocking —
// it just flags that the journey needs g-tolerance tech, it never forbids the burn.
export type CrewLoad = { g: number; status: TransitStatus; note: string };
export function crewLoad(accel_ms2: number): CrewLoad {
  const g = accel_ms2 / G0;
  if (g <= 2) return { g, status: 'green', note: 'Within sustained human tolerance.' };
  if (g <= 10) return { g, status: 'yellow', note: 'Above ~2 g sustained — crew need g-tolerance tech (couches, fluid breathing).' };
  return { g, status: 'red', note: 'Above ~10 g sustained — survivable only with advanced inertial-compensation tech.' };
}

// Relativistic kinetic energy to bring a mass to a fraction of c: (γ−1)·m·c².
export function kineticEnergyJoules(massKg: number, fractionC: number): number {
  const beta = clamp(fractionC, 0, 0.99999999);
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  return (gamma - 1) * massKg * C2;
}
// Express an energy as the mass that would have to be fully converted (E = mc²) to supply it.
// Ladders through familiar units so the number stays in a readable range and uses thousands
// separators rather than scientific notation (e.g. "42.9 kilotonnes", not "4.29e+4 tonnes").
const MASS_TIERS = [
  { u: 'g', kg: 1e-3 },
  { u: 'kg', kg: 1 },
  { u: 'tonnes', kg: 1e3 },
  { u: 'kilotonnes', kg: 1e6 },
  { u: 'megatonnes', kg: 1e9 },
  { u: 'gigatonnes', kg: 1e12 },
  { u: 'teratonnes', kg: 1e15 },
  { u: "× Earth's mass", kg: EARTH_MASS_KG },
  { u: "× Jupiter's mass", kg: JUPITER_MASS_KG },
];
export function massEnergyEquivalent(joules: number): string {
  if (!Number.isFinite(joules) || joules <= 0) return '—';
  const kg = joules / C2; // mass-energy equivalent
  let tier = MASS_TIERS[0];
  for (const t of MASS_TIERS) if (kg >= t.kg) tier = t;
  const value = kg / tier.kg;
  const decimals = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  const num = value.toLocaleString(undefined, { maximumFractionDigits: decimals });
  return `${num} ${tier.u}`;
}

export type TransitStatus = 'green' | 'yellow' | 'red';
export type TransitMode = 'realistic' | 'massless' | 'relativistic' | 'jump';

export interface TransitResult {
  status: TransitStatus;
  cruise_ms: number;
  fractionC: number;
  observerSeconds: number;
  shipSeconds: number;
  gamma: number;
  headline: string;
  detail: string;
  cannotStop?: boolean;   // reaches the destination but lacks the Δv to brake — arrives as a coasting fly-by
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmtKms = (v: number) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km/s`;
// Format a speed as a percentage of c that NEVER reads "100% c" — near the wall it floors and
// adds just enough decimals to reveal the gap (e.g. 99.997% c), since c is only ever approached.
export function fmtFractionC(fraction: number): string {
  const f = clamp(fraction, 0, 0.999999999);
  const p = f * 100;
  if (p < 0.01) return `${p.toPrecision(2)}% c`;
  if (p < 99.9) return `${p.toFixed(1)}% c`;
  const gap = Math.max(1e-7, 100 - p);                       // percentage points short of c
  const decimals = Math.min(6, Math.max(1, Math.ceil(-Math.log10(gap))));
  const factor = Math.pow(10, decimals);
  const floored = Math.floor(p * factor) / factor;           // floor → can't round up to 100
  return `${floored.toFixed(decimals)}% c`;
}
const pctC = (v: number) => fmtFractionC(v / C_MS);

export function distanceToMeters(value: number, unit: string): number {
  const u = (unit || 'LY').toLowerCase();
  if (u.startsWith('pc') || u.includes('parsec')) return value * PC_M;
  if (u === 'au') return value * AU_M;
  if (u.startsWith('ly') || u.includes('light')) return value * LY_M;
  return value * LY_M;
}

export function formatDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '—';
  const years = seconds / JULIAN_YEAR_S;
  if (years >= 1) {
    if (years >= 1e9) return `${(years / 1e9).toPrecision(3)} Gyr`;
    if (years >= 1e6) return `${(years / 1e6).toPrecision(3)} Myr`;
    if (years >= 1000) return `${Math.round(years).toLocaleString()} yr`;
    return `${years.toFixed(years < 10 ? 2 : 1)} yr`;
  }
  const days = seconds / 86400;
  if (days >= 1) return `${days.toFixed(1)} days`;
  const hours = seconds / 3600;
  if (hours >= 1) return `${hours.toFixed(1)} h`;
  return `${Math.max(0, Math.round(seconds))} s`;
}

function relTimes(v_ms: number, d_m: number) {
  if (v_ms <= 0) return { observer: Infinity, ship: Infinity, gamma: Infinity };
  const beta = clamp(v_ms / C_MS, 0, 0.99999999);
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const observer = d_m / v_ms;
  return { observer, ship: observer / gamma, gamma };
}

// 1 — REALISTIC: rocket equation, fuel-limited. fuelFraction = share of the ship's fuel spent on the
// outbound burn; the remainder is the braking reserve.
export interface RealisticInput {
  avgIsp_s: number;
  dryMassKg: number;
  fuelMassKg: number;
  fuelFraction: number;     // 0..1 committed to the outbound burn
  starMassKg: number;
  orbitRadius_m: number;
  distance_m: number;
  accel_ms2?: number;       // optional sustained burn acceleration → adds finite burn time
}
export function realisticTransit(p: RealisticInput): TransitResult {
  const ve = (p.avgIsp_s || 0) * G0;
  const wet = p.dryMassKg + p.fuelMassKg;
  const burn = p.fuelMassKg * clamp(p.fuelFraction, 0, 1);
  const mAfter = wet - burn;
  const dvOut = ve > 0 && mAfter > 0 && wet > 0 ? ve * Math.log(wet / mAfter) : 0;
  const vCirc = p.starMassKg > 0 && p.orbitRadius_m > 0 ? Math.sqrt(G * p.starMassKg / p.orbitRadius_m) : 0;
  const dvEscape = (Math.SQRT2 - 1) * vCirc; // circular-orbit → escape

  if (dvOut <= dvEscape || dvOut <= 0) {
    return {
      status: 'red', cruise_ms: 0, fractionC: 0, observerSeconds: Infinity, shipSeconds: Infinity, gamma: Infinity,
      headline: 'Cannot break orbit',
      detail: `Needs ${fmtKms(dvEscape)} of Δv just to escape the star; the drive only delivers ${fmtKms(dvOut)} with this fuel. Commit more fuel or lighten the ship.`,
    };
  }
  const cruise = dvOut - dvEscape;
  const dvBrake = ve > 0 && mAfter > 0 ? ve * Math.log(mAfter / p.dryMassKg) : 0;
  const t = relTimes(cruise, p.distance_m);
  // A finite burn acceleration adds accel + brake time on top of the coast (impulsive burns are
  // the default when no accel is given).
  const burnExtra = p.accel_ms2 && p.accel_ms2 > 0 ? (cruise / p.accel_ms2) + (Math.min(dvBrake, cruise) / p.accel_ms2) : 0;
  const observer = t.observer + burnExtra;
  const ship = t.ship + burnExtra;
  const burnNote = burnExtra > 0 ? ` Burns add ${formatDuration(burnExtra)} at ${(p.accel_ms2! / G0).toFixed(1)} g.` : '';
  if (dvBrake >= cruise) {
    return {
      status: 'green', cruise_ms: cruise, fractionC: cruise / C_MS, observerSeconds: observer, shipSeconds: ship, gamma: t.gamma,
      headline: 'Full journey — arrives and stops',
      detail: `Escapes the star, cruises at ${fmtKms(cruise)} (${pctC(cruise)}), and the ${fmtKms(dvBrake)} reserve brakes it to rest at the destination.${burnNote}`,
    };
  }
  return {
    status: 'yellow', cruise_ms: cruise, fractionC: cruise / C_MS, observerSeconds: observer, shipSeconds: ship, gamma: t.gamma,
    headline: 'Reaches interstellar space — but cannot stop',
    detail: `Cruises at ${fmtKms(cruise)} (${pctC(cruise)}) but has only ${fmtKms(dvBrake)} of braking Δv (needs ${fmtKms(cruise)}). It arrives as an unstoppable fly-by, then coasts on adrift — reserve more fuel to brake.${burnNote}`,
    cannotStop: true,
  };
}

// 2 — MASSLESS FUEL: infinite/free fuel, so escape and braking are never in doubt. There is NO
// cruise: the ship burns at a constant g all the way to the midpoint (peak speed there), flips, and
// brakes at the same g to rest. Uses the relativistic constant-proper-acceleration (hyperbolic
// motion) solution, so the peak speed never exceeds c and ship-frame time is properly dilated.
export function masslessTransit(accel_ms2: number, distance_m: number): TransitResult {
  const a = accel_ms2 > 0 ? accel_ms2 : G0;
  const half = Math.max(0, distance_m) / 2;
  // Hyperbolic motion from rest: x = (c²/a)(cosh(aτ/c) − 1). Solve for the proper time τ to cover
  // the half-distance, then the coordinate (observer) time and the midpoint speed.
  const coshArg = 1 + (a * half) / C2;          // = cosh(aτ_half/c)
  const tauHalf = (C_MS / a) * Math.acosh(coshArg);
  const tHalf = (C_MS / a) * Math.sinh((a * tauHalf) / C_MS);
  const vPeak = C_MS * Math.tanh((a * tauHalf) / C_MS);
  const gammaPeak = coshArg;                    // cosh(aτ/c) is exactly γ at the midpoint
  const observer = 2 * tHalf;
  const ship = 2 * tauHalf;
  return {
    status: 'green', cruise_ms: vPeak, fractionC: vPeak / C_MS, observerSeconds: observer, shipSeconds: ship, gamma: gammaPeak,
    headline: 'Free fuel — constant-g flip-and-burn',
    detail: `Accelerates at ${(a / G0).toFixed(1)} g to a midpoint peak of ${pctC(vPeak)}, then flips and brakes at the same g to rest. No cruise phase — it is speeding up or slowing down the whole way.`,
  };
}

// 3 — RELATIVISTIC: ignore the ship entirely; instant accel to a chosen fraction of c.
export function relativisticTransit(cruiseFractionC: number, distance_m: number): TransitResult {
  const v = clamp(cruiseFractionC, 1e-6, 0.999999) * C_MS;
  const t = relTimes(v, distance_m);
  return {
    status: 'green', cruise_ms: v, fractionC: v / C_MS, observerSeconds: t.observer, shipSeconds: t.ship, gamma: t.gamma,
    headline: 'Relativistic cruise',
    detail: `Instant jump to ${pctC(v)}. Time aboard runs ×${t.gamma.toFixed(t.gamma < 10 ? 2 : 0)} slower than the outside universe.`,
  };
}

// 4 — JUMP DRIVE: abstract; the GM just states how long it takes (same in both frames).
export function jumpTransit(days: number, distance_m: number): TransitResult {
  const s = Math.max(0, days) * 86400;
  const v = s > 0 ? distance_m / s : 0;
  return {
    status: 'green', cruise_ms: v, fractionC: v / C_MS, observerSeconds: s, shipSeconds: s, gamma: 1,
    headline: 'Jump drive',
    detail: `Arrives in ${days} day${days === 1 ? '' : 's'} — the same for the crew and everyone else (no relativity).`,
  };
}
