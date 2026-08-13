// ===== types.ts =====
import type { OrbitalBoundaries } from './physics/orbits';
import type { GeoActivity } from './physics/geoActivity';
import type { VolatileRetention } from './physics/volatileRetention';
import type { ClassExplanation } from './system/classification';
import type { TravellerWorldData } from './traveller/types';
import type { ScheduledJourneyLog } from './transit/types';

export type ID = string;

export interface Visibility {
  // Deprecated, use object_playerhidden instead
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

// `origin` states where a tag came from and therefore what may delete it — see tags/tagLifecycle.ts,
// which is the only place that interprets it. It is OPTIONAL and inferred from the flags below when
// absent, so the existing writers did not have to change; set it explicitly on new ones.
export interface Tag {
  key: string; value?: string; ns?: string;
  origin?: 'physics' | 'rule' | 'authored' | 'manual' | 'inherited' | 'derived';
  override?: true;   // manual, inside a namespace the engine derives — it wins that key
  secret?: true;     // never reaches a player surface (see tags/tagLifecycle redactTagsForPlayers)
  manual?: boolean; coi?: boolean; inherited?: boolean; source?: string;
}

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
export interface ImageRef { url: string; title?: string; credit?: string; license?: string; sourceUrl?: string; custom?: boolean; }
// A construct's 3D model (G3). The binary is a normalised GLB in the hash-addressed model store
// (src/lib/constructs/modelStore.ts) — never inline here, because the whole node JSON rides every
// broadcast snapshot resend. Attribution fields mirror ImageRef: CC-BY models are allowed
// (owner decision 5), so credit/license/sourceUrl must survive export and share with the ref.
export interface ModelRef {
  // A BUNDLED model — an app-relative path such as `/models/nasa/iss.glb`. The file ships with
  // the app, so every browser already has it: nothing goes in the model store, nothing is
  // embedded in a save, and nothing crosses the broadcast. A bundled ref needs no `hash`.
  url?: string;
  hash?: string;           // content hash (SHA-256 hex) of a GM-UPLOADED GLB — the store key
  name?: string;           // display name (source filename or model title)
  sourceFormat?: 'glb' | 'stl' | 'obj'; // what the GM uploaded, before conversion
  triangles?: number;      // triangle count of the stored (post-simplify) mesh
  bytes?: number;          // stored GLB size in bytes
  hadMaterials?: boolean;  // false = source carried no materials (every STL): tint applies by default
  // Hull finish (design §5's procedural menu): how the model is dressed when the map style is
  // 'filled'. Absent = flat-shaded tint + panel lines for material-less sources, authored
  // materials untouched for GLBs. A wireframe map style overrides every finish (F6 parity).
  finish?: 'flat' | 'cel' | 'matcap' | 'blueprint' | 'plated' | 'patina' | 'iridescent';
  // Orientation fix from the import preview (unit quaternion x,y,z,w), applied at VIEW time rather
  // than baked into the binary — so a compliant GLB stores byte-identical and keeps its compression.
  // CONVENTION (aligned by the modal's drive marker): after orient, the NOSE points +Z and the MAIN
  // DRIVE points -Z — so a scene can lookAt(velocity) and the engines honestly point aft.
  orient?: [number, number, number, number];
  // Drive nozzles, in the model's OWN normalised space (the space `orient` then rotates), so a
  // later re-orientation never strands them. Empty/absent = one plume at the stern-face centre,
  // which is right for most hulls; the editor's placer exists for the ones it is not (offset or
  // multiple drives). `nozzleScale` sizes them all, 1 = the default width.
  nozzles?: [number, number, number][];
  nozzleScale?: number;
  // Livery accent. Absent = DERIVED from the ship's colour (a seeded complementary hue), which is
  // the default and needs no authoring; set it to pin the contrast instead of taking the roll.
  accentHex?: string;
  title?: string; credit?: string; license?: string; sourceUrl?: string;
  custom?: boolean;        // GM-uploaded — the processor must never overwrite
}

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
  // C3: the plane this orbit's inclination is quoted in. Absent = the parent's EQUATOR for a
  // satellite (the usual convention for a regular moon) and the system plane for anything else;
  // 'ecliptic' = the system plane, for a satellite far enough out that the Laplace plane has handed
  // over from the bulge to the star's tide (Luna, Phoebe). The field already ships in the bundled
  // maps and holo/scene.ts already reads it — through `as any`, which is why it drifted untyped.
  frame?: 'ecliptic';
}

export interface DeltaVCapability {
  dryMassKg?: number; propMassKg?: number; isp_s?: number; maxAccel_mps2?: number;
  burns?: BurnPlan[]; allowManualDV?: boolean;
}
export interface BurnPlan { atTimeMs: number; frame: "perifocal"; dv_mps: [number,number,number]; description?: string; publishToPlayer?: boolean; }

export interface MagneticField {
  strengthGauss: number;
  // F-OVR: true once the GM has manually set the field. A manual value OVERRIDES the derived
  // magnetism model — it governs the magnetic/* shielding tags (0 → unshielded, >0 → dynamo/
  // induced) instead of the interior dynamo read. Absent/false → the field follows the model.
  manual?: boolean;
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
  nominalGauss: number;                            // a single representative strength (rotation + composition + size scaled); the field derives from this unless the GM overrides it
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
// Verbs = behaviours × targeting modes (the underlying abstraction):
//   HAUL family   — gather/carry then deliver:  mine (resource-targeted) ↔ transport (place-targeted)
//   LOITER family — go somewhere + dwell:        explore (resource-targeted) ↔ patrol (place-targeted)
//   ESCORT        — shadow a MOVING construct at a standoff distance (dynamic target, not a fixed point).
// Place-targeted = anchored to a specific body/station (placeId); resource-targeted = nearest source of
// resourceKeys. Dock/unload are inferred from deliverTo. Scan folded into patrol.
// FLYBY = loiterDays === 0: don't stop, keep delta-v, momentum-carry to the next leg (planner BANKED —
// it must coast/scrub/slingshot per junction, breaking the come-to-rest assumption of every other leg).
export type AutopilotAction = 'mine' | 'transport' | 'patrol' | 'explore' | 'escort';
export interface AutopilotLeg {
  action: AutopilotAction;
  placeId?: ID;             // place-targeted: transport pickup source / patrol location / escort target (a construct)
  resourceKeys?: string[];  // resource-targeted: mine what to extract / explore what to seek; transport: cargo (incl 'people/passengers')
  rate_tpd?: number;        // haul fill rate (t/day) — default from the hull's capability tag
  fillAmount_t?: number;    // haul — how much to take on (defaults to free cargo space)
  deliverTo?: AutopilotWhere; // haul — where the cargo/people go (docking + unloading implied)
  loiterDays?: number;      // loiter — days to loiter/scan/survey before moving on; 0 ⇒ flyby (don't stop, keep delta-v)
  noRevisit?: boolean;      // loiter — skip places already in the ship's log (defaults on for explore)
  escortKm?: number;        // escort — standoff distance to hold from the shadowed construct (0 = formation; large = outside sensor range)
}
export interface Autopilot {
  enabled: boolean;
  traversal: 'in-order' | 'best-order' | 'any';   // visit all in order / all best order / any one as needed
  legs: AutopilotLeg[];
  repeat: boolean;          // true ⇒ loop the route forever; false ⇒ run once, then flag green + auto-disengage
  tardiness?: number;       // 0..1 Discipline; undefined ⇒ inherit from the Owner CoI
  planning: number;         // 0..5 lookahead — covers fuel/restock scheduling too; 0 = greedy
  drive: number;            // 0..1 Drive bias: 0 efficiency … 1 speed
  maxAccelG?: number;       // hard accel cap (g) on transit, below the drive's limit; undefined ⇒ full thrust. Comfort/economy, or cap a lead ship so slow escorts keep up
  maxJourneyDays?: number;  // cap on a whole LEG (travel out, work, and return) — stops 50-year crawls
  ignoreFuel: boolean;      // simplify: this ship doesn't require or consume fuel
  ignoreSupplies: boolean;  // simplify: this ship doesn't require life-support supplies
  avoidPlaceIds?: ID[];     // locations the ship won't visit or replenish at (e.g. politically unaligned)
}
// One entry in a construct's autopilot FLIGHT LOG — the deterministic ledger the planner appends to as it
// commits a route (work that happens at the STOPS, between transit journeys). ShipLogPane renders these merged
// and time-sorted with the journeys; the Totals tab derives every aggregate (tonnes/annum, loops, on-time %)
// purely by reducing over them, so there is no extra mutable cargo/fuel state to keep in sync. Timestamps are
// universe-seconds (bigint string, like ScheduledJourneyLog.createdAtSec); events are scrubbable by atSec.
export type ConstructLogKind = 'depart' | 'arrive' | 'load' | 'unload' | 'mine' | 'refuel' | 'loiter' | 'stuck' | 'disengage';
export interface ConstructLogEvent {
  id: ID;
  journeyId?: ID;        // the ScheduledJourneyLog this stop belongs to — pruned together on cancel/clear
  atSec: string;         // when it happens (universe-seconds)
  kind: ConstructLogKind;
  text: string;          // human breadcrumb, e.g. "Loaded 120 t water-ice at Enceladus"
  placeId?: ID;          // where it happened
  resourceKey?: string;  // load / unload / mine — what moved
  tonnes?: number;       // load / unload / mine — cargo mass moved (+aboard for load/mine, −aboard for unload)
  durationSec?: number;  // load / unload / mine happen OVER the dwell, so cargo ramps rather than steps
  fuelKg?: number;       // refuel — fuel taken on
  plannedAtSec?: string; // the on-time baseline (vs atSec once tardiness slack is applied) — for on-time %
  fromConstructId?: ID;  // set only on a DERIVED incoming-visit event (see transit/constructInteractions.ts) — the visiting ship
}
// Routes "Under autopilot" attention marker: red = stuck (can't proceed), orange = needs GM decision,
// green = finished a once-route (auto-disengaged). Derived by the planner; null = running fine.
export type AutopilotAttention = 'stuck' | 'intervention' | 'done';

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
  auroraEmitters?: AuroraEmitter[];  // resolved at process time from atmosphere × gas AuroraBand data
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
  tidallyLocked?: boolean;      // one face permanently toward its primary (planet or star)
  starTidallyLocked?: boolean;  // locked specifically to its STAR → a permanent substellar face (eyeball)
  oblateness?: number;          // DERIVED equatorial flattening f=(a−c)/a from spin vs the breakup limit; renderers draw the squashed shape
  /** @deprecated A second name for `axial_tilt_deg`, kept only so `importFixup` can recover it from
   *  older saves and delete it. Nothing reads it. Write `axial_tilt_deg`. */
  obliquity_deg?: number;
  albedoBreakdown?: { albedo: number; surfaceAlbedo: number; cloudAlbedo: number; cloudCover: number; cloudSpecies?: string; note: string };
  // F-OVR: GM overrides for otherwise-derived scalars. A key being PRESENT means the GM pinned that
  // value — it is saved and fed into the derivation instead of the computed default, with a reset that
  // deletes the key and hands control back to the physics. (magneticField uses its own `manual` flag.)
  overrides?: {
    albedo?: number;              // Bond albedo 0..1 (else derived from makeup + cloud decks)
    gasThermalInflation?: number; // gas-giant radius inflation factor (else derived from insolation)
    radiogenicHeatK?: number;     // GM radiogenic-heat override (+K): adds surface heat AND geological vigor
  };
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
  volatiles?: VolatileRetention; // derived surface-ice retention per species (see deriveVolatileRetention)
  irradiationDose?: number;    // derived cumulative space-weathering dose (relative) — drives tholins
  // Radiation is reported as TWO named figures because one number cannot answer both questions
  // (inbox B22): `surfaceRadiation` is the ground, or for a surfaceless body the 1-bar reference
  // level; `orbitalRadiation` is the environment above the atmosphere, which for a magnetised body
  // means inside its own trapped belt. `beltInnerEdgeRadii` is where that belt begins, in body radii.
  orbitalRadiation?: number;
  beltInnerEdgeRadii?: number;
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
  model?: ModelRef; // construct 3D model (G3) — sibling of `image`; photo wins in the info block, model next, glyph last

  engines?: Engine[]; // Array of engines attached to the construct
  fuel_tanks?: FuelTank[]; // Array of fuel tanks attached to the construct
  sensors?: SensorInstance[]; // Array of sensors attached to the construct
  autopilot?: Autopilot; // Autopilot plan (the wizard) — see docs/autopilot-spec.md
  autopilotStuckReason?: string; // why the planner couldn't plot a course (surfaced in the Autopilot tab); cleared on success
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
  flight_log?: ConstructLogEvent[]; // autopilot flight log — events the planner emits at stops (see docs/autopilot-spec.md §7)
  
  // Star-only: magnetic flare activity 0..1 (drives an episodic particle dose on close planets).
  flareActivity?: number;

  // Self-luminous substellar (brown-dwarf-mass) body — set by the processor's substellar pass. Such a
  // body radiates its own heat (so its surface reads ≈ selfLuminousTeffK) and irradiates its moons.
  isSelfLuminous?: boolean;
  selfLuminousTeffK?: number;       // own photosphere effective temperature (K)
  internalLuminositySolar?: number; // own luminosity in L☉ (what it shines on its moons)

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
  image?: ImageRef;           // type/artwork image; ImageRef.custom = a GM-uploaded picture the processor won't overwrite
  
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
  // Authorship credit — shown under the main star and editable on its "System Info" tab. Authored data,
  // saved with the system; never stripped by the import fix-up.
  credits?: { author?: string; contact?: string; created?: string; version?: string };
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
  // PRECONDITIONS. Every gate band must hold or the type scores 0, but a gate contributes
  // NOTHING to the score — no fit, no band count. Use it for "is this body eligible to be this
  // kind of thing at all" (a gas giant has no surface, so it cannot be an eyeball), as opposed to
  // `match`, which is for traits that DEFINE the type and should make it more specific.
  // The distinction is not cosmetic: a gate expressed as a match band is always-true for every
  // body that survives it, and averaging an always-1 band in DILUTES a poor defining band —
  // lifting a 0.11-fit match by 37% while lifting a perfect one by only 8%. It rewards the worst
  // matches most, which is how a 289 K world briefly classified as a cold eyeball (B25).
  gate?: Record<string, FingerprintBand>;
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

export type LiquidFamily = 'water' | 'hydrocarbon' | 'cryo' | 'acid' | 'molten' | 'exotic' | 'internal';
export interface LiquidDef {
    name: string;
    label: string;
    meltK: number;            // melting point (K) — below this it is solid (ice)
    boilK: number;            // boiling point (K) at 1 bar — above this it is vapour
    colorHex?: string;        // representative surface/ocean colour (intrinsic absorption tint)
    refractiveIndex?: number; // n at visible wavelengths — sets the specular starlight share of the apparent colour
    density_gcc?: number;     // liquid density, for layering
    conductive?: boolean;     // electrically conductive (acids, molten metal) → can drive a dynamo
    biosolvent?: 'ideal' | 'alternative' | 'none';  // suitability as a solvent for life
    family?: LiquidFamily;
    // Pressure-phase data (docs/dev/liquids-phase-tags.md §3). All optional — absent means the
    // legacy 1-atm behaviour with no sublimation floor and no supercritical ceiling.
    tripleBar?: number;       // below this pressure there is NO liquid phase (sublimation regime)
    criticalK?: number;       // above this temperature the substance is supercritical at any pressure
    criticalBar?: number;     // pressure at the critical point (upper anchor of the boil curve)
    incandescent?: boolean;   // self-luminous when molten (magma / molten metals): drives a temperature-
                              // scaled thermal-glow emissive layer, so the ocean glows even under a dim star
    cloudOpacity?: number;    // 0..1 veil strength when this substance condenses as a CLOUD DECK
                              // (how opaquely it hides what is beneath). Absent → a moderate default.
    cloudTintDistance?: number; // 0..255: how far from WHITE a deck of this condensate sits. Droplets
                              // that only scatter go white however dark the liquid (water, ~60); a
                              // suspension whose particles absorb keeps its colour (Jupiter's brown
                              // hydrosulphide, martian dust). Absent → the scattering default.
    cloudAlbedo?: number;     // 0..1 REFLECTIVITY of a deck of this condensate — the share of starlight
                              // a fully-covered sky of it sends back out. Distinct from cloudOpacity:
                              // opacity is what it hides, this is what it returns. Feeds Bond albedo,
                              // and through it equilibrium temperature. Absent → a moderate default.
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
  // G15(4): the drive plume's colour is pack DATA per the architecture rule (a GM-editable look
  // lever). Absent = the renderer's hot blue-white default. The host passes it to the scene as
  // look-data; the scene never reads the pack.
  exhaust_color_hex?: string;
}

export interface GasTag {
  name: string;
  trigger: string; // e.g. "pp > 0.05 AND O2_gas_present"
}

// One auroral emission band a gas produces when excited at the magnetic poles. A gas can have MORE
// THAN ONE (atomic oxygen glows apple-green in its main band AND deep-red crimson high above), so this
// is an ARRAY on the gas. efficiency = brightness per unit concentration (atomic oxygen glows far
// brighter per molecule than N₂). altitude 0=low fringe, 1=main band, 2=high tenuous band (stacks the
// renderer's shells). minFraction gates a band to gas-rich atmospheres (the crimson crown only appears
// when the oxygen column is thick).
export interface AuroraBand {
  colour: string;        // human name (e.g. 'green', 'crimson') — for the trace/description
  hex: string;           // emission colour
  efficiency: number;    // brightness weight per unit gas fraction
  altitude: number;      // 0 low | 1 main | 2 high
  minFraction?: number;  // only emit when the gas fraction is at least this (default 0)
}

// A resolved auroral emitter present on a specific body, weight-normalised (dominant first). Derived
// from the atmosphere composition × each gas's AuroraBand data at process time and stored on the body,
// so every renderer draws the same colours without needing the rule pack.
export interface AuroraEmitter { gas: string; colour: string; hex: string; weight: number; altitude: number; }

// Cloud formation for a gas (absent = not cloud-forming). condensesTo names the LIQUID whose data
// gives the deck its look (colour, cloudOpacity, meltK for ice-crystal vs droplet); minFraction is
// the partial-fraction floor below which no deck forms. See docs/dev/cloud-decks-design.md.
export interface GasCloud { condensesTo: string; minFraction?: number; }
// A reaction PRODUCT declares its recipe (NH4SH from NH3 + H2S). The product's effective fraction
// derives from its constituents at process time: min(constituents) × yield, constituents depleted
// by the amount converted. `yield` (0..1, default 1) models photochemical traces — Titan's HCN is
// made from N2 + CH4 but converts only a sliver, not min(0.95, 0.05). One generation only — a
// product cannot itself react further. This is NOT a chemistry database: only reactions someone
// cares about are defined, and users add their own ("Krypton + Unobtanium = pink bubblegum").
export interface GasReaction { from: string[]; yield?: number; }

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
  aurora?: AuroraBand[];  // auroral emission bands (empty/absent = this gas does not fluoresce)
  cloud?: GasCloud;       // cloud formation (absent = this gas never forms a deck)
  reaction?: GasReaction; // this gas is a reaction product of other gases (absent = primary gas)
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
  // The system was renamed independently of its primary star. While false/undefined the map label
  // defaults to (and tracks) the primary star's name; once the GM sets a custom system name this
  // pins it, so renaming the star no longer overwrites it.
  isNameUserDefined?: boolean;
  // WS7: optional DEPTH. Absent is treated as the reference plane (0), so every existing campaign
  // loads byte-identical. Whether z counts toward DISTANCE is the campaign's choice — see
  // Starmap.ignoreZForDistances and lib/map/systemDistance.ts.
  position: { x: number; y: number; z?: number };
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
  name?: string; // optional label, drawn in small text along the route line
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
  liquids?: LiquidDef[];
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
  // Persistent broadcast session identity (docs/dev/vtt-integration-design.md 9.1/1A): minted once
  // by ensure-on-load in the GM route, saved with the map, FROZEN across renames so player links/QRs
  // and VTT configs survive GM restarts and PC moves. Human-readable: name slug + 2 words + 3 digits.
  // Regeneration is a deliberate revocation action, never automatic.
  broadcastId?: string;
  systems: StarSystemNode[];
  routes: Route[];
  activeJourneys?: ActiveJourney[];
  adriftConstructs?: AdriftConstruct[];   // ships stranded in interstellar space (ended a journey mid-flight)
  mapMode?: 'diagrammatic' | 'scaled';
  // PROVENANCE (M1). Two independent stamps, both optional so every existing file still loads:
  //  - `appVersion`: the build that last SAVED this map. Written on every save. Its ABSENCE is itself
  //    information — it means the file predates 2.1.271-beta, which is what the base-map upgrade offer
  //    keys on (see docs/dev/v2.2-player-view-visual-overhaul.md, WS8).
  //  - `baseMapVersion`: which edition of a BUNDLED starter map this descends from. Set by the shipped
  //    maps (static/example-starmaps/manifest.json), carried through saves untouched, and never invented
  //    for a map the GM built themselves — a map with no base has no base version.
  appVersion?: string;
  baseMapVersion?: number;
  generationEngine?: 'standard' | 'evolutionary';
  invertDisplay?: boolean;
  scale?: StarmapScaleConfig;
  // The GM's live snap-grid, injected into the player broadcast (not persisted) so the player-view
  // starmap can draw the IDENTICAL grid at the same cell size. `size` is the cell size in map units.
  mapGrid?: { type: 'grid' | 'hex' | 'traveller-hex' | 'none'; size: number };
  distanceUnit: string;                        // INTERSTELLAR map unit (ly / pc / diagrammatic) — see mapMode
  unitIsPrefix: boolean;
  // WS7: when true, system DEPTH is presentational only and distances stay planar as they always were.
  // Default (absent/false) = depth COUNTS, which is the honest answer. The 3D view's z-exaggeration is
  // a separate display-only control and never affects distance.
  ignoreZForDistances?: boolean;
  measurementUnits?: 'metric' | 'imperial';    // IN-SYSTEM distance/speed display: km/km·s (default) vs miles/mph
  temperatureUnit?: 'C' | 'F' | 'K';            // temperature display: °C (default) / °F / Kelvin — its own switch
  systemEdgeAu?: number;                        // "leaves the system" boundary in AU; unset = the star's Hill limit

  // Unified player-view presets + their uploaded graphics are campaign data — saved with the map.
  // See $lib/player and docs/dev/unified-player-view-design.md. Optional: absent on old maps.
  playerPresets?: import('./player/presetTypes').PlayerPreset[];
  playerAssets?: import('./player/presetTypes').PlayerAsset[];

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
