// Deterministic coast physics — the trajectory an abandoned/adrift ship follows. Two layers:
//
//  1. keplerUniversal — exact two-body propagation (universal-variable / Stumpff formulation), replacing the
//     old step-integrator that was sampling-dependent (scrubbing changed the step count → different results)
//     and injected energy through perihelion (the unphysical "slingshot at 1500 km/s").
//  2. coastConicAt — PATCHED CONICS on top: coast on the root star's exact conic, and when the ship crosses a
//     planet's Hill sphere hand the state over to an exact conic around THAT planet (the flyby hyperbola is
//     closed-form too), handing the bent state back to the star frame on exit. This restores the real
//     "flung out by Jupiter" behaviour the pure star conic threw away — WITHOUT giving up determinism: every
//     sample is an analytic Kepler solve from a fixed anchor, and the encounter march is a pure function of
//     that anchor (steps never depend on the query pattern), so the same query time always yields the same
//     state regardless of how you scrub to it. One patch level only (star ↔ planet): moons inside a planet's
//     sphere are not patched again, mirroring the old n-body field which also excluded moons. Distant
//     perturbation (a planet tugging from AU away) is still not modelled — patched conics bend encounters,
//     they don't accumulate secular drift.
//
// References: Curtis, "Orbital Mechanics for Engineering Students", Algorithm 3.4 (universal Kepler) + 3.3
// (Lagrange f/g); Hill sphere r_H = a·∛(m/3M); patched conics per standard mission-design practice.
// Internals are SI (metres, m/s, mu in m^3/s^2).

import { AU_KM, G } from '../constants';
import type { System, Vector2 } from '../types';
import { getGlobalState } from '../transit/physics';

const AU_M = AU_KM * 1000;

// Stumpff functions C(z), S(z) — the series that unify the conic cases (z>0 elliptic, z<0 hyperbolic, z≈0 parabolic).
function stumpffC(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (1 - Math.cos(s)) / z; }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.cosh(s) - 1) / -z; }
  return 0.5; // series limit at z→0
}
function stumpffS(z: number): number {
  if (z > 1e-6) { const s = Math.sqrt(z); return (s - Math.sin(s)) / (s * s * s); }
  if (z < -1e-6) { const s = Math.sqrt(-z); return (Math.sinh(s) - s) / (s * s * s); }
  return 1 / 6; // series limit at z→0
}

// Propagate a state vector (position r0 [m], velocity v0 [m/s]) by dt seconds under point mass `mu` [m^3/s^2].
// Returns the new position + velocity. Works for any conic; dt may be negative (propagate backwards).
export function keplerUniversal(
  r0: Vector2, v0: Vector2, mu: number, dt: number
): { r: Vector2; v: Vector2 } {
  if (dt === 0 || !(mu > 0)) return { r: { ...r0 }, v: { ...v0 } };
  const r0mag = Math.hypot(r0.x, r0.y);
  const v0mag = Math.hypot(v0.x, v0.y);
  if (r0mag === 0) return { r: { ...r0 }, v: { ...v0 } };
  const vr0 = (r0.x * v0.x + r0.y * v0.y) / r0mag;   // radial speed
  const alpha = 2 / r0mag - (v0mag * v0mag) / mu;    // = 1/a  (>0 ellipse, <0 hyperbola, ~0 parabola)
  const sqrtMu = Math.sqrt(mu);

  // Closed orbits repeat: reduce century-scale dt modulo the period so the Newton solve below starts near the
  // answer instead of grinding through thousands of revolutions of universal anomaly. State is identical.
  let dtEff = dt;
  if (alpha > 0) {
    const T = (2 * Math.PI) / (sqrtMu * Math.pow(alpha, 1.5));
    if (Number.isFinite(T) && T > 0 && Math.abs(dtEff) > T) dtEff = dtEff % T;
  }

  // Universal-anomaly cap (hyperbolic only): sinh/cosh(√-z) overflows double precision past √-z ≈ 700 —
  // but the SOLUTION always sits far below (at the root, √-z = the hyperbolic anomaly ≈ ln(2·M_h), and
  // e^650 seconds outlives the universe). Capping χ keeps every Stumpff evaluation finite without ever
  // clipping a reachable answer. This was the "abandoned mid-torch, sampled years later" NaN: the
  // elliptic-style χ guess grows ∝ dt and blew straight through the overflow line.
  const chiCap = alpha < 0 ? 650 / Math.sqrt(-alpha) : Infinity;

  // Initial guess for the universal anomaly χ — elliptic per Curtis 3.4; hyperbolic per the standard
  // log-form starter (Vallado Alg. 8), which lands near the root instead of ∝ dt past it.
  let chi: number;
  if (alpha < -1e-12) {
    const num = -2 * mu * alpha * dtEff;
    const den = r0mag * vr0 + Math.sign(dtEff) * Math.sqrt(-mu / alpha) * (1 - r0mag * alpha);
    const arg = den !== 0 ? num / den : 0;
    chi = arg > 0 ? Math.sign(dtEff) * Math.sqrt(-1 / alpha) * Math.log(arg) : (sqrtMu * dtEff) / r0mag;
  } else if (alpha > 1e-12) {
    chi = sqrtMu * alpha * dtEff;
  } else {
    chi = (sqrtMu * dtEff) / r0mag;
  }
  if (Number.isFinite(chiCap)) chi = Math.max(-chiCap, Math.min(chiCap, chi));

  for (let i = 0; i < 200; i++) {
    const z = alpha * chi * chi;
    const C = stumpffC(z), S = stumpffS(z);
    const chi2 = chi * chi, chi3 = chi2 * chi;
    const F = (r0mag * vr0 / sqrtMu) * chi2 * C + (1 - alpha * r0mag) * chi3 * S + r0mag * chi - sqrtMu * dtEff;
    const dF = (r0mag * vr0 / sqrtMu) * chi * (1 - alpha * chi2 * S) + (1 - alpha * r0mag) * chi2 * C + r0mag;
    if (!Number.isFinite(F) || !Number.isFinite(dF) || Math.abs(dF) < 1e-30) { chi *= 0.5; continue; } // recover, never NaN-poison
    const ratio = F / dF;
    chi -= ratio;
    if (Number.isFinite(chiCap)) chi = Math.max(-chiCap, Math.min(chiCap, chi));
    if (Math.abs(ratio) < 1e-9) break;
  }

  // Lagrange f, g (position) and ḟ, ġ (velocity).
  const z = alpha * chi * chi;
  const C = stumpffC(z), S = stumpffS(z);
  const f = 1 - (chi * chi / r0mag) * C;
  const g = dtEff - (1 / sqrtMu) * chi * chi * chi * S;
  const r = { x: f * r0.x + g * v0.x, y: f * r0.y + g * v0.y };
  const rmag = Math.hypot(r.x, r.y) || 1;
  const fdot = (sqrtMu / (rmag * r0mag)) * (alpha * chi * chi * chi * S - chi);
  const gdot = 1 - (chi * chi / rmag) * C;
  const v = { x: fdot * r0.x + gdot * v0.x, y: fdot * r0.y + gdot * v0.y };
  // Belt-and-braces: a non-finite state must never reach the renderer (one NaN kills the whole canvas
  // frame). Degrade to the ballistic asymptote — where a fast unbound ship is headed anyway.
  if (!Number.isFinite(r.x) || !Number.isFinite(r.y) || !Number.isFinite(v.x) || !Number.isFinite(v.y)) {
    return { r: { x: r0.x + v0.x * dtEff, y: r0.y + v0.y * dtEff }, v: { ...v0 } };
  }
  return { r, v };
}

// ————— Patched-conic SOI layer ——————————————————————————————————————————————————————————————————————————

const MIN_SOI_MASS_KG = 3e23;          // same "massive enough to matter" bar as the assist solver
const MAX_PATCH_HORIZON_SEC = 3.15e9;  // ~100 y of encounter-checking; beyond, the last conic just continues
const MAX_MARCH_ITERS = 500_000;       // runaway backstop (anchor-determined, so still deterministic if hit)
const BISECT_ITERS = 60;               // fixed-count bisection → deterministic crossing times
const ENTRY_HYSTERESIS = 0.999;        // enter at 99.9% of r_H, exit at 100% — kills boundary flapping

interface CoastSegment {
  t0Sec: number;          // unix seconds this segment starts
  frameId: string | null; // null = root frame; else the planet whose conic we ride
  r0: Vector2;            // frame-relative position, metres
  v0: Vector2;            // frame-relative velocity, m/s
  mu: number;             // m^3/s^2 of the frame body
  rHm?: number;           // Hill radius (m) frozen at entry — the exit test for planet frames
}

interface CoastTrack {
  segments: CoastSegment[];
  frontierSec: number; // encounter-checked up to here; sampling beyond it needs extendTrack first
  done: boolean;       // no further encounters possible (captured, pruned empty, or horizon reached)
}

// Track cache — pure acceleration. A track is fully determined by its anchor (the march below never depends
// on the query pattern), so evicting and rebuilding yields bit-identical results.
const trackCache = new Map<string, CoastTrack>();

interface SoiCandidate { id: string; node: any; mu: number; rHm: number }

// Bodies whose Hill sphere is worth patching for. Hill radius comes from the candidate's OWN orbit (a around
// its actual host, mass ratio to that host) — exact for single-star systems and right for S-type planets in
// barycentric systems, where distance-to-root would be wildly off. Moons/belts/rings excluded (see header).
function soiCandidates(system: System, rootId: string): SoiCandidate[] {
  const out: SoiCandidate[] = [];
  for (const n of system.nodes as any[]) {
    if (n.kind !== 'body' || n.id === rootId) continue;
    if (n.roleHint === 'belt' || n.roleHint === 'ring' || n.roleHint === 'moon') continue;
    const m = n.massKg || 0;
    if (!(m > MIN_SOI_MASS_KG)) continue;
    const a_AU = n.orbit?.elements?.a_AU;
    const hostMu = n.orbit?.hostMu;
    if (!(a_AU > 0) || !(hostMu > 0)) continue;
    const mu = G * m;
    const rHm = a_AU * AU_M * Math.cbrt(mu / (3 * hostMu));
    if (rHm > 0) out.push({ id: n.id, node: n, mu, rHm });
  }
  return out;
}

// Hill spheres for DISPLAY — the same candidates and radii the patched-conic coast hands off at, exported so
// the orrery overlay can never disagree with the physics boundary it's drawing. Radii in AU.
export function hillSpheresAu(system: System): { id: string; rAu: number }[] {
  const root: any = system.nodes.find((n: any) => n.parentId === null || n.parentId == null);
  if (!root) return [];
  return soiCandidates(system, root.id).map((c) => ({ id: c.id, rAu: c.rHm / AU_M }));
}

// A candidate's global state in SI (getGlobalState returns AU + AU/s).
function bodyStateM(system: System, node: any, tSec: number): { r: Vector2; v: Vector2 } {
  if (!node) return { r: { x: 0, y: 0 }, v: { x: 0, y: 0 } }; // node deleted mid-drift — degrade, don't throw
  const s = getGlobalState(system, node, tSec * 1000);
  return { r: { x: s.r.x * AU_M, y: s.r.y * AU_M }, v: { x: s.v.x * AU_M, y: s.v.y * AU_M } };
}

// Radial reach [periapsis, apoapsis] of a conic — used to prune candidates a coast can never meet.
function radialRange(r0: Vector2, v0: Vector2, mu: number): { rp: number; ra: number } {
  const r = Math.hypot(r0.x, r0.y);
  const v2 = v0.x * v0.x + v0.y * v0.y;
  const E = v2 / 2 - mu / r;
  const h = r0.x * v0.y - r0.y * v0.x;
  if (h * h < 1e-6 * mu * r) {
    // Near-radial: falls through the centre and (if bound) back out to 2a = −mu/E.
    return { rp: 0, ra: E < 0 ? -mu / E : Infinity };
  }
  const p = (h * h) / mu;
  const e = Math.sqrt(Math.max(0, 1 + (2 * E * h * h) / (mu * mu)));
  const rp = p / (1 + e);
  const ra = E < 0 ? p / Math.max(1e-9, 1 - e) : Infinity;
  return { rp, ra };
}

// Keep only candidates whose orbit band the segment's conic can radially reach. Only prunes candidates that
// orbit the root DIRECTLY (their root-distance band is just a(1±e)); S-type/other hierarchies are kept and
// left to the march. Valid for the whole segment — the conic doesn't change until the next handoff.
function pruneCandidates(seg: CoastSegment, rootId: string, cands: SoiCandidate[]): SoiCandidate[] {
  const { rp, ra } = radialRange(seg.r0, seg.v0, seg.mu);
  return cands.filter((c) => {
    const hostId = c.node.orbit?.hostId ?? c.node.parentId;
    if (hostId !== rootId) return true; // not a direct root orbiter — can't cheaply band it, keep it
    const a = (c.node.orbit?.elements?.a_AU ?? 0) * AU_M;
    const e = c.node.orbit?.elements?.e ?? 0;
    if (!(a > 0)) return true;
    const lo = a * (1 - e) - 2 * c.rHm;
    const hi = a * (1 + e) + 2 * c.rHm;
    return !(ra < lo || rp > hi);
  });
}

// Refine an SOI boundary crossing bracketed by [tLo, tHi] (ship strictly on the old side at tLo, strictly on
// the new side at tHi). Returns the tHi-side bound after BISECT_ITERS halvings — i.e. a time guaranteed on
// the NEW side of the boundary, so the next segment can't instantly flap back.
function bisectCrossing(
  system: System, seg: CoastSegment, cand: SoiCandidate, thresholdM: number,
  tLo: number, tHi: number, insideAtHi: boolean
): number {
  for (let i = 0; i < BISECT_ITERS; i++) {
    const tm = 0.5 * (tLo + tHi);
    const s = keplerUniversal(seg.r0, seg.v0, seg.mu, tm - seg.t0Sec);
    let d: number;
    if (seg.frameId === cand.id) {
      d = Math.hypot(s.r.x, s.r.y); // planet frame: distance IS |r_rel|
    } else {
      const p = bodyStateM(system, cand.node, tm);
      d = Math.hypot(s.r.x - p.r.x, s.r.y - p.r.y);
    }
    const inside = d < thresholdM;
    if (inside === insideAtHi) tHi = tm; else tLo = tm;
  }
  return tHi;
}

const clampNum = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

// Extend a track's encounter-checked frontier to at least `targetSec`. The march is a pure function of the
// anchor: step sizes derive only from exact conic states at exact sample times (never clamped to targetSec),
// so any query pattern — one-shot, incremental scrub, cache rebuilt — produces the identical segment list.
function extendTrack(system: System, track: CoastTrack, rootId: string, muRoot: number, cands: SoiCandidate[], targetSec: number): void {
  const anchor0 = track.segments[0].t0Sec;
  let guard = 0;
  while (!track.done && track.frontierSec < targetSec) {
    const seg = track.segments[track.segments.length - 1];

    if (seg.frameId === null) {
      // —— Root-frame segment: coast the star conic, watch for Hill-sphere entries. ——
      const relevant = pruneCandidates(seg, rootId, cands);
      if (!relevant.length) { track.frontierSec = Infinity; track.done = true; return; }

      // Fresh segment: if the anchor state is ALREADY inside a candidate's sphere (ship abandoned next to a
      // planet), convert immediately rather than waiting for a "crossing" that never happens.
      if (track.frontierSec === seg.t0Sec) {
        let startedInside = false;
        for (const c of relevant) {
          const p = bodyStateM(system, c.node, seg.t0Sec);
          if (Math.hypot(seg.r0.x - p.r.x, seg.r0.y - p.r.y) < c.rHm * ENTRY_HYSTERESIS) {
            track.segments.push({
              t0Sec: seg.t0Sec, frameId: c.id, mu: c.mu, rHm: c.rHm,
              r0: { x: seg.r0.x - p.r.x, y: seg.r0.y - p.r.y },
              v0: { x: seg.v0.x - p.v.x, y: seg.v0.y - p.v.y }
            });
            startedInside = true;
            break;
          }
        }
        if (startedInside) continue;
      }

      let t = Math.max(track.frontierSec, seg.t0Sec);
      let handedOff = false;
      while (t < targetSec) {
        if (t - anchor0 > MAX_PATCH_HORIZON_SEC || guard++ > MAX_MARCH_ITERS) { track.frontierSec = Infinity; track.done = true; return; }
        const s = keplerUniversal(seg.r0, seg.v0, muRoot, t - seg.t0Sec);
        const rMag = Math.hypot(s.r.x, s.r.y);
        // Base step ~1/16 of the local characteristic time; shrunk near any candidate so a sphere can't be
        // stepped clean over (approach-limited), floored so a grazing pass can't stall the march.
        let step = clampNum(Math.sqrt((rMag * rMag * rMag) / muRoot) / 16, 3600, 60 * 86400);
        for (const c of relevant) {
          const p = bodyStateM(system, c.node, t);
          const d = Math.hypot(s.r.x - p.r.x, s.r.y - p.r.y);
          const rel = Math.max(1, Math.hypot(s.v.x - p.v.x, s.v.y - p.v.y));
          const allowed = Math.max((d - c.rHm) / (2 * rel), c.rHm / (4 * rel));
          if (allowed < step) step = allowed;
        }
        step = Math.max(step, 60);
        const tNext = t + step; // NEVER clamped to targetSec — keeps the sample sequence anchor-determined
        const sN = keplerUniversal(seg.r0, seg.v0, muRoot, tNext - seg.t0Sec);
        let hit: SoiCandidate | null = null;
        for (const c of relevant) {
          const p = bodyStateM(system, c.node, tNext);
          if (Math.hypot(sN.r.x - p.r.x, sN.r.y - p.r.y) < c.rHm * ENTRY_HYSTERESIS) { hit = c; break; }
        }
        if (hit) {
          const tE = bisectCrossing(system, seg, hit, hit.rHm * ENTRY_HYSTERESIS, t, tNext, true);
          const sE = keplerUniversal(seg.r0, seg.v0, muRoot, tE - seg.t0Sec);
          const pE = bodyStateM(system, hit.node, tE);
          track.segments.push({
            t0Sec: tE, frameId: hit.id, mu: hit.mu, rHm: hit.rHm,
            r0: { x: sE.r.x - pE.r.x, y: sE.r.y - pE.r.y },
            v0: { x: sE.v.x - pE.v.x, y: sE.v.y - pE.v.y }
          });
          track.frontierSec = tE;
          handedOff = true;
          break;
        }
        t = tNext;
        track.frontierSec = t;
      }
      if (!handedOff && track.frontierSec >= targetSec) return;
    } else {
      // —— Planet-frame segment: captured forever, or ride the flyby conic out of the sphere. ——
      const rHm = seg.rHm!;
      const rRel0 = Math.hypot(seg.r0.x, seg.r0.y);
      const E = (seg.v0.x * seg.v0.x + seg.v0.y * seg.v0.y) / 2 - seg.mu / rRel0;
      if (E < 0) {
        const { ra } = radialRange(seg.r0, seg.v0, seg.mu);
        if (ra < rHm * 0.95) { track.frontierSec = Infinity; track.done = true; return; } // CAPTURED — orbits the planet for good
      }
      let t = Math.max(track.frontierSec, seg.t0Sec);
      let exited = false;
      while (t < targetSec && !exited) {
        if (t - anchor0 > MAX_PATCH_HORIZON_SEC || guard++ > MAX_MARCH_ITERS) { track.frontierSec = Infinity; track.done = true; return; }
        const s = keplerUniversal(seg.r0, seg.v0, seg.mu, t - seg.t0Sec);
        const rRel = Math.max(1, Math.hypot(s.r.x, s.r.y));
        const vRel = Math.max(1, Math.hypot(s.v.x, s.v.y));
        const step = clampNum(Math.min(Math.sqrt((rRel * rRel * rRel) / seg.mu) / 16, rHm / (8 * vRel)), 600, 10 * 86400);
        const tNext = t + step;
        const sN = keplerUniversal(seg.r0, seg.v0, seg.mu, tNext - seg.t0Sec);
        if (Math.hypot(sN.r.x, sN.r.y) > rHm) {
          const dummyCand: SoiCandidate = { id: seg.frameId!, node: null, mu: seg.mu, rHm };
          const tX = bisectCrossing(system, seg, dummyCand, rHm, t, tNext, false);
          const sX = keplerUniversal(seg.r0, seg.v0, seg.mu, tX - seg.t0Sec);
          const planet = system.nodes.find((n) => n.id === seg.frameId);
          const pX = bodyStateM(system, planet, tX);
          track.segments.push({
            t0Sec: tX, frameId: null, mu: muRoot,
            r0: { x: sX.r.x + pX.r.x, y: sX.r.y + pX.r.y },
            v0: { x: sX.v.x + pX.v.x, y: sX.v.y + pX.v.y }
          });
          track.frontierSec = tX;
          exited = true;
        } else {
          t = tNext;
          track.frontierSec = t;
        }
      }
      if (!exited && track.frontierSec >= targetSec) return;
    }
  }
}

// State at atSec from a track: exact conic solve within the governing segment (+ the planet's own global
// state when riding a planet frame). SI in, SI out.
function sampleTrack(system: System, track: CoastTrack, atSec: number): { r: Vector2; v: Vector2 } {
  let seg = track.segments[0];
  for (const s of track.segments) { if (s.t0Sec <= atSec) seg = s; else break; }
  const st = keplerUniversal(seg.r0, seg.v0, seg.mu, atSec - seg.t0Sec);
  if (seg.frameId) {
    const planet = system.nodes.find((n) => n.id === seg.frameId);
    const p = bodyStateM(system, planet, atSec);
    return { r: { x: st.r.x + p.r.x, y: st.r.y + p.r.y }, v: { x: st.v.x + p.v.x, y: st.v.y + p.v.y } };
  }
  return st;
}

// Heliocentric coast: where an adrift ship is at `atMs`, given the heliocentric state (AU + m/s) it was cut
// loose at `cancelMs`. The root sits at the system origin, so the heliocentric vector IS the absolute one.
// Patched-conic under the hood (see header): star conic between encounters, exact planet conic through each
// Hill sphere — so a drift past Jupiter bends/flings, and a ship abandoned inside a planet's sphere can be
// captured by it. Deterministic + exact through perihelion. Returns null if there's no star to fall to.
export function coastConicAt(
  system: System, position_au: Vector2, velocity_ms: Vector2, cancelMs: number, atMs: number
): { position_au: Vector2; velocity_ms: Vector2 } | null {
  const root: any = system.nodes.find((n: any) => n.parentId === null || n.parentId == null);
  const mass = root?.massKg ?? root?.effectiveMassKg ?? 0;
  if (!(mass > 0)) return null;
  const mu = G * mass; // m^3/s^2
  const r0 = { x: position_au.x * AU_M, y: position_au.y * AU_M };
  const v0 = { x: velocity_ms.x, y: velocity_ms.y };
  const t0Sec = cancelMs / 1000;
  const atSec = atMs / 1000;

  const cands = soiCandidates(system, root.id);
  if (!cands.length || atSec <= t0Sec) {
    // No planets to patch, or a backwards/zero-span query (pre-anchor motion is the journey's business,
    // not the coast's) — the plain star conic is exact.
    const out = keplerUniversal(r0, v0, mu, atSec - t0Sec);
    return { position_au: { x: out.r.x / AU_M, y: out.r.y / AU_M }, velocity_ms: { x: out.v.x, y: out.v.y } };
  }

  const key = `${(system as any).id ?? ''}|${root.id}|${cancelMs}|${r0.x},${r0.y}|${v0.x},${v0.y}`;
  let track = trackCache.get(key);
  if (!track) {
    if (trackCache.size > 128) trackCache.clear(); // cheap bound; tracks rebuild bit-identically
    track = { segments: [{ t0Sec, frameId: null, r0, v0, mu }], frontierSec: t0Sec, done: false };
    trackCache.set(key, track);
  }
  extendTrack(system, track, root.id, mu, cands, atSec);
  const out = sampleTrack(system, track, atSec);
  return { position_au: { x: out.r.x / AU_M, y: out.r.y / AU_M }, velocity_ms: { x: out.v.x, y: out.v.y } };
}
