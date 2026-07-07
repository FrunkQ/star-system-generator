// Universe Sandbox (.ubox) import — state vectors → Keplerian elements (browser-safe).
// See docs/dev/ubox-import-design.md §5. All inputs SI; a_AU emitted in AU, angles in degrees.
import { AU_KM } from '$lib/constants';
import type { Kepler } from '$lib/types';

const AU_M = AU_KM * 1000;
const RAD = 180 / Math.PI;

export type V3 = [number, number, number];

// --- vector helpers ---
const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const scale = (a: V3, s: number): V3 => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0]
];
const norm = (a: V3): number => Math.sqrt(dot(a, a));
const normalize = (a: V3): V3 => { const n = norm(a); return n > 0 ? scale(a, 1 / n) : [0, 0, 0]; };

/** US uses the XZ plane for orbits with Y "up"; textbook Keplerian maths wants Z up. Swap Y↔Z once
 *  on input so the standard formulas apply unchanged (design §5 step 1). */
const toWork = (v: V3): V3 => [v[0], v[2], v[1]];

export interface StateVectorResult { elements: Kepler | null; unbound: boolean; }

/** Convert relative state vectors (SI, US frame) to SSG Keplerian elements. Returns
 *  { elements: null, unbound: true } for a hyperbolic/parabolic/degenerate state (never clamped). */
export function stateVectorsToElements(rRelUs: V3, vRelUs: V3, mu: number): StateVectorResult {
  const r = toWork(rRelUs);
  const v = toWork(vRelUs);
  const rMag = norm(r);
  const vMag = norm(v);
  if (!(rMag > 0) || !(vMag >= 0) || !(mu > 0)) return { elements: null, unbound: true };

  const h = cross(r, v);
  const hMag = norm(h);
  // node vector n = ẑ × h = (-h_y, h_x, 0)
  const n: V3 = [-h[1], h[0], 0];
  const nMag = norm(n);

  const rv = dot(r, v);
  const eVec = scale(
    sub(scale(r, vMag * vMag - mu / rMag), scale(v, rv)),
    1 / mu
  );
  const e = norm(eVec);

  const energy = (vMag * vMag) / 2 - mu / rMag;
  if (energy >= 0 || e >= 0.999 || !(hMag > 0)) return { elements: null, unbound: true };

  const a = -mu / (2 * energy);

  const i = Math.acos(Math.max(-1, Math.min(1, h[2] / hMag)));
  const equatorial = nMag < 1e-9;
  const circular = e < 1e-6;

  // RAAN (Ω)
  let Omega = 0;
  if (!equatorial) {
    Omega = Math.acos(Math.max(-1, Math.min(1, n[0] / nMag)));
    if (n[1] < 0) Omega = 2 * Math.PI - Omega;
  }

  // Argument of periapsis (ω)
  let omega = 0;
  if (!circular) {
    if (equatorial) {
      // measure ω from the x-axis
      omega = Math.atan2(eVec[1], eVec[0]);
      if (h[2] < 0) omega = 2 * Math.PI - omega; // retrograde equatorial
    } else {
      omega = Math.acos(Math.max(-1, Math.min(1, dot(n, eVec) / (nMag * e))));
      if (eVec[2] < 0) omega = 2 * Math.PI - omega;
    }
  }

  // True anomaly (ν)
  let nu: number;
  if (!circular) {
    nu = Math.acos(Math.max(-1, Math.min(1, dot(eVec, r) / (e * rMag))));
    if (rv < 0) nu = 2 * Math.PI - nu;
  } else if (!equatorial) {
    // argument of latitude, measured from the node
    nu = Math.acos(Math.max(-1, Math.min(1, dot(n, r) / (nMag * rMag))));
    if (r[2] < 0) nu = 2 * Math.PI - nu;
  } else {
    // true longitude, from the x-axis
    nu = Math.atan2(r[1], r[0]);
    if (nu < 0) nu += 2 * Math.PI;
  }

  // ν → E → M0
  const E = 2 * Math.atan2(Math.sqrt(1 - e) * Math.sin(nu / 2), Math.sqrt(1 + e) * Math.cos(nu / 2));
  let M0 = E - e * Math.sin(E);
  M0 = ((M0 % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);

  return {
    elements: {
      a_AU: a / AU_M,
      e,
      i_deg: i * RAD,
      Omega_deg: (Omega * RAD) % 360,
      omega_deg: (omega * RAD) % 360,
      M0_rad: M0
    },
    unbound: false
  };
}

/** Reconstruct the WORK-frame position (metres) implied by elements at M0 — used by the round-trip
 *  test to prove the conversion is lossless (design §5 round-trip guard). */
export function elementsToWorkPosition(el: Kepler, mu: number): V3 {
  const a = el.a_AU * AU_M;
  const e = el.e;
  // Solve Kepler's equation M = E - e sinE (Newton).
  let E = el.M0_rad;
  for (let k = 0; k < 60; k++) {
    const f = E - e * Math.sin(E) - el.M0_rad;
    const fp = 1 - e * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < 1e-12) break;
  }
  const nu = 2 * Math.atan2(Math.sqrt(1 + e) * Math.sin(E / 2), Math.sqrt(1 - e) * Math.cos(E / 2));
  const rMag = a * (1 - e * Math.cos(E));
  // perifocal position
  const pf: V3 = [rMag * Math.cos(nu), rMag * Math.sin(nu), 0];
  // rotate perifocal → work frame by (ω, i, Ω) 3-1-3
  const O = (el.Omega_deg * Math.PI) / 180;
  const inc = (el.i_deg * Math.PI) / 180;
  const w = (el.omega_deg * Math.PI) / 180;
  const cosO = Math.cos(O), sinO = Math.sin(O);
  const cosi = Math.cos(inc), sini = Math.sin(inc);
  const cosw = Math.cos(w), sinw = Math.sin(w);
  const R: [V3, V3, V3] = [
    [cosO * cosw - sinO * sinw * cosi, -cosO * sinw - sinO * cosw * cosi, sinO * sini],
    [sinO * cosw + cosO * sinw * cosi, -sinO * sinw + cosO * cosw * cosi, -cosO * sini],
    [sinw * sini, cosw * sini, cosi]
  ];
  return [
    R[0][0] * pf[0] + R[0][1] * pf[1] + R[0][2] * pf[2],
    R[1][0] * pf[0] + R[1][1] * pf[1] + R[1][2] * pf[2],
    R[2][0] * pf[0] + R[2][1] * pf[1] + R[2][2] * pf[2]
  ];
}

/** Fractional position error of a round-trip (elements → position) vs the original relative state. */
export function roundTripError(rRelUs: V3, vRelUs: V3, mu: number): number | null {
  const { elements, unbound } = stateVectorsToElements(rRelUs, vRelUs, mu);
  if (unbound || !elements) return null;
  const reconstructed = elementsToWorkPosition(elements, mu);
  const original = toWork(rRelUs);
  return norm(sub(reconstructed, original)) / norm(original);
}

// --- Rotation / obliquity (design §5.1; verified Earth 23.4°, Uranus 97.8°, Jupiter 2.2°) ---

/** Rotate v by quaternion q = [x,y,z,w]: v + 2s(u×v) + 2u×(u×v). */
export function quatRotate(q: [number, number, number, number], v: V3): V3 {
  const u: V3 = [q[0], q[1], q[2]];
  const s = q[3];
  const uv = cross(u, v);
  const uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * s), scale(uuv, 2)));
}

/** Axial tilt (degrees) between the body's world spin axis and its orbit normal. */
export function obliquityDeg(
  orientation: [number, number, number, number],
  rotationAxisLocal: V3,
  rRelUs: V3,
  vRelUs: V3
): number {
  const axisWorld = quatRotate(orientation, rotationAxisLocal);
  const orbitNormal = normalize(cross(rRelUs, vRelUs));
  const an = norm(axisWorld);
  if (an === 0 || norm(orbitNormal) === 0) return 0;
  const cosTilt = Math.max(-1, Math.min(1, dot(axisWorld, orbitNormal) / an));
  return Math.acos(cosTilt) * RAD;
}

/** Sidereal rotation period (hours) from |AngularVelocity| (rad/s); null when non-rotating. */
export function rotationHoursFromAngularVelocity(angularVelocity: V3): number | null {
  const w = norm(angularVelocity);
  if (!(w > 0)) return null;
  return (2 * Math.PI) / w / 3600;
}
