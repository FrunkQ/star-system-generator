// ===== types.ts =====
export type ID = string;

export interface Visibility {
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

export interface Tag { key: string; value?: string; ns?: string; }

export interface NodeBase {
  id: ID; name: string; parentId: ID | null;
  tags: Tag[]; notes?: string; gmNotes?: string; visibility?: Visibility;
}

export interface Atmosphere { main?: string; pressure_bar?: number; composition?: Record<string, number>; tags?: Tag[]; }
export interface Hydrosphere { coverage?: number; depth_m?: number; composition?: string; tags?: Tag[]; }
export interface ImageRef { url: string; title?: string; credit?: string; license?: string; sourceUrl?: string; }

export interface Area {
  id: ID; name: string;
  type: "biome" | "region" | "city" | "facility" | "anomaly" | "site" | "station" | "colony" | "other";
  metrics: Record<string, number>;
  tags: Tag[]; description?: string; gmNotes?: string; visibility?: Visibility;
}

export interface Kepler { a_AU: number; e: number; i_deg: number; Omega_deg: number; omega_deg: number; M0_rad: number; }

export interface Orbit {
  hostId: ID; elements: Kepler; t0: number; hostMu: number; seed?: string;
  n_rad_per_s?: number; // Optional pre-calculated mean motion (rad/s)
  resonance?: { numerator: number; denominator: number } | null;
}

export interface DeltaVCapability {
  dryMassKg?: number; propMassKg?: number; isp_s?: number; maxAccel_mps2?: number;
  burns?: BurnPlan[]; allowManualDV?: boolean;
}
export interface BurnPlan { atTimeMs: number; frame: "perifocal"; dv_mps: [number,number,number]; description?: string; publishToPlayer?: boolean; }

export interface MagneticField {
  strengthGauss: number;
}

export interface CelestialBody extends NodeBase {
  kind: "body";
  roleHint?: "star" | "planet" | "moon" | "submoon" | "ring" | "belt" | "artifact" | "station" | "other";
  classes: string[];
  massKg?: number; radiusKm?: number; density?: number; radiusInnerKm?: number; radiusOuterKm?: number;
  atmosphere?: Atmosphere; hydrosphere?: Hydrosphere;
  albedo?: number; temperatureK?: number; gravityG?: number; magneticField?: MagneticField;
  orbit?: Orbit; areas: Area[]; image?: ImageRef; deltaV?: DeltaVCapability;
}

export interface Barycenter extends NodeBase {
  kind: "barycenter";
  memberIds: ID[]; effectiveMassKg?: number; orbit?: Orbit;
}

export interface System {
  id: ID; name: string; seed: string; epochT0: number;
  nodes: Array<CelestialBody | Barycenter>;
  rulePackId: string; rulePackVersion: string;
  tags: Tag[]; notes?: string; gmNotes?: string;
}

// Rule Pack interfaces (subset for M0–M1)
export interface ClassifierRule { when: Expr; addClass: string; score: number; }
export type Feature =
  | "mass_Me" | "radius_Re" | "density" | "Teq_K" | "period_days" | "a_AU" | "stellarType"
  | "atm.main" | "atm.pressure_bar" | "hydrosphere.coverage" | "tidallyLocked" | "ringSystem" | "age_Gyr";
export type Expr = { all?: Expr[]; any?: Expr[]; not?: Expr }
  | { gt: [Feature, number] } | { lt: [Feature, number] } | { between: [Feature, number, number] }
  | { eq: [Feature, string] } | { hasTag: string };
export interface ClassifierSpec { rules: ClassifierRule[]; maxClasses: number; minScore: number; }

export interface PromptSpec { systemPreamble: string; fewShots?: Array<{input: any; output: string;}>; perEntityPrompts?: Record<string,string>; }
export interface ViewPresetSpec { defaultPlayerVisibility: { discoveredBasics: boolean; showTags: string[]; hiddenFields: string[]; }; overrides?: Array<{ match: { role?: string; class?: string; tag?: string }, visibleFields: string[], hiddenFields: string[] }>; }

export interface TableSpec { name: string; entries: Array<{ weight: number; value: any }>; }
export interface MetricDef { key: string; label: string; min: number; max: number; default?: number; }

export interface RulePack {
  id: string; version: string; name: string;
  distributions: Record<string, TableSpec>;
  tagVocab: string[]; // taxonomy IDs
  prompts: PromptSpec;
  viewPresets?: ViewPresetSpec;
  statTemplates?: Record<string,string>;
  metrics?: Record<string, MetricDef>;
  classifier?: ClassifierSpec;
}