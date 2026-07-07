// Universe Sandbox (.ubox) import — shared types.
// See docs/dev/ubox-import-design.md (the HOW) and ubox-import-spec.md (the WHAT/WHY).
import type { System } from '$lib/types';

// ---------------------------------------------------------------------------
// Universe Sandbox side (as confirmed by the Update 36.2.1 teardowns, spec §4a)
// ---------------------------------------------------------------------------

/** A material/gas depot: a mass inventory entry inside CompositionComponent.depots. */
export interface UsDepot { Mass: number; LockSurfaceTracking?: boolean; }

/** One entry in the archive manifest (manifest.json → Entries[]). */
export interface UsManifestEntry {
  Name?: string;
  AssetType?: string;
  BaseType?: string;   // 'Simulation' marks a simulation member
  TypeName?: string;
  Path?: string;
  ID?: string;
}

export interface UsManifest {
  Header?: { BuildRevision?: number; BuildName?: string; EntryPoint?: string; EntryPoints?: string[]; };
  Entries?: UsManifestEntry[];
}

/** A celestial entity in the simulation JSON (Entities[]). Only the fields we read are typed;
 *  the real object has ~45 keys. Vectors are ";"-joined strings (spec §4a). */
export interface UsEntity {
  $type?: string;         // 'Body'
  Name?: string;
  Id?: number;
  Category?: string;      // 'star' | 'planet' | 'moon' | 'sso' | 'blackhole' | undefined (particles)
  Mass?: number;          // kg
  Radius?: number;        // m
  Density?: number;       // kg/m^3
  Age?: number;           // seconds
  Position?: string;      // "x;y;z"  metres
  Velocity?: string;      // "x;y;z"  m/s
  AngularVelocity?: string; // "x;y;z" rad/s
  RotationAxis?: string;  // "x;y;z"  (body-local; ±Y for planets)
  Orientation?: string;   // "x;y;z;w" quaternion
  HorizonID?: string | null;
  Parent?: number;        // -1 in every known sample (hierarchy not stored)
  CustomOrbitParentId?: number;
  Flags?: number;
  LockedProperties?: unknown;
  Components?: UsComponent[];
}

export interface UsComponent {
  $type?: string;         // 'Celestial' | 'HeatComponent' | 'CompositionComponent' | ...
  // Celestial
  AtmosphereMass?: number;      // kg
  MeanMolecularWeightDryAir?: number;
  Luminosity?: number;          // W
  StarType?: number;
  MagneticField?: number;       // gauss
  MagPoleAngle?: number;
  SurfaceTemperatureOverride?: number;
  // HeatComponent
  SurfaceTemperature?: number;  // K
  StartingTemperature?: number;
  Albedo?: number;
  EmitsLight?: boolean;
  OverrideStartingTemp?: boolean;
  // CompositionComponent
  depots?: Record<string, UsDepot>;
}

export interface UsSimulation {
  Name?: string;
  Date?: string;
  TimePassed?: number;
  Entities: UsEntity[];
}

/** Result of parse.ts: the resolved simulation plus archive metadata. */
export interface ParsedUbox {
  manifest: UsManifest | null;
  sim: UsSimulation;
  simText: string;        // raw JSON text of the chosen simulation (for the deterministic hash)
  buildRevision: number;
  buildName: string;
}

// ---------------------------------------------------------------------------
// Result side (public API)
// ---------------------------------------------------------------------------

export type UboxErrorCode = 'not-a-zip' | 'no-simulation' | 'unrecognised-format' | 'empty-system';

export class UboxError extends Error {
  code: UboxErrorCode;
  constructor(code: UboxErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'UboxError';
    this.code = code;
  }
}

export type SkipReason =
  | 'particle' | 'dummy' | 'far-field' | 'unbound'
  | 'below-mass-threshold' | 'object-preset' | 'unparseable-entity';

export interface SkippedEntity { name: string; reason: SkipReason; }

/** US values we deliberately did NOT import, kept per node id for the audit (spec §9). */
export interface UsSnapshotEntry {
  name: string;
  roleHint: string;
  surfaceTemperatureK?: number;
  albedo?: number;
  magneticFieldGauss?: number;
  luminosityW?: number;
  densityKgM3?: number;
  ageGyr?: number;
  pressureBar?: number;      // converter's own derived pressure input (cross-check)
}
export type UsReferenceSnapshot = Record<string, UsSnapshotEntry>;

export interface UboxImportOptions {
  /** index (0-based) or Name of the simulation when the archive lists several; default: the manifest EntryPoint. */
  simulation?: number | string;
  /** the user slider — bodies below this mass (kg) are skipped. Default RECOMMENDED_MIN_MASS_KG. */
  minBodyMassKg?: number;
}

export interface UboxListing {
  simulations: { name: string; path: string; entityCount?: number }[];
  buildName: string;
  buildRevision: number;
}

export interface UboxImportResult {
  /** UNPROCESSED authored-inputs system — the caller runs fixUpImportedSystem + systemProcessor.process. */
  system: System;
  snapshot: UsReferenceSnapshot;
  skipped: SkippedEntity[];
  assumptions: string[];
  counts: { stars: number; planets: number; moons: number; other: number; rings: number };
}

// ---------------------------------------------------------------------------
// Import Review (review.ts)
// ---------------------------------------------------------------------------

export type ReviewBucket = 'aligned' | 'explained' | 'unexplained';

export interface ReviewRow {
  body: string;
  metric: string;         // e.g. 'surface temperature'
  us: string;             // US value, formatted
  ssg: string;            // SSG derived value, formatted
  bucket: ReviewBucket;
  reason?: string;        // SHORT why (a couple of words), shown inline
  note?: string;          // the full explanation, shown on hover / in the copied report
}

export interface ImportReview {
  counts: UboxImportResult['counts'];
  assumptions: string[];
  skipped: { reason: SkipReason; count: number; examples: string[] }[];
  comparisons: ReviewRow[];
}
