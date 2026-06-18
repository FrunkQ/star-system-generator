// ===== types.ts =====
import type { OrbitalBoundaries } from './physics/orbits';
import type { GeoActivity } from './physics/geoActivity';
import type { ClassExplanation } from './system/classification';
import type { TravellerWorldData } from './traveller/types';
import type { ScheduledJourneyLog } from './transit/types';

export type ID = string;

export interface Visibility {
  // Deprecated, use object_playerhidden instead
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

export interface Tag { key: string; value?: string; ns?: string; manual?: boolean; coi?: boolean; inherited?: boolean; source?: string; }

export interface NodeBase {
  id: ID; name: string; parentId: ID | null; ui_parentId?: ID | null;
  placement?: string; // e.g., 'L4', 'L5', 'Surface'
  tags: Tag[]; notes?: string; gmNotes?: string; description?: string;
  
  // Player Visibility Flags
  object_playerhidden?: boolean;
  description_playerhidden?: boolean;
}

export interface Atmosphere { name: string; main?: string; pressure_bar?: number; composition: Record<string, number>; tags?: Tag[]; molarMassKg?: number; scaleHeightKm?: number; }
// A fluid layer somewhere in/on a body. location: surface ocean | subsurface (under-ice) ocean |
// atmospheric cloud deck | deep interior (conductive — drives the dynamo, §2d).
// Surface temperature decomposed by CAUSE — far more useful at the table than one min/max. Each
// component is the swing that source ALONE would produce around the mean; the totals are the
// combined worst-case extremes (coldest = pole+winter+night; hottest = equator+day+summer or a
// tidal hotspot).
export type TempSource = 'latitude' | 'seasonal' | 'diurnal' | 'locked-day' | 'locked-night' | 'tidal-hotspot';
export interface TempComponent { source: TempSource; label: string; lowK: number; highK: number; note?: string; }
export interface SurfaceTempProfile { meanK: number; totalMinK: number; totalMaxK: number; components: TempComponent[]; }

export type FluidLocation = 'surface' | 'subsurface' | 'cloud' | 'interior';
export interface FluidLayer { liquid: string; location: FluidLocation; coverage?: number; conductive?: boolean; colorHex?: string; }
export interface Hydrosphere { coverage?: number; depth_m?: number; composition?: string; tags?: Tag[]; layers?: FluidLayer[]; }
// Derived apparent colour, kept BOTH as a flattened single swatch (hex — what the flat orrery
// shows) AND as the un-mixed palette of contributions, so a future sphere/shader renderer can
// draw Earth's ocean/land/cloud mix or Jupiter's bands from the same derivation (§2e).
export type ApparentColorRole = 'surface' | 'ocean' | 'cloud' | 'ice-cap' | 'atmosphere' | 'incandescent';
export interface ApparentColorStop { hex: string; role: ApparentColorRole; weight: number; label?: string; }
export interface ApparentColor { hex: string; palette: ApparentColorStop[]; banding?: number; }
// Bulk interior makeup (mass fractions, normalised). Density + radius derive from it (§2a).
export interface Makeup { metal?: number; rock?: number; carbon?: number; ice?: number; gas?: number; }
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
  lastEditedT0?: number; // Timestamp of last manual edit
}

export interface DeltaVCapability {
  dryMassKg?: number; propMassKg?: number; isp_s?: number; maxAccel_mps2?: number;
  burns?: BurnPlan[]; allowManualDV?: boolean;
}
export interface BurnPlan { atTimeMs: number; frame: "perifocal"; dv_mps: [number,number,number]; description?: string; publishToPlayer?: boolean; }

export interface MagneticField {
  strengthGauss: number;
}

// Derived magnetism profile (§2d) — a DESCRIPTIVE, baseline-safe read of the dynamo from the
// interior makeup + rotation + conductive fluid layers. Does NOT override MagneticField.strengthGauss
// (the editable input); it explains what field the physics implies and its geometry.
export type DynamoSource =
  | 'none'                  // no convecting conductor → unshielded
  | 'iron-core'             // molten metal core (Earth, Mercury)
  | 'metallic-hydrogen'     // gas-giant deep envelope (Jupiter, Saturn)
  | 'superionic-water'      // ice-giant mantle (Uranus, Neptune — tilted/offset)
  | 'salty-ocean-induced'   // conductive subsurface ocean, induced by a host field (Europa)
  | 'suppressed';           // a dynamo damped by a non-convecting layer (polymeric C–N–H, slow spin)
export type MagnetGeometry = 'none' | 'dipolar' | 'tilted' | 'off-centre' | 'multipolar' | 'induced';
export interface Magnetism {
  source: DynamoSource;
  geometry: MagnetGeometry;
  intrinsic: boolean;                              // self-generated (vs induced by a host field)
  estimatedRangeGauss: { min: number; max: number };
  notes: string[];
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

// Autopilot wizard plan on a construct (docs/autopilot-spec.md §12). Capture-only for now — the planner
// that flies it comes later. A WHERE is a specific place OR the nearest source of a resource tag.
export type AutopilotWhere = { kind: 'place' | 'resource'; placeId?: ID; resourceKeys?: string[] }; // resource = a source of ANY of these
// Four distinct verbs. mine = resource-only (nearest source); transport = a place AND cargo/people;
// patrol = loiter/sweep a place (absorbs the old scan); explore = push outward, refuel as able.
// Dock/unload are no longer actions — they're inferred from deliverTo.
export type AutopilotAction = 'mine' | 'transport' | 'patrol' | 'explore';
export interface AutopilotLeg {
  action: AutopilotAction;
  placeId?: ID;             // transport: pickup source; patrol: where to patrol (optional)
  resourceKeys?: string[];  // mine: what to extract; transport: what to carry (cargo type or 'people/passengers')
  rate_tpd?: number;        // mine/transport fill rate (t/day) — default from the hull's capability tag
  fillAmount_t?: number;    // mine/transport — how much to take on (defaults to free cargo space)
  deliverTo?: AutopilotWhere; // mine/transport — where the cargo/people go (docking + unloading implied)
  loiterDays?: number;      // patrol — how long to loiter/sweep before moving on
}
export interface Autopilot {
  enabled: boolean;
  traversal: 'in-order' | 'best-order' | 'any';   // visit all in order / all best order / any one as needed
  legs: AutopilotLeg[];
  tardiness?: number;       // 0..1 Discipline; undefined ⇒ inherit from the Owner CoI
  planning: number;         // 0..5 lookahead — covers fuel/restock scheduling too; 0 = greedy
  drive: number;            // 0..1 Drive bias: 0 efficiency … 1 speed
  maxJourneyDays?: number;  // cap on a whole LEG (travel out, work, and return) — stops 50-year crawls
  ignoreFuel: boolean;      // simplify: this ship doesn't require or consume fuel
  ignoreSupplies: boolean;  // simplify: this ship doesn't require life-support supplies
  avoidPlaceIds?: ID[];     // locations the ship won't visit or replenish at (e.g. politically unaligned)
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

export interface CelestialBody extends NodeBase, PhysicalParameters {
  kind: 'body' | 'construct';
  roleHint: 'star' | 'planet' | 'moon' | 'barycenter' | 'construct' | 'belt' | 'ring' | 'ship';
  classes?: string[];
  orbit?: Orbit;

  // Physical parameters
  radiusKm?: number;
  radiusInnerKm?: number; // For belts/rings
  radiusOuterKm?: number; // For belts/rings
  temperatureK?: number;        // global MEAN surface temp (heat averaged over the whole body)
  // Surface temperature RANGE: cold extreme (night-side/poles/winter) → hot extreme (equator/day/
  // summer or tidal-volcanic hotspots). The mean alone hides this. (§ surface-temperature model)
  temperatureRangeK?: { min: number; max: number };
  temperatureProfile?: SurfaceTempProfile;  // the range DECOMPOSED by cause (seasonal/diurnal/…)
  tidallyLocked?: boolean;      // one face permanently toward its primary (no day/night cycle)
  obliquity_deg?: number;       // axial tilt — drives seasonal variation
  albedoBreakdown?: { albedo: number; surfaceAlbedo: number; cloudAlbedo: number; cloudCover: number; cloudSpecies?: string; note: string };
  calculatedGravity_ms2?: number;
  distanceToHost_km?: number;
  orbitalBoundaries?: OrbitalBoundaries;

  // Environment
  atmosphere?: Atmosphere;
  // Evolution opt-in. Hand-authored, imported and picker-placed bodies carry END-STATE values
  // the GM chose — absent flags mean the processor derives AROUND them but never rewrites them.
  // The generator opts its own creations in.
  evolveAtmosphere?: boolean;  // erode the atmosphere over the system age (from the atmosphere0 baseline)
  atmosphere0?: Atmosphere;    // primordial baseline escape derives from — keeps re-processing idempotent
  autoClassify?: boolean;      // let the classifier overwrite `classes` (and the type image)
  hydrosphere?: Hydrosphere;
  makeup?: Makeup;            // bulk interior composition (drives density/radius)
  biosphere?: Biosphere;
  magnetic_field?: MagneticField;
  magnetism?: Magnetism;       // derived dynamo profile (descriptive; see deriveMagnetism)
  geoActivity?: GeoActivity;   // derived tectonics/volcanism by mechanism (see deriveGeoActivity)
  habitabilityBreakdown?: {    // the AUTHORITATIVE habitability breakdown the Bio tab renders
    factors: {
      label: string; points: number; max: number; value: string; ideal: string;
      // optional numeric range so the Bio tab can draw where this body sits on the habitable band:
      // lo/hi are the score-zero edges, idealLo/idealHi the full-marks plateau, value the body's reading.
      range?: { value: number; lo: number; idealLo: number; idealHi: number; hi: number; unit: string };
    }[];
    surfaceScore: number;      // sum of the surface factors (before long-term modifiers)
    modifiers: { label: string; delta: number }[]; // geology/magnetism/super/subsurface adjustments
    finalScore: number;
    tier: string;
  };
  classification?: ClassExplanation;  // why this type was chosen (winning fingerprint + bands)

  // Legacy/Construct specifics
  physical_parameters?: PhysicalParameters;
  systems?: Systems;
  crew?: { current?: number; max?: number };
  IsTemplate?: boolean;

  engines?: Engine[]; // Array of engines attached to the construct
  fuel_tanks?: FuelTank[]; // Array of fuel tanks attached to the construct
  sensors?: SensorInstance[]; // Array of sensors attached to the construct
  autopilot?: Autopilot; // Autopilot plan (the wizard) — see docs/autopilot-spec.md
  current_cargo_tonnes?: number; // Current cargo mass in tonnes
  current_crew_count?: number; // Current number of crew members
  cargoDescription?: string; // User-editable description of the cargo
  
  // Flight Dynamics (V2)
  vector_velocity_ms?: { x: number; y: number; z?: number };
  vector_position_au?: { x: number; y: number; z?: number };
  vector_epoch_ms?: number;
  flight_state?: 'Orbiting' | 'Transit' | 'Deep Space' | 'Landed' | 'Docked';
  
  // Transit Planning Persistence
  draft_transit_plan?: any[]; // Holds TransitPlan[] for resuming sessions
  scheduled_journeys?: ScheduledJourneyLog[];
  
  // Star-only: magnetic flare activity 0..1 (drives an episodic particle dose on close planets).
  flareActivity?: number;

  // Surface Stats
  surfaceRadiation?: number;
  stellarRadiation?: number; // Raw incoming flux
  photonRadiation?: number;
  particleRadiation?: number;
  radiationShieldingAtmo?: number; // 0-1 effectiveness
  radiationShieldingMag?: number;  // 0-1 effectiveness
  equilibriumTempK?: number;
  internalHeatK?: number;
  apparentColorHex?: string;  // derived true colour (makeup + atmosphere/clouds + temperature)
  apparentColor?: ApparentColor;  // un-mixed palette behind apparentColorHex (for richer rendering)
  
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
// --- Fingerprint classifier (Phase 04 rewrite) ---
// Each planet type is described by a fingerprint: the parameter bands that define it.
// A numeric band is [min, max]; a categorical band is a string or list of accepted strings.
export type FingerprintBand = [number, number] | string | string[];
export interface Fingerprint {
  class: string;                         // e.g. "planet/ocean"
  kind: 'base' | 'modifier';             // base archetypes are mutually exclusive; modifiers stack
  match: Record<string, FingerprintBand>;// feature → defining band
  weight?: number;                       // optional score multiplier (default 1)
  note?: string;                         // human note on the type's defining traits
}
export interface ClassifierSpec {
  rules: ClassifierRule[];               // legacy additive rules (fallback when no fingerprints)
  fingerprints?: Fingerprint[];          // new per-type fingerprints (preferred when present)
  maxClasses: number;
  minScore: number;
  planetImages?: Record<string, string>;
  starImages?: Record<string, string>;
}

export interface PromptSpec { systemPreamble: string; fewShots?: Array<{input: Record<string, unknown>; output: string;}>; perEntityPrompts?: Record<string,string>; }
export interface ViewPresetSpec { defaultPlayerVisibility: { discoveredBasics: boolean; showTags: string[]; hiddenFields: string[]; }; overrides?: Array<{ match: { role?: string; class?: string; tag?: string }, visibleFields: string[], hiddenFields: string[] }>; }

export interface TableSpec { name: string; entries: Array<{ weight: number; value: unknown }>; }
export interface MetricDef { key: string; label: string; min: number; max: number; default?: number; }

export type LiquidFamily = 'water' | 'hydrocarbon' | 'cryo' | 'acid' | 'molten' | 'exotic';
export interface LiquidDef {
    name: string;
    label: string;
    meltK: number;            // melting point (K) — below this it is solid (ice)
    boilK: number;            // boiling point (K) — above this it is vapour
    colorHex?: string;        // representative surface/ocean colour (intrinsic absorption tint)
    refractiveIndex?: number; // n at visible wavelengths — sets the specular starlight share of the apparent colour
    density_gcc?: number;     // liquid density, for layering
    conductive?: boolean;     // electrically conductive (acids, molten metal) → can drive a dynamo
    biosolvent?: 'ideal' | 'alternative' | 'none';  // suitability as a solvent for life
    family?: LiquidFamily;
}

export interface FuelDefinition {
  id: string;
  name: string;
  density_kg_per_m3: number;
  description: string;
  // Tag inheritance: where this fuel can be sourced — resource/* (a deposit) or frontier/* (a refuel
  // context). availability: common = any refuel stop; manufactured = factory + raw; exotic = only where
  // its own resource tag is present. See docs/tag-inheritance.md.
  refuel_tags?: string[];
  availability?: 'common' | 'manufactured' | 'exotic';
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
  drive_tags?: string[]; // FTL drive/* tag(s) this engine confers; empty/absent = sublight. See docs/tag-inheritance.md.
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
  time?: {
    displayTimeSec?: string;
  };
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

// A ship in flight between two systems, started from the transit planner. Progress is read off the
// starmap's game clock: fraction = (displayTime − startTimeSec) / durationSec, so it advances as the
// GM plays/scrubs time. Cancelling snaps the ship back to its origin.
export interface ActiveJourney {
  id: ID;
  shipId: ID;
  shipName: string;
  fromSystemId: ID;
  toSystemId: ID;
  toBodyId?: ID | null;
  toBodyName?: string;
  mode: string;
  startTimeSec: string;   // game-clock seconds at departure (matches TemporalState string seconds)
  durationSec: number;    // outside-observer travel time
  // --- Resolution (derive-from-clock model). The journey RECORD is the source of truth; a
  // construct's displayed location is derived from it + the clock, and the persistent node move is
  // committed by reconcile only once ACTUAL time passes the (effective) end. ---
  outcome?: 'arrive' | 'return' | 'strand';   // how it ends; default 'arrive' (reaches destination)
  endedAtSec?: string;    // game-clock seconds the GM resolved it early (abandon/strand); else natural end
  strandCoast?: boolean;  // on a strand: true = keep momentum (drift on), false = stop dead. Overrides the
                          // drive-mode default. Set when the GM picks "drift" vs "stop" at the abort.
  cannotStop?: boolean;   // realistic plan that can't brake: it reaches the destination then coasts on past
                          // it (a fly-by → adrift with velocity), rather than stopping.
  toX?: number; toY?: number;  // POINT destination (starmap coords) — flying to a spot in interstellar
                          // space (e.g. a stranded ship) rather than a system. When set, the journey
                          // targets this point and "arrival" rendezvouses there (adrift) instead of docking.
  toLabel?: string;       // human label for a point destination (e.g. the target ship's name)
  fromX?: number; fromY?: number;  // POINT origin (starmap coords) — a course replotted from where the
                          // ship currently sits (e.g. a refuelled adrift ship), not a system. Symmetric
                          // with toX/toY: when set, the journey departs this point.
  fromLabel?: string;     // human label for a point origin
  redirectDvMs?: number;  // Δv spent at departure to redirect the ship's existing momentum onto the new
                          // heading (0 if it was at rest / already aligned). Recorded for the log/fuel.
}

// A construct stranded in interstellar space (a journey ended mid-flight). It no longer belongs to
// any system — it sits at a starmap position between the systems it was travelling between, and can
// be edited or relaunched on a new interstellar journey from there.
export interface AdriftConstruct {
  construct: CelestialBody;   // the full construct node (kind:'construct')
  x: number; y: number;        // starmap position (interstellar)
  fromSystemId?: ID;           // where it departed
  toSystemId?: ID;             // where it had been heading
  strandedAtSec?: string;      // game-clock seconds when it was stranded
  // Ballistic drift: a momentum drive (relativistic/torch) interrupted keeps coasting. vx/vy are
  // starmap units per game-SECOND; position is DERIVED as (x,y) + (vx,vy)·(displaySec − t0Sec). Absent /
  // zero = stationary (a jump-drive abort just stops). Stays reversible — only the anchor is stored.
  vx?: number; vy?: number;
  t0Sec?: string;              // anchor time for the drift (game-clock seconds); defaults to strandedAtSec
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

export interface TemporalHierarchyUnit {
  unit: string;
  multiplier: number;
}

export interface TemporalLeapLogic {
  drift_per_year_t: number;
  threshold_t: number;
  apply_to: string;
}

export interface TemporalMonthDefinition {
  name: string;
  days: number;
}

export interface TemporalLookupTables {
  weekdays?: string[];
  months?: TemporalMonthDefinition[];
}

export interface BucketDrainCalendarDefinition {
  id: string;
  math_type: 'BUCKET_DRAIN';
  epoch_offset_t: string;
  year_offset?: number;
  format: string;
  hierarchy: TemporalHierarchyUnit[];
  leap_logic?: TemporalLeapLogic;
  lookup_tables?: TemporalLookupTables;
}

export interface RatioLinearCalendarDefinition {
  id: string;
  math_type: 'RATIO_LINEAR';
  epoch_offset_t: string;
  format: string;
  parameters: {
    units_per_earth_year: number;
    seconds_per_earth_year: number;
    precision_digits?: number;
  };
}

export type TemporalCalendarDefinition =
  | BucketDrainCalendarDefinition
  | RatioLinearCalendarDefinition;

export interface TemporalState {
  masterTimeSec: string;
  displayTimeSec: string;
  activeCalendarKey: string;
  temporal_registry: Record<string, TemporalCalendarDefinition>;
  playbackRunning?: boolean;
  playbackRateSecPerSec?: number;
}

export interface Starmap {
  id: string;
  name: string;
  description?: string;
  gmNotes?: string;
  systems: StarSystemNode[];
  routes: Route[];
  activeJourneys?: ActiveJourney[];
  adriftConstructs?: AdriftConstruct[];   // ships stranded in interstellar space (ended a journey mid-flight)
  mapMode?: 'diagrammatic' | 'scaled';
  generationEngine?: 'standard' | 'evolutionary';
  invertDisplay?: boolean;
  scale?: StarmapScaleConfig;
  distanceUnit: string;
  unitIsPrefix: boolean;
  temporal?: TemporalState;
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
