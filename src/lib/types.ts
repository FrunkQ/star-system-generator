// ===== types.ts =====
import type { OrbitalBoundaries } from './physics/orbits';
import type { CircumbinaryAnnulus } from './physics/circumbinary';
import type { GeoActivity } from './physics/geoActivity';
import type { VolatileRetention } from './physics/volatileRetention';
import type { ClassExplanation } from './system/classification';
import type { TravellerWorldData } from './traveller/types';
import type { ScheduledJourneyLog } from './transit/types';
import type { PackListDelta } from './rulepackDelta';

export type ID = string;

export interface Visibility {
  // Deprecated, use object_playerhidden instead
  visibleToPlayers: boolean;
  fields?: Record<string, boolean>;
}

// `origin` states where a tag came from and therefore what may delete it — see tags/tagLifecycle.ts,
// which is the only place that interprets it. It is OPTIONAL and inferred from the flags below when
// absent, so the existing writers did not have to change; set it explicitly on new ones.
/** G54: the disclosure ladder — see `Tag.disclosure` and `tagLifecycle.redactTagsForPlayers`. */
export type TagDisclosure = 'hidden' | 'anonymous' | 'open';

export interface Tag {
  key: string; value?: string; ns?: string;
  origin?: 'physics' | 'rule' | 'authored' | 'manual' | 'inherited' | 'derived';
  override?: true;   // manual, inside a namespace the engine derives — it wins that key
  secret?: true;     // LEGACY SPELLING of `disclosure: 'hidden'`. Read it ONLY through
                     // `tagLifecycle.tagDisclosure()`, never directly (G54, engine-map TAG-24).
  /**
   * G54 — THE DISCLOSURE LADDER, and the rung in the middle is the whole point.
   *
   *   `hidden`     stripped entirely. The player sees the consequence and no cause.
   *   `anonymous`  the tag's PRESENCE survives; its IDENTITY does not — "something is here and I am
   *                not telling you what". It reaches a player as one neutral placeholder tag.
   *   `open`       the full tag.
   *
   * Absent means `open`, so nothing that exists today moves. Applied at exactly ONE point
   * (`tagLifecycle.redactTagsForPlayers`, engine-map TAG-9); nothing else may act on it, because a
   * second site is how a leak happens.
   */
  disclosure?: TagDisclosure;
  manual?: boolean; coi?: boolean; inherited?: boolean; source?: string;
}

// G53 §3.5/§4.2: A MEGA-CONSTRUCT'S PLACEMENT PREDICATE, SPLIT BY CLAUSE KIND — the owner's own
// correction, and the split is the rule. `hard` is RELEVANCE: the option has no referent without it
// (a space elevator with no surface to anchor to is meaningless, not implausible), so it greys and
// that is final. `steer` is PLAUSIBILITY: the placement is meaningful and the numbers are bad, so
// it TAGS AND EXPLAINS and never refuses — alien tech, unobtanium and PlotDevice live here.
// The test an implementer can apply: is there a HOST FEATURE the object attaches to or depends on?
// Absent = relevance = hard. Present but the numbers are bad = plausibility = steer.
// `inHabitableZone` is a steer clause and MUST NEVER be hard (a ring at 3 AU is legitimate and
// cold; the engine owes it a temperature, not a refusal) — the evaluator demotes it if a pack
// author promotes it. Lives in types.ts because it is PACK DATA (rule-pack templates author it);
// the registry (`constructs/megaTypes.ts`) carries per-type defaults in the same shape.

/** RELEVANCE — greys the option, final. Each clause names a host feature the object depends on. */
export interface MegaHardClauses {
  /** The host's roleHint ('planet' | 'moon' | 'star') or kind 'barycenter'. */
  hostKind?: readonly string[];
  /** The host must have a surface to anchor to — not a gas giant, not a star. */
  hasSurface?: true;
  /** The object circles a star; anything else has nothing to circle. */
  hostIsStar?: true;
  /** A REAL geostationary altitude — not OrbitalBoundaries' fallback. */
  needsGeostationary?: true;
}

/** PLAUSIBILITY — tags and explains, never refuses. Published numbers, not walls. */
export interface MegaSteerClauses {
  /** Geostationary should sit well inside the Hill sphere; above this fraction the tether is marginal. */
  geoBelowHillFraction?: number;
  /** The goldilocks-zone RECOMMENDATION (the owner's word). NEVER a hard clause — see above. */
  inHabitableZone?: true;
  /** Beyond this many AU the collector intercepts almost nothing. */
  maxPlacementAU?: number;
  minHostMassKg?: number;
  maxHostMassKg?: number;
}

export interface MegaRequires {
  hard?: MegaHardClauses;
  steer?: MegaSteerClauses;
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
export type ApparentColorRole = 'surface' | 'vegetation' | 'ocean' | 'cloud' | 'ice-cap' | 'atmosphere' | 'incandescent';
// `hex` is APPEARANCE — the material as this world's own light leaves it. `rawHex` is the MATERIAL,
// the authored reflectance before any star touched it. The surface view needs the second: painting a
// scene from `hex` and then re-lighting it lights everything twice, and the "at home" half of the
// comparison would show the world under its own sun rather than under ours.
export interface ApparentColorStop { hex: string; role: ApparentColorRole; weight: number; label?: string; rawHex?: string; }
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

// G43: the AUTHORED co-orbital relationship — "this node rides a Lagrange point of that body".
// The node stays a child of the SECONDARY'S OWN HOST (the star/barycentre) — a trojan orbits the
// star, and sits outside the secondary's Hill sphere by construction — and the ENGINE derives its
// `orbit` from the secondary's every pass (physics/lagrange.ts owns the one convention). The loose
// `placement` string ('L4'/'L5') is display-legacy; this is the load-bearing record.
export type LagrangePointId = 'l1' | 'l2' | 'l3' | 'l4' | 'l5';
export interface CoOrbital {
  hostId: ID;             // the SECONDARY whose point this is (a planet, moon, or barycentre)
  point: LagrangePointId; // l4 leads, l5 trails (in the secondary's direction of motion)
}

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
  // The COMMITTED surface field. On a planet or moon it is DERIVED every pass from the interior
  // dynamo (`magnetism.nominalGauss`), or from `overrides.magneticFieldGauss` when the GM has pinned
  // one. On a STAR it is authored input, written by the star editor and never re-derived.
  //
  // G37: it used to carry a `manual?: boolean` of its own — a second convention for the one concept
  // `body.overrides` already expresses, so a GM-pinned field was invisible to everything that asked
  // "what has been overridden here". The flag is gone; `importFixup` recovers it from older saves
  // into `overrides.magneticFieldGauss`.
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
  nominalGauss: number;                            // a single representative strength (rotation + composition + size scaled); the field derives from this unless the GM overrides it
  notes: string[];
}

/** One morphology present on a world, with how much of the LAND it paints.
 *
 *  COVERAGE IS OF THE LAND, NOT A SHARE OF IT. The layers stack painter-style in list order, so
 *  microbial at 80%, fungal at 50% and flora at 60% are independent statements and may sum well past
 *  100% without being wrong — fungal paints its 50% over whatever microbial already covered. Two
 *  people will otherwise implement this two ways (inbox G19). */
export interface BiosphereLayer {
  morphology: string;   // a key into the rule pack's morphology definitions — NOT a closed union
  coverage: number;     // 0..1 of the land, painted OVER the layers before it
  /** An AUTHORED colour for this layer, replacing whatever the model would have chosen.
   *
   *  It exists because a biosphere that does not photosynthesise has no pigment and therefore takes
   *  no colour from its star — the derivation correctly has nothing to say, and somebody has to. A
   *  chemosynthetic mat is whatever its chemistry makes it, and that is a GM's call.
   *
   *  Offered on EVERY layer rather than only the ones that need it, because "microbial gets a colour
   *  picker" would be a rule about microbial. It is an INPUT — nothing re-derives it — which is why
   *  it is stored here with the rest of the authored biosphere rather than arriving as a tag. */
  colorHex?: string;
}

export interface Biosphere {
  complexity: 'simple' | 'complex';
  coverage: number;
  biochemistry: 'water-carbon' | 'ammonia-silicon' | 'methane-carbon';
  energy_source: 'photosynthesis' | 'chemosynthesis' | 'thermosynthesis';
  /** Ordered, deepest FIRST — THE ORDER IS THE HIERARCHY, and it is what makes the render a
   *  painter's algorithm (plant life covers fungal, fungal colours microbial).
   *
   *  Widened from the closed union `('microbial'|'fungal'|'flora'|'fauna')[]` deliberately (G19):
   *  a user-extensible list cannot be a closed union, so a morphology is now a KEY into pack data,
   *  the same move gases and liquids already made. Saved campaigns carry bare strings and still
   *  load — `biosphereLayers()` in physics/vegetation.ts is the ONE reader that normalises both
   *  forms, so there is no second store of this fact and nothing to keep in sync. */
  morphologies: (string | BiosphereLayer)[];
}

/** One absorption feature of a pigment: a Gaussian in wavelength. */
export interface PigmentBand { centreNm: number; widthNm: number; strength: number; }

/** A photosynthetic pigment as RULE-PACK DATA. Its colour is NOT authored — it is whatever the
 *  pigment fails to absorb out of the light that actually reaches the ground, which is why the same
 *  pigment presents green under one star and near-black under another. */
export interface PigmentDef {
  key: string;
  label: string;
  bands: PigmentBand[];
  baselineAbsorptance?: number;   // flat absorption across the whole grid (melanin ≈ 0.8)
  note?: string;
}

/** How the competing selection pressures are weighed. All of it is pack data because none of it is
 *  settled science — see the three competing explanations on /physics#biosphere. */
export interface PigmentModelConfig {
  // The three weights are EXPONENTS — the pressures multiply rather than adding, so each one
  // switches itself off in the regime where it stops meaning anything. See scorePigments.
  captureWeight: number;        // photons absorbed, saturating
  protectionWeight: number;     // damage avoided at high flux and at the high-energy end
  steadinessWeight: number;     // steadiness of supply — absorbing on the flanks, not at the peak
  /** Flat absorption of the ORGANISM the pigment sits in — water and structure, neither of them a
   *  mirror. It is what makes a leaf dark green rather than a bright paint chip. */
  tissueAbsorptance: number;
  /** The photon flux at which a photosystem stops keeping up, photons·m⁻²·s⁻¹. Real vegetation
   *  light-saturates at a fraction of full sunlight; this is the number that says at what fraction,
   *  and it is what makes selectivity scale with available energy rather than being thresholded. */
  saturationFlux: number;
  /** The red limit of the reaction centre, nm. Everything a pigment absorbs shorter than this is
   *  converted at the same fixed yield, so the excess energy is dumped as heat — the term that tells
   *  a blue absorber apart from a red one. */
  reactionCentreNm: number;
  damageThresholdNm: number;    // photons shorter than this start doing harm as well as work
  damageScale: number;          // how hard overload is punished
  viabilityFraction: number;    // a pigment is viable at this fraction of the best score
  drawSharpness: number;        // how sharply the weighted draw favours the leaders
}

/** One life morphology as RULE-PACK DATA. ONE uniform record; there are no special rules and no
 *  render modes. A morphology that contributes no colour has an EMPTY tint list and zero pigment
 *  drive; one that contributes no light has an EMPTY light range. Adding a sixth morphology is
 *  another entry in this list and no code at all. */
export interface MorphologyDef {
  key: string;
  label: string;
  order: number;                    // painter order — lower paints first, deeper
  defaultCoverage: number;          // 0..1 of the land, when a GM switches it on
  tints: string[];                  // candidate surface colours; EMPTY = contributes no colour of its own
  pigmentDriven: number;            // 0..1 how far the derived pigment colour replaces the tint
  opacity: number;                  // how completely this layer hides what is beneath it
  light: { min: number; max: number }; // night-side emission, 0..1; an EMPTY range means no lights
  /** What the night side GLOWS, as a hex. Absent = the sodium-amber a human city reads as from
   *  orbit, which is the honest default for `techno` and what this always drew.
   *
   *  IT IS DATA BECAUSE THE ALTERNATIVES ARE NOT VARIANTS OF A CITY: a bioluminescent forest, a
   *  methane-flare industry and somebody's purple arc-light are the same MODEL with a different
   *  number, and the moment the colour lives in the painter they need branches instead. The painter
   *  derives its dimmer arterial tone from this one colour, so a GM picks one swatch, not two. */
  lightHex?: string;
  /** How far past ORDINARY DRY GROUND this morphology can hold, as a fraction of the world's water.
   *
   *  0 = strictly dry land. Plants get a little, because a shallow shelf is lit to the bottom and
   *  green. Technological life gets ALL of it — a civilisation that has covered its continents roofs
   *  its seas next, and the ocean becomes the floor it stands on rather than a boundary.
   *
   *  ONE number, TWO consequences, because they are the same claim: it also says how far the
   *  morphology holds ground that is under ICE. Something that can roof an ocean is not stopped by a
   *  glacier, and a planet-wide city has poles like everywhere else. A shelf-bound plant has neither.
   *
   *  This is the field that makes "only technology takes the seas and the caps" true WITHOUT a rule
   *  saying so. Nothing in the code knows what `techno` is; it simply has a 1 here. */
  waterReach: number;
  note?: string;
}

/** The spectrum that actually reaches the reference level, and the filter it came through.
 *  PHY-2 — WHAT: spectral irradiance. WHERE: named by `level`. UNITS: W·m⁻²·nm⁻¹ on GRID_NM. */
export interface SurfaceSpectrum {
  level: 'surface' | '1 bar';   // NAME THE LEVEL. A giant has a level, not a surface (B18/B22).
  starTempK: number;
  distanceAU: number;
  totalTopWm2: number;
  totalSurfaceWm2: number;
  photonFlux: number;           // photons·m⁻²·s⁻¹ reaching the level over the whole grid
  peakTopNm: number;            // per-unit-WAVELENGTH peak (B53 — the two definitions differ)
  peakSurfaceNm: number;
  surfaceLightHex: string;      // what that light looks like TO HUMAN EYES
  attenuators: { label: string; strength: number }[];   // strongest first; strength = 1 − transmission at its band
}

/** The full sampled curves behind a `SurfaceSpectrum`, on `GRID_NM`.
 *
 *  DELIBERATELY NOT STORED ON THE BODY. Three 113-element arrays per body is ten thousand lines on
 *  the Sol fixture alone, and that fixture is a DIFF-REVIEW surface — burying every future physics
 *  change in spectra makes it useless. It would also ride every save and every broadcast snapshot
 *  for a value any consumer can rebuild in microseconds. The summary is what a body carries; a chart
 *  that wants the shape calls `deriveSurfaceSpectrum` again, which is the SAME derivation and
 *  therefore not a second authority on it. */
export interface SurfaceSpectrumCurves {
  nm: number[];
  topOfAtmosphere: number[];    // W·m⁻²·nm⁻¹ above the atmosphere
  surface: number[];            // W·m⁻²·nm⁻¹ at the reference level
  transmission: number[];       // 0..1, what the sky let through
}

/** One pigment scored against a world's surface spectrum. A RANKED SET, never a single winner —
 *  seven pigments are all viable around a G star and the honest claim is only which dominates. */
export interface PigmentRank {
  key: string;
  label: string;
  captured: number;      // fraction of available photons absorbed
  sufficiency: number;   // 0..1, how far what it absorbs reaches the SATURATING flux — capture, capped
  protection: number;    // 0..1, higher = less overload and less high-energy damage taken
  steadiness: number;    // 0..1, 0.5 = neutral; above = absorbing on the flanks rather than at the peak
  score: number;
  viable: boolean;
  drawWeight: number;    // share of the weighted draw among the viable set
  /** What it reflects, ADAPTED to this star — the pigment's own identity, right for a legend. */
  reflectedHex: string;
  /** What it reflects with the star's cast and brightness LEFT IN — what you would see arriving
   *  from orbit. This is the one a renderer uses; see reflectedHexUnderIlluminant for why. */
  reflectedUnderStarHex: string;
}

/** The derived look of a world's life. Resolved from pack data onto the body — every renderer reads
 *  this and none of them needs the rule pack, the same move `auroraEmitters` already makes. */
export interface VegetationLayerSpec {
  morphology: string;
  label: string;
  /** The pigment THIS morphology settled on. Each pigment-driven layer draws its own from the same
   *  scored viable set, so a world's mats and its plants need not have made the same choice — which
   *  is what shipping a ranked set rather than a single winner was for. */
  pigment: string | null;
  pigmentLabel: string | null;
  coverage: number;      // 0..1 of the land
  opacity: number;
  colorHex: string | null;   // null = this morphology contributes no colour (empty tints, no pigment drive)
  light: number;             // 0..1 night-side emission
  lightHex?: string;         // what it glows; absent = the default amber (see MorphologyDef)
  waterReach: number;        // how much of the world's WATER this morphology can take (see MorphologyDef)
}
export interface Vegetation {
  pigment: string | null;        // the drawn dominant; null when nothing photosynthesises here
  pigmentLabel: string | null;
  ranked: PigmentRank[];
  layers: VegetationLayerSpec[]; // painter order, deepest first
  visibleCover: number;          // 0..1 of the LAND showing any life colour (the union, not the sum)
  /** 0..1 of the globe that IS land. Every coverage above is of the land, so a renderer scattering
   *  patches over a whole disc must multiply by this or it paints the ocean green. Derived here,
   *  where the hydrosphere is in hand, rather than re-derived per renderer. */
  landFraction: number;
  /** Where life clusters, as |latitude| in [centre - width, centre + width]. ONE convention: the
   *  whole globe is centre 45 / width 45, never centre 0 / width 90. */
  bandCentreDeg: number;
  bandWidthDeg: number;
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

/** A star's MK classification, carried NATIVELY rather than as a string re-read at each use.
 *
 *  `M1.5Iab` is three separate facts and they do different work: the LETTER gives the temperature
 *  and the colour, the SUBCLASS refines the temperature within the letter, and the LUMINOSITY CLASS
 *  gives the size — which is the axis that separates a red dwarf from a red supergiant at the same
 *  temperature, and is the HR diagram's own vertical. Reading only the letter is what made Antares
 *  import at a fiftieth of its mass (inbox D19).
 *
 *  PARSED ONCE, AT IMPORT OR AT PICK. The point of the structured form is that no consumer re-parses
 *  an MK string — that is how a fourth site learns to parse them badly — and that the INVERSE
 *  direction exists: `formatStellarType` turns this back into the designation it came from, which is
 *  the invariant `docs/dev/type-vocabulary-prev4.md` exists to protect ("a body created AS T must
 *  classify back AS T").
 */
export interface StellarType {
  /** Spectral letter, or a remnant/sub-stellar key: O B A F G K M L T Y, WD, NS, BH, magnetar. */
  spectral: string;
  /** The numeric subclass — 1.5 in M1.5Iab. Absent when the catalogue does not state one. */
  subclass?: number;
  /** White dwarfs only: the letters after the D naming which absorption lines dominate — the `A` of
   *  `DA2.9`, the `QZ` of `DQZ`. A composition fact, not a luminosity class. */
  variant?: string;
  /** The MK luminosity class AS WRITTEN: 'Ia', 'Iab', 'Ib', 'II', 'III', 'IV', 'V', 'VI'. Absent
   *  when the catalogue does not state one, which is the common case and must stay distinguishable
   *  from "stated as V". */
  luminosity?: string;
  /** The luminosity class NORMALISED to the three bands the rule pack carries: 'I' (supergiant),
   *  'III' (giant), 'V' (main sequence). `II` folds up to I and `IV`/`VI` fold to V. This is the
   *  half of the class the pack key `star/<LETTER>-<BAND>` is built from; `luminosity` above is the
   *  half a reader should be shown. */
  band?: 'I' | 'III' | 'V';
  /** A companion encoded in the same catalogue string — the `+B2Vn` of `M1.5Iab+B2Vn`. RECORDED,
   *  NOT ACTED ON: a binary imported as one star needs node creation, not a parameter lookup, and
   *  that is deliberately a separate job. Kept so the designation can be rebuilt exactly and so the
   *  information is not silently thrown away a second time. */
  companion?: string;
}

export interface CelestialBody extends NodeBase, PhysicalParameters {
  kind: 'body' | 'construct';
  roleHint: 'star' | 'planet' | 'moon' | 'barycenter' | 'construct' | 'belt' | 'ring' | 'ship';
  // G53 THE HYBRID'S TWO FLAGS, AND THEY ARE ORTHOGONAL (mega-constructs-design.md §3.3):
  // `constructChrome` governs the VIEW (present and handle as a PLACE — glyph, dock, construct
  // lists); `artificial` governs the PHYSICS chain (BUILT, not formed — composition is DECLARED,
  // never derived). A Death Star is both; an asteroid-as-place is chrome without artificial, because
  // it is a real rock and deriving it is correct. Both absent = an ordinary node, unchanged
  // everywhere. Read them ONLY through `src/lib/constructs/chrome.ts` — never test the raw flags in
  // view or physics code, so the convention cannot fork (the G43 lesson, five rival conventions).
  constructChrome?: true;
  artificial?: true;
  /** G53: names this node's record in the mega-construct registry
   *  (`src/lib/constructs/megaTypes.ts`). A pack may name a type this build does not know; an
   *  unknown key degrades to an ordinary construct rather than erroring. */
  megaType?: string;
  /** G53 §4.2: the placement predicate, as PACK DATA on a mega template — evaluated by ONE function
   *  (`src/lib/constructs/megaPlacement.ts`), never by switches in the UI. When absent the registry
   *  record's default applies. Copied inert onto instances (a later phase re-evaluates on move). */
  requires?: MegaRequires;
  /** G53 §4.2: the GM-facing sentence shown when the hard clauses grey this template, with `{host}`
   *  interpolated — prose in data, so a pack author can write their own. */
  explain?: string;
  classes?: string[];
  /** A star's MK classification as structured data. See `StellarType`. */
  stellarType?: StellarType;
  // WHERE THE FIGURES CAME FROM (B89). True when mass, radius and temperature are the rule pack's
  // TYPICAL-FOR-CLASS band rather than anything measured - the state every SIMBAD-only star arrives
  // in, because SIMBAD carries a spectral type and no radius. `starParamsFromType` has always
  // returned this and the import always DROPPED it, so the honesty lived only in the description
  // prose while every numeric surface showed a band midpoint as if it were observed. Same idea as
  // `ageEstimated` on the system: a guess must never wear a measurement's clothes.
  typicalForClass?: boolean;
  auroraEmitters?: AuroraEmitter[];  // resolved at process time from atmosphere × gas AuroraBand data
  orbit?: Orbit;
  /** G43: authored Lagrange-point relationship. When present, `orbit` is DERIVED from the
   *  secondary's orbit every pass (see physics/lagrange.ts) — do not hand-edit the elements. */
  coOrbital?: CoOrbital;

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
  /** Axial tilt in degrees — the angle between the spin axis and the orbit normal. Drives the
   *  seasonal temperature swing, the moon-orbit reference plane (`satelliteFrame`) and how the
   *  renderers tip the body. THIS IS THE ONLY NAME FOR IT.
   *
   *  It was untyped for a long time and that is what let a second name grow beside it: every read and
   *  write went through an untyped access, so nothing steered anyone to the right field, while the
   *  vestigial `obliquity_deg` WAS declared here and looked authoritative. The seasonal term read the
   *  declared one, the bundled data set the undeclared one, and neither side had a reason to notice
   *  (see `spinProvenance.ts`, which recorded the gap and left it). */
  axial_tilt_deg?: number;
  /** @deprecated A second name for `axial_tilt_deg`, kept only so `importFixup` can recover it from
   *  older saves and delete it. Nothing reads it. Write `axial_tilt_deg`. */
  obliquity_deg?: number;
  albedoBreakdown?: { albedo: number; surfaceAlbedo: number; cloudAlbedo: number; cloudCover: number; cloudSpecies?: string; note: string };
  // F-OVR: GM overrides for otherwise-derived scalars. A key being PRESENT means the GM pinned that
  // value — it is saved and fed into the derivation instead of the computed default, with a reset that
  // deletes the key and hands control back to the physics.
  //
  // EVERY ONE OF THESE IS DESCRIBED IN `src/lib/physics/overrides.ts` (G37) — the label, the slider
  // range, the absurd-but-allowed range a typed number may reach, the derived default, and the
  // sentence shown when a pinned figure leaves the plausible band. Do NOT restate any of that in an
  // editor; add a record to the roster and every surface picks it up.
  overrides?: {
    albedo?: number;              // Bond albedo 0..1 (else derived from makeup + cloud decks)
    gasThermalInflation?: number; // gas-giant radius inflation factor (else derived from insolation)
    radiogenicHeatK?: number;     // GM radiogenic-heat override (+K): adds surface heat AND geological vigor
    // MAGNETIC ACTIVITY 0..1 — the ionising half of a star's output, and DELIBERATELY NOT ITS
    // BRIGHTNESS. Luminosity is fixed by radius and temperature (exact); ionising output is driven by
    // the magnetic dynamo, and the two decouple exactly where it matters: a flare moves a star's
    // bolometric output by a hundredth of a percent while its X-ray output jumps a thousandfold.
    // Derived from class and age by default; this pins it so a GM can make a quiet giant flare
    // without pretending it got brighter.
    flareActivity?: number;
    // Surface field strength in gauss, pinned. Governs the magnetic/* shielding tags and the
    // radiation that reaches the ground, INSTEAD of the interior dynamo read — so a value the
    // interior could never generate (a 70 T terrestrial) is allowed, labelled and kept.
    magneticFieldGauss?: number;
    // THE MEAN surface temperature, pinned outright (owner Q5). It is carried as a constant
    // anomalous flux through `composeBodySurfaceTemperature`, which is what makes the mean land
    // exactly on the pin while day, night and peak keep their swing about it — and what
    // SHORT-CIRCUITS the thermal solve, since the surface no longer moves across the iteration.
    // Everything downstream (clouds, phases, classification, habitability, biosphere) reads the pin.
    surfaceTempK?: number;
    // Surface pressure in bar, pinned. Atmospheric escape is applied and then overridden, so a world
    // keeps a column its gravity could never have retained.
    pressureBar?: number;
    // Bulk density in g/cm3, pinned. Mass, radius and density are ONE relation with two degrees of
    // freedom, so this pins the second of them and `densityHold` says which of mass and radius is
    // the other — the third follows (owner Q1, "pin any two"). The COMPOSITION is deliberately not
    // re-inferred, so a rocky world that weighs a tenth of what rock weighs stays a contradiction
    // instead of being quietly turned into a gas ball. Gravity and escape velocity stay derived.
    densityGcm3?: number;
    densityHold?: 'radius' | 'mass';
    // THE STATED REASON for each pin, keyed by the override it explains — an `anomaly/*` tag from
    // the Anomaly category. Several overrides may share one reason. LIFECYCLE-BOUND: resetting an
    // override deletes its entry here too (see `clearOverride`), because a reason with nothing left
    // to explain would outlive the thing it referred to. The tag DEFINITION survives in the category.
    anomalies?: Record<string, { tag: string; secret?: boolean }>;
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
  
  // HOW OFTEN THIS SHIP HAS BEEN FOUND CARRYING A PLACEMENT ITS OWN JOURNEYS DISAGREE WITH, and
  // repaired on the spot by `reconcileConstructArrival`. The repair is idempotent, so a healthy ship
  // reads 0 or has no counter at all; a count that CLIMBS means something upstream is still writing
  // the ship wrong and the underlying fault ([[B97]]) is still live. Diagnostic only - nothing reads
  // it to make a decision, and it exists so a user's saved file can answer the question directly.
  placementHealCount?: number;

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
  // TOTAL incident flux at the reference level (Earth = 1): starlight, stellar wind AND the trapped
  // particles of any belt this body sits inside. It stopped being "stellar" at B17, when the belt
  // term landed in it — Io reads 26,279 here against 0.037 of actual sunlight, because Jupiter's
  // magnetosphere is its environment. Named for what it measures (B34); `starlightFlux` below is the
  // one that is only the star.
  totalIncidentFlux?: number;
  totalIncidentFluxMin?: number;
  totalIncidentFluxMax?: number;
  // The star's own output at this distance, Earth = 1 — photons and wind, no belt. This is what a
  // rule about IRRADIATION means: how hard the star itself is shining on this world.
  starlightFlux?: number;
  photonRadiation?: number;
  particleRadiation?: number;
  radiationShieldingAtmo?: number; // 0-1 effectiveness
  radiationShieldingMag?: number;  // 0-1 effectiveness
  equilibriumTempK?: number;
  /** G53 phase 4: what a megastructure took out of this body's starlight, one entry per shaded
   *  star — DERIVED every pass by `physics/temperature.ts deriveStarlightDimming` and deliberately
   *  ABSENT (deleted, not zeroed) when nothing shades the body, so systems without megastructures
   *  never carry the field. The trace reads it; nothing else may re-derive who shadows whom. */
  starlightDimming?: {
    starName: string;
    /** Time-averaged share of that star's light this body receives, 0..1. */
    receivedFrac: number;
    occluders: { name: string; fraction: number; band: boolean; alignedShare: number }[];
  }[];
  internalHeatK?: number;
  apparentColorHex?: string;  // derived true colour (makeup + atmosphere/clouds + temperature)
  apparentColor?: ApparentColor;  // un-mixed palette behind apparentColorHex (for richer rendering)
  /** The star's spectrum after the sky took its cut. ONE quantity, TWO consumers — the pigment
   *  branch reads its photon counts, the presentation branch reads its colour — and it is derived
   *  here in physics rather than in a renderer (inbox B54). */
  surfaceSpectrum?: SurfaceSpectrum;
  /** The derived look of this world's life: the ranked pigments, the drawn dominant, and one
   *  painter-ordered layer per morphology with its colour already resolved from pack data. */
  vegetation?: Vegetation;
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
  // A PAIR CAN RIDE A LAGRANGE POINT, not just a single body (B98). (617) Patroclus-Menoetius is a
  // real binary Jupiter trojan - two ~110 km bodies about 680 km apart librating about L4 together -
  // and until this existed the engine had no way to SAY that. A GM who built one got the marker on a
  // MEMBER instead, which put the L-point derivation and the barycentre reconciler in a fight over
  // the same node's orbit and parentage, and the companion's orbit ran away a little further on
  // every pass. When this is set, the pair's barycentre is the thing at the point and the members
  // simply orbit it; no member may carry `coOrbital` as well (physics/lagrange.ts enforces it).
  coOrbital?: CoOrbital;
  // THE CIRCUMBINARY (P-TYPE) STABLE ANNULUS (G45) — DERIVED, never authored. Written by the
  // stability pass (physics/stability.ts) from the pair's own orbit and its members', and rebuilt
  // from scratch on every pass. Both edges are SEMI-MAJOR AXES in AU measured from the barycentre:
  // the inner one is the Holman & Wiegert critical radius, the outer one a fraction of the pair's
  // combined-mass Hill radius. THIS IS THE CONTRACT for anything that wants to show or check where
  // a circumbinary body may live — read these fields; do not re-derive either edge, because a second
  // derivation is a second answer. The maths, its validity range and the real-system checks are in
  // physics/circumbinary.ts.
  circumbinary?: CircumbinaryAnnulus;
}

export interface System {
  id: ID; name: string; seed: string; epochT0: number; age_Gyr: number;
  // WHERE THE AGE CAME FROM. `ageEstimated` was set by the real-sky importer for years without being
  // declared here (via `as any`); it now has a home, and every importer sets it through
  // `guessSystemAge`. An estimated age is a GUESS from the primary's stellar type, not a measurement,
  // and the UI says so; `ageBandGyr` is the range the star's own life makes reasonable, shown under the
  // age control so the GM can move it knowingly. Neither is written by generation, which chose its age.
  ageEstimated?: boolean;
  ageBandGyr?: [number, number];
  nodes: Array<CelestialBody | Barycenter>;
  rulePackId: string; rulePackVersion: string;
  tags: Tag[]; notes?: string; gmNotes?: string;
  visualScalingMultiplier?: number;
  toytownFactor?: number;
  // Authorship credit — shown under the main star and editable on its "System Info" tab. Authored data,
  // saved with the system; never stripped by the import fix-up.
  credits?: { author?: string; contact?: string; created?: string; version?: string };
}

// Rule Pack interfaces (subset for M0–M1)
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
  // WHERE THE TYPE CAN BE BORN — read ONLY by the viability model (the "add here" picker and the
  // generator), NEVER by the classifier. The classifier works on what it sees: a hand-authored
  // chthonian in a million-year-old system still classifies as a chthonian, however implausible its
  // presence, and the tags say so. `formation` is the one-way half of that bargain — it decides
  // what a slot may be GIVEN, not what a body IS. Bands: age_Gyr (early / late formers).
  formation?: Record<string, FingerprintBand>;
  weight?: number;                       // optional score multiplier (default 1)
  note?: string;                         // human note on the type's defining traits
}
export interface ClassifierSpec {
  // REMOVED (inbox B67 / D12). The additive `rules[]` seam was never reached by any shipped pack —
  // starter-sf has always carried fingerprints, and the early return took them — while quietly
  // holding a copy of the classifier that predated B6 (eyeballs moved onto surface temperature) and
  // B25 (the surface gate), plus a rule that called any small hot world a stripped gas-giant core.
  // Measured before removal: 43 of the 50 fired through a fingerprint-less pack and the output was
  // materially worse on every body compared. Kept in the type only so an old pack still PARSES;
  // `warnIfLegacyRules` tells its author the rules are not read.
  rules?: unknown[];
  fingerprints?: Fingerprint[];          // per-type fingerprints — the only classifier
  maxClasses: number;
  planetImages?: Record<string, string>;
  starImages?: Record<string, string>;
}

export interface PromptSpec { systemPreamble: string; fewShots?: Array<{input: Record<string, unknown>; output: string;}>; perEntityPrompts?: Record<string,string>; }
export interface ViewPresetSpec { defaultPlayerVisibility: { discoveredBasics: boolean; showTags: string[]; hiddenFields: string[]; }; overrides?: Array<{ match: { role?: string; class?: string; tag?: string }, visibleFields: string[], hiddenFields: string[] }>; }

export interface TableSpec { name: string; entries: Array<{ weight: number; value: unknown }>; }
export interface MetricDef { key: string; label: string; min: number; max: number; default?: number; }

/**
 * Planet spacing rules (`generation_parameters.orbital_spacing`), read by
 * `generation/placement-strategy.ts`. Every value is in units of the STAR or of a zone the engine
 * derives from it — never in absolute AU, which is the fault this block replaced (inbox B58).
 */
export interface OrbitalSpacingRules {
  name?: string;
  /**
   * RATIO of successive orbits, drawn ONCE PER SYSTEM. This is the spacing rule, because it is what
   * is actually near-constant within real systems: Sol's successive ratios average about 1.7 and
   * TRAPPIST-1's about 1.32, while their separations in mutual Hill radii vary by a factor of eight.
   * Scale-free, so it carries nothing about Sol into other stars.
   */
  spacing_ratio: [number, number];
  /** Per-gap multiplicative variation around the system's ratio, e.g. 0.15 for +/-15%. */
  separation_gap_spread?: number;
  /**
   * MINIMUM separation in mutual Hill radii. Not the spacing rule — the floor under it. Where the
   * drawn ratio would put a pair closer than this, the gap widens. This is what keeps the slots
   * either side of a massive body clear, since the Hill term contains that body's mass.
   */
  stability_floor_hill_radii: number;
  /** The innermost planet is drawn between the dust edge and this fraction of the FORMATION frost line. */
  inner_edge_frost_fraction: [number, number];
  /** Proxy masses (Earth masses) used ONLY to size gaps, inside and outside the formation frost line. */
  spacing_mass_earth_inside_frost: [number, number];
  spacing_mass_earth_outside_frost: [number, number];
  /** Ceiling on a proxy mass as a fraction of the star's mass — an M dwarf cannot build a Jupiter. */
  max_planet_mass_stellar_fraction: number;
  /** "Peas in a pod": 0 = adjacent masses independent, 1 = every planet the mass of its neighbour. */
  peas_in_a_pod: number;
}

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
// gives the deck its look (colour, cloudOpacity, meltK for ice-crystal vs droplet).
// There was a `minFraction` here — an abundance floor below which no deck formed. Removed with
// inbox B95: it deleted real, optically thick decks (our own Saturn's ammonia among them) and it
// measured the wrong thing. Whether a cloud can be seen is decided by its OPTICAL DEPTH, which
// `deriveCloudDecks` computes anyway. A campaign whose gasPhysics override still carries the key is
// harmless — nothing reads it. See docs/dev/cloud-decks-design.md.
export interface GasCloud { condensesTo: string; }
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
  /** Rayleigh scattering cross-section RELATIVE TO N2 — the visible-light analogue of `shielding`,
   *  which is the ionising one. Absent = 1 (treat it like nitrogen). CO2 scatters about 2.4× as
   *  hard, H2 about 0.2× — that ratio is why a thick CO2 sky is not simply a thicker blue one. */
  rayleigh?: number;
  /** Where this gas EATS the incoming spectrum, as Gaussian bands. Absent = it takes only its
   *  Rayleigh share, which is the honest answer for N2, argon and the noble gases. NOT for O2:
   *  the pack gives it the 762 nm A-band, so this comment named it wrongly for as long as it
   *  existed — 16 of the 33 shipped gases carry bands. Authoring, not architecture: the shape was
   *  always here, the numbers were not (inbox B54). */
  absorptionBands?: PigmentBand[];
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
  // Derived water vapour over an ocean (see physics/atmosphere.ts waterVapourFraction).
  vapourColumnMeanHumidity?: number;   // column mean as a fraction of saturation; Earth-calibrated
  vapourColumnMaxFraction?: number;    // where "trace vapour on an atmosphere" stops being true
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
  /**
   * Player-facing chrome the GM can re-word in character (A63). Flavour, never a system message —
   * a pack that omits it falls back to the same wording in code.
   */
  playerStrings?: { incoming?: string };
  climateModel?: ClimateModelConfig;
  gasMolarMassesKg?: Record<string, number>; // Legacy support (optional)
  gasShielding?: Record<string, number>; // Legacy support (optional)
  liquids?: LiquidDef[];
  // Biosphere look levers — all OPTIONAL overrides of the built-in defaults in src/lib/data/.
  // A pack ships them together in one `biospheres.json`; see rulepack-loader.
  pigments?: PigmentDef[];
  pigmentModel?: PigmentModelConfig;
  morphologies?: MorphologyDef[];
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
  /**
   * Loose grab-bag of pack scalars and rule blocks. It was already read in several places
   * (`zones.ts`, `generation/planet.ts`) while being absent from this interface entirely, so those
   * reads were untyped; `orbital_spacing` is named because placement depends on its shape.
   */
  generation_parameters?: {
    orbital_spacing?: OrbitalSpacingRules;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [key: string]: any;
  };
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
  // DELTAS, not copies — only the keys and fields a GM actually changed. See lib/rulepackDelta.ts
  // for why: a whole-list override freezes the shipped defaults at the moment of the edit, and
  // every later improvement to the pack silently stops reaching that campaign. Both fields still
  // accept a whole list, because campaigns saved before this carry one.
  morphologies?: PackListDelta<MorphologyDef> | MorphologyDef[];
  pigments?: PackListDelta<PigmentDef> | PigmentDef[];
  /** A handful of scalars — stored whole, but only the ones that differ from the pack. */
  pigmentModel?: Partial<PigmentModelConfig>;
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

/**
 * G16 - "your own map behind the stars": the image a GM puts BEHIND the starmap.
 *
 * IT IS CAMPAIGN CONTENT, NOT CHROME, and that is the whole reason it lives on the Starmap rather
 * than in a UI store. In map-fixed mode the picture is GEOREFERENCED - a sector map whose borders
 * must line up with the systems - so its anchor has to travel with the campaign into the save
 * bundle and out to every player window, or a player is looking at a WRONG map rather than a
 * slightly different one. One anchor, one place, every surface reads it: GM 2D map, player 2D map,
 * the 3D map's plane, and the starmap document. See $lib/map/mapBackground.ts for the geometry.
 *
 * The GM's old local "show background image" toggle became `source`: no image / the shipped Milky
 * Way / an uploaded image. Absent = the shipped Milky Way, screen-fixed, opaque - exactly what
 * every existing campaign already showed.
 */
export interface MapBackground {
  /** none = plain space; default = the shipped ESO Milky Way; asset = one of `playerAssets`. */
  source: 'none' | 'default' | 'asset';
  assetId?: string;
  /** screen = decoration fixed to the viewport (today's behaviour); map = georeferenced. */
  attach: 'screen' | 'map';
  opacity: number;      // fade, 0..1
  sizePct: number;      // SCREEN-fixed only: width as a % of the viewport (100 = cover)
  widthUnits: number;   // MAP-fixed: image width in the campaign's OWN unit (never ly by assumption)
  offsetX: number;      // MAP-fixed: image CENTRE, in campaign units
  offsetY: number;
  rotationDeg: number;  // MAP-fixed: clockwise, about the centre
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
  // G40: the star the DISPLAY grids centre on — the 3D map's polar/scaled rings radiate from it and
  // measure distance FROM it, and the GM map's Reset View centres on it (zoomed so every star still
  // fits). Display and navigation only: snap lattices, hex addresses and stored distances never move.
  gridCenterId?: string;
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
  //  - `baseMapUpgradeDeclined`: the base-map edition the GM said 'Not now' to, recorded ON THE MAP so
  //    the answer rides saves, bundles and other devices. B88: the decline used to live only in this
  //    browser's localStorage, so a user was re-asked on every refresh, forever. A NEWER edition than
  //    the one declined may still be offered - 'not now' is not 'never'.
  //  - `baseMapUpgradeDismissed`: the GM ticked 'do not ask again for this campaign'. Never offer again.
  appVersion?: string;
  baseMapVersion?: number;
  baseMapUpgradeDeclined?: number;
  baseMapUpgradeDismissed?: boolean;
  /**
   * DEAD (G35). The experimental "evolutionary" (accrete) generator was removed; it lives on as its
   * own project at https://system-lab.starsystemx.com/. Kept in the type ONLY so a starmap saved by
   * an older build still parses — the load path drops the value and nothing reads it. Do not write
   * it, and do not revive it as a selector: see engine map GEN-1 for why the preservation order it
   * was under was superseded.
   */
  generationEngine?: string;
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
  // G34: per-quantity × body-type display-unit choices (`${quantity}:${bodyType}` → unit id; the
  // vocabulary and defaults live in units.ts). Sparse — absent keys mean the defaults. CAMPAIGN
  // DATA: rides save, bundle and the player snapshot so players inherit the GM's units. Presence
  // of the record (even empty) marks the two legacy fields above as migrated; they are display
  // prefs superseded by this and retire with the Settings selector (G34 phase 5).
  unitPrefs?: Record<string, string>;
  systemEdgeAu?: number;                        // "leaves the system" boundary in AU; unset = the star's Hill limit

  // Unified player-view presets + their uploaded graphics are campaign data — saved with the map.
  // See $lib/player and docs/dev/unified-player-view-design.md. Optional: absent on old maps.
  playerPresets?: import('./player/presetTypes').PlayerPreset[];
  playerAssets?: import('./player/presetTypes').PlayerAsset[];

  // G16: the picture behind the stars. CAMPAIGN CONTENT, not chrome - see MapBackground.
  mapBackground?: MapBackground;

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
