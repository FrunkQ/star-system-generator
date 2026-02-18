// ===== types.ts =====
import type { OrbitalBoundaries } from './physics/orbits';
import type { TravellerWorldData } from './traveller/types';

export type ID = string;

export interface Visibility {
  // Deprecated, use object_playerhidden instead
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

export interface Tag { key: string; value?: string; ns?: string; }

export interface NodeBase {
  id: ID; name: string; parentId: ID | null; ui_parentId?: ID | null;
  placement?: string; // e.g., 'L4', 'L5', 'Surface'
  tags: Tag[]; notes?: string; gmNotes?: string; description?: string;
  
  // Player Visibility Flags
  object_playerhidden?: boolean;
  description_playerhidden?: boolean;
}

export interface Atmosphere { name: string; main?: string; pressure_bar?: number; composition: Record<string, number>; tags?: Tag[]; molarMassKg?: number; scaleHeightKm?: number; }
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

export interface FuelTank {
  fuel_type_id: ID;
  capacity_units: number; // e.g., liters, kg, or arbitrary units
  current_units: number;
}

export interface SensorDefinition {
  id: string;
  name: string;
  range_km: number;
  preferred_unit?: 'km' | 'AU';
  description?: string; // target_category + data_revealed combined
}

export interface SensorInstance {
  definition_id: string;
  name: string;
  range_km: number;
  description?: string;
}

export interface CelestialBody extends NodeBase {
  kind: 'body' | 'construct';
  engines?: Engine[]; // Array of engines attached to the construct
  fuel_tanks?: FuelTank[]; // Array of fuel tanks attached to the construct
  sensors?: SensorInstance[]; // Array of sensors attached to the construct
  current_cargo_tonnes?: number; // Current cargo mass in tonnes
  current_crew_count?: number; // Current number of crew members
  cargoDescription?: string; // User-editable description of the cargo
  
  // Flight Dynamics (V2)
  vector_velocity_ms?: { x: number; y: number; z?: number };
  flight_state?: 'Orbiting' | 'Transit' | 'Deep Space' | 'Landed' | 'Docked';
  
  // Transit Planning Persistence
  draft_transit_plan?: any[]; // Holds TransitPlan[] for resuming sessions
  
  // Surface Stats
  surfaceRadiation?: number;
  stellarRadiation?: number; // Raw incoming flux
  photonRadiation?: number;
  particleRadiation?: number;
  radiationShieldingAtmo?: number; // 0-1 effectiveness
  radiationShieldingMag?: number;  // 0-1 effectiveness
  equilibriumTempK?: number;
  internalHeatK?: number;
  
  // Traveller Data
  traveller?: TravellerWorldData;
}

export interface PhysicalParameters {
  dimensionsM?: [number, number, number];
  massKg?: number;
  spinRadiusM?: number;
  cargoCapacity_tonnes?: number; // Maximum cargo capacity in tonnes
  rotation_period_hours?: number;
  
  // Aerobraking Capabilities
  can_aerobrake?: boolean;
  thermal_protection_type?: 'none' | 'ceramic' | 'ablative' | 'magnetic' | 'forcefield';
  aerobrake_limit_kms?: number; // Custom override
}

export interface PowerPlant {
  type: string;
  output_MW: number;
}

export interface LifeSupport {
  max_crew?: number; // Maximum crew capacity
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
export interface ClassifierSpec { rules: ClassifierRule[]; maxClasses: number; minScore: number; planetImages?: Record<string, string>; starImages?: Record<string, string>; }

export interface PromptSpec { systemPreamble: string; fewShots?: Array<{input: Record<string, unknown>; output: string;}>; perEntityPrompts?: Record<string,string>; }
export interface ViewPresetSpec { defaultPlayerVisibility: { discoveredBasics: boolean; showTags: string[]; hiddenFields: string[]; }; overrides?: Array<{ match: { role?: string; class?: string; tag?: string }, visibleFields: string[], hiddenFields: string[] }>; }

export interface TableSpec { name: string; entries: Array<{ weight: number; value: unknown }>; }
export interface MetricDef { key: string; label: string; min: number; max: number; default?: number; }

export interface LiquidDef {
    name: string;
    label: string;
    meltK: number;
    boilK: number;
}

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
  fuel_type?: string; // Optional: The name of the fuel type
  thrust_kN: number;
  efficiency_isp: number;
  powerDraw_MW?: number; // Optional: Power drawn by the engine when active
  atmo_efficiency?: number; // Optional: Thrust multiplier in atmosphere (0-1)
  description: string;
}

export interface GasTag {
  name: string;
  trigger: string; // e.g. "pp > 0.05 AND O2_gas_present"
}

export interface GasPhysics {
  molarMass: number;
  shielding: number;
  greenhouse: number;
  specificHeat: number;
  radiativeCooling: number;
  colorHex: string | null;
  meltK: number;
  boilK: number;
  tags?: GasTag[];
}

export interface ClimateModelGreenhouseConfig {
  cryoNoPenaltyAboveK?: number;
  cryoBaseK?: number;
  cryoExponent?: number;
  cryoMinFactor?: number;
  responseScale?: number;
  responseK?: number;
  denseCo2BoostStartBar?: number;
  denseCo2BoostDenominator?: number;
  denseCo2BoostMax?: number;
}

export interface ClimateModelInternalHeatConfig {
  minPressureBarForGiants?: number;
  minHydrogenHeliumFraction?: number;
  gasGiantHeatK?: number;
  iceGiantHeatK?: number;
}

export interface ClimateModelConfig {
  greenhouse?: ClimateModelGreenhouseConfig;
  internalHeat?: ClimateModelInternalHeatConfig;
}

export interface RulePack {
  id: string; version: string; name: string;
  distributions: Record<string, TableSpec>;
  gasPhysics?: Record<string, GasPhysics>;
  climateModel?: ClimateModelConfig;
  gasMolarMassesKg?: Record<string, number>; // Legacy support (optional)
  gasShielding?: Record<string, number>; // Legacy support (optional)
  liquids?: LiquidDef[];
  orbitalConstants?: Record<string, number>;
  constructTemplates?: Record<string, CelestialBody[]>; // Templates are CelestialBody objects
  engineDefinitions?: {
    id: string;
    name: string;
    entries: EngineDefinition[];
  };
  fuelDefinitions?: {
    id: string;
    name: string;
    entries: FuelDefinition[];
  };
  sensorDefinitions?: {
    id: string;
    name: string;
    entries: SensorDefinition[];
  };
  tagVocab?: string[]; // taxonomy IDs
  prompts?: PromptSpec;
  viewPresets?: ViewPresetSpec;
  metrics?: Record<string, MetricDef>;
  classifier?: ClassifierSpec;
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
  viewport?: { pan: { x: number; y: number }; zoom: number; }; // Fixed panX/panY to pan object
  subsectorId?: string;
}

export interface Route {
  id: ID;
  sourceSystemId: ID;
  targetSystemId: ID;
  distance: number;
  unit: string;
  lineStyle: 'solid' | 'dashed';
}

export interface StarmapScaleConfig {
  unit: string;
  pixelsPerUnit: number;
  showScaleBar: boolean;
}

export interface RulePackOverrides {
  fuelDefinitions?: FuelDefinition[];
  engineDefinitions?: EngineDefinition[];
  sensorDefinitions?: SensorDefinition[];
  gasPhysics?: Record<string, GasPhysics>;
  atmosphereCompositions?: any[];
}

export interface Starmap {
  id: string;
  name: string;
  description?: string;
  systems: StarSystemNode[];
  routes: Route[];
  mapMode?: 'diagrammatic' | 'scaled';
  invertDisplay?: boolean;
  scale?: StarmapScaleConfig;
  distanceUnit: string;
  unitIsPrefix: boolean;
  rulePackOverrides?: RulePackOverrides;
  travellerMetadata?: {
    importedSubsectors: Array<{
        id: string;
        name: string;
        sectorName: string;
        subsectorCode: string;
        originCol: number;
        originRow: number;
    }>;
  };
}
