// Real Keplerian elements for the Sol bodies, at an arbitrary instant.
//
// PLANETS: Standish, "Keplerian Elements for Approximate Positions of the Major Planets"
// (JPL Solar System Dynamics). J2000 values plus per-Julian-century rates; stated good to about
// an arcminute over 1800-2050 for the inner planets.
//
// LUNA: Meeus, Astronomical Algorithms ch.47 - the Moon's MEAN elements. These carry the node and
// apse precession (18.6 yr and 8.85 yr) but NOT the large periodic terms (evection 1.27 deg,
// variation 0.66 deg...), so a fixed-element Kepler orbit built from them sits within roughly a
// degree of the true Moon. Stated rather than hidden: it is the limit of what a fixed-element
// engine can carry.

const DEG = Math.PI / 180;
const J2000_MS = Date.UTC(2000, 0, 1, 12, 0, 0);          // 2000-01-01T12:00Z
const CENT_MS = 36525 * 86400000;

function centuriesSinceJ2000(ms) { return (ms - J2000_MS) / CENT_MS; }
function norm360(d) { return ((d % 360) + 360) % 360; }
function norm2pi(r) { const t = 2 * Math.PI; return ((r % t) + t) % t; }

// name: [a, e, i, L, longPeri, longNode] then the same as per-century rates
const PLANETS = {
  Mercury: [[0.38709927, 0.20563593, 7.00497902, 252.25032350, 77.45779628, 48.33076593],
            [0.00000037, 0.00001906, -0.00594749, 149472.67411175, 0.16047689, -0.12534081]],
  Venus:   [[0.72333566, 0.00677672, 3.39467605, 181.97909950, 131.60246718, 76.67984255],
            [0.00000390, -0.00004107, -0.00078890, 58517.81538729, 0.00268329, -0.27769418]],
  Earth:   [[1.00000261, 0.01671123, -0.00001531, 100.46457166, 102.93768193, 0.0],
            [0.00000562, -0.00004392, -0.01294668, 35999.37244981, 0.32327364, 0.0]],
  Mars:    [[1.52371034, 0.09339410, 1.84969142, -4.55343205, -23.94362959, 49.55953891],
            [0.00001847, 0.00007882, -0.00813131, 19140.30268499, 0.44441088, -0.29257343]],
  Jupiter: [[5.20288700, 0.04838624, 1.30439695, 34.39644051, 14.72847983, 100.47390909],
            [-0.00011607, -0.00013253, -0.00183714, 3034.74612775, 0.21252668, 0.20469106]],
  Saturn:  [[9.53667594, 0.05386179, 2.48599187, 49.95424423, 92.59887831, 113.66242448],
            [-0.00125060, -0.00050991, 0.00193609, 1222.49362201, -0.41897216, -0.28867794]],
  Uranus:  [[19.18916464, 0.04725744, 0.77263783, 313.23810451, 170.95427630, 74.01692503],
            [-0.00196176, -0.00004397, -0.00242939, 428.48202785, 0.40805281, 0.04240589]],
  Neptune: [[30.06992276, 0.00859048, 1.77004347, -55.12002969, 44.96476227, 131.78422574],
            [0.00026291, 0.00005105, 0.00035372, 218.45945325, -0.32241464, -0.00508664]],
  Pluto:   [[39.48211675, 0.24882730, 17.14001206, 238.92903833, 224.06891629, 110.30393684],
            [-0.00031596, 0.00005170, 0.00004818, 145.20780515, -0.04062942, -0.01183482]]
};

/** Classical elements for a planet at `ms`, in the engine's own field names/units. */
function planetElements(name, ms) {
  const [base, rate] = PLANETS[name];
  const T = centuriesSinceJ2000(ms);
  const a = base[0] + rate[0] * T;
  const e = base[1] + rate[1] * T;
  const i = base[2] + rate[2] * T;
  const L = base[3] + rate[3] * T;
  const longPeri = base[4] + rate[4] * T;
  const longNode = base[5] + rate[5] * T;
  const omega = norm360(longPeri - longNode);   // argument of perihelion
  const M = norm360(L - longPeri);              // mean anomaly
  return {
    a_AU: a, e,
    i_deg: i,
    omega_deg: omega,
    Omega_deg: norm360(longNode),
    M0_rad: norm2pi(M * DEG),
    // THE MEAN MOTION COMES FROM THE SAME TABLE AS THE ELEMENTS - the L rate IS n. Deriving it from
    // sqrt(mu/a^3) instead uses the PRIMARY's mass alone and so runs slow by the secondary's share.
    n_rad_per_s: (rate[3] / 36525) * DEG / 86400,
    // diagnostics, not written to the map
    _L_deg: norm360(L), _longPeri: norm360(longPeri)
  };
}

/** Luna's MEAN elements at `ms`, ecliptic-referenced (Meeus ch.47 arguments). */
function lunaElements(ms) {
  const T = centuriesSinceJ2000(ms);
  const Lp = 218.3164477 + 481267.88123421 * T - 0.0015786 * T * T;   // mean longitude
  const Mp = 134.9633964 + 477198.8675055 * T + 0.0087414 * T * T;    // mean anomaly
  const Om = 125.0445479 - 1934.1362891 * T + 0.0020754 * T * T;      // mean ascending node
  const omega = norm360(Lp - Mp - Om);                                 // argument of perigee
  return {
    a_AU: 384399 / 149597870.7,   // mean distance, km -> AU
    e: 0.0549006,
    i_deg: 5.145396,              // mean inclination to the ecliptic
    omega_deg: omega,
    Omega_deg: norm360(Om),
    M0_rad: norm2pi(norm360(Mp) * DEG),
    // The sidereal month, from Meeus's own L' rate: 27.32166 d. The engine's sqrt(GM_earth/a^3)
    // gives 27.45179 d because it ignores the Moon's own mass - 0.13 d of drift EVERY lunation,
    // which is 3.1 days over two years and is what put the predicted eclipses in the wrong months.
    n_rad_per_s: (481267.88123421 / 36525) * DEG / 86400,
    _L_deg: norm360(Lp)
  };
}

module.exports = { planetElements, lunaElements, PLANETS, norm360, DEG };

if (require.main === module) {
  const at = process.argv[2] || '2026-09-01T12:00:00Z';
  const ms = Date.parse(at);
  console.log('Elements at', at, '\n');
  const e = planetElements('Earth', ms);
  // VALIDATION 1: the Sun's geocentric ecliptic longitude = Earth's heliocentric longitude + 180.
  // Ecliptic longitude of a body = Omega + atan2(sin(u)cos(i), cos(u)) where u = omega + true anom;
  // for a near-circular, near-coplanar orbit, mean longitude L is within ~2 deg of the truth.
  console.log('Earth  heliocentric mean longitude L =', e._L_deg.toFixed(3), 'deg');
  console.log('  -> Sun geocentric longitude approx  ', norm360(e._L_deg + 180).toFixed(3), 'deg');
  console.log('     (1 Sept: the Sun sits in late Leo / early Virgo, about 158-160 deg. CHECK)');
  const l = lunaElements(ms);
  console.log('\nLuna   mean longitude L =', l._L_deg.toFixed(3), 'deg   node Om =', l.Omega_deg.toFixed(3), 'deg');
  console.log('  elongation from the Sun =', norm360(l._L_deg - norm360(e._L_deg + 180)).toFixed(1), 'deg');
  console.log('     (0 = new moon, 180 = full. 2026-09-01 was a waxing gibbous, ~2 days before full,');
  console.log('      so expect roughly 150-160 deg. CHECK)');
  console.log('\nNode regression check: Omega should fall ~19.35 deg per year');
  const a1 = lunaElements(Date.parse('2026-09-01T12:00:00Z')).Omega_deg;
  const a2 = lunaElements(Date.parse('2027-09-01T12:00:00Z')).Omega_deg;
  console.log('  2026:', a1.toFixed(3), ' 2027:', a2.toFixed(3), ' delta:', (a2 - a1).toFixed(3));
}
