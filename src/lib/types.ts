// ===== types.ts =====
import type { OrbitalBoundaries } from './physics/orbits';

export type ID = string;

export interface Visibility {
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

export interface Tag { key: string; value?: string; ns?: string; }

export interface NodeBase {
  id: ID; name: string; parentId: ID | null; ui_parentId?: ID | null;
  placement?: string; // e.g., 'L4', 'L5', 'Surface'
  tags: Tag[]; notes?: string; gmNotes?: string; visibility?: Visibility;
}

export interface Atmosphere { name: string; main?: string; pressure_bar?: number; composition: Record<string, number>; tags?: Tag[]; molarMassKg?: number; }
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
  isRetrogradeOrbit?: boolean;
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

export interface Biosphere {
  complexity: 'simple' | 'complex';
  coverage: number;
  biochemistry: 'water-carbon' | 'ammonia-silicon' | 'methane-carbon';
  energy_source: 'photosynthesis' | 'chemosynthesis' | 'thermosynthesis';
  morphologies: ('microbial' | 'fungal' | 'flora' | 'fauna')[];
}

export interface Engine {
  engine_id: ID;
  quantity: number;
}

export interface CelestialBody extends NodeBase {
  kind: 'body' | 'construct';
  engines?: Engine[]; // Array of engines attached to the construct
  // ... existing properties ...
}

export interface PhysicalParameters {
  dimensionsM?: [number, number, number];
  massKg?: number;
  cargoCapacity_tonnes?: number;
  rotation_period_hours?: number;
  spinRadiusM?: number;
  can_aerobrake?: boolean;
  has_landing_gear?: boolean;
}

export interface PowerPlant {
  type: string;
  output_MW: number;
}

export interface LifeSupport {
  consumables_max_person_days: number;
  consumables_current_person_days: number;
}

export interface Systems {
  power_plants?: PowerPlant[];
  life_support?: LifeSupport;
  modules?: string[];
}

export interface AIContext {
  seedText?: string;
  tags?: string[];
  style?: any;
  length?: number;
  lastPrompt?: string;
}

export interface Barycenter extends NodeBase {
  kind: "barycenter";
  memberIds: ID[]; effectiveMassKg?: number; orbit?: Orbit;
}

export interface System {
  id: ID; name: string; seed: string; epochT0: number; age_Gyr: number;
  nodes: Array<CelestialBody | Barycenter>;
  rulePackId: string; rulePackVersion: string;
  tags: Tag[]; notes?: string; gmNotes?: string;
  visualScalingMultiplier?: number;
  toytownFactor?: number;
  isManuallyEdited?: boolean;
}

// Rule Pack interfaces (subset for M0–M1)
export interface ClassifierRule { when: Expr; addClass: string; score: number; }
export type Feature =
  | "mass_Me" | "radius_Re" | "density" | "Teq_K" | "a_AU" | "stellarType"
  | "atm.main" | "atm.pressure_bar" | "hydrosphere.coverage" | "tidalHeating" | "tidallyLocked" | "ringSystem"
  | "age_Gyr" | "orbital_period_days" | "rotation_period_hours" | "has_ring_child" | "radiation_flux";
export type Expr = { all?: Expr[]; any?: Expr[]; not?: Expr }
  | { gt: [Feature, number] } | { lt: [Feature, number] } | { between: [Feature, number, number] }
  | { eq: [Feature, string] } | { hasTag: string };
export interface ClassifierSpec { rules: ClassifierRule[]; maxClasses: number; minScore: number; }

export interface PromptSpec { systemPreamble: string; fewShots?: Array<{input: Record<string, unknown>; output: string;}>; perEntityPrompts?: Record<string,string>; }
export interface ViewPresetSpec { defaultPlayerVisibility: { discoveredBasics: boolean; showTags: string[]; hiddenFields: string[]; }; overrides?: Array<{ match: { role?: string; class?: string; tag?: string }, visibleFields: string[], hiddenFields: string[] }>; }

export interface TableSpec { name: string; entries: Array<{ weight: number; value: unknown }>; }
export interface MetricDef { key: string; label: string; min: number; max: number; default?: number; }

export interface FuelDefinition {
  id: string;
  name: string;
  density_kg_per_m3: number;
  description: string;
}

export interface EngineDefinition {
  id: string;
  name: string;
  type: string;
  fuel_type_id: string;
  thrust_kN: number;
  efficiency_isp: number;
  powerDraw_MW?: number; // Optional: Power drawn by the engine when active
  atmo_efficiency?: number; // Optional: Thrust multiplier in atmosphere (0-1)
  description: string;
}

export interface RulePack {
  id: string; version: string; name: string;
  distributions: Record<string, TableSpec>;
  gasMolarMassesKg?: Record<string, number>;
  orbitalConstants?: Record<string, number>;
  constructTemplates?: Record<string, CelestialBody[]>; // Templates are CelestialBody objects
  engineDefinitions?: {
    id: string;
    name: string;
    entries: EngineDefinition[];
  };
  fuelDefinitions?: FuelDefinition[];
  tagVocab: string[]; // taxonomy IDs
  prompts: PromptSpec;
  viewPresets?: ViewPresetSpec;
}

export type ViableOrbitResult = {
  success: true;
  orbit: Orbit;
} | {
  success: false;
  reason: string;
};

export interface StarSystemNode {
  id: ID;
  name: string;
  position: { x: number; y: number };
  system: System;
  viewport?: { panX: number; panY: number; zoom: number; };
}

export interface Route {
  id: ID;
  sourceSystemId: ID;
  targetSystemId: ID;
  distance: number;
  unit: string;
  lineStyle: 'solid' | 'dashed';
}

export interface Starmap {
  id: string;
  name: string;
  description: string;
  systems: StarmapSystem[];
  routes: StarmapRoute[];
  distanceUnit: string;
  unitIsPrefix: boolean;
  gridType?: 'grid' | 'hex' | 'none';
  mouseZoomDisabled?: boolean;
}
