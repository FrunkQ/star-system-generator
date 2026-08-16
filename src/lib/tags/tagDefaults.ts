// THE DEFAULT TAG CATEGORIES, as data — the construct starter set and the built-in rule pack.
//
// They live here, apart from the modules that used to own them, for one reason: tagCategories.ts is
// the store both of those modules now read from, so if the defaults stayed with them the import
// graph would be a cycle and the store would have to be seeded lazily by whoever imported first.
// That is exactly the bug this file was created to fix — a spec that never imported coi.ts saw an
// empty store and the B33 surface-resource rules silently stopped firing.
//
// Only TYPES are imported here, which is what keeps the graph acyclic: types are erased at runtime.
import type { CoICategory, CoITag } from '../constructs/coi';
import type { PoIExpr, PoIRole, PoIRule, PoIPack } from '../physics/reasonsToVisit';


// Which rule categories are on for a NEW user. Mysteries & hooks (intrigue) default OFF — it is the
// most "GM flavour" set; the physical three are on. The migration reads this as its fallback layer:
// "no saved preference" must mean THIS, not "everything on", or a fresh install silently gains a
// category the product deliberately ships disabled.
export const REASONS_DEFAULTS: { enabled: boolean; categories: Record<string, boolean> } = {
  enabled: true,
  categories: { resource: true, science: true, frontier: true, intrigue: false }
};

// EVERY NAMESPACE THE ENGINE ITSELF WRITES, and where its tags come from. This is the data that used
// to be a literal array of key prefixes inside tagLifecycle — the kind of list that goes stale in
// silence, because adding a namespace anywhere in the engine does not make it notice.
//
//   physics   the processor derives it every pass; a strip clears it and an emitter rewrites it.
//   authored  written ONCE at generation or import and never re-derived. Freely removable: delete
//             one and it stays deleted, which is exactly what the lock on those tags used to deny.
//
// `orbit/` is listed BY KEY rather than as a namespace because it is genuinely mixed: retrograde and
// double are the generator's claims about how a body came to be, while tidally-locked and
// spin-orbit-resonance are re-derived from the lock model on every pass.
export const ENGINE_NAMESPACES: { id: string; provenance: 'physics' | 'authored'; label: string }[] = [
  // Generation and import provenance — the promises that an inferred value is distinguishable from
  // a measured one (inbox B10, C3c) and that an invented world is distinguishable from a detected
  // one (the real-sky importer's origin/generated).
  { id: 'spin', provenance: 'authored', label: 'Spin provenance' },
  { id: 'origin', provenance: 'authored', label: 'Origin' },
  { id: 'traveller', provenance: 'authored', label: 'Traveller' },
  { id: 'orbit/retrograde', provenance: 'authored', label: 'Retrograde orbit' },
  { id: 'orbit/double', provenance: 'authored', label: 'Double orbit' },

  // Derived every pass. These are the namespaces a GM may override by hand.
  { id: 'geology', provenance: 'physics', label: 'Geology' },
  { id: 'tidal', provenance: 'physics', label: 'Tidal' },
  { id: 'climate', provenance: 'physics', label: 'Climate' },
  { id: 'weather', provenance: 'physics', label: 'Weather' },
  { id: 'aurora', provenance: 'physics', label: 'Aurora' },
  { id: 'magnetic', provenance: 'physics', label: 'Magnetism' },
  { id: 'shape', provenance: 'physics', label: 'Shape' },
  { id: 'structure', provenance: 'physics', label: 'Structure' },
  { id: 'surface', provenance: 'physics', label: 'Surface' },
  { id: 'volatiles', provenance: 'physics', label: 'Volatiles' },
  { id: 'thermal', provenance: 'physics', label: 'Thermal' },
  { id: 'habitability', provenance: 'physics', label: 'Habitability' },
  { id: 'hazard', provenance: 'physics', label: 'Hazard' },
  { id: 'flight', provenance: 'physics', label: 'Flight' },
  { id: 'activity', provenance: 'physics', label: 'Activity' },
  { id: 'orbit', provenance: 'physics', label: 'Orbit' },
  { id: 'stability', provenance: 'physics', label: 'Stability' },
  { id: 'fate', provenance: 'physics', label: 'Fate' },
  { id: 'resonance', provenance: 'physics', label: 'Resonance' },
  { id: 'ring', provenance: 'physics', label: 'Rings' },
  { id: 'barycenter', provenance: 'physics', label: 'Barycentre' },
  { id: 'stellar', provenance: 'physics', label: 'Stellar activity' },
  { id: 'biodiversity', provenance: 'physics', label: 'Biosphere' },
  { id: 'atmosphere', provenance: 'physics', label: 'Atmosphere' },
  { id: 'feature', provenance: 'physics', label: 'Features' },
  { id: 'visibility', provenance: 'physics', label: 'Visibility' }
];


function prettify(slug: string): string {
  if (slug === 'HQ') return 'HQ';
  return slug.split('-').map((w) => w[0].toUpperCase() + w.slice(1)).join(' ');
}
// Build a category's tags from a list of slugs, or [slug, explicitLabel] pairs where prettify won't do.
function mkTags(catId: string, entries: (string | [string, string])[]): CoITag[] {
  return entries.map((e) => typeof e === 'string'
    ? { key: `${catId}/${e}`, label: prettify(e) }
    : { key: `${catId}/${e[0]}`, label: e[1] });
}

// Owner -> tardiness; Purpose -> what the ship is for.
export const DEFAULT_COI_CATEGORIES: CoICategory[] = [
  {
    // Operational state. Multi-select. NO "Active" tag — a construct is assumed fully operational (readiness
    // 1) unless a status impairs it; each blocking status carries a `readiness` (0..1) drive multiplier.
    // Adrift / In transit are DERIVED from the journey log (mirroring internal state), not hand-set.
    // A CORE category autopilot relies on — always on, can't be removed.
    id: 'status', label: 'Status', color: '#5a7d8c', textColor: '#ffffff', single: false, enabled: true, required: true,
    tags: [
      { key: 'status/in-transit-interstellar', label: 'In transit (interstellar)', derived: true },
      { key: 'status/in-transit-system', label: 'In transit (in-system)', derived: true },
      { key: 'status/adrift', label: 'Adrift', derived: true, readiness: 0 },
      { key: 'status/damaged', label: 'Damaged', readiness: 0.5 },
      { key: 'status/distress', label: 'Distress', readiness: 0 },
      { key: 'status/refit', label: 'Refit', readiness: 0 },
      { key: 'status/dormant', label: 'Dormant', readiness: 0 },
      { key: 'status/captured', label: 'Captured' },
      { key: 'status/derelict', label: 'Derelict', readiness: 0 },
      { key: 'status/mothballed', label: 'Mothballed', readiness: 0 },
      { key: 'status/construction', label: 'Under construction', readiness: 0.5 },
      { key: 'status/impounded', label: 'Impounded', readiness: 0 },
      { key: 'status/quarantined', label: 'Quarantined', readiness: 0 },
      { key: 'status/lost', label: 'Lost', readiness: 0 },
      { key: 'status/decommissioned', label: 'Decommissioned', readiness: 0 }
    ]
  },
  {
    id: 'owner', label: 'Owner', color: '#3f6fb0', textColor: '#ffffff', single: true, enabled: true, required: true,
    tags: [
      { key: 'owner/military', label: 'Military', tardiness: 0 },
      { key: 'owner/government', label: 'Government', tardiness: 0.1 },
      { key: 'owner/corporation', label: 'Corporation', tardiness: 0.25 },
      { key: 'owner/consortium', label: 'Consortium', tardiness: 0.5 },
      { key: 'owner/independent', label: 'Independent', tardiness: 0.6 },
      { key: 'owner/pirate', label: 'Pirate', tardiness: 0.75 },
      { key: 'owner/owner-operator', label: 'Owner-operator', tardiness: 1 }
    ]
  },
  {
    id: 'purpose', label: 'Purpose', color: '#2f9e8f', textColor: '#ffffff', single: false, enabled: true, required: true,
    tags: mkTags('purpose', [
      'patrol', 'ship-repair', 'refuel', 'resupply', 'leisure', 'people-transport', 'cargo-transport',
      'bulk-carrier', 'courier', 'mining', 'refining', 'survey-prospecting', 'survey-science', 'prison',
      'colony', 'agriculture', 'research', 'intelligence', 'manufacturing', 'power-generation', 'trade-hub',
      'HQ', 'government', 'forward-base', 'customs', 'salvage', 'rescue-tender', 'medical', 'diplomatic',
      'tanker', 'factory-ship', 'farm-ship', 'comms-relay', 'beacon', 'defence-platform',
      // Traveller-style port capabilities — a "Class A starport" is just a bundle of these, not a label.
      ['refined-fuel', 'Refined fuel'], ['unrefined-fuel', 'Unrefined fuel'],
      ['shipyard', 'Shipyard'], ['shipyard-jump', 'Shipyard (jump-capable)'], ['shipyard-craft', 'Shipyard (small craft)'],
      'drydock', 'brokerage', 'lodging', ['bonded-warehouse', 'Bonded warehouse'], 'extraterritorial'
    ])
  },
  {
    // What a construct mines, refines, stockpiles or hauls. DELIBERATELY shares the `resource/` prefix +
    // slug vocabulary with the PoI resource namespace (a body's natural deposit), styled to match, so the
    // two read as ONE ledger — "find all water-ice in the system" spans bodies AND ships. Provenance stays
    // clean: a body's resource/* is physics-derived; a construct's is coi/manual (hand-set, GM-owned).
    id: 'resource', label: 'Resources', color: '#d4a843', textColor: '#000000', single: false, enabled: true, required: true,
    tags: mkTags('resource', [
      // Raw materials — shared with the PoI body-resource namespace.
      ['water-ice', 'Water ice'], 'volatiles', 'organics', ['heavy-metals', 'Heavy metals'],
      ['platinum-group', 'Platinum-group'], ['rare-metals', 'Rare metals'], ['rare-earths', 'Rare earths'],
      'fissiles', ['helium-3', 'Helium-3'], 'deuterium', 'hydrocarbons', ['noble-gases', 'Noble gases'],
      ['exotic-crystals', 'Exotic crystals'], 'diamonds', 'oxidizer', ['ore-belt', 'Asteroid ore'],
      // Finished / exotic goods — CoI-only (a body can't manufacture these; they never appear on a planet).
      // Antimatter is MANUAL-ONLY: never auto-generated (0% on the sliders); hand-added to a high-end port.
      'provisions', 'technology', ['alien-technology', 'Alien technology'],
      ['exotic-matter', 'Exotic matter'], 'antimatter', 'luxuries', 'pharmaceuticals'
    ])
  },
  {
    // The setting / IP register a construct belongs to. Replaces the universe level of the old class-path
    // hierarchy ("Expanse/Ship/Corvette") so "show me every Expanse ship" is a tag filter, not a folder.
    id: 'universe', label: 'Universe', color: '#7a6a9a', textColor: '#ffffff', single: true, enabled: true,
    tags: mkTags('universe', [
      'contemporary', ['hard-scifi', 'Hard sci-fi'], ['high-scifi', 'High sci-fi'],
      'expanse', 'aliens', 'traveller', 'mothership', 'natural'
    ])
  },
  {
    // The ship's size/role class — scale governs what jobs make sense (a capital ship won't run courier).
    id: 'class', label: 'Hull class', color: '#8a6fc0', textColor: '#ffffff', single: true, enabled: true, required: true,
    tags: mkTags('class', [
      'shuttle', 'dropship', 'pinnace', 'yacht', 'racer', 'fighter', 'gunship', 'scout', 'corvette',
      'frigate', 'destroyer', 'cruiser', 'battleship', ['capital', 'Capital ship'], 'carrier', 'dreadnought',
      'freighter', ['liner', 'Liner'], ['colony-ship', 'Colony ship'], ['generation-ship', 'Generation ship'],
      'tug', 'platform', 'station', 'habitat', 'orbital-elevator'
    ])
  },
  {
    // FTL METHODS ONLY (CORE). Sublight is the default — NO selection means sublight, so there's no
    // 'sublight' tag. Torch and solar-sail are sublight engines (hard calc data on the engine list), NOT
    // FTL. Generation ship is a Hull class, not a drive. Jump Drive is the default FTL (green when the
    // hull actually carries FTL hardware, red but still selectable otherwise — UI).
    id: 'drive', label: 'FTL drive', color: '#c07f3f', textColor: '#ffffff', single: true, enabled: true, required: true,
    tags: mkTags('drive', [
      'jump-drive', 'warp', 'hyperdrive', ['gate', 'Wormhole / gate'], ['ftl-unknown', 'Exotic / unknown']
    ])
  },
  {
    // Stance toward the party — a quick GM read; could colour contacts on a future tactical view.
    id: 'disposition', label: 'Disposition', color: '#b05050', textColor: '#ffffff', single: true, enabled: false,
    tags: mkTags('disposition', ['allied', 'friendly', 'neutral', 'wary', 'hostile', 'unknown'])
  },
  {
    // Tech level / origin — sets the sci-fi register (primitive frontier vs precursor relic).
    id: 'tech', label: 'Tech & origin', color: '#6a6f7a', textColor: '#ffffff', single: true, enabled: true,
    tags: mkTags('tech', [
      'primitive', 'industrial', 'standard', 'advanced', 'experimental',
      'alien', ['precursor', 'Precursor / ancient']
    ])
  }
];

// --- The built-in default pack (the original rules, as data). Order preserved so the seeded roll
//     sequence — and therefore which tags appear — is identical to the hardcoded version. ---
let _rid = 0; const R = (tag: string, category: string, chance: number, when: PoIExpr, appliesTo?: PoIRole[]): PoIRule => ({ id: `d${_rid++}`, tag, category, chance, when, appliesTo });

// SURFACE-ACCESS rules: the same rule, plus "and there is a surface to get it off".
//
// B33. A rule that says you can mine, refuel or resupply here is a claim about reaching material
// and lifting it — but these rules were all written against BULK COMPOSITION, which a giant
// trivially satisfies. A 751 C helium giant offered "Life-support resupply", "Water/ice refuelling"
// and "Water ice", because a planet-sized envelope contains plenty of water by mass. It is
// supercritical vapour spread through an atmosphere, not ice, and there is no ground to stand on.
//
// GATED ON makeup.gas, NOT on `isGiant`, and not on the delta-v budget. Both were considered:
//  - `isGiant` already exists and reads well, but it is `classes include a giant type OR gas >= 0.4`,
//    and the bundled data has bodies carrying BOTH a rocky and a giant class — "planet/desert +
//    planet/cloudless-gas-giant" at gas 0.00, "planet/ice + planet/ice-giant" at gas 0.00. Gating on
//    it would strip surface resources from bodies whose composition says they have a surface.
//  - the surface-to-low-orbit budget is the better IDEA — accessibility is the concept these rules
//    are missing — but it cannot do this particular job, because for a body with no surface the
//    figure is derived at the notional 1-bar radius and is as fictional as the surface gravity B18
//    found there. Measured across the 366 bundled bodies, the giants' budgets run 9.1 to 1163 km/s:
//    the low end is Earth's, so no threshold excludes giants without excluding Earth too.
// makeup.gas is what B18 and B25 already use, so habitability, classification and now the reasons
// to visit all answer "does this body have a surface" the same way.
const SURFACE = (when: PoIExpr): PoIExpr => ({ all: [{ lt: ['makeup.gas', 0.5] }, when] });
const RS = (tag: string, category: string, chance: number, when: PoIExpr, appliesTo?: PoIRole[]): PoIRule =>
  R(tag, category, chance, SURFACE(when), appliesTo);
export const DEFAULT_POI_PACK: PoIPack = {
  id: 'default', name: 'Reasons to Visit (default)', description: 'The built-in physics-driven PoI hooks.', enabled: true,
  categories: [
    { id: 'resource', label: 'Resources', desc: 'Mineable / economic value — fuels, metals, exotics', color: '#d4a843', textColor: '#1a1206' },
    { id: 'science', label: 'Scientific interest', desc: 'Research draws — rare formations, biosignatures, anomalies', color: '#5a9fd0', textColor: '#04121c' },
    { id: 'frontier', label: 'Frontier logistics', desc: 'Refuelling, waystations, gravity assists', color: '#6fae8f', textColor: '#06160f' },
    { id: 'intrigue', label: 'Mysteries & hooks', desc: 'Rumours, signals, legends — pure adventure bait', color: '#b07ad0', textColor: '#160a1c' }
  ],
  rules: [
    // Rocky/solid-world resources — planets & moons (belts have their own ore/rare-metals hooks).
    RS('resource/heavy-metals', 'resource', 0.7, { gte: ['makeup.metal', 0.3] }, ['planet', 'moon']),
    RS('resource/platinum-group', 'resource', 0.45, { gte: ['makeup.metal', 0.5] }, ['planet', 'moon']),
    RS('resource/rare-earths', 'resource', 0.4, { all: [{ gte: ['makeup.metal', 0.2] }, { gte: ['makeup.rock', 0.3] }] }, ['planet', 'moon']),
    RS('resource/fissiles', 'resource', 0.3, { all: [{ gte: ['makeup.rockMetal', 0.6] }, { between: ['ageGyr', 0.5, 9] }] }, ['planet', 'moon']),
    R('resource/helium-3', 'resource', 1.0, { eq: ['isGiant', true] }, ['planet']),  // He in a giant's atmosphere — deterministic
    R('resource/helium-3', 'resource', 0.3, { all: [{ eq: ['hasAtmo', false] }, { gte: ['ageGyr', 3] }, { gt: ['makeup.rockIce', 0.5] }] }, ['moon']),  // airless-moon regolith (solar-wind implanted) — a prospect, semi-random
    R('resource/deuterium', 'resource', 0.4, { any: [{ gte: ['makeup.gas', 0.4] }, { gte: ['hydroCover', 0.3] }] }, ['planet', 'moon']),
    RS('resource/water-ice', 'resource', 1.0, { any: [{ eq: ['hydro', 'water'] }, { gte: ['hydroCover', 0.1] }, { gte: ['makeup.ice', 0.3] }, { hasTag: 'structure/icy-shell' }] }, ['planet', 'moon']),  // any liquid water OR ice → water-ice (deterministic; was wrongly capped to frozen worlds <250K)
    R('resource/volatiles', 'resource', 0.5, { any: [{ all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 160] }] }, { gte: ['makeup.ice', 0.5] }] }, ['belt', 'moon']),
    R('resource/hydrocarbons', 'resource', 1.0, { any: [{ eq: ['atmMain', 'CH4'] }, { eq: ['hydro', 'methane'] }] }, ['planet', 'moon']),  // methane atmosphere OR surface lakes — deterministic
    RS('resource/exotic-crystals', 'resource', 0.25, { all: [{ gte: ['massMe', 2] }, { gte: ['makeup.rockMetal', 0.7] }] }, ['planet', 'moon']),
    RS('resource/diamonds', 'resource', 0.4, { all: [{ gte: ['makeup.carbon', 0.3] }, { gte: ['massMe', 0.8] }] }, ['planet', 'moon']),
    RS('resource/organics', 'resource', 0.5, { any: [{ eq: ['hasBio', true] }, { hasTag: 'prebiotic-precursor' }, { all: [{ eq: ['hydro', 'water'] }, { between: ['teqK', 250, 330] }] }] }, ['planet', 'moon']),
    R('resource/ore-belt', 'resource', 0.8, true, ['belt']),
    // Atmosphere-present resources — DETERMINISTIC (the gas is measurably there, so the resource is): chance 1.0.
    R('resource/oxidizer', 'resource', 1.0, { eq: ['hasO2', true] }, ['planet', 'moon']),
    R('resource/noble-gases', 'resource', 1.0, { eq: ['hasNobleGas', true] }, ['planet', 'moon']),
    R('resource/volatiles', 'resource', 1.0, { eq: ['atmMain', 'CO2'] }, ['planet', 'moon']),
    R('science/pristine-protoplanetary', 'science', 0.85, { lt: ['ageGyr', 0.5] }, ['planet', 'moon']),
    R('science/biosignature', 'science', 0.95, { eq: ['hasBio', true] }, ['planet', 'moon']),
    R('science/extremophile-niche', 'science', 0.8, { any: [{ eq: ['regime', 'cryovolcanic'] }, { hasTag: 'structure/subsurface-ocean' }, { hasTag: 'habitability/subsurface' }] }, ['planet', 'moon']),
    R('science/tidal-laboratory', 'science', 0.6, { any: [{ hasTag: 'tidal/hotspots' }, { eq: ['regime', 'tidal-volcanic'] }, { hasTag: 'resonance/laplace' }] }, ['planet', 'moon']),
    R('science/impact-record', 'science', 0.3, { any: [{ gt: ['ecc', 0.2] }, { eq: ['regime', 'crater'] }] }, ['planet', 'moon', 'belt']),
    R('science/remnant-proximity', 'science', 0.6, { eq: ['hasRemnant', true] }, ['planet', 'moon']),
    R('science/resonance-showcase', 'science', 0.45, { hasTagPrefix: 'resonance/' }, ['planet', 'moon']),
    R('science/rare-world-type', 'science', 0.6, { eq: ['isRareType', true] }, ['planet', 'moon']),
    R('science/exotic-chemistry', 'science', 0.4, { any: [{ hasTag: 'highly-corrosive' }, { hasTag: 'corrosive' }, { hasTag: 'technosignature' }] }, ['planet', 'moon']),
    R('science/runaway-greenhouse', 'science', 0.5, { any: [{ eq: ['regime', 'stagnant-lid'] }, { hasTag: 'climate/runaway-greenhouse' }] }, ['planet']),
    RS('frontier/fuel-depot', 'frontier', 0.6, { any: [{ gte: ['makeup.ice', 0.2] }, { eq: ['hydro', 'water'] }, { all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 250] }, { hasTag: 'structure/icy-shell' }] }] }, ['planet', 'moon']),
    R('frontier/gas-skimming', 'frontier', 0.92, { eq: ['isGiant', true] }, ['planet']),
    RS('frontier/life-support', 'frontier', 0.6, { any: [{ eq: ['hasO2', true] }, { all: [{ eq: ['hydro', 'water'] }, { eq: ['hasAtmo', true] }] }] }, ['planet', 'moon']),
    R('frontier/aerobraking', 'frontier', 0.3, { all: [{ eq: ['hasAtmo', true] }, { gte: ['pressure', 0.1] }] }, ['planet', 'moon']),
    R('frontier/gravity-assist', 'frontier', 0.3, { gte: ['massMe', 50] }, ['planet']),
    R('frontier/waystation', 'frontier', 0.2, { gt: ['makeup.rockMetal', 0.4] }, ['moon']),
    R('intrigue/anomalous-signal', 'intrigue', 0.08, true, ['planet', 'moon', 'belt']),
    R('intrigue/derelict-rumour', 'intrigue', 0.18, { eq: ['hasConstructs', true] }, ['planet', 'moon', 'belt']),
    R('intrigue/derelict-rumour', 'intrigue', 0.05, { eq: ['hasConstructs', false] }, ['planet', 'moon', 'belt']),
    R('intrigue/uncharted-feature', 'intrigue', 0.1, true, ['planet', 'moon', 'belt']),
    R('intrigue/legend', 'intrigue', 0.4, { any: [{ hasTag: 'habitability/super' }, { eq: ['isLegendClass', true] }] }, ['planet', 'moon']),
    // Belt-specific hooks. Belts read by temperature (icy outer/Kuiper vs rocky-metallic inner) and
    // orbital excitation (a stirred belt is likely a disrupted differentiated body — a shattered core).
    R('frontier/ice-mining', 'frontier', 0.7, { all: [{ gt: ['teqK', 0] }, { lt: ['teqK', 150] }] }, ['belt']),
    R('resource/rare-metals', 'resource', 0.4, { gte: ['teqK', 150] }, ['belt']),
    R('science/shattered-core', 'science', 0.5, { gt: ['ecc', 0.12] }, ['belt'])
  ]
};
