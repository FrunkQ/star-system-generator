type ID = string;

/**
 * A position or velocity in the transit subsystem.
 *
 * KEPT UNDER ITS OLD NAME ON PURPOSE. It is three-dimensional now — `z` is the height above the
 * reference plane, in the same units as x and y — but it is OPTIONAL, and every helper in `math.ts`
 * reads it as `z ?? 0`. That is what let the whole subsystem go 3D without rewriting the several
 * hundred `{ x, y }` literals that build these, and what keeps a coplanar system's answers
 * bit-identical to the flat ones it used to give.
 *
 * Owner, 2026-08-26: transit "didn't really think in 3D, so some distances may be a bit longer now,
 * but the maths should be no different" — which is exactly right. Lambert's universal-variable core,
 * the RK4, the phase schedule and the time stamps are all dimension-agnostic; what changed is that
 * `getGlobalState` stopped flattening the orbits on the way in.
 */
export interface Vector2 {
  x: number;
  y: number;
  z?: number;
}

export interface StateVector {
  r: Vector2; // Position in AU
  v: Vector2; // Velocity in AU/s (or km/s, need to standardize. Let's use AU/day for internal math, convert for display)
}

export type TransitMode = 'Fast' | 'Economy';

export interface BurnPoint {
  id: ID;
  time: number; // Unix timestamp
  position: Vector2; // In System Coordinates (AU)
  deltaV_ms: number; // Magnitude of burn in m/s
  type: 'Departure' | 'Arrival' | 'MidCourse' | 'Brake' | 'Correction';
}

export interface TransitSegment {
  id: ID;
  // `Aerobrake` is a phase in which the ATMOSPHERE does the braking, so the drive is dark through it
  // even though the ship is decelerating hard. Anything that reads this to decide whether a ship is
  // thrusting must treat it like `Coast`, not like `Brake` (constructs/shipBurn.ts).
  type: 'Coast' | 'Accel' | 'Brake' | 'Correction' | 'Aerobrake';
  startTime: number;
  endTime: number;
  startState: StateVector; // Relative to system center (Star) usually
  endState: StateVector;
  hostId: ID; // The body this segment is relative to (usually Star, but could be Planet if inside SOI)
  pathPoints: Vector2[]; // Pre-calculated points for visualization
  // WHEN each of those points is, in absolute ms, parallel to `pathPoints`. Optional because
  // journeys saved before G46 do not carry it and every reader falls back to assuming even
  // spacing — which is exactly the assumption that let a sub-hour burn be drawn with two coast
  // samples 48 hours apart. A stamped segment is read by the two points that actually BRACKET
  // the query time (transit/pathSampling.ts).
  pathTimes?: number[];
  // THE DELTA-V THIS PHASE ACTUALLY SPENDS, in m/s. Published rather than inferred, because the
  // only other source is the difference between `startState.v` and `endState.v` — and those are
  // ZEROED on most segments, so inferring gave the drive plume 2.4x its real thrust on a Hohmann
  // departure and effectively NOTHING on a 57-hour torch burn. Absent on Coast segments and on
  // journeys saved before G46, where the old inference is still the fallback.
  deltaV_ms?: number;
  // WHICH WAY THE DRIVE IS POINTING while this phase burns: the unit vector of the phase's own
  // Delta-v, in the same frame as `pathPoints`. A ship under thrust points along the thrust, and
  // that is NOT the same as along its course — a departure burn's Delta-v sits at an angle to the
  // velocity it is changing. Without this the renderer can only aim the nose down the route line
  // and flip it for a brake, which is right to within that angle and no better. Absent on Coast.
  thrustDir?: Vector2;
  warnings: string[]; // "High G", "Radiation", "Fuel Low"
  fuelUsed_kg: number;
}

/**
 * THE ORBIT-CHANGE PICTURE — the figure everybody arrives already knowing.
 *
 * Initial orbit, transfer ellipse, final orbit, and the two burns that join them. A ship moving
 * between two orbits of ONE body is doing something with a shape, and the app used to draw it as a
 * line to the planet followed by the ship appearing in a different orbit.
 *
 * The two CIRCLES are carried as radii and a plane, not as baked points, for two reasons. They hang
 * off a body that is itself moving, so points fixed at plan time would be right for one instant only;
 * and journeys ride the player snapshot, where a pair of point arrays per plan is exactly the kind of
 * growth the frame-limit rule warns about. The renderer draws them against the host's live position.
 *
 * The transfer ellipse between them is not here because it is not context: it is the path the ship
 * actually flies, and it is the plan's own Coast segment.
 */
export interface OrbitChangeFigure {
  /** The body both orbits belong to. The circles are drawn around wherever it is now. */
  hostId: ID;
  /** Radius the ship starts in, and the one it ends in. */
  fromRadius_au: number;
  toRadius_au: number;
  /** Orthonormal basis of the manoeuvre plane, host-relative: `u` points at the first burn, `w` is
   *  the direction the ship is travelling there. A circle is host + r(u cos t + w sin t). */
  u: Vector2;
  w: Vector2;
  /** When each burn happens, so the picture can mark them where the reference figure does. */
  burn1Time: number;
  burn2Time: number;
}

export interface TransitPlan {
  id: ID;
  originId: ID;
  targetId: ID;
  startTime: number;
  mode: TransitMode;
  segments: TransitSegment[];
  burns: BurnPoint[];
  totalDeltaV_ms: number;
  totalTime_days: number;
  totalFuel_kg: number;
  aerobrakingDeltaV_ms?: number; // Delta-V the ATMOSPHERE absorbed — propellant not spent
  // What that manoeuvre actually involved, so the ship's log and the panel can say it rather than
  // just showing a smaller fuel figure (physics/aerobrake.ts).
  aeroCirculariseDeltaV_ms?: number; // burn to climb out of the air and circularise where wanted
  aeroTimeSec?: number;              // wall-clock the dip and its passes add
  aeroNote?: string;                 // the plain-words account for the log
  arrivalVelocity_ms: number; // Relative velocity at arrival (0 if braked)
  distance_au: number;
  isValid: boolean;
  error?: string;
  
  // User Parameters
  maxG: number;
  accelRatio: number; 
  brakeRatio: number;
  interceptSpeed_ms: number; // 0 for dock
  arrivalPlacement?: string; // 'l4', 'l5', 'lo', 'mo', 'ho', 'geo', 'surface'
  /** G53 PHASE 5: the journey ends ATTACHED to this structure - a level up a ladder, or the
   *  nearest point of a rim/shell (constructs/docking.ts). The flight is solved to the HOST at
   *  that radius (targetId + parkingOrbitRadius); the arrival hands the ship to the structure. */
  arrivalDock?: { structureId: string; level?: 'anchor' | 'lo' | 'mo' | 'geo' | 'counterweight' };
  tags?: string[];
  planType?: 'Efficiency' | 'Speed' | 'Assist' | 'Complex';
  name?: string;
  hiddenReason?: string;
  isKinematic?: boolean; // True if path points are pre-scaled for kinematic, bypasses visualizer scaling
  initialDelay_days?: number; // Delay before this leg starts
  /** Present when this plan is a change between two orbits of ONE body — the Hohmann figure. */
  orbitChange?: OrbitChangeFigure;
}

export type TransitLogStatus = 'scheduled' | 'active' | 'completed' | 'cancelled';

export interface ScheduledJourneyLog {
  id: ID;
  createdAtSec: string;
  plans: TransitPlan[];
  status: TransitLogStatus;
  autopilot?: boolean; // generated by the autopilot planner (vs hand-planned) — badged in the ship's log
  forceExecute?: boolean;
  cancelledAtSec?: string;
  cancelState?: {
    position_au: Vector2;
    velocity_ms: { x: number; y: number; z?: number };
  };
}
