// Interstellar transit physics — four models of increasing abstraction (Alex's spec, 2026-06-09):
//   1. realistic    — rocket equation; fuel-limited; must escape the star + brake at the far end.
//   2. massless     — same idea, but fuel is free/massless (drive thrust still sets the g-load).
//   3. relativistic — ship ignored; instant accel to a chosen fraction of c; time dilation.
//   4. jump         — abstract jump drive; you just pick how many days it takes.
// Everything reports an outside-observer time AND a ship-frame (proper) time, with a red/yellow/green
// feasibility status for the fuel-limited model. Approximations are deliberate (impulsive burns,
// Newtonian escape) — this is a GM tool, not an ephemeris.
import { C_MS, LY_M, PC_M, AU_KM, JULIAN_YEAR_S, G } from '../constants';

const AU_M = AU_KM * 1000;
const G0 = 9.80665;

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
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const fmtKms = (v: number) => `${(v / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 })} km/s`;
const pctC = (v: number) => {
  const f = v / C_MS;
  return f >= 0.01 ? `${(f * 100).toFixed(1)}% c` : `${(f * 100).toPrecision(2)}% c`;
};

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
  if (dvBrake >= cruise) {
    return {
      status: 'green', cruise_ms: cruise, fractionC: cruise / C_MS, observerSeconds: t.observer, shipSeconds: t.ship, gamma: t.gamma,
      headline: 'Full journey — arrives and stops',
      detail: `Escapes the star, cruises at ${fmtKms(cruise)} (${pctC(cruise)}), and the ${fmtKms(dvBrake)} reserve brakes it to rest at the destination.`,
    };
  }
  return {
    status: 'yellow', cruise_ms: cruise, fractionC: cruise / C_MS, observerSeconds: t.observer, shipSeconds: t.ship, gamma: t.gamma,
    headline: 'Reaches interstellar space — but cannot stop',
    detail: `Cruises at ${fmtKms(cruise)} (${pctC(cruise)}) but has only ${fmtKms(dvBrake)} of braking Δv (needs ${fmtKms(cruise)}). It arrives as an unstoppable fly-by — reserve more fuel for the burn.`,
  };
}

// 2 — MASSLESS FUEL: infinite/free fuel, so it always escapes and can always brake. The drive's
// thrust still caps the comfortable acceleration; the GM picks the cruise speed.
export function masslessTransit(maxAccel_ms2: number, cruiseFractionC: number, distance_m: number): TransitResult {
  const v = clamp(cruiseFractionC, 0, 0.999) * C_MS;
  const a = maxAccel_ms2 > 0 ? maxAccel_ms2 : G0;
  const tAccel = v / a;                 // accel (and equally decel) duration
  const dAccel = 0.5 * a * tAccel * tAccel;
  const dCruise = Math.max(0, distance_m - 2 * dAccel);
  const tCruise = v > 0 ? dCruise / v : Infinity;
  const beta = clamp(v / C_MS, 0, 0.99999999);
  const gamma = 1 / Math.sqrt(1 - beta * beta);
  const observer = 2 * tAccel + tCruise;
  const ship = 2 * tAccel + tCruise / gamma; // dilate the coast; accel phases ~undilated (approx)
  return {
    status: 'green', cruise_ms: v, fractionC: v / C_MS, observerSeconds: observer, shipSeconds: ship, gamma,
    headline: 'Free fuel — full journey',
    detail: `Burns at ${(a / G0).toFixed(1)} g to ${pctC(v)} and back to rest. Infinite propellant, so escape and braking are never in doubt.`,
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
