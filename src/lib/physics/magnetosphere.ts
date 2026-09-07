// MAGNETOSPHERES — the shape a magnetic field cuts out of the wind that blows on it ([[G82]]).
//
// Everything here is DESCRIPTIVE, in the same sense `magnetism.ts` is: it reads the field the
// dynamo pass has already committed and publishes where that field's boundary stands. It writes
// nothing back to `magneticField`, refuses no placement and corrects no map — a GM's pinned 70 T
// field simply gets an enormous bubble and a note saying so (STEER, DO NOT STOP).
//
// THE ONE LAW. A magnetosphere ends where the magnetic pressure inside it balances the mechanical
// pressure outside it (Chapman-Ferraro). A dipole's field falls as r^-3, so
//
//     B(r) = B_eq (R/r)^3,   (f B(r))^2 / (2 mu0) = P_out
//     =>  R_mp / R = ( f^2 B_eq^2 / (2 mu0 P_out) )^(1/6)
//
// `f` is the compression factor: the boundary current sheet roughly DOUBLES the field just inside
// the magnetopause, so the balance is struck against 2B rather than B. It is rule-pack DATA
// (`magnetopause_compression_factor`), because it is the one number in the law a reader might
// reasonably want to argue with, and dropping it shrinks every bubble by 21%.
//
// WHAT PUSHES BACK is not the same thing everywhere, and this is the part that has to be right for
// a moon:
//   - out in the open, the STELLAR WIND's ram pressure — a pack reference at 1 AU, scaled by the
//     star's activity and by 1/d^2, summed over every star in the system;
//   - inside a host's own magnetosphere, the HOST'S MAGNETIC PRESSURE at the moon's orbit. A moon
//     there never meets the stellar wind at all: the host's field has already stopped it. That one
//     substitution is what brings Europa's induced bubble out at 1.3 of its own radii against an
//     observed ~1.25, and it is why the nose of a moon's bubble faces its HOST and not the star.
//
// UNITS, because the standing rule asks for them explicitly and a bubble measured against the
// wrong radius is exactly the A33/B27/B28 fault: every distance published here is in THE BODY'S
// OWN RADII measured from THE BODY'S CENTRE, except `astrosphereAu` (AU from the star) and
// `confiningPressureNPa` (nanopascals, at this body's orbit).
//
// ORDERING. This runs inside pass 2b, immediately after the body's field is committed, and it
// reads a value the PARENT wrote in the SAME pass — safe only because 2b iterates parent before
// child. It must never read anything pass 2c or later writes: `totalIncidentFlux`,
// `surfaceRadiation` and the stamped `beltInnerEdgeRadii` field are all forbidden here, which is
// why the belt geometry comes from the belt model's pure FUNCTIONS instead. `idempotence.test.ts`
// is what enforces it.
import type { CelestialBody, Barycenter, RulePack, Magnetosphere, MagnetGeometry } from '$lib/types';
import { AU_KM, SOLAR_RADIUS_KM } from '$lib/constants';
import { calculateDistanceToStar } from './temperature';
import { isLuminousSource } from './substellar';
import { beltInnerEdgeRadii, beltScaleLengthRadii } from './radiation';
import { ionisingFromField } from './ionisingOutput';
import { seedFrom } from '$lib/rendering/landmass';

const MU0 = 4 * Math.PI * 1e-7;      // vacuum permeability, T m / A
const GAUSS_TO_TESLA = 1e-4;
const PA_TO_NPA = 1e9;
const SOLAR_MASS_KG = 1.989e30;

interface GeometryEntry { tilt_deg: number; offset_radii: number; ordered: boolean }

// The GEOMETRY WORD the dynamo pass already derives, turned into numbers. DATA, not branches: a new
// geometry is a row here, never an `if` in a renderer.
//   dipolar     Earth, Jupiter — a clean axial dipole leaning about 10 degrees off the spin axis
//   tilted      a strongly inclined but still centred dipole
//   off-centre  Uranus 59 deg / 0.30 R and Neptune 47 deg / 0.55 R — a thin-shell dynamo, so the
//               entry is the midpoint of the two real ice giants rather than either one of them
//   multipolar  no single axis at all: drawn as a disordered bundle, and SAID to be one
//   induced     a current loop driven by the host's field, aligned with the HOST rather than the spin
const DEFAULT_GEOMETRY_TABLE: Record<string, GeometryEntry> = {
  'none':       { tilt_deg: 0,  offset_radii: 0,    ordered: false },
  'dipolar':    { tilt_deg: 10, offset_radii: 0,    ordered: true },
  'tilted':     { tilt_deg: 45, offset_radii: 0.10, ordered: true },
  'off-centre': { tilt_deg: 53, offset_radii: 0.42, ordered: true },
  'multipolar': { tilt_deg: 0,  offset_radii: 0,    ordered: false },
  'induced':    { tilt_deg: 0,  offset_radii: 0,    ordered: true }
};

/** Every constant of the model in one place, read from the pack the way `beltConstants` reads its own. */
export function magnetosphereConstants(rulePack: RulePack | null | undefined) {
  const gp: any = (rulePack as any)?.generation_parameters ?? {};
  return {
    // The Sun's wind ram pressure at 1 AU. Real, and genuinely variable: it swings between about
    // 0.5 and 10 nPa over the solar cycle and with every coronal mass ejection, so 2 is a quiet
    // average rather than a constant of nature. The physics page says so.
    WIND_NPA_1AU: gp.wind_ref_pressure_npa_at_1au ?? 2.0,
    // How a star's wind scales with its ionising output. Both are driven by the same magnetic
    // activity, and `ionisingFromField` already publishes that output in multiples of the quiet
    // Sun's — so the Sun scores 1 by construction and the anchor calibration stays clean. (0.9979
    // in practice, because `SOLAR_RADIUS_KM` is 696,340 km while the bundled Sol carries 695,700:
    // two IAU solar radii in one engine, reported on the board rather than patched from here.)
    // LINEAR IS THE HONEST DEFAULT: the observed mass-loss relation (Wood 2005) is a per-unit-AREA
    // law against a SURFACE flux, which is not the quantity we hold.
    WIND_ACTIVITY_EXPONENT: gp.wind_activity_exponent ?? 1.0,
    WIND_SCALE_MIN: gp.wind_scale_min ?? 0.05,
    WIND_SCALE_MAX: gp.wind_scale_max ?? 100,
    // Total pressure of the local interstellar medium — thermal + magnetic + the flow's ram term.
    ISM_PA: gp.ism_pressure_pa ?? 1.4e-13,
    // The boundary current sheet's field doubling. See the header.
    CF: gp.magnetopause_compression_factor ?? 2.0,
    // How far downstream the DRAWN tail runs, in standoffs. THIS IS A DRAWING CONVENTION AND NOT A
    // MEASUREMENT, and it is labelled one everywhere it is published: a real magnetotail has no
    // sharp end (Earth's has been crossed beyond 1,000 radii), so any finite length is a choice
    // about the picture. The physical claim a tail does make here is its WIDTH, about two standoffs.
    TAIL_STANDOFFS: gp.magnetotail_standoffs ?? 20,
    // How far downstream the SHIELDED region runs, in its own closed-field radii - and unlike the
    // open tail this one is a real boundary rather than a convention. The closed lines stop where
    // they reconnect: Earth's near-tail reconnection line sits about 25 radii downstream, which is
    // four times its closed-field radius of 6.2. Past it the lines are open and the wind gets in.
    CLOSED_TAIL_STANDOFFS: gp.closed_field_tail_standoffs ?? 4,
    // The open/closed field-line boundary sits well inside the subsolar standoff, because the last
    // closed line is stretched down the tail. Calibrated ONCE against both oval anchors together
    // (Earth 65-72 deg, Jupiter 72-78 deg) rather than against either one alone.
    OVAL_L_FRACTION: gp.aurora_oval_l_fraction ?? 0.55,
    // How fast the boundary FLARES away from the nose, in Shue's form r = r0 (2/(1+cos t))^alpha.
    // 0.58 is the observed value for Earth. It is the shape of a real magnetopause rather than a
    // drawn teardrop, which matters because it settles the WIDTH for free: at right angles to the
    // nose the boundary sits 2^0.58 = 1.49 standoffs out, so a bubble is about three standoffs
    // across its waist. The tail's LENGTH is still the convention above; this is its profile.
    FLARING_ALPHA: gp.magnetopause_flaring_alpha ?? 0.58,
    GEOMETRY: { ...DEFAULT_GEOMETRY_TABLE, ...(gp.magnet_geometry_table ?? {}) } as Record<string, GeometryEntry>
  };
}

/**
 * The magnetopause standoff, in BODY RADII from the body's centre.
 *
 * Returns 0 when the balance point falls inside the body. That is not an error and not a refusal:
 * it is the honest statement that the wind reaches the ground (Venus, Mars, and any field too weak
 * for where it sits).
 */
export function magnetopauseStandoffRadii(
  fieldGauss: number,
  confiningPressurePa: number,
  c: ReturnType<typeof magnetosphereConstants>
): number {
  const B = (fieldGauss || 0) * GAUSS_TO_TESLA;
  if (!(B > 0) || !(confiningPressurePa > 0)) return 0;
  const inside = (c.CF * B) * (c.CF * B) / (2 * MU0);   // magnetic pressure just inside the boundary, Pa
  const r = Math.pow(inside / confiningPressurePa, 1 / 6);
  if (!Number.isFinite(r) || r <= 1) return 0;
  return r;
}

/** How hard this star's wind blows, relative to the Sun's. Exactly 1 for the Sun's field and size. */
export function windScaleOf(star: CelestialBody, c: ReturnType<typeof magnetosphereConstants>): number {
  const ionising = ionisingFromField({
    fieldGauss: star.magneticField?.strengthGauss,
    radiusSolar: (star.radiusKm ?? 0) / SOLAR_RADIUS_KM,
    massSolar: (star.massKg ?? 0) / SOLAR_MASS_KG,
    tempK: star.temperatureK,
    luminositySolar: star.radiationOutput
  });
  // NO FIELD ON RECORD IS NOT A CLAIM OF NO WIND (the B9a rule). An imported or hand-made star very
  // often carries no field at all, and scaling its wind to zero would hand every planet around it
  // an infinite magnetosphere. Absent that input the star blows the reference wind, and says so.
  if (!(ionising > 0)) return 1;
  return Math.min(c.WIND_SCALE_MAX, Math.max(c.WIND_SCALE_MIN, Math.pow(ionising, c.WIND_ACTIVITY_EXPONENT)));
}

/**
 * The stellar wind's ram pressure at this body's orbit, in Pa — every star in the system summed.
 *
 * The distance is the flux-equivalent one `calculateDistanceToStar` already derives, which is the
 * right average for a ram pressure for exactly the reason it is right for a flux: both fall as
 * 1/d^2, so an eccentric orbit takes the same time-averaging correction.
 */
export function windPressurePa(
  body: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[],
  c: ReturnType<typeof magnetosphereConstants>
): { pa: number; nearestStarId?: string } {
  const stars = allNodes.filter((n) => isLuminousSource(n as any)) as CelestialBody[];
  let pa = 0;
  let nearest = Infinity;
  let nearestStarId: string | undefined;
  for (const star of stars) {
    if (star.id === body.id) continue;
    const d = calculateDistanceToStar(body, star, allNodes);
    if (!(d > 0)) continue;
    pa += (c.WIND_NPA_1AU / PA_TO_NPA) * windScaleOf(star, c) / (d * d);
    if (d < nearest) { nearest = d; nearestStarId = star.id; }
  }
  return { pa, nearestStarId };
}

/** A host's own magnetic pressure at `rHostRadii` of its radii, in Pa. The dipole falls as r^-3. */
export function hostFieldPressurePa(hostFieldGauss: number, rHostRadii: number): number {
  const B0 = (hostFieldGauss || 0) * GAUSS_TO_TESLA;
  if (!(B0 > 0) || !(rHostRadii > 0)) return 0;
  const B = B0 / (rHostRadii * rHostRadii * rHostRadii);
  return (B * B) / (2 * MU0);
}

/** Where a body sits in its host's frame, in HOST radii. 0 when it has no body host. */
export function orbitRadiusInHostRadii(body: CelestialBody, host: CelestialBody | undefined): number {
  const aAU = body.orbit?.elements?.a_AU ?? 0;
  const hostRadiusKm = host?.radiusKm ?? 0;
  if (!(aAU > 0) || !(hostRadiusKm > 0)) return 0;
  return (aAU * AU_KM) / hostRadiusKm;
}

/**
 * WHAT PUSHES BACK on this body's field, in Pa, and where it comes from.
 *
 * ONE ANSWER, SOLVED THE SAME WAY WHEREVER IT IS ASKED. Both the induced-field question inside the
 * dynamo pass and the published block below reach the boundary through this and
 * `magnetopauseStandoffRadii`, so there is no second opinion about where a magnetopause is.
 */
export function confiningPressurePaOf(
  body: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[],
  c: ReturnType<typeof magnetosphereConstants>,
  depth = 0
): { pa: number; upstream: 'star' | 'host'; upstreamId?: string; host?: CelestialBody } {
  const host = body.parentId ? (allNodes.find((n) => n.id === body.parentId) as CelestialBody | undefined) : undefined;
  if (host && host.kind === 'body' && insideHostMagnetosphere(body, allNodes, c, depth)) {
    return {
      pa: hostFieldPressurePa(host.magneticField?.strengthGauss ?? 0, orbitRadiusInHostRadii(body, host)),
      upstream: 'host',
      upstreamId: host.id,
      host
    };
  }
  const w = windPressurePa(body, allNodes, c);
  return { pa: w.pa, upstream: 'star', upstreamId: w.nearestStarId, host: host?.kind === 'body' ? host : undefined };
}

/**
 * Where this body's magnetopause stands, in its own radii. 0 when there is none.
 *
 * A STAR HAS NO MAGNETOPAUSE and returns 0 — its boundary is the ASTROSPHERE, a different balance
 * against a different pressure. That is not a shortcut: it is what stops the recursion below from
 * ever walking into a star, and it is why nothing orbiting a star is ever "inside its host's
 * magnetosphere". A planet in the solar wind is not inside the Sun's magnetosphere; it is in the wind.
 */
export function standoffRadiiOf(
  body: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[],
  c: ReturnType<typeof magnetosphereConstants>,
  depth = 0
): number {
  if (body.roleHint === 'star') return 0;
  const { pa } = confiningPressurePaOf(body, allNodes, c, depth);
  return magnetopauseStandoffRadii(body.magneticField?.strengthGauss ?? 0, pa, c);
}

/**
 * Does this body orbit INSIDE its host's magnetosphere? A DISTANCE, not a mass threshold.
 *
 * This replaces the "host over 50 Earth masses, or gassy, or at least 1 gauss" test that stood in
 * for it before there was a standoff to compare against ([[G82]]).
 *
 * SEMI-MAJOR AXIS, NOT THE LIVE DISTANCE. An eccentric moon genuinely crosses the boundary twice
 * an orbit (Titan really does: 21 host radii against a standoff near 18), and a field that
 * flickered on and off with the clock would not be idempotent.
 *
 * IT SOLVES THE HOST'S BOUNDARY RATHER THAN READING A PUBLISHED ONE, because the dynamo pass asks
 * this question BEFORE any magnetosphere has been published — see the engine map's PHY entry for
 * the ordering. The walk up the parent chain terminates at the first star (which has no
 * magnetopause) and is depth-capped besides.
 */
export function insideHostMagnetosphere(
  body: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[],
  c: ReturnType<typeof magnetosphereConstants>,
  depth = 0
): boolean {
  if (depth > 8 || !body.parentId) return false;
  const host = allNodes.find((n) => n.id === body.parentId) as CelestialBody | undefined;
  if (!host || host.kind !== 'body') return false;
  const r = orbitRadiusInHostRadii(body, host);
  if (!(r > 0)) return false;
  return r < standoffRadiiOf(host, allNodes, c, depth + 1);
}

/** The astrosphere: where this star's wind gives way to the interstellar medium, in AU. */
export function astrosphereAu(star: CelestialBody, c: ReturnType<typeof magnetosphereConstants>): number {
  if (!(c.ISM_PA > 0)) return 0;
  const p1au = (c.WIND_NPA_1AU / PA_TO_NPA) * windScaleOf(star, c);
  if (!(p1au > 0)) return 0;
  return Math.sqrt(p1au / c.ISM_PA);
}

/**
 * WHERE THE SHIELDING ACTUALLY IS — the last CLOSED field line's equatorial crossing, body radii.
 *
 * Inside it the field lines leave the body and come back, so a wind ion is turned around and sent
 * away; outside it they are open to the wind, and what comes down them lands on the polar cap. That
 * is the difference between the bubble's OUTER extent and its USEFUL extent, and it is why the
 * overlay shades this region and only outlines the magnetopause (owner, 2026-09-07: *"drawn at
 * where it can provide atmo protection levels rather than max extent - maybe very pale to max
 * extent, more obvious at useful levels"*).
 *
 * It costs no new constant, because the aurora oval is THIS BOUNDARY'S OWN FOOTPRINT: the oval is
 * where the last closed line meets the surface. One number, two pictures, and they cannot disagree.
 */
export function closedFieldRadii(standoffRadii: number, c: ReturnType<typeof magnetosphereConstants>): number {
  return c.OVAL_L_FRACTION * (standoffRadii || 0);
}

/**
 * The aurora oval's COLATITUDE — degrees from the MAGNETIC pole, not the spin pole.
 *
 * A dipole field line that crosses the equator at L radii comes back to the surface at colatitude
 * theta with sin^2(theta) = 1/L, and the oval traces the last CLOSED line — so L is exactly
 * `closedFieldRadii` and this is that boundary read at the surface instead of at the equator.
 */
export function auroraOvalColatDeg(standoffRadii: number, c: ReturnType<typeof magnetosphereConstants>): number {
  const L = closedFieldRadii(standoffRadii, c);
  if (!(L > 1)) return 90;   // the last closed line never leaves the surface: no oval, the cap is all open
  return (Math.asin(Math.sqrt(1 / L)) * 180) / Math.PI;
}

/**
 * The longitude the dipole leans towards, in degrees, seeded from the body's id.
 *
 * IT IS UNOBSERVABLE AND IT IS SAID TO BE. Nothing this engine holds fixes which WAY a tilt points,
 * only how far it leans, so this is a stable arbitrary choice rather than a derivation and the
 * physics page labels it one. Seeded so a world looks the same to everyone at the table and the
 * same on every re-process.
 */
export function dipoleLongitudeDeg(bodyId: string): number {
  return (seedFrom(bodyId || 'x') % 3600) / 10;
}

/**
 * THE OUTLINE OF A MAGNETOPAUSE, in body radii, in a frame where +x points UPSTREAM (at the star, or
 * at the host for a moon inside its host's bubble) and the tail runs down -x.
 *
 * Shue et al. (1997): r(t) = r0 (2 / (1 + cos t))^alpha, with t measured from the upstream axis.
 * It is the standard empirical magnetopause and it is used here rather than a drawn teardrop for one
 * reason: it makes the WIDTH a consequence of the standoff instead of a second invented number.
 *
 * THE FAR END OF THE TAIL IS NOT A SHAPE PROBLEM, IT IS AN HONESTY PROBLEM, and it has two different
 * right answers depending on which boundary is being drawn (owner, 2026-09-07, looking at the first
 * cut: *"is that hard edge away from the star real? I thought it would tail off like a teardrop"* -
 * it was not real, it was this clamp).
 *   `taper: false` (the MAGNETOPAUSE): the form diverges as t approaches 180 degrees because a real
 *     magnetotail has no end - Earth's has been crossed a thousand radii downstream. So the shape is
 *     clamped at `tailRadii` at a CONSTANT WIDTH, which is what a real tail does, and the renderer
 *     FADES the paint to nothing along it. There is no edge to draw because there is no edge.
 *   `taper: true` (the CLOSED-FIELD region): this one genuinely ends. The last closed field line
 *     comes back to the body, so the region closes, and it is drawn closing - eased to a blunt point
 *     on the axis rather than cut off square.
 * Neither is a teardrop that narrows to a point on the dayside: a magnetosphere is blunt at the nose
 * and open at the back, which is the opposite of a teardrop, and drawing it the other way round
 * would put the widest part in the wrong place.
 *
 * ONE SHAPE, EVERY PICTURE. The orrery and the 3D cage both come through here, so they cannot draw
 * two different boundaries for one number.
 */
export function magnetopauseOutlineRadii(
  standoffRadii: number,
  tailRadii: number,
  c: ReturnType<typeof magnetosphereConstants>,
  steps = 48,
  taper = false
): { x: number; y: number }[] {
  const r0 = standoffRadii || 0;
  if (!(r0 > 0)) return [];
  const tail = tailRadii > r0 ? tailRadii : r0;
  const out: { x: number; y: number }[] = [];
  // Walk the sunward half from the nose round to the tail, then mirror: the shape is symmetric about
  // the upstream axis, so half the trigonometry answers both flanks and they cannot disagree.
  const half: { x: number; y: number }[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (Math.PI * i) / steps;               // 0 at the nose, PI down the tail
    const denom = 1 + Math.cos(t);
    const r = denom <= 1e-6 ? Infinity : r0 * Math.pow(2 / denom, c.FLARING_ALPHA);
    const x = Number.isFinite(r) ? r * Math.cos(t) : -tail;
    const y = Number.isFinite(r) ? r * Math.sin(t) : r0 * Math.pow(2 / 1e-6, c.FLARING_ALPHA);
    if (x < -tail) {
      const prev = half[half.length - 1];
      const wy = prev ? prev.y : r0;
      if (taper) {
        // A boundary that really closes: ease the width to nothing over the last stretch, so it
        // comes to a blunt point on the axis instead of stopping at a wall.
        // `1 - f^2`, not a quarter circle: a circular ease comes down VERTICALLY at the end, which
        // is a hard edge again wearing a curve. This one flattens into the axis.
        const x0 = prev ? prev.x : 0;
        for (let k = 1; k <= 10; k++) {
          const f = k / 10;
          half.push({ x: x0 + (-tail - x0) * f, y: wy * (1 - f * f) });
        }
      } else {
        // A tail that does not end: carry it downstream at constant width and let the renderer fade
        // the paint out along it. The straight run is honest; a visible edge at the end is not.
        half.push({ x: -tail, y: wy });
      }
      break;
    }
    half.push({ x, y });
  }
  for (const p of half) out.push(p);
  for (let i = half.length - 1; i >= 0; i--) out.push({ x: half[i].x, y: -half[i].y });
  return out;
}

/**
 * The same outline, ORIENTED and SCALED: offsets from the body's centre in whatever unit `oneRadius`
 * is given in, with the nose along the unit vector (ux, uy).
 *
 * It lives here rather than in the renderer for the reason the duplication rule gives: the orrery
 * and the gate that checks the orrery must not each carry their own rotation, or the check stops
 * checking anything. `oneRadius` is the caller's - the plan view hands in the body's DRAWN disc
 * radius, so the bubble inherits the same size floor the disc has and no second one.
 */
export function magnetopauseOutlineOriented(
  standoffRadii: number,
  tailRadii: number,
  c: ReturnType<typeof magnetosphereConstants>,
  ux: number,
  uy: number,
  oneRadius: number,
  steps = 48,
  taper = false
): { x: number; y: number }[] {
  return magnetopauseOutlineRadii(standoffRadii, tailRadii, c, steps, taper).map((p) => ({
    x: (p.x * ux - p.y * uy) * oneRadius,
    y: (p.x * uy + p.y * ux) * oneRadius
  }));
}

/**
 * VIEWPORT CULLING for a drawn bubble, as two pure decisions the renderer and its gate can share.
 *
 * A magnetotail is twenty standoffs long, so at any useful zoom most of it is off the canvas - and a
 * path handed to `fill()` is rasterised whether anyone can see it or not (owner, 2026-09-07: *"make
 * sure you do culling on these shapes to avoid lagging by drawing stuff off screen"*).
 *
 * Coordinates are the renderer's world-minus-pan frame, where the visible rectangle is simply
 * +/- half the canvas over the zoom, and `cx, cy` is the body's centre in it.
 */
export function magnetosphereOffScreen(
  cx: number, cy: number, halfW: number, halfH: number, maxReachWorld: number
): boolean {
  return cx - maxReachWorld > halfW || cx + maxReachWorld < -halfW
      || cy - maxReachWorld > halfH || cy + maxReachWorld < -halfH;
}

/**
 * The tail length actually worth generating, in body radii: no further from the body than the far
 * corner of the viewport. NEVER used for the gradient - the fade is built over the TRUE length, so
 * what a viewer sees is identical and only the invisible remainder is dropped.
 */
export function visibleTailRadii(
  cx: number, cy: number, halfW: number, halfH: number, oneRadiusWorld: number, tailRadii: number
): number {
  if (!(oneRadiusWorld > 0)) return tailRadii;
  const reach = Math.hypot(Math.abs(cx) + halfW, Math.abs(cy) + halfH);
  return Math.min(tailRadii, reach / oneRadiusWorld);
}

/** The furthest any point of a drawn bubble can sit from the body's centre, in body radii. The flank
 *  never exceeds about three standoffs, so this bounds the whole shape for the cull above. */
export function magnetosphereReachRadii(standoffRadii: number, tailRadii: number): number {
  return Math.max(tailRadii, 3 * standoffRadii);
}

export interface MagnetosphereOpts {
  /** The `magnetic/*` tag the dynamo pass has already decided. ONE decision, read here rather than remade. */
  shieldingTag: string;
}

export function deriveMagnetosphere(
  body: CelestialBody,
  allNodes: (CelestialBody | Barycenter)[],
  rulePack: RulePack,
  opts: MagnetosphereOpts
): Magnetosphere {
  const c = magnetosphereConstants(rulePack);
  const notes: string[] = [];
  const geometryWord: MagnetGeometry = body.magnetism?.geometry ?? 'none';
  const g = c.GEOMETRY[geometryWord] ?? DEFAULT_GEOMETRY_TABLE['none'];
  const fieldGauss = body.magneticField?.strengthGauss ?? 0;

  // THE SHAPE IS THE TAG'S SHAPE. Deriving it again from the field would be a second threshold for
  // one concept, and the two would drift the first time `TENUOUS_GAUSS` moved.
  const shapeFromTag: Magnetosphere['shape'] =
    opts.shieldingTag === 'magnetic/unshielded' ? 'none'
    : opts.shieldingTag === 'magnetic/tenuous' ? 'tenuous'
    : opts.shieldingTag === 'magnetic/induced' ? 'induced'
    : 'bubble';

  // WHAT PUSHES BACK. Inside a host's bubble the stellar wind never arrives, so the confining
  // pressure is the host's own field at this orbit and the nose faces the HOST. One helper answers
  // this wherever it is asked, so the dynamo pass and this block cannot disagree about a boundary.
  const { pa: confiningPa, upstream, upstreamId, host } = confiningPressurePaOf(body, allNodes, c);
  if (upstream === 'host' && host) {
    notes.push(`Inside ${host.name || 'its host'}'s magnetosphere, so the boundary is set by the host's field at this orbit and the nose faces the host rather than the star.`);
  }

  const solved = shapeFromTag === 'none' ? 0 : magnetopauseStandoffRadii(fieldGauss, confiningPa, c);
  const shape: Magnetosphere['shape'] = solved > 0 ? shapeFromTag : 'none';

  if (shapeFromTag !== 'none' && solved === 0) {
    notes.push('The field is too weak for the pressure out here: the balance point falls inside the body, so the wind reaches the ground and there is no bubble to draw.');
  }

  // The trapped belt, read from the belt model's own constants rather than derived a second time
  // ([[B17]]/[[B22]] own that law and this needs only its geometry). Its dose falls monotonically
  // outward from the inner edge, so the belt's PEAK is that inner edge.
  let beltPeakRadii: number | undefined;
  let beltScaleRadii: number | undefined;
  const spinHours = Math.abs(body.rotation_period_hours ?? 0);
  const lambda = beltScaleLengthRadii(fieldGauss, rulePack);
  if (solved > 0 && lambda > 0 && spinHours > 0) {
    const edge = beltInnerEdgeRadii(body, rulePack);
    if (edge < solved) { beltPeakRadii = edge; beltScaleRadii = lambda; }
  }

  if (!g.ordered && solved > 0) {
    notes.push('A disordered, multipolar field: there is no single magnetic axis, so the bubble has no clean pole and the aurora is a scatter of patches rather than one oval.');
  }
  if (solved > 0) {
    notes.push(`The magnetopause stands ${solved.toFixed(1)} body radii out, where the field's pressure balances ${(confiningPa * PA_TO_NPA).toPrecision(3)} nPa of ${upstream === 'host' ? 'host field' : 'stellar wind'}.`);
  }

  return {
    shape,
    standoffRadii: +solved.toFixed(3),
    closedFieldRadii: +closedFieldRadii(solved, c).toFixed(3),
    tailRadii: +(solved * c.TAIL_STANDOFFS).toFixed(2),
    dipoleTiltDeg: solved > 0 ? g.tilt_deg : 0,
    dipoleOffsetRadii: solved > 0 ? g.offset_radii : 0,
    dipoleLongitudeDeg: +dipoleLongitudeDeg(body.id).toFixed(1),
    ordered: g.ordered,
    ovalColatDeg: solved > 0 ? +auroraOvalColatDeg(solved, c).toFixed(2) : 90,
    ...(beltPeakRadii !== undefined ? { beltPeakRadii: +beltPeakRadii.toFixed(3), beltScaleRadii: +beltScaleRadii!.toFixed(3) } : {}),
    upstream,
    ...(upstreamId ? { upstreamId } : {}),
    confiningPressureNPa: +(confiningPa * PA_TO_NPA).toPrecision(4),
    notes
  };
}
