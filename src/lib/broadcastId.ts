/**
 * broadcastId.ts — persistent, human-readable broadcast session identity.
 *
 * Format: `<name-slug>-<word>-<word>-<NNN>`, e.g. `my_tuesday_game-gamma-spice-042`.
 * Designed in docs/dev/vtt-integration-design.md (Part II, 9.1/1A):
 *  - The NAME PREFIX is a slug of the starmap name AT MINT TIME and is frozen —
 *    renaming the starmap must never re-derive the id, or every stored player
 *    link/QR/VTT config dies. It carries ZERO secrecy (campaign names get spoken
 *    and streamed); it exists so a human can tell WHICH campaign a code belongs to.
 *  - The RANDOM TAIL is the security: two distinct words from the SF list below
 *    plus a three-digit suffix, all chosen with crypto.getRandomValues. With ~500
 *    words that is ~28 bits (~250M combinations) — years of scanning at PeerJS
 *    broker probe rates, proportionate to the asset (read-only redacted fiction)
 *    given the regenerate/revoke control exists.
 *  - The whole id must satisfy the PeerJS id charset: [a-z0-9_-] only.
 *
 * The Mappadux room-code pattern is the ancestor (word-word-word), but Mappadux
 * codes are ephemeral per session; this one is saved ON the starmap, so it uses
 * a crypto RNG and carries more entropy.
 */

/** Deduplicated at module load; keep entries lowercase [a-z]+, 2-12 chars,
 *  phonetically distinct enough to be said across a table. */
const WORD_BANKS: string[] = [
  // Greek letters
  'alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta', 'iota',
  'kappa', 'lambda', 'sigma', 'tau', 'upsilon', 'phi', 'chi', 'psi', 'omega',
  // Planets, moons, small worlds
  'mercury', 'venus', 'terra', 'mars', 'jupiter', 'saturn', 'uranus', 'neptune',
  'pluto', 'ceres', 'eris', 'makemake', 'haumea', 'sedna', 'quaoar', 'orcus',
  'vesta', 'pallas', 'juno', 'hygiea', 'luna', 'phobos', 'deimos', 'io',
  'europa', 'ganymede', 'callisto', 'amalthea', 'titan', 'rhea', 'iapetus',
  'dione', 'tethys', 'enceladus', 'mimas', 'hyperion', 'phoebe', 'miranda',
  'ariel', 'umbriel', 'titania', 'oberon', 'triton', 'nereid', 'charon',
  // Named stars
  'sol', 'sirius', 'vega', 'rigel', 'deneb', 'altair', 'polaris', 'antares',
  'arcturus', 'capella', 'castor', 'pollux', 'procyon', 'regulus', 'spica',
  'aldebaran', 'canopus', 'achernar', 'bellatrix', 'alnilam', 'alnitak',
  'mintaka', 'saiph', 'fomalhaut', 'algol', 'mira', 'alcor', 'mizar', 'dubhe',
  'merak', 'alioth', 'alkaid', 'megrez', 'phecda', 'schedar', 'caph', 'segin',
  'electra', 'maia', 'taygeta', 'alcyone', 'celaeno', 'merope', 'pleione',
  'wezen', 'adhara', 'naos', 'avior', 'atria', 'sargas', 'shaula', 'lesath',
  // Constellations
  'orion', 'lyra', 'cygnus', 'aquila', 'draco', 'cassiopeia', 'perseus',
  'andromeda', 'pegasus', 'cepheus', 'auriga', 'bootes', 'corvus', 'crater',
  'hydra', 'leo', 'virgo', 'libra', 'scorpius', 'sagittarius', 'capricorn',
  'aquarius', 'pisces', 'aries', 'taurus', 'gemini', 'cancer', 'carina',
  'puppis', 'vela', 'pyxis', 'dorado', 'tucana', 'pavo', 'grus', 'phoenix',
  'indus', 'lacerta', 'monoceros', 'lepus', 'columba', 'fornax', 'caelum',
  'reticulum', 'octans', 'crux', 'musca', 'norma', 'circinus', 'lupus', 'ara',
  'scutum', 'sagitta', 'vulpecula', 'delphinus', 'equuleus', 'sextans',
  // Particles and physics
  'photon', 'electron', 'proton', 'neutron', 'quark', 'lepton', 'boson',
  'fermion', 'hadron', 'meson', 'baryon', 'muon', 'gluon', 'graviton',
  'neutrino', 'positron', 'ion', 'plasma', 'quantum', 'entropy', 'vector',
  'tensor', 'scalar', 'axion', 'tachyon', 'phonon', 'soliton', 'vortex',
  'flux', 'spinor', 'isotope', 'nucleon', 'dipole', 'lattice', 'doppler',
  'casimir', 'compton', 'zeeman', 'redshift', 'blueshift', 'spectrum',
  // Astronomical objects and phenomena
  'pulsar', 'quasar', 'magnetar', 'nebula', 'nova', 'supernova', 'blazar',
  'galaxy', 'cluster', 'comet', 'meteor', 'bolide', 'aurora', 'corona',
  'penumbra', 'umbra', 'eclipse', 'transit', 'perihelion', 'aphelion',
  'apogee', 'perigee', 'zenith', 'nadir', 'azimuth', 'parallax', 'albedo',
  'equinox', 'solstice', 'syzygy', 'libration', 'precession', 'nutation',
  'accretion', 'ejecta', 'regolith', 'tektite', 'chondrite', 'pallasite',
  'breccia', 'caldera', 'tholin', 'geyser', 'plume', 'ringlet', 'shepherd',
  'trojan', 'centaur', 'plutino', 'cubewano', 'oort', 'kuiper', 'halo',
  'filament', 'cepheid', 'ecliptic', 'sidereal', 'meridian', 'occultation',
  // Drives, structures, SF technology
  'warp', 'hyperdrive', 'stardrive', 'impulse', 'thruster', 'gimbal',
  'skyhook', 'tether', 'elevator', 'ramjet', 'scramjet', 'torchship',
  'lightsail', 'solarsail', 'magsail', 'ansible', 'stargate', 'wormhole',
  'jumpgate', 'slipstream', 'subspace', 'hyperspace', 'nullspace',
  'cryosleep', 'stasis', 'biodome', 'habitat', 'arcology', 'terraform',
  'geodesic', 'reactor', 'fusion', 'fission', 'antimatter', 'deuterium',
  'tritium', 'xenon', 'argon', 'krypton', 'railgun', 'coilgun', 'maser',
  'turbolift', 'airlock', 'bulkhead', 'gantry', 'cradle', 'drydock',
  'shipyard', 'beacon', 'relay', 'transponder', 'uplink', 'downlink',
  'telemetry', 'gyroscope', 'reaction', 'ballast', 'keel', 'nacelle',
  // Missions and craft
  'voyager', 'pioneer', 'cassini', 'galileo', 'viking', 'mariner', 'magellan',
  'ulysses', 'giotto', 'rosetta', 'philae', 'huygens', 'dawn', 'kepler',
  'spitzer', 'hubble', 'chandra', 'herschel', 'webb', 'gaia', 'hipparcos',
  'soho', 'parker', 'messenger', 'apollo', 'artemis', 'skylab', 'salyut',
  'soyuz', 'vostok', 'voskhod', 'progress', 'sputnik', 'ranger', 'surveyor',
  'genesis', 'stardust', 'clipper', 'dragonfly', 'lucy', 'psyche',
  // Scientists and authors
  'newton', 'copernicus', 'brahe', 'halley', 'hawking', 'sagan', 'einstein',
  'bohr', 'curie', 'feynman', 'dirac', 'pauli', 'heisenberg', 'maxwell',
  'faraday', 'tesla', 'lovelace', 'hopper', 'turing', 'noether', 'hypatia',
  'leavitt', 'payne', 'rubin', 'tombaugh', 'lowell', 'messier', 'drake',
  'fermi', 'oberth', 'goddard', 'clarke', 'asimov', 'lem', 'herbert',
  'leguin', 'butler', 'banks', 'vinge', 'gibson', 'bester', 'zelazny',
  // Elements and minerals
  'iron', 'nickel', 'cobalt', 'titanium', 'vanadium', 'chromium', 'lithium',
  'beryllium', 'boron', 'carbon', 'silicon', 'neon', 'radon', 'helium',
  'hydrogen', 'oxygen', 'nitrogen', 'sulphur', 'iridium', 'osmium',
  'platinum', 'tungsten', 'uranium', 'thorium', 'radium', 'olivine',
  'pyroxene', 'feldspar', 'quartz', 'basalt', 'granite', 'obsidian',
  'corundum', 'graphite', 'anorthite', 'ilmenite', 'troilite', 'magnetite',
  // Navigation and place
  'vanguard', 'sentinel', 'bastion', 'citadel', 'outpost', 'frontier',
  'horizon', 'tropic', 'bearing', 'heading', 'waypoint', 'course', 'orbit',
  'apex', 'chord', 'helix', 'node', 'cusp', 'locus', 'datum', 'grid',
  'sector', 'quadrant', 'parsec', 'lightyear', 'fathom', 'league', 'drift',
  // Qualities
  'crimson', 'scarlet', 'vermilion', 'amber', 'azure', 'cerulean', 'indigo',
  'violet', 'infrared', 'thermal', 'stellar', 'solar', 'lunar', 'orbital',
  'galactic', 'cosmic', 'astral', 'boreal', 'austral', 'polar', 'umbral',
  'spectral', 'prismatic', 'luminous', 'radiant', 'dormant', 'quiescent',
  'errant', 'rogue', 'spice', 'static', 'silent', 'binary', 'ternary',
  'retrograde', 'prograde', 'eccentric', 'resonant', 'tidal', 'radial',
];

/** The live pool: deduplicated, charset-enforced. Exported for tests. */
export const BROADCAST_WORDS: readonly string[] = [...new Set(WORD_BANKS)]
  .filter((w) => /^[a-z]{2,12}$/.test(w));

const NAME_SLUG_MAX = 24;

/**
 * Slug a starmap name into the PeerJS id charset [a-z0-9_-]: lowercase, spaces
 * to underscores, everything else dropped, separators collapsed and trimmed,
 * capped at NAME_SLUG_MAX. Returns '' when nothing survives (all-Unicode or
 * empty names) — the caller then omits the prefix entirely.
 */
export function slugifyStarmapName(name: string | undefined | null): string {
  if (!name) return '';
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_-]/g, '')
    .replace(/[-_]{2,}/g, '_')
    .replace(/^[-_]+|[-_]+$/g, '')
    .slice(0, NAME_SLUG_MAX)
    .replace(/[-_]+$/g, '');
  return slug;
}

/** Uniform integer in [0, n) via crypto.getRandomValues with rejection sampling
 *  (no modulo bias). Falls back to Math.random only where crypto is missing
 *  (non-browser test environments). */
function randomInt(n: number): number {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (!c?.getRandomValues) return Math.floor(Math.random() * n);
  const limit = Math.floor(0x100000000 / n) * n;
  const buf = new Uint32Array(1);
  for (;;) {
    c.getRandomValues(buf);
    if (buf[0] < limit) return buf[0] % n;
  }
}

/**
 * Mint a new broadcast id for a starmap: frozen name slug + two distinct random
 * words + three digits. NEVER call this to re-derive an id a starmap already
 * has — the id is minted once and survives renames; regeneration is a
 * deliberate user action (revocation), not maintenance.
 */
export function mintBroadcastId(starmapName: string | undefined | null): string {
  const slug = slugifyStarmapName(starmapName);
  const i = randomInt(BROADCAST_WORDS.length);
  let j = randomInt(BROADCAST_WORDS.length - 1);
  if (j >= i) j += 1; // second word guaranteed distinct
  const digits = String(randomInt(1000)).padStart(3, '0');
  const tail = `${BROADCAST_WORDS[i]}-${BROADCAST_WORDS[j]}-${digits}`;
  return slug ? `${slug}-${tail}` : tail;
}

/** True when a string is a valid PeerJS-safe broadcast id we could host under. */
export function isValidBroadcastId(id: string | undefined | null): boolean {
  return !!id && /^[a-z0-9][a-z0-9_-]{2,80}$/.test(id);
}
