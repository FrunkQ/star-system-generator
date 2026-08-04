// Tag presentation layer: turns raw namespaced tag keys (geology/cryovolcanic, magnetic/induced,
// structure/icy-shell, …) into a friendly LABEL + a plain-English DESCRIPTION (the physics behind
// it) + a namespace GROUP and COLOUR. Keeps the data model terse while the UI reads human.

export interface TagPresentation {
  key: string;
  label: string;
  description: string;
  group: string;
  color: string;
  textColor?: string;
}

// PoI category styles, registered at runtime by the reasons-to-visit system from the active packs.
// Keyed by category id (= the tag namespace before "/"). Lets a user-defined tag like
// survey/geochem-sample render with its pack-chosen colour + heading. Stale entries are harmless.
const POI_CATEGORY_STYLE: Record<string, { label: string; color: string; textColor?: string }> = {};
export function registerPoiCategories(cats: { id: string; label: string; color?: string; textColor?: string }[]): void {
  for (const c of cats) {
    if (!c?.id) continue;
    POI_CATEGORY_STYLE[c.id] = { label: c.label || c.id, color: c.color || NAMESPACE_META[c.id]?.color || '#888888', textColor: c.textColor };
  }
}

// Per-tag friendly name + hover description, supplied by PoI rules (the editor's "player name" and
// "hover text"). Rebuilt wholesale on each registration so deletions/edits take effect. Overrides
// the built-in TAG_INFO / title-cased fallback for that exact tag key.
const POI_TAG_META: Record<string, { label?: string; description?: string; color?: string; textColor?: string }> = {};
export function registerPoiTags(tags: { key: string; label?: string; description?: string; color?: string; textColor?: string }[]): void {
  for (const k of Object.keys(POI_TAG_META)) delete POI_TAG_META[k];
  for (const t of tags) {
    if (t?.key && (t.label || t.description || t.color)) {
      POI_TAG_META[t.key] = { label: t.label, description: t.description, color: t.color, textColor: t.textColor };
    }
  }
}

// Per-namespace grouping + chip colour.
const NAMESPACE_META: Record<string, { group: string; color: string; poi?: boolean }> = {
  origin:       { group: 'Origin',       color: '#8a8a9a' },
  orbit:        { group: 'Orbit',        color: '#9a8ac0' },
  barycenter:   { group: 'Barycentre',   color: '#9a8ac0' },
  stability:    { group: 'Stability',    color: '#b0a060' },
  resonance:    { group: 'Resonance',    color: '#c0a0e0' },
  fate:         { group: 'Stability',    color: '#d06868' },
  structure:    { group: 'Structure',    color: '#5f8f8f' },
  ring:         { group: 'Rings',        color: '#b9a36a' },
  geology:      { group: 'Geology',      color: '#c2733a' },
  tidal:        { group: 'Tidal',        color: '#d8843a' },
  magnetic:     { group: 'Magnetism',    color: '#6aa0d8' },
  thermal:      { group: 'Thermal',      color: '#e0955a' },
  aurora:       { group: 'Aurora',       color: '#57d69a' },
  shape:        { group: 'Shape',        color: '#c9a0e0' },
  spin:         { group: 'Spin',         color: '#c9a0e0' },
  atmosphere:   { group: 'Atmosphere',   color: '#8aa0b0' },
  climate:      { group: 'Climate',      color: '#6fae8f' },
  weather:      { group: 'Weather',      color: '#7fb6cc' },
  surface:      { group: 'Surface',      color: '#a98a63' },
  hazard:       { group: 'Hazard',       color: '#cc5555' },
  flight:       { group: 'Flight',       color: '#5a9fd4' },
  habitability: { group: 'Habitability', color: '#5bbf6a' },
  biodiversity: { group: 'Biosphere',    color: '#4fa86a' },
  // RPG "reasons to visit" categories (poi: re-derived by a PoI RULE the user can change).
  resource:     { group: 'Resources',    color: '#d4a843', poi: true },
  science:      { group: 'Science',       color: '#5a9fd0', poi: true },
  frontier:     { group: 'Frontier',      color: '#6fae8f', poi: true },
  intrigue:     { group: 'Intrigue',      color: '#b07ad0', poi: true }
};

// Namespace-level fallback description. Every derived tag should justify its existence in the physics
// panel, so when a specific TAG_INFO entry is missing (a new tag we haven't written up yet — auroras,
// bands, a fresh climate flag…) we still explain what KIND of thing it is rather than showing nothing.
// Add a specific TAG_INFO entry to say more; add a line here when you introduce a whole new namespace.
const NAMESPACE_DESC: Record<string, string> = {
  origin:       'How and where this body formed, versus where it ended up.',
  orbit:        'A property of the body\'s orbit.',
  barycenter:   'A shared centre-of-mass balance point that two or more bodies orbit.',
  stability:    'How dynamically stable the orbit is over the long term.',
  resonance:    'An orbital resonance — a whole-number period ratio — with a neighbour.',
  fate:         'The predicted long-term end-state of the orbit.',
  structure:    'A derived internal or surface layer of the body.',
  ring:         'A property of the body\'s ring system.',
  geology:      'The body\'s tectonic and volcanic regime, set by its interior heat.',
  tidal:        'A consequence of tidal heating from a close, eccentric or resonant orbit.',
  magnetic:     'The body\'s magnetic field and the stellar-wind shielding it provides.',
  atmosphere:   'A property of the atmosphere\'s composition.',
  climate:      'A derived surface-climate condition.',
  weather:      'Weather derived from the body\'s cloud decks and the energy driving them.',
  surface:      'A property of the surface itself — its age, what the sky and the star have done to it.',
  hazard:       'An environmental or stellar hazard to visitors or the atmosphere.',
  flight:       'What it costs to get to or from this world.',
  aurora:       'A polar auroral glow from ionising particles funnelled into the atmosphere by the magnetic field.',
  habitability: 'The body\'s habitability tier under the current model.',
  biodiversity: 'A property of the body\'s biosphere.',
  shape:        'The body\'s rotational shape — how far its spin has deformed it from a sphere.',
  spin:         'The body\'s spin AXIS — which way it leans, and where that lean came from.'
};

// Friendly label + physics description, keyed by exact tag.
const TAG_INFO: Record<string, { label: string; description: string }> = {
  // --- Resonances & predicted fates ---
  'resonance/laplace': {
    label: 'Laplace resonance',
    description: 'Three bodies locked in a 1:2:4 orbital chain (Io–Europa–Ganymede style). The lock is protective AND continually pumps eccentricity — the archetypal driver of tidal heating.'
  },
  'fate/infall': {
    label: 'Fated: spirals in',
    description: 'The predicted end-state: the orbit decays inside the Roche limit or onto the host — consumed or tidally shredded into a ring.'
  },
  'fate/eject': {
    label: 'Fated: flung out',
    description: 'The predicted end-state: gravitational scattering pumps the orbit until the body is thrown onto an escape trajectory.'
  },
  'fate/collision': {
    label: 'Fated: collision',
    description: 'The predicted end-state: crossing orbits with a comparable-mass neighbour — a merger or mutual disruption.'
  },
  'fate/inversion': {
    label: 'Unphysical hierarchy',
    description: 'The orbiting body outweighs its host — rebuild the hierarchy.'
  },
  // --- Stability severities (timescales from the spacing/overlap heuristics) ---
  'stability/marginal': {
    label: 'Marginal',
    description: 'Metastable: dynamically packed and perturbation-sensitive, but generally long-lived (>100 Myr to Gyr).'
  },
  'stability/unstable': {
    label: 'Unstable',
    description: 'Likely 1–100 Myr before disruption under sustained perturbations.'
  },
  'stability/very-unstable': {
    label: 'Very unstable',
    description: 'Likely <1 kyr before major orbital disruption (collision, ejection or infall).'
  },
  // --- RPG "reasons to visit": resource / science / frontier / intrigue ---
  'resource/heavy-metals':    { label: 'Heavy metals',      description: 'A metal-rich interior/crust — iron, nickel and friends in extractable concentrations.' },
  'resource/platinum-group':  { label: 'Platinum-group',    description: 'Unusually metal-dense — platinum, iridium, osmium: high-value, low-bulk cargo.' },
  'resource/rare-earths':     { label: 'Rare earths',       description: 'Lanthanides and friends in workable ore — the stuff of electronics and exotic alloys.' },
  'resource/fissiles':        { label: 'Fissiles',          description: 'A radiogenic-rich crust: uranium/thorium for reactors and weapons-grade refining.' },
  'resource/helium-3':        { label: 'Helium-3',          description: 'He-3 for clean fusion — abundant in giant atmospheres and solar-wind-soaked airless regolith.' },
  'resource/deuterium':       { label: 'Deuterium',         description: 'Heavy hydrogen for fusion fuel — skimmed from giant atmospheres or extracted from water.' },
  'resource/water-ice':       { label: 'Water ice',         description: 'Accessible water ice — reaction mass, life support and split-for-fuel.' },
  'resource/volatiles':       { label: 'Volatiles',         description: 'Frozen gases (CO₂, ammonia, methane) — cheap propellant and industrial feedstock.' },
  'resource/hydrocarbons':    { label: 'Hydrocarbons',      description: 'Liquid/solid hydrocarbons — a petrochemical bonanza (Titan-style methane seas).' },
  'resource/exotic-crystals': { label: 'Exotic crystals',   description: 'High-pressure mineral phases from a deep interior — prized for tech and curiosity alike.' },
  'resource/diamonds':        { label: 'Diamonds',          description: 'A carbon-rich, high-pressure world — diamond as bedrock, and as industrial abrasive.' },
  'resource/organics':        { label: 'Organics',          description: 'Pre-biotic or biotic organic chemistry — feedstock, samples, or food supplies.' },
  'resource/ore-belt':        { label: 'Asteroid ore',      description: 'A debris belt: undifferentiated metals, rock and ice ready for in-situ mining.' },
  'resource/rare-metals':     { label: 'Asteroid rare metals', description: 'A warm, rocky-metallic belt — platinum-group and rare earths in low-gravity bodies that are cheap to mine.' },
  'resource/oxidizer':        { label: 'Oxidizer',          description: 'A free-oxygen atmosphere — bankable oxidizer for chemical propellant and industry.' },

  'science/pristine-protoplanetary': { label: 'Pristine protoplanetary', description: 'A very young world — a snapshot of planet formation before it weathers away.' },
  'science/biosignature':            { label: 'Biosignature',            description: 'Signs of life — the find of a career, and a quarantine headache.' },
  'science/extremophile-niche':      { label: 'Extremophile niche',      description: 'A sub-ice ocean or cryo-vent: a candidate for alien biochemistry.' },
  'science/tidal-laboratory':        { label: 'Tidal laboratory',        description: 'Extreme tidal heating — a natural lab for interior physics (and a spectacular sight).' },
  'science/impact-record':           { label: 'Impact record',           description: 'A battered or eccentric body preserving the system\'s collisional history.' },
  'science/remnant-proximity':       { label: 'Remnant proximity',       description: 'Orbits near a stellar remnant — relativistic physics on the doorstep.' },
  'science/resonance-showcase':      { label: 'Resonance showcase',      description: 'A clean orbital resonance — a textbook celestial-mechanics demonstration.' },
  'science/rare-world-type':         { label: 'Rare world type',         description: 'An uncommon planet class — worth charting for its rarity alone.' },
  'science/exotic-chemistry':        { label: 'Exotic chemistry',        description: 'Aggressive or artificial atmospheric chemistry — hazardous and fascinating.' },
  'science/runaway-greenhouse':      { label: 'Runaway greenhouse',      description: 'A Venus-like hothouse — a cautionary tale and a climate-science prize.' },
  'science/shattered-core':          { label: 'Shattered core',          description: 'An eccentric, dynamically excited belt — likely the debris of a disrupted differentiated body, its metallic core laid bare. A window into planetary interiors (and a metal bonanza).' },

  'frontier/ice-mining':     { label: 'Belt ice refuelling', description: 'Icy belt/Kuiper bodies — crack the ice for hydrogen/oxygen propellant; refuelling among the rocks, no gravity well.' },
  'frontier/fuel-depot':     { label: 'Water/ice refuelling', description: 'Accessible water/ice to crack into hydrogen/oxygen propellant — a wilderness refuelling stop.' },
  'frontier/gas-skimming':   { label: 'Gas-giant refuelling', description: 'Skim the giant\'s hydrogen atmosphere for jump/reaction fuel — the classic Traveller wilderness top-up.' },
  'frontier/life-support':   { label: 'Life-support resupply', description: 'Breathable oxygen and/or water on hand — replenish air and life-support consumables.' },
  'frontier/aerobraking':    { label: 'Aerobraking',      description: 'Enough atmosphere to brake against — saves fuel on arrival.' },
  'frontier/gravity-assist': { label: 'Gravity assist',   description: 'A massive body well placed for slingshot manoeuvres.' },
  'frontier/waystation':     { label: 'Waystation site',  description: 'A solid, resource-bearing moon — a plausible spot for a forward base.' },

  'intrigue/anomalous-signal':  { label: 'Anomalous signal',  description: 'Something here is broadcasting — or reflecting — that shouldn\'t be. (GM hook.)' },
  'intrigue/derelict-rumour':   { label: 'Derelict rumour',   description: 'Spacers\' tales of a wreck or abandoned station in this neighbourhood. (GM hook.)' },
  'intrigue/uncharted-feature': { label: 'Uncharted feature', description: 'A surface/orbital feature the surveys can\'t quite explain. (GM hook.)' },
  'intrigue/legend':            { label: 'Legend',            description: 'A world that has entered legend — paradise, curse, or both. (GM hook.)' },

  // --- Orbit ---
  'orbit/tidally-locked': {
    label: 'Tidally locked',
    description: 'Derived: the despinning timescale (∝ a⁶) is shorter than the system age, so the body has settled into synchronous rotation — one face permanently toward its host (the Moon, and most close-in worlds). Its day length is therefore its orbital period, and is set from it. Pin it by hand in the body editor to override.'
  },
  'orbit/spin-orbit-resonance': {
    label: 'Spin–orbit resonance',
    description: 'Despun by tides, but NOT to a permanent face: an eccentric orbit captured the spin into a whole-number ratio with the year instead. Mercury is the real example — it turns 3 times for every 2 orbits, so its day is its own number rather than its year, and the whole surface still sees the star.'
  },
  'orbit/locked-star': {
    label: 'Locked to its star',
    description: 'Tidally locked to the STAR — one face permanently sunward. A permanent day/night split (an eyeball world): a baked or molten substellar hemisphere and a frozen far side.'
  },
  'orbit/locked-planet': {
    label: 'Locked to its planet',
    description: 'A moon tidally locked to its planet — one face permanently toward the planet, but its whole surface still cycles through stellar day and night over its orbit, so it weathers evenly (no eyeball).'
  },
  'orbit/retrograde': {
    label: 'Retrograde orbit',
    description: 'Orbits opposite to the system\'s general direction — usually the signature of a captured body or a violent dynamical past.'
  },
  'orbit/double': {
    label: 'Double planet',
    description: 'Two comparable-mass bodies orbiting their common barycentre rather than one clearly orbiting the other (Pluto–Charon).'
  },

  // --- Origin (how the body came to be where it is) ---
  'origin/captured': {
    label: 'Captured',
    description: 'Not formed here: a retrograde or steeply-inclined orbit is the tell-tale of a body gravitationally captured from elsewhere (Triton, the irregular moons).'
  },
  'origin/migrated': {
    label: 'Migrated',
    description: 'Formed at a different distance and migrated to its present orbit — the classic history of a hot Jupiter that spiralled inward through the disc.'
  },
  'origin/generated': {
    label: 'Generated',
    description: 'INVENTED, NOT OBSERVED. A real-sky import filled this world in around a confirmed star to make the system playable; no telescope has seen it. Seeded from the star\'s catalogue id, so the same import always produces the same worlds. The confirmed detections in the same system carry no such tag — that is how you tell them apart.'
  },

  // --- Spin (the axis, as opposed to shape/ which is what the spin does to the body) ---
  'spin/axis-inferred': {
    label: 'Spin axis inferred',
    description: 'This world\'s axial tilt is a plausible value from the formation model, not a measurement. A body condenses aligned with its disc and is tipped from there, so the figure shown is typical rather than known — unlike Earth\'s 23.4 degrees or Uranus\'s 97.8, which have been observed.'
  },
  'spin/tipped': {
    label: 'Tipped over',
    description: 'Hit hard enough to re-point its axis. A late giant impact does not nudge a spin axis, it replaces it, leaving an obliquity unrelated to the disc the world formed in — Uranus lies on its side at 97.8 degrees and Venus turns backwards at 177.4.'
  },

  // --- Barycentre ---
  'barycenter/auto': {
    label: 'Auto barycentre',
    description: 'An automatically-inserted balance point (centre of mass) that a multiple-star or double-planet pair orbits — created by the engine to keep the hierarchy physical, not hand-placed.'
  },

  // --- Hazard ---
  'hazard/flaring': {
    label: 'Flare hazard',
    description: 'The host star flares — episodic flares and coronal mass ejections spike radiation and can erode an unshielded atmosphere (common on active M-dwarfs).'
  },
  'hazard/radiation': {
    label: 'Radiation hazard',
    description: 'HOW LONG a character standing on this surface survives it, which is what sieverts per year will not tell you: hours, days, weeks, months or years to a median lethal dose. Past fifty years the acute model stops meaning anything, so it says chronic instead (a real long-term cancer risk, above the 20 mSv/yr occupational limit) or background (Earth sits here). The exact figure is beside the dose in the data block. Not the same reading as "Space weathering", which is a cumulative total and reads low on the fiercest surface in a system.'
  },
  'hazard/orbital-radiation': {
    label: 'Radiation belts',
    description: 'The same survival-time reading for the space above the atmosphere, at the INNER EDGE OF THE TRAPPED-PARTICLE BELTS — 1,263 km up in Earth\'s case — shown only when it differs materially from the surface. It is not the dose at any altitude a ship chooses: low orbit sits BENEATH the belts, which is why the ISS at 400 km takes about 150 mSv a year while this figure reads days-to-lethal. Read it as "there is a hazardous shell around this world", not as "orbit is lethal".'
  },

  // --- Flight ---
  'flight/ascent': {
    label: 'Ascent cost',
    description: 'What it takes to get off this world and into a low orbit - trivial (under 2 km/s, a small craft hops off, like Luna), moderate (under 5, Mars), hard (under 15, Earth), extreme (Venus at 29 km/s). The figure itself is the Ascent Delta-v row in the data block.'
  },

  // --- Rings (derived from ring-child geometry) ---
  'ring/system':   { label: 'Ringed',         description: 'Hosts a ring system — orbiting ice/rock debris — derived from a ring child in the geometry, not hand-tagged.' },
  'ring/multiple': { label: 'Multiple rings',  description: 'More than one distinct ring orbits the body.' },
  'ring/light':    { label: 'Light ring',      description: 'A faint, low-mass ring — sparse, tenuous debris.' },
  'ring/medium':   { label: 'Medium ring',     description: 'A moderately dense ring of orbiting debris.' },
  'ring/heavy':    { label: 'Heavy ring',      description: 'A dense, massive ring — a bright, prominent Saturn-like band.' },

  // --- Geology (tectonics + volcanism by mechanism) ---
  'geology/plate-tectonics': {
    label: 'Plate tectonics',
    description: 'A vigorous interior plus surface water drives a mobile lid; the carbonate–silicate cycle regulates climate — the engine of long-term habitability (Earth).'
  },
  'geology/stagnant-lid': {
    label: 'Stagnant lid',
    description: 'A vigorous but dry interior under a single unbroken plate, shedding its heat quietly. Nothing recycles the crust, so there is no carbonate–silicate cycle to regulate climate.'
  },
  'geology/episodic': {
    label: 'Episodic resurfacing',
    description: 'A vigorous but dry lid traps heat until the whole thing overturns at once, resurfacing the planet catastrophically and then going quiet again (Venus, on a ~700 Myr cycle). No CO₂ drawdown between overturns, so the greenhouse runs away.'
  },
  'geology/plutonic': {
    label: 'Plutonic',
    description: 'Modest interior heat melts rock at depth but cannot reach the surface or mobilise the lid: magma intrudes and freezes in place as plutons and dykes under an intact crust. A waning or mid-sized world.'
  },
  'geology/volcanic-tidal': {
    label: 'Tidal volcanism',
    description: 'Tidal flexing drives silicate volcanism far exceeding radiogenic heat — surfaces resurface too fast for surface life (Io).'
  },
  'geology/cryovolcanic': {
    label: 'Cryovolcanism',
    description: 'Interior heat keeps a subsurface ocean liquid; plumes vent water/ice through the crust — a separate, sub-ice habitability niche (Europa/Enceladus).'
  },
  'geology/inactive': {
    label: 'Geologically dead',
    description: 'Radiogenic heat has decayed below the convection threshold (small or old world); no tectonics, no volcanism, no nutrient recycling (Mars/Moon).'
  },

  // --- Tidal heating ---
  'tidal/hotspots':  { label: 'Tidal hotspots',  description: 'Tidal flexing concentrates heat into localized hotspots far above the mean surface temperature.' },
  'tidal/volcanism': { label: 'Active volcanism', description: 'Tidal hotspots reach volcanic temperatures.' },
  'tidal/lava-flows':{ label: 'Tidal lava flows', description: 'Tidal hotspots reach silicate melt — surface lava lakes and flows (Io).' },

  // --- Magnetism ---
  'magnetic/dynamo':     { label: 'Intrinsic dynamo', description: 'A convecting conductive interior generates a self-sustained magnetic field that shields the atmosphere from stellar wind.' },
  'magnetic/induced':    { label: 'Induced field',    description: "A conductive subsurface ocean induces a weak field within the host planet's magnetosphere — no internal dynamo (Europa)." },
  'magnetic/tenuous':    { label: 'Tenuous magnetosphere', description: 'A real but very weak field (well under a tenth of Earth’s) — a small or slowly-spinning iron core (Mercury ≈ 0.003 G). Barely any stellar-wind shielding.' },
  'magnetic/unshielded': { label: 'No magnetosphere', description: 'No convecting conductor (or far too slow rotation) → the atmosphere is exposed to stellar-wind stripping.' },
  'magnetic/anomalous':  { label: 'Anomalous field',  description: 'A magnetic field with no interior dynamo to explain it — an imposed field of unknown or artificial origin (megastructure, exotic matter, a young system…).' },

  // --- Thermal (self-luminosity) ---
  'thermal/self-luminous': { label: 'Self-luminous', description: 'A brown-dwarf-mass body (~8–80 Jupiter masses) that radiates its OWN heat from gravitational contraction and early deuterium burning — a "failed star". It glows in the infrared, cools over gigayears (L→T→Y), and warms and irradiates its moons like a mini-star. The value is its effective temperature in K.' },

  // --- Aurorae (atmosphere + magnetosphere + ionising particle flux) ---
  'aurora/faint':     { label: 'Faint aurora',     description: 'A subtle polar shimmer — enough field to channel some ionising particles into the upper air, but a weak display.' },
  'aurora/moderate':  { label: 'Aurora',           description: 'Clear auroral curtains ringing the magnetic poles where funnelled particles excite the atmosphere — an Earth-class light show.' },
  'aurora/strong':    { label: 'Strong aurora',    description: 'Bright, restless polar curtains — a stout magnetosphere pouring particles into a substantial atmosphere.' },
  'aurora/brilliant': { label: 'Brilliant aurora', description: 'Huge, blazing auroral ovals — the Jupiter class, where an immense field and dense atmosphere light up on a planetary scale.' },

  // --- Shape (rotational deformation) ---
  'shape/oblate':       { label: 'Oblate', description: 'Spinning fast enough to visibly flatten at the poles and bulge at the equator (Jupiter/Saturn-like).' },
  'shape/ellipsoid':    { label: 'Ellipsoid', description: 'Rapid rotation has pulled it into a distinctly triaxial, egg-in-plan shape — well beyond a gentle bulge.' },
  'shape/near-breakup': { label: 'Near break-up', description: 'Spinning so fast the equator is close to the mass-shedding limit — strongly deformed, tending toroidal.' },
  'shape/unstable':     { label: 'Rotationally unstable', description: 'At or beyond its break-up spin — the equator can no longer hold on; the body would fly apart into a ring.' },

  // --- Structure (derived layering) ---
  'structure/icy-shell':        { label: 'Icy shell',        description: 'A frozen exterior (the value names the ice — water, nitrogen, CO₂, methane…) over a rockier interior.' },
  'climate/polar-ice':          { label: 'Polar ice',        description: 'Liquid at the mean temperature, but the cold poles / night side dip below the solvent\'s freezing point — partial frozen caps.' },
  'climate/runaway-greenhouse': { label: 'Runaway greenhouse', description: 'A runaway greenhouse has taken hold — trapped heat has driven surface volatiles into a thick, self-reinforcing hothouse atmosphere (Venus).' },
  'structure/subsurface-ocean': { label: 'Subsurface ocean', description: 'A liquid ocean beneath an ice crust, kept liquid by tidal and/or radiogenic interior heat.' },
  'structure/cloud-deck':       { label: 'Cloud deck',       description: 'A condensed cloud layer in the atmosphere. The value names what it is made of and how completely it covers the sky — wisps, scattered, broken, overcast or a total veil. A world can carry several decks at once, stacked by the temperature each substance condenses at.' },
  'weather/precipitation':      { label: 'Precipitation',    description: 'What falls out of a cloud deck, and whether it survives the trip down: rain where the drops reach the ground, snow where they freeze, and virga where they evaporate on the way (Venus\'s sulphuric-acid rain never lands).' },
  'surface/age':                { label: 'Surface age',       description: 'How long the visible surface has been sitting there exposed — young, moderate, old or ancient. A world that resurfaces itself keeps wiping the slate clean, so this is not the body\'s age: it is how much time the craters, weathering and irradiation have had to accumulate on what you can actually see.' },
  // NOT a dose rate, and the old label said otherwise. This is `irradiationDose` bucketed: a CUMULATIVE
  // exposure relative to Earth-unshielded-young, i.e. how weathered the visible surface is, and it sat
  // in the same block as annual dose figures under the word "Irradiation" (inbox A33). Io's surface is
  // the proof it is a different quantity: constantly resurfaced, so it reads LOW here while its
  // radiation rows read among the highest in the solar system. The name now says which one it is.
  'surface/irradiation':        { label: 'Space weathering',  description: 'How much starlight and cosmic radiation the unshielded surface has accumulated over its exposed lifetime — low, moderate or high. This is a total relative to a young unshielded Earth, NOT a dose per year, so it does not compare with the radiation figures above: a constantly resurfaced world reads low here however fierce its radiation environment. It is what darkens and reddens icy worlds, turning retained organics into tholins.' },
  // --- Rulepack ATMOSPHERE tags that had no entry (inbox B29). They are emitted from gasPhysics
  // triggers and were reaching a reader as bare title-cased words with no explanation at all —
  // "Biosignature" beside "Exotic Biology" on the same world, with nothing to say they are the same
  // gas seen twice. Registered here, where every other built-in pack tag is described.
  'high-humidity':              { label: 'High humidity',   description: 'Water vapour is a substantial fraction of the air (partial pressure above 0.05 bar) — muggy, and enough airborne water to matter for weather, corrosion and life support.' },
  'biosignature':               { label: 'Biosignature',    description: 'A gas present that is hard to produce without life, at a concentration no known geology accounts for. Evidence worth investigating, not proof.' },
  'exotic-biology':             { label: 'Exotic biology',  description: 'The biosignature gas here is one that points AWAY from water-carbon life as we know it — chemistry that would need a different biochemistry to explain.' },
  'volatiles/ices':             { label: 'Retained ice',      description: 'A volatile that survives ON THE SURFACE as frost or bright ice, rather than being lost to space. It needs both traps: cold enough for the species to stay solid, and gravity enough to hold the vapour it sublimates (the Jeans parameter above the retention floor). A body emits one of these per species it keeps.' },
  'surface/oxidised':           { label: 'Oxidised surface', description: 'Iron at the surface has RUSTED — this is why Mars is red. It takes iron, an oxidiser to react with (free oxygen, or the carbon dioxide and water that did the job on early Mars) and long exposure: the Moon has the iron and the age but no atmosphere, so it stays grey.' },
  'stellar/activity':           { label: 'Magnetic activity', description: 'How tangled this star\'s magnetic field is — the one thing behind its starspots, its bright faculae and its flares. Young, fast-spinning and low-mass stars run active or flare constantly; an old sun-like star shows a handful of small spots.' },
  'weather/lightning':          { label: 'Lightning',        description: 'Charge separation in a deep convecting cloud deck — driven by a warm, thick atmosphere, or by ash where the world is volcanically active. The value is how often it fires.' },
  'weather/dust-storms':        { label: 'Dust storms',      description: 'A dry, loose, wind-scoured surface with air enough to lift it and no ocean to pin it down (Mars). The value is how far they spread — seasonal, frequent, or planet-wide.' },
  'weather/monsoon':            { label: 'Monsoon',          description: 'A seasonal swing in rainfall: rain that reaches the ground, an ocean to supply it, and an axial tilt big enough to give the year real seasons. The value names the rain.' },
  'feature/polar-vortex':       { label: 'Polar vortex',     description: 'A standing polar jet stream on a gas giant that locks into a geometric polygon — Saturn\'s north pole is a famous hexagon (6 sides); Jupiter\'s poles hold polygonal cyclone rings (5–8). The value is the side count.' },
  'structure/supercritical-envelope': { label: 'Supercritical envelope', description: 'The dominant volatile is past its critical point (for water, 647 K / 218 bar) — a dense supercritical fluid that is neither a true sea nor a true sky.' },

  // --- Hydrosphere phase (the recorded surface volatile, read at the current temperature & pressure) ---
  'hydrosphere/ocean':      { label: 'Standing liquid',   description: 'A standing surface liquid — the recorded solvent is liquid at the surface temperature and pressure. Extractable, life-relevant, a place for chemistry to run.' },
  'hydrosphere/frozen':     { label: 'Frozen surface',    description: 'The recorded surface volatile is below its melting point — the "coverage" is an ice sheet, not a sea.' },
  'hydrosphere/boiled-off':  { label: 'Boiled off',        description: 'The recorded solvent is above its boiling point at this pressure — the surface is desiccated; the inventory has gone to vapour.' },
  'hydrosphere/brine':      { label: 'Briny sea',         description: 'A salty, electrically conductive ocean — freezing-point-depressed (liquid below 0 °C) and able to induce a magnetic field in a host\'s field.' },
  'climate/steam-world':    { label: 'Steam world',       description: 'A boiled-off ocean still held as a thick water-vapour atmosphere — a white, high-albedo, greenhouse-dominated sky.' },

  // --- Activity (volatile-driven surface processes) ---
  'activity/sublimating':   { label: 'Sublimating',       description: 'Surface ices are below their triple-point pressure and warming toward their melt point, passing straight from solid to gas — the outgassing that raises a comet\'s coma and tail.' },
  'activity/cryovolcanism': { label: 'Cryovolcanism',     description: 'Interior heat drives icy-melt (water/ammonia) eruptions through a frozen crust — plumes and resurfacing, as on Enceladus and Triton.' },

  // --- Atmosphere gas roles (flat keys, from the atmosphere composition). RPG-relevant only:
  //     survival, breathability, equipment hazards, world-building signals. ---
  // Namespaced atmosphere variants emitted by the generator (alongside the flat gas-role keys below).
  'atmosphere/breathable':     { label: 'Breathable',       description: 'The atmosphere\'s composition and pressure fall within the human-breathable envelope — air you could breathe unaided.' },
  'atmosphere/reducing':       { label: 'Reducing',         description: 'A reducing atmosphere with no free oxygen — hydrogen/methane/ammonia chemistry, typical of a young or abiotic world.' },
  'inert':                     { label: 'Inert atmosphere', description: 'Dominated by chemically unreactive gases (N₂, noble gases) — no reactive chemistry.' },
  'oxidizer':                  { label: 'Oxidizing',        description: 'Free oxidizer (e.g. O₂) present — a strong sign of an active biosphere or photochemistry.' },
  'breathable-human':          { label: 'Breathable',       description: 'Composition and partial pressures fall within the human-breathable envelope.' },
  'breathable-human-hypoxic':  { label: 'Thin but breathable', description: 'Breathable mix, but low partial pressure of O₂ — hypoxic, like high altitude.' },
  'reducing':                  { label: 'Reducing',         description: 'No free oxygen — hydrogen/methane/ammonia chemistry (a young or abiotic world).' },
  'corrosive':                 { label: 'Corrosive',        description: 'Corrosive species attack unprotected gear and suits over time.' },
  'highly-corrosive':          { label: 'Highly corrosive', description: 'Aggressively corrosive (sulfuric acid, halogens) — rapid damage to gear and suits.' },
  'toxic-human':               { label: 'Toxic',            description: 'Toxic to humans at the modelled partial pressures — a suit breach is dangerous.' },
  'highly-toxic':              { label: 'Highly toxic',     description: 'Lethal in small doses (e.g. HCN) — even trace exposure is deadly.' },
  'asphyxiant':                { label: 'Asphyxiant',       description: 'Displaces oxygen — suffocation risk without a sealed air supply.' },
  'crushing-atmosphere':       { label: 'Crushing pressure',description: 'Surface pressure high enough to crush unrated equipment.' },
  'acid-rain':                 { label: 'Acid rain',        description: 'Acidic precipitation — an environmental and equipment hazard.' },
  'flammable':                 { label: 'Flammable',        description: 'Combustible gases present — ignition risk.' },
  'oxygen-toxicity':           { label: 'Oxygen toxicity',  description: 'O₂ partial pressure high enough to be toxic over time.' },
  'hypergolic':                { label: 'Hypergolic',       description: 'Spontaneously ignites on contact with common materials (e.g. F₂).' },
  'lifting-gas':               { label: 'Lifting gas',      description: 'Low-density gas that supports airships / balloons.' },
  'greenhouse':                { label: 'Greenhouse',       description: 'Contains greenhouse gases that warm the surface.' },
  'super-greenhouse':          { label: 'Super-greenhouse', description: 'Extremely potent greenhouse forcing (e.g. CFCs).' },
  'prebiotic-precursor':       { label: 'Prebiotic chemistry', description: 'Precursor molecules (e.g. HCN) relevant to the origin of life.' },
  'technosignature':           { label: 'Technosignature',  description: 'Artificial gases (e.g. CFCs) — a sign of technology, not nature.' },

  // --- Habitability tiers ---
  'habitability/super':      { label: 'Super-habitable',  description: 'Better than Earth for life — a larger biosphere on durable plate tectonics, a mature stable system, a warm wet optimum. Scores above 100.' },
  'habitability/earth-like': { label: 'Earth-like',       description: 'Surface conditions and an oxygen-bearing atmosphere closely match Earth.' },
  'habitability/human':      { label: 'Human-habitable',  description: 'Liveable for unprotected humans with little or no life support.' },
  'habitability/alien':      { label: 'Alien-habitable',  description: 'Hostile to humans but viable for some biochemistry.' },
  'habitability/subsurface': { label: 'Subsurface niche',  description: 'No surface biosphere, but a liquid subsurface ocean with an energy source could host sub-ice life (Europa/Enceladus).' },
  'habitability/none':       { label: 'Uninhabitable',    description: 'No plausible biosphere under the current model.' }
};

// --- Legacy tag cleanup -----------------------------------------------------------------------
// V1 tags the new engine replaces are stripped (never a manual tag). We avoid a hand-maintained
// list: a modern tag is always lowercase-hyphen-namespaced, so any key with an UPPERCASE letter or
// SPACE is a V1 display-name ("Tidally Locked", "Ice Giant", "Sun-like"); classification stored as a
// tag uses the planet/ · star/ · belt/ prefixes (NOT ring/, now a live physics namespace). The
// lowercase retired-atmosphere flavour (voice-changer, noble-gas, …) is handled separately by the
// atmosphere pass (RETIRED_ATMOSPHERE_TAGS), and the example files have been cleaned at source.
export function isLegacyTag(key: string): boolean {
  return /[A-Z\s]/.test(key) || /^(planet|star|belt)\//.test(key);
}

// A tag is "managed" (system-owned) if the engine re-derives it every run — physics namespaces,
// known flat gas tags, and the PoI categories (resource/science/frontier/intrigue). These can't be
// usefully removed by hand (they come straight back); the way to change them is the rules/PoI pack.
// Anything else is a USER tag — free-text the player added, theirs to keep or remove.
export function isManagedTag(key: string): boolean {
  return tagSource(key) !== 'manual';
}

// Where a tag comes from: 'physics' (derived, fixed — red lock), 'poi' (a PoI rule, changeable via
// the pack — orange lock), or 'manual' (the player's own — removable). Drives the Tags editor.
export type TagSource = 'physics' | 'poi' | 'manual';
export function tagSource(key: string): TagSource {
  if (key.includes('/')) {
    const ns = key.split('/')[0];
    if (POI_CATEGORY_STYLE[ns]) return 'poi';   // a registered PoI pack category
    const meta = NAMESPACE_META[ns];
    if (!meta) return 'manual';
    return meta.poi ? 'poi' : 'physics';
  }
  return key in TAG_INFO ? 'physics' : 'manual';
}

function titleCase(s: string): string {
  return s.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Flat (un-namespaced) gas-role tags derived from the atmosphere composition. They live without a
// "/" prefix for terseness, so group them explicitly under Atmosphere — this signals to the player
// that the lever is the body's atmosphere data (edit that to change these physics-derived tags).
const FLAT_ATMOSPHERE_TAGS = new Set([
  'inert', 'oxidizer', 'breathable-human', 'breathable-human-hypoxic', 'reducing', 'corrosive',
  'highly-corrosive', 'toxic-human', 'highly-toxic', 'asphyxiant', 'crushing-atmosphere', 'acid-rain',
  'flammable', 'oxygen-toxicity', 'hypergolic', 'lifting-gas', 'greenhouse', 'super-greenhouse',
  'prebiotic-precursor', 'technosignature'
]);

export function describeTag(key: string): TagPresentation {
  const ns = key.split('/')[0];
  // A registered PoI category wins (user/pack-chosen colour + heading), then flat atmosphere, then
  // the built-in namespace map, then a neutral fallback.
  const poiStyle = key.includes('/') ? POI_CATEGORY_STYLE[ns] : undefined;
  const meta = poiStyle
    ? { group: poiStyle.label, color: poiStyle.color }
    : (!key.includes('/') && FLAT_ATMOSPHERE_TAGS.has(key))
      ? { group: 'Atmosphere', color: NAMESPACE_META.atmosphere.color }
      : NAMESPACE_META[ns] ?? { group: 'Other', color: '#888888' };
  const textColor = poiStyle?.textColor;
  const info = TAG_INFO[key];
  // Dynamic mean-motion resonance tags (resonance/3-2 → "3:2 resonance").
  const mmr = !info && /^resonance\/(\d+)-(\d+)$/.exec(key);
  if (mmr) {
    return {
      key, label: `${mmr[1]}:${mmr[2]} resonance`, group: meta.group, color: meta.color,
      description: `Mean-motion resonance: the orbital periods sit in a ${mmr[1]}:${mmr[2]} whole-number ratio with a partner. Depending on the masses it shields the pair from close approaches, pumps eccentricity (tidal heating), or destabilises a packed system.`
    };
  }
  const tagMeta = POI_TAG_META[key];
  const label = tagMeta?.label || info?.label || titleCase(key.includes('/') ? key.split('/').slice(1).join(' ') : key);
  // Never leave a tag unexplained: specific write-up → namespace-level fallback → (last resort) blank.
  const description = tagMeta?.description ?? info?.description ?? (key.includes('/') ? NAMESPACE_DESC[ns] : undefined) ?? '';
  // A PER-TAG colour wins over its category's. That is what lets one `faction` category give every
  // faction its own flag colour without a second mechanism to configure.
  return {
    key, label, description, group: meta.group,
    color: tagMeta?.color || meta.color,
    textColor: tagMeta?.textColor || textColor
  };
}

// A CONTEXTUAL label for compact lists (reports, the field guide) where a bare "Oblate" or "Dynamo"
// loses its category. Prepends the group when it adds meaning — "Shape · Oblate", "Magnetism · Intrinsic
// dynamo" — but skips it when the label already conveys the category (e.g. "Brilliant aurora", "Inert
// atmosphere") to avoid "Aurora · Brilliant aurora". Appends the tag value when present ("… : 0.62").
// HOW A TAG'S VALUE IS SHOWN TO A READER (inbox B29 / A35).
//
// Most values are already words — `hours`, `moderate`, `water rain` — and pass straight through.
// A few are raw NUMBERS, and a bare number in a chip is a float on a scale nothing states: "Brilliant
// aurora: 0.78" tells a player nothing, and sat beside "Surface age: moderate" it is not even
// obviously a number rather than a grade. Every numeric value therefore needs one of two answers
// here — a unit, or suppression — and `tagConsistency.spec.ts` fails if a new one appears with
// neither.
//
// Returns null to show the label ALONE. That is the right answer whenever the number is a renderer
// input rather than a reading: the aurora tier is already in the key (`aurora/brilliant` → "Brilliant
// aurora"), so the strength adds precision the curtain needs and nothing a reader can use.
export function formatTagValue(key: string, value?: string): string | null {
  if (value == null || value === '') return null;
  if (key.startsWith('aurora/')) return null;                          // tier is in the key; strength is for the renderer
  if (key === 'thermal/self-luminous') {
    const k = Number(value);
    return Number.isFinite(k) ? `${k.toLocaleString()} K` : value;     // it is an effective temperature
  }
  if (key === 'feature/polar-vortex') {
    const n = Number(value);
    return Number.isFinite(n) ? `${n}-sided` : value;                  // it is a side count
  }
  return value;
}

export function tagContextLabel(key: string, value?: string): string {
  const { label, group } = describeTag(key);
  const gl = group.toLowerCase();
  const glSingular = gl.replace(/s$/, '');
  const known = !!group && group !== 'Other';
  const redundant = known && (label.toLowerCase().includes(gl) || label.toLowerCase().includes(glSingular));
  const base = known && !redundant ? `${group} · ${label}` : label;
  const shown = formatTagValue(key, value);
  return shown ? `${base}: ${shown}` : base;
}
