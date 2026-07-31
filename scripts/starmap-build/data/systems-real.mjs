// Curated roster for the Local Neighbourhood starmap (the REAL one).
//
// Scope: every known star system within ~13 light years of Sol, every confirmed
// planet host out to ~16.5 light years, and a handful of famous landmarks beyond
// (Altair, Vega, Zeta Reticuli, TRAPPIST-1).
//
// What lives here vs. what is fetched:
// - Positions: SIMBAD ICRS RA/Dec + parallax (data/cache/simbad-roster.json).
// - Planets + planet-host stellar parameters: NASA Exoplanet Archive pscomppars
//   (data/cache/archive-pscomppars.json). Only confirmed planets exist there.
// - This file: system structure (binaries, hierarchy), literature parameters for
//   PLANETLESS stars (the archive doesn't cover them), binary orbital elements,
//   debris belts/discs, ages, and all descriptions.
//
// Sources for hand-entered stellar/binary values (retrieved 2026-07-30):
// SIMBAD; Wikipedia star articles citing refereed determinations (e.g. Bond et
// al. 2017 for Sirius, Bond et al. 2015 for Procyon, Kervella et al. 2016/2017
// and Akeson et al. 2021 for Alpha Centauri, Mason et al. WDS for visual-binary
// orbits); NASA Exoplanet Archive stellar hosts table. Mutual inclinations
// within systems are set near zero (planetary systems are close to coplanar;
// sky-plane inclinations from transit/astrometry papers are NOT used here
// because SSE's reference plane is the system's own invariable plane).
//
// Component spec shapes understood by build-starmaps.mjs:
//   { star: { key, name, type, massMsun, radiusRsun, teff, lumLsun, desc,
//             starId?, planetsFrom?, planetNameBase?, planetIdPrefix?,
//             rotationHours?, planetOverrides?, belts? } }
//   { bary: [specA, specB], aAU, e, id, name?, periodYr? }   // pair via barycentre
// Star params may be omitted for planet hosts (auto-filled from the archive).

export const EPOCH = 1762339146908;
export const PIXELS_PER_LY = 43.30127018922193; // unchanged from the previous map
export const MAP_CENTRE = { x: 400, y: 300 };   // Sol's pixel position, kept stable

export const systems = [
  // ---------------------------------------------------------------- Sol (special-cased: embedded from static/examples/Sol_2030-System.json)
  {
    id: 'sys-sol', name: 'Sol', special: 'sol',
    description: 'Our home system: one middle-aged G-type dwarf, eight planets, and the only world known to carry life. Every distance on this map is measured from here.'
  },

  // ---------------------------------------------------------------- Alpha Centauri (4.34 ly)
  {
    id: 'sys-alphacen', name: 'Alpha Centauri', slug: 'alpha-centauri', systemId: 'alpha-centauri-system',
    seed: 'alpha-centauri-real-data', simbad: 'alf Cen A', age_Gyr: 5.3,
    description: 'The closest star system to Sol: a tight, bright G+K pair circled at enormous distance by the red dwarf Proxima, which is currently the nearest individual star to Earth. Proxima carries two confirmed planets, including the temperate Proxima b.',
    root: {
      bary: [
        {
          bary: [
            { star: { key: 'a', starId: 'alpha-centauri-a', name: 'Rigil Kentaurus (Alpha Centauri A)', type: 'G2V', massMsun: 1.079, radiusRsun: 1.218, teff: 5795, lumLsun: 1.506, desc: 'A near-twin of the Sun, slightly older and brighter. No confirmed planets yet, though candidate signals have been reported around both A and B for years.' } },
            { star: { key: 'b', starId: 'alpha-centauri-b', name: 'Toliman (Alpha Centauri B)', type: 'K1V', massMsun: 0.909, radiusRsun: 0.859, teff: 5231, lumLsun: 0.498, desc: 'The orange-dwarf half of the central pair. From a planet here, Alpha Centauri A would outshine the full Moon thousands of times over.' } }
          ],
          aAU: 23.3, e: 0.524, periodYr: 79.76, id: 'ab', baryId: 'alpha-centauri-barycenter', name: 'Alpha Centauri AB Barycentre'
        },
        {
          star: {
            key: 'proxima', starId: 'proxima-centauri-star', name: 'Proxima Centauri (Alpha Centauri C)', type: 'M5.5Ve',
            massMsun: 0.122, radiusRsun: 0.154, teff: 2992, lumLsun: 0.00156,
            desc: 'The nearest star to the Sun, a dim red flare dwarf. Its habitable-zone planet Proxima b is the closest known exoplanet to Earth.',
            planetsFrom: 'Proxima Cen', planetNameBase: 'Proxima Centauri', planetIdPrefix: 'proxima-centauri',
            planetOverrides: {
              'Proxima Cen b': { desc: 'The nearest known exoplanet: at least 1.1 Earth masses, orbiting inside the habitable zone every 11.2 days. Tidally locked and scoured by flares, but temperate enough for liquid water on the day side.' },
              'Proxima Cen d': { desc: 'A sub-Earth of at least a quarter of an Earth mass, skimming the star every five days. One of the lightest planets ever found by radial velocity.' }
            }
          }
        }
      ],
      aAU: 8700, e: 0.5, periodYr: 547000, id: 'outer', baryId: 'alpha-centauri-barycenter-outer', name: 'Alpha Centauri System Barycentre'
    }
  },

  // ---------------------------------------------------------------- Barnard's Star (5.96 ly)
  {
    id: 'sys-barnard', name: "Barnard's Star", slug: 'barnard', systemId: 'barnard-system', seed: 'barnard',
    simbad: "Barnard's star", age_Gyr: 10,
    description: 'The nearest single star: an ancient, fast-moving red dwarf with the highest proper motion in the sky. In 2024-25 precision radial velocities confirmed a compact family of four sub-Earth planets, all packed inside a tenth of Mercury’s orbit.',
    root: {
      star: {
        key: 'star', starId: 'barnard-star', name: "Barnard's Star", type: 'M4V',
        massMsun: 0.162, radiusRsun: 0.187, teff: 3195, lumLsun: 0.0035,
        desc: 'A 10-billion-year-old red dwarf, one of the oldest stars in the neighbourhood. It crosses the width of the full Moon in under two centuries of sky.',
        planetsFrom: "Barnard's star", planetNameBase: 'Barnard', planetIdPrefix: 'barnard',
        planetOverrides: {
          'Barnard b': { desc: 'Confirmed in 2024 by ESPRESSO after decades of false alarms around this star: a sub-Earth of about a third of an Earth mass on a 3.15-day orbit.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- Wolf 359 (7.86 ly)
  {
    id: 'sys-wolf359', name: 'Wolf 359', slug: 'wolf359', systemId: 'wolf359-system', seed: 'wolf359',
    simbad: 'Wolf 359', age_Gyr: 0.5,
    description: 'A dim red flare star, one of the faintest and lowest-mass stars known when discovered. Planet candidates have been claimed and withdrawn; nothing is currently confirmed.',
    root: { star: { key: 'star', starId: 'wolf359-star', name: 'Wolf 359 (CN Leonis)', type: 'M6.5Ve', massMsun: 0.110, radiusRsun: 0.144, teff: 2749, lumLsun: 0.0011, desc: 'A young, magnetically violent red dwarf that can double in brightness within minutes when it flares. Shining at a ten-thousandth of the Sun’s output, it is invisible to the naked eye despite being one of our closest neighbours.' } }
  },

  // ---------------------------------------------------------------- Lalande 21185 (8.31 ly)
  {
    id: 'sys-lalande', name: 'Lalande 21185', slug: 'lalande', systemId: 'lalande-system', seed: 'lalande',
    simbad: 'Lalande 21185', age_Gyr: 7.5,
    description: 'The brightest red dwarf in the northern sky and the fourth-closest system to Sol, with two confirmed planets from precision radial-velocity work.',
    root: {
      star: {
        key: 'star', starId: 'lalande-star', name: 'Lalande 21185', type: 'M2V',
        planetsFrom: 'GJ 411', planetNameBase: 'Lalande 21185', planetIdPrefix: 'lalande',
        desc: 'A quiet, old M dwarf. It has been in star catalogues since 1801, and in planet-hunt target lists for over a century.'
      }
    }
  },

  // ---------------------------------------------------------------- Sirius (8.71 ly)
  {
    id: 'sys-sirius', name: 'Sirius', slug: 'sirius', systemId: 'sirius-system', seed: 'sirius',
    simbad: 'Sirius A', age_Gyr: 0.242,
    description: 'The brightest star in Earth’s night sky, paired with the nearest white dwarf. Sirius B was once the heavier of the two: a five-solar-mass star that burned out and collapsed while its companion is still in its prime.',
    root: {
      bary: [
        { star: { key: 'a', starId: 'sirius-a', name: 'Sirius A', type: 'A0mA1Va', massMsun: 2.063, radiusRsun: 1.711, teff: 9940, lumLsun: 25.4, desc: 'A hot white main-sequence star, twice the Sun’s mass and twenty-five times its light. Its glare hid its tiny companion for decades after the companion’s gravity had already given it away.' } },
        { star: { key: 'b', starId: 'sirius-b', name: 'Sirius B', type: 'DA2 (white dwarf)', massMsun: 1.018, radiusKm: 5634, teff: 25369, lumLsun: 0.056, desc: 'The nearest white dwarf: a full solar mass compressed into a sphere smaller than Earth. A teaspoon of its matter would weigh several tonnes.' } }
      ],
      aAU: 19.8, e: 0.5914, periodYr: 50.13, id: 'pair', baryId: 'sirius-barycenter', name: 'Sirius Barycentre'
    }
  },

  // ---------------------------------------------------------------- Luyten 726-8 / UV Ceti (8.79 ly)
  {
    id: 'sys-luyten726', name: 'Luyten 726-8', slug: 'luyten726', systemId: 'luyten726-system', seed: 'luyten726',
    simbad: 'BL Cet', age_Gyr: 0.4,
    description: 'A close-matched pair of red flare dwarfs. UV Ceti is the prototype flare star: its eruptions can brighten it seventy-five-fold in minutes, and the whole class now bears its name.',
    root: {
      bary: [
        { star: { key: 'a', starId: 'luyten726-a', name: 'BL Ceti (Luyten 726-8 A)', type: 'M5.5Ve', massMsun: 0.122, radiusRsun: 0.165, teff: 2784, lumLsun: 0.00147, desc: 'The marginally heavier half of the pair, itself a flare star of the class its twin defines.' } },
        { star: { key: 'b', starId: 'luyten726-b', name: 'UV Ceti (Luyten 726-8 B)', type: 'M6Ve', massMsun: 0.116, radiusRsun: 0.159, teff: 2728, lumLsun: 0.00125, desc: 'The archetypal flare star. During a 1952 outburst it brightened by a factor of 75 in twenty seconds. A super-Neptune candidate was reported around the pair in 2024, but remains unconfirmed.' } }
      ],
      aAU: 5.46, e: 0.617, periodYr: 26.5, id: 'pair', baryId: 'luyten726-barycenter', name: 'Luyten 726-8 Barycentre'
    }
  },

  // ---------------------------------------------------------------- Ross 154 (9.71 ly)
  {
    id: 'sys-ross154', name: 'Ross 154', slug: 'ross154', systemId: 'ross154-system', seed: 'ross154',
    simbad: 'Ross 154', age_Gyr: 0.4,
    description: 'A young red flare dwarf in Sagittarius, the nearest star in that constellation. No planets have been confirmed.',
    root: { star: { key: 'star', starId: 'ross154-star', name: 'Ross 154 (V1216 Sagittarii)', type: 'M3.5Ve', massMsun: 0.177, radiusRsun: 0.200, teff: 3340, lumLsun: 0.0040, desc: 'A UV Ceti-type flare star, less than a billion years old, flaring roughly every two days.' } }
  },

  // ---------------------------------------------------------------- Ross 248 (10.30 ly)
  {
    id: 'sys-ross248', name: 'Ross 248', slug: 'ross248', systemId: 'ross248-system', seed: 'ross248',
    simbad: 'Ross 248', age_Gyr: 2,
    description: 'A red dwarf in Andromeda. In about 36,000 years it will overtake Alpha Centauri as the closest star system to Sol, and Voyager 2 is drifting in its general direction.',
    root: { star: { key: 'star', starId: 'ross248-star', name: 'Ross 248 (HH Andromedae)', type: 'M6V', massMsun: 0.145, radiusRsun: 0.190, teff: 2930, lumLsun: 0.0022, desc: 'A spotted, slowly pulsing flare dwarf. Voyager 2 will pass within 1.7 light years of it in roughly 40,000 years.' } }
  },

  // ---------------------------------------------------------------- Epsilon Eridani (10.47 ly)
  {
    id: 'sys-epseri', name: 'Epsilon Eridani', slug: 'epseri', systemId: 'epseri-system', seed: 'epseri',
    simbad: 'eps Eri', age_Gyr: 0.6,
    description: 'A young orange dwarf wrapped in the most detailed debris architecture known this close to Sol: two warm asteroid belts, a vast cold outer ring, and the confirmed Jupiter-analogue planet AEgir shepherding between them.',
    root: {
      star: {
        key: 'star', starId: 'epseri-star', name: 'Epsilon Eridani (Ran)', type: 'K2V',
        planetsFrom: 'eps Eri', planetNameBase: 'Epsilon Eridani', planetIdPrefix: 'epseri',
        desc: 'A K-dwarf less than a billion years old: a portrait of what the early Solar System may have looked like, belts and all. Formally named Ran, after the Norse goddess of the sea.',
        planetOverrides: {
          'eps Eri b': { id: 'epseri-aegir', name: 'AEgir (Epsilon Eridani b)', desc: 'A true Jupiter analogue, confirmed by decades of radial velocities plus astrometry: roughly two-thirds of a Jupiter mass orbiting at 3.5 AU. Named for Ran’s husband, the Norse god of the ocean.' }
        },
        belts: [
          { id: 'epseri-inner-belt', name: 'Inner Warm Belt', aAU: 3, widthAU: 1.5, classes: ['belt/asteroid'], massKg: 5e20, desc: 'A warm asteroid belt at about 3 AU, analogous to our Main Belt, mapped by Spitzer infrared observations.' },
          { id: 'epseri-outer-belt', name: 'Outer Warm Belt', aAU: 20, widthAU: 6, classes: ['belt/asteroid'], massKg: 2e21, desc: 'A second, cooler belt near 20 AU, close to where Uranus sits at home.' },
          { id: 'epseri-cold-ring', name: 'Cold Debris Ring', aAU: 69, widthAU: 35, classes: ['belt/ice'], massKg: 3e22, desc: 'A bright, resolved ring of icy debris spanning roughly 35 to 100 AU, the system’s Kuiper Belt analogue and one of the best-imaged debris discs in the sky.' }
        ]
      }
    }
  },

  // ---------------------------------------------------------------- Lacaille 9352 / GJ 887 (10.72 ly)
  {
    id: 'sys-lacaille9352', name: 'Lacaille 9352', slug: 'lacaille9352', systemId: 'lacaille9352-system', seed: 'lacaille9352',
    simbad: 'Lacaille 9352', age_Gyr: 4.6,
    description: 'The brightest red dwarf in the southern sky and an unusually calm one, hosting four confirmed planets including two super-Earths found by the RedDots campaign.',
    root: {
      star: {
        key: 'star', starId: 'lacaille9352-star', name: 'Lacaille 9352 (GJ 887)', type: 'M2V',
        planetsFrom: 'GJ 887', planetNameBase: 'Lacaille 9352', planetIdPrefix: 'lacaille9352',
        desc: 'A remarkably quiet M dwarf: almost no starspots and very rare flares, which makes its planets unusually pleasant real estate by red-dwarf standards.'
      }
    }
  },

  // ---------------------------------------------------------------- Ross 128 (11.01 ly)
  {
    id: 'sys-ross128', name: 'Ross 128', slug: 'ross128', systemId: 'ross128-system', seed: 'ross128',
    simbad: 'Ross 128', age_Gyr: 9,
    description: 'A quiet, old red dwarf hosting Ross 128 b: a temperate Earth-sized planet, and one of the nearest potentially habitable worlds known.',
    root: {
      star: {
        key: 'star', starId: 'ross128-star', name: 'Ross 128 (FI Virginis)', type: 'M4V',
        planetsFrom: 'Ross 128', planetNameBase: 'Ross 128', planetIdPrefix: 'ross128',
        desc: 'An ageing red dwarf that has largely outgrown its flaring youth, to the great benefit of its planet.',
        planetOverrides: {
          'Ross 128 b': { desc: 'At least 1.4 Earth masses on a 9.9-day orbit, receiving 38% more light than Earth. Its quiet host makes it one of the best nearby candidates for a temperate, survivable surface.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- EZ Aquarii (11.1 ly)
  {
    id: 'sys-ezaquarii', name: 'EZ Aquarii', slug: 'ezaquarii', systemId: 'ezaquarii-system', seed: 'ezaquarii',
    simbad: 'EZ Aqr', age_Gyr: 3,
    description: 'A cramped triple of red flare dwarfs: an inner pair whirling around each other every four days, orbited by a third star two astronomical units out.',
    root: {
      bary: [
        {
          bary: [
            { star: { key: 'aa', name: 'EZ Aquarii Aa', type: 'M5Ve', massMsun: 0.1216, radiusRsun: 0.175, teff: 2700, lumLsun: 0.00078, desc: 'The primary of the inner spectroscopic pair.' } },
            { star: { key: 'ab', name: 'EZ Aquarii Ab', type: 'M6V', massMsun: 0.0957, radiusRsun: 0.14, teff: 2650, lumLsun: 0.00012, desc: 'Locked in a 3.8-day embrace with its primary; the two stars are separated by only a few stellar diameters.' } }
          ],
          aAU: 0.030, e: 0.0, id: 'aa-ab', name: 'EZ Aquarii A Barycentre'
        },
        { star: { key: 'b', name: 'EZ Aquarii B', type: 'M5Ve', massMsun: 0.1145, radiusRsun: 0.21, teff: 2650, lumLsun: 0.0019, desc: 'The outer member, circling the inner pair every 2.3 years.' } }
      ],
      aAU: 1.2, e: 0.437, periodYr: 2.25, id: 'outer', name: 'EZ Aquarii System Barycentre'
    }
  },

  // ---------------------------------------------------------------- Procyon (11.40 ly)
  {
    id: 'sys-procyon', name: 'Procyon', slug: 'procyon', systemId: 'procyon-system', seed: 'procyon',
    simbad: 'Procyon A', age_Gyr: 1.9,
    description: 'The eighth-brightest star in Earth’s sky, a swollen F-type star just beginning to leave the main sequence, with a faint white-dwarf companion discovered by its gravitational tug decades before it was seen.',
    root: {
      bary: [
        { star: { key: 'a', starId: 'procyon-a', name: 'Procyon A', type: 'F5IV-V', massMsun: 1.478, radiusRsun: 2.048, teff: 6530, lumLsun: 6.93, desc: 'One and a half solar masses and nearly seven times the Sun’s light: a star burning through its fuel fast, already puffing up into subgianthood.' } },
        { star: { key: 'b', starId: 'procyon-b', name: 'Procyon B', type: 'DQZ (white dwarf)', massMsun: 0.592, radiusKm: 8600, teff: 7740, lumLsun: 0.00049, desc: 'A cool, ancient white dwarf that finished dying over a billion years ago. Its existence was deduced from Procyon A’s wobble in 1840, half a century before a telescope caught it.' } }
      ],
      aAU: 15.0, e: 0.40, periodYr: 40.84, id: 'pair', baryId: 'procyon-barycenter', name: 'Procyon Barycentre'
    }
  },

  // ---------------------------------------------------------------- 61 Cygni (11.40 ly)
  {
    id: 'sys-61cygni', name: '61 Cygni', slug: '61cygni', systemId: '61cygni-system', seed: '61cygni',
    simbad: '61 Cyg A', age_Gyr: 6.1,
    description: 'A handsome pair of orange dwarfs, and a landmark of astronomy: in 1838 Bessel measured its parallax, making 61 Cygni the first star whose distance from Earth was ever determined.',
    root: {
      bary: [
        { star: { key: 'a', starId: '61cygni-a', name: '61 Cygni A', type: 'K5V', massMsun: 0.677, radiusRsun: 0.667, teff: 4398, lumLsun: 0.150, desc: 'The brighter of the "Flying Star" pair, so nicknamed for its then-record proper motion across the sky.' } },
        { star: { key: 'b', starId: '61cygni-b', name: '61 Cygni B', type: 'K7V', massMsun: 0.629, radiusRsun: 0.594, teff: 4174, lumLsun: 0.097, desc: 'The cooler companion, orbiting once every seven centuries. Both stars are visible together in binoculars.' } }
      ],
      aAU: 84, e: 0.44, periodYr: 659, id: 'pair', baryId: '61cygni-barycenter', name: '61 Cygni Barycentre'
    }
  },

  // ---------------------------------------------------------------- Struve 2398 (11.49 ly)
  {
    id: 'sys-struve2398', name: 'Struve 2398', slug: 'struve2398', systemId: 'struve2398-system', seed: 'struve2398',
    simbad: 'GJ 725 A', age_Gyr: 6.2,
    description: 'A wide pair of red dwarfs in Draco. In 2024 the primary yielded a confirmed sub-Earth planet, one of the lightest ever found around a nearby star.',
    root: {
      bary: [
        {
          star: {
            key: 'a', starId: 'struve2398-a', name: 'Struve 2398 A (GJ 725 A)', type: 'M3V',
            planetsFrom: 'Gl 725 A', planetNameBase: 'Struve 2398 A', planetIdPrefix: 'struve2398',
            // The default id would be `struve2398-b` — the planet letter dropped onto the system slug —
            // which is the id the companion STAR already holds. Two nodes, one id: the star is the one
            // referenced (the barycentre's memberIds), so the planet takes the explicit id, carrying the
            // component letter the way its NAME already does. See D3.
            planetOverrides: { 'Gl 725 A b': { id: 'struve2398-a-b' } },
            desc: 'The primary, a mid-M dwarf with a compact confirmed planet found by ESPRESSO radial velocities.'
          }
        },
        { star: { key: 'b', starId: 'struve2398-b', name: 'Struve 2398 B (GJ 725 B)', type: 'M3.5V', massMsun: 0.25, radiusRsun: 0.280, teff: 3379, lumLsun: 0.0092, desc: 'The smaller twin, a flare star catalogued as HD 173740.' } }
      ],
      aAU: 63, e: 0.44, periodYr: 1166, id: 'pair', baryId: 'struve2398-barycenter', name: 'Struve 2398 Barycentre'
    }
  },

  // ---------------------------------------------------------------- Groombridge 34 / GJ 15 (11.62 ly)
  {
    id: 'sys-groombridge34', name: 'Groombridge 34', slug: 'groombridge34', systemId: 'groombridge34-system', seed: 'groombridge34',
    simbad: 'GJ 15 A', age_Gyr: 3,
    description: 'A wide binary of red dwarfs in Andromeda. The primary hosts two confirmed planets: a hot super-Earth and a cold long-period companion.',
    root: {
      bary: [
        {
          star: {
            key: 'a', name: 'Groombridge 34 A (GX Andromedae)', type: 'M2V',
            planetsFrom: 'GJ 15 A', planetNameBase: 'Groombridge 34 A', planetIdPrefix: 'groombridge34',
            // Same collision as Struve 2398: `groombridge34-b` is the companion star's id. Only the
            // colliding planet is moved — `groombridge34-c` is a working stable id and renaming it to
            // match would break the rule this fix exists to protect. See D3.
            planetOverrides: { 'GJ 15 A b': { id: 'groombridge34-a-b' } },
            desc: 'A quiet M2 dwarf with a confirmed two-planet system spanning from an 11-day orbit out beyond the snow line.'
          }
        },
        { star: { key: 'b', name: 'Groombridge 34 B (GQ Andromedae)', type: 'M4V', massMsun: 0.15, radiusRsun: 0.18, teff: 3304, lumLsun: 0.00085, desc: 'The faint secondary, a flare dwarf orbiting on a long, notably eccentric path around its partner.' } }
      ],
      aAU: 93, e: 0.73, periodYr: 1065, id: 'pair', name: 'Groombridge 34 Barycentre'
    }
  },

  // ---------------------------------------------------------------- DX Cancri (11.83 ly)
  {
    id: 'sys-dxcancri', name: 'DX Cancri', slug: 'dxcancri', systemId: 'dxcancri-system', seed: 'dxcancri',
    simbad: 'DX Cnc', age_Gyr: 0.2,
    description: 'One of the smallest true stars known: a red dwarf right at the edge of the hydrogen-burning limit, shining with a fifteen-hundredth of the Sun’s light.',
    root: { star: { key: 'star', name: 'DX Cancri', type: 'M6.5Ve', massMsun: 0.106, radiusRsun: 0.124, teff: 2840, lumLsun: 0.00073, desc: 'A flare star that can quintuple in brightness. Any dimmer and it would have been born a brown dwarf instead.' } }
  },

  // ---------------------------------------------------------------- Epsilon Indi (11.87 ly)
  {
    id: 'sys-epsindi', name: 'Epsilon Indi', slug: 'epsindi', systemId: 'epsindi-system', seed: 'epsindi',
    simbad: 'eps Ind', age_Gyr: 3.5,
    description: 'An orange dwarf trailed at 1,500 AU by a pair of brown dwarfs, and home to Epsilon Indi Ab: the nearest Jupiter-like planet ever directly imaged, photographed by JWST in 2024.',
    root: {
      bary: [
        {
          star: {
            key: 'a', name: 'Epsilon Indi A', type: 'K5V',
            planetsFrom: 'eps Ind A', planetNameBase: 'Epsilon Indi A', planetIdPrefix: 'epsindi',
            desc: 'A bright K dwarf visible to the naked eye. Its cold Jupiter-analogue planet was confirmed the hard way: photographed directly in the infrared by the JWST.',
            planetOverrides: {
              'eps Ind A b': { desc: 'A cold gas giant of several Jupiter masses on a decades-long orbit, directly imaged by JWST in 2024. The nearest imaged exoplanet to Earth.' }
            }
          }
        },
        {
          bary: [
            { star: { key: 'ba', name: 'Epsilon Indi Ba', type: 'T1 (brown dwarf)', massMjup: 66.9, radiusRsun: 0.0805, teff: 1312, lumLsun: 0.00002, desc: 'The heavier of the closest known binary brown-dwarf pair to Earth: a T dwarf glowing with its own fading heat of formation.' } },
            { star: { key: 'bb', name: 'Epsilon Indi Bb', type: 'T6 (brown dwarf)', massMjup: 53.3, radiusRsun: 0.0825, teff: 972, lumLsun: 0.000006, desc: 'The cooler twin, a methane-atmosphere T dwarf about the temperature of a hot oven.' } }
          ],
          aAU: 2.41, e: 0.540, periodYr: 11.02, id: 'bpair', name: 'Epsilon Indi B Barycentre'
        }
      ],
      aAU: 1460, e: 0.3, id: 'outer', name: 'Epsilon Indi System Barycentre'
    }
  },

  // ---------------------------------------------------------------- Tau Ceti (11.91 ly)
  {
    id: 'sys-tauceti', name: 'Tau Ceti', slug: 'tauceti', systemId: 'tauceti-system', seed: 'tauceti',
    simbad: 'tau Cet', age_Gyr: 5.8,
    description: 'The nearest single Sun-like star, ringed by a massive debris disc and at least three confirmed super-Earths. A perennial first stop for SETI surveys and interstellar-mission proposals alike.',
    root: {
      star: {
        key: 'star', starId: 'tauceti-star', name: 'Tau Ceti', type: 'G8V',
        planetsFrom: 'tau Cet', planetNameBase: 'Tau Ceti', planetIdPrefix: 'tauceti',
        desc: 'A calm G dwarf slightly smaller than the Sun and nearly a billion years older. Its debris disc holds ten times the mass of our Kuiper Belt, so its planets endure a heavier cometary bombardment than Earth does.',
        belts: [
          { id: 'tauceti-debris-disc', name: 'Tau Ceti Debris Disc', aAU: 25, widthAU: 22, classes: ['belt/ice'], massKg: 1e23, desc: 'A broad, massive disc of cold debris stretching from roughly 6 to 52 AU, an oversized cousin of the Kuiper Belt.' }
        ]
      }
    }
  },

  // ---------------------------------------------------------------- YZ Ceti (12.11 ly)
  {
    id: 'sys-yzceti', name: 'YZ Ceti', slug: 'yzceti', systemId: 'yzceti-system', seed: 'yzceti',
    simbad: 'YZ Cet', age_Gyr: 5,
    description: 'A red flare dwarf with three confirmed rocky planets, all orbiting closer to their star than Mercury does to the Sun. The innermost may be broadcasting: it is a candidate for radio emission driven by its magnetic interaction with the star.',
    root: {
      star: {
        key: 'star', name: 'YZ Ceti', type: 'M4.5V',
        planetsFrom: 'YZ Cet', planetNameBase: 'YZ Ceti', planetIdPrefix: 'yzceti',
        desc: 'A small flare star only a few hundredths of the Sun’s brightness, whirling three Earth-sized planets through week-long years.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 1061 (11.98 ly)
  {
    id: 'sys-gj1061', name: 'GJ 1061', slug: 'gj1061', systemId: 'gj1061-system', seed: 'gj1061',
    simbad: 'GJ 1061', age_Gyr: 7,
    description: 'An unassuming red dwarf that turned out to host three super-Earths, one of them orbiting squarely in the habitable zone.',
    root: {
      star: {
        key: 'star', name: 'GJ 1061', type: 'M5.5V',
        planetsFrom: 'GJ 1061', planetNameBase: 'GJ 1061', planetIdPrefix: 'gj1061',
        desc: 'A low-activity M dwarf, overlooked for a century until the RedDots campaign teased three planets out of its wobble.',
        planetOverrides: {
          'GJ 1061 d': { desc: 'A super-Earth of at least 1.6 Earth masses receiving Mars-like insolation: comfortably inside the habitable zone if it holds any reasonable atmosphere.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- Luyten's Star (12.20 ly)
  {
    id: 'sys-luyten', name: "Luyten's Star", slug: 'luyten', systemId: 'luyten-system', seed: 'luyten',
    simbad: "Luyten's star", age_Gyr: 8,
    description: 'A quiet red dwarf with two confirmed planets, including the temperate super-Earth Luyten b, long rated among the most habitable-zone-friendly worlds within twenty light years. It sits barely a light year from Procyon in real space.',
    root: {
      star: {
        key: 'star', starId: 'luyten-star', name: "Luyten's Star (GJ 273)", type: 'M3.5V',
        planetsFrom: 'GJ 273', planetNameBase: 'Luyten', planetIdPrefix: 'luyten',
        desc: 'A slow-rotating, placid M dwarf. From its planets, Procyon would blaze as a beacon far brighter than Venus does from Earth.',
        planetOverrides: {
          'GJ 273 b': { desc: 'A super-Earth of at least 2.9 Earth masses in the habitable zone, target of the 2017-18 "Sonar Calling GJ 273b" interstellar radio transmission from Earth.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- Teegarden's Star (12.49 ly)
  {
    id: 'sys-teegarden', name: "Teegarden's Star", slug: 'teegarden', systemId: 'teegarden-system', seed: 'teegarden',
    simbad: "Teegarden's star", age_Gyr: 8,
    description: 'A feeble, ancient red dwarf missed by every survey until 2003, now known to host three temperate planets. Teegarden b holds one of the highest Earth-similarity ratings of any known world.',
    root: {
      star: {
        key: 'star', starId: 'teegarden-star', name: "Teegarden's Star", type: 'M7.0V',
        planetsFrom: "Teegarden's Star", planetNameBase: 'Teegarden', planetIdPrefix: 'teegarden',
        desc: 'One of the dimmest stars on this map, radiating well under a thousandth of the Sun’s light. Its three confirmed planets huddle within a twentieth of Earth’s orbital distance.',
        planetOverrides: {
          'Teegarden’s Star b': { desc: 'At least 1.05 Earth masses in the habitable zone. If it has an atmosphere at all, models allow liquid water across much of its surface.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- Kapteyn's Star (12.83 ly)
  {
    id: 'sys-kapteyn', name: "Kapteyn's Star", slug: 'kapteyn', systemId: 'kapteyn-system', seed: 'kapteyn',
    simbad: "Kapteyn's star", age_Gyr: 11.5,
    description: 'A visitor from another galaxy: a halo red dwarf on a retrograde orbit, likely torn from the Omega Centauri progenitor dwarf galaxy eleven billion years ago. It hosts one confirmed planet nearly as old as the universe’s first stars.',
    root: {
      star: {
        key: 'star', name: "Kapteyn's Star", type: 'sdM1',
        planetsFrom: 'Kapteyn', planetNameBase: 'Kapteyn', planetIdPrefix: 'kapteyn',
        desc: 'A metal-poor subdwarf moving backwards around the galaxy relative to nearly every star you can see: debris from a galaxy the Milky Way consumed long before the Sun existed.'
      }
    }
  },

  // ---------------------------------------------------------------- Kruger 60 (13.08 ly)
  {
    id: 'sys-kruger60', name: 'Kruger 60', slug: 'kruger60', systemId: 'kruger60-system', seed: 'kruger60',
    simbad: 'GJ 860 A', age_Gyr: 5,
    description: 'A close binary of red dwarfs in Cepheus, orbiting each other about as far apart as the Sun and Saturn. The secondary is a well-studied flare star.',
    root: {
      bary: [
        { star: { key: 'a', name: 'Kruger 60 A', type: 'M3V', massMsun: 0.271, radiusRsun: 0.301, teff: 3342, lumLsun: 0.0098, desc: 'The primary: a quarter of a solar mass, orbited closely enough by its twin that the pair complete a lap within a 45-year human working lifetime.' } },
        { star: { key: 'b', name: 'Kruger 60 B (DO Cephei)', type: 'M4V', massMsun: 0.176, radiusRsun: 0.209, teff: 3097, lumLsun: 0.0039, desc: 'A flare star that doubles in brightness every few hours of observation on average.' } }
      ],
      aAU: 9.8, e: 0.41, periodYr: 45.1, id: 'pair', name: 'Kruger 60 Barycentre'
    }
  },

  // ---------------------------------------------------------------- SCR 1845-6357 (12.87 ly)
  {
    id: 'sys-scr1845', name: 'SCR 1845-6357', slug: 'scr1845', systemId: 'scr1845-system', seed: 'scr1845',
    simbad: 'SCR J1845-6357', age_Gyr: 3,
    description: 'A red dwarf at the very bottom of the stellar mass ladder, orbited at Jupiter-ish distance by a directly imaged T-type brown dwarf.',
    root: {
      bary: [
        { star: { key: 'a', name: 'SCR 1845-6357 A', type: 'M8.5V', massMsun: 0.075, radiusRsun: 0.094, teff: 2400, lumLsun: 0.000265, desc: 'Barely a star: a late-M dwarf discovered only in 2004, despite being one of our two dozen nearest neighbours.' } },
        { star: { key: 'b', name: 'SCR 1845-6357 B', type: 'T6 (brown dwarf)', massMjup: 45, radiusRsun: 0.072, teff: 1000, lumLsun: 0.0000053, desc: 'A methane brown dwarf imaged at about 4 AU from its primary, glowing only in the infrared.' } }
      ],
      aAU: 4.1, e: 0.2, id: 'pair', name: 'SCR 1845-6357 Barycentre'
    }
  },

  // ---------------------------------------------------------------- WISE 0855-0714 (7.43 ly)
  {
    id: 'sys-wise0855', name: 'WISE 0855-0714', slug: 'wise0855', systemId: 'wise0855-system', seed: 'wise0855',
    simbad: 'WISEA J085510.74-071442.5', age_Gyr: 5,
    description: 'The coldest known object outside a planetary system, and the fourth-closest system to Sol: a rogue Y-class brown dwarf far colder than a winter’s day, with water-ice clouds in its atmosphere.',
    root: { star: { key: 'star', name: 'WISE 0855-0714', type: 'Y4 (brown dwarf)', massMjup: 6, radiusRsun: 0.105, teff: 276, lumLsun: 0.00000005, desc: 'A free-floating world of a few Jupiter masses, discovered by the WISE infrared survey in 2014. At about -25 degrees Celsius it is colder than Earth’s poles, yet it formed like a star.' } }
  },

  // ---------------------------------------------------------------- Wolf 1061 (14.05 ly)
  {
    id: 'sys-wolf1061', name: 'Wolf 1061', slug: 'wolf1061', systemId: 'wolf1061-system', seed: 'wolf1061',
    simbad: 'Wolf 1061', age_Gyr: 5,
    description: 'A quiet red dwarf with three confirmed super-Earths, including Wolf 1061 c on the inner edge of the habitable zone.',
    root: {
      star: {
        key: 'star', name: 'Wolf 1061', type: 'M3.5V',
        planetsFrom: 'Wolf 1061', planetNameBase: 'Wolf 1061', planetIdPrefix: 'wolf1061',
        desc: 'A low-activity M dwarf whose three planets were teased out of two decades of HARPS spectra.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 9066 (14.58 ly)
  {
    id: 'sys-gj9066', name: 'GJ 9066', slug: 'gj9066', systemId: 'gj9066-system', seed: 'gj9066',
    simbad: 'GJ 9066', age_Gyr: 4.8,
    description: 'A faint red flare dwarf (TZ Arietis) hosting a confirmed gas giant on a long orbit: a genuine cold Jupiter around one of the smallest stars known to have one.',
    root: {
      star: {
        key: 'star', name: 'GJ 9066 (TZ Arietis)', type: 'M4.5V',
        planetsFrom: 'GJ 9066', planetNameBase: 'GJ 9066', planetIdPrefix: 'gj9066',
        desc: 'A dim, flaring M dwarf. Its cold giant planet is an oddity: stars this light rarely manage to build one.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 674 (14.84 ly)
  {
    id: 'sys-gj674', name: 'GJ 674', slug: 'gj674', systemId: 'gj674-system', seed: 'gj674',
    simbad: 'GJ 674', age_Gyr: 0.55,
    description: 'A young, active red dwarf with one confirmed close-in planet, found by HARPS in 2007 among the first low-mass worlds ever detected.',
    root: {
      star: {
        key: 'star', name: 'GJ 674', type: 'M3V',
        planetsFrom: 'GJ 674', planetNameBase: 'GJ 674', planetIdPrefix: 'gj674',
        desc: 'An M dwarf young enough to still carry strong magnetic activity; its hot Neptune-mass planet whips round in under five days.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 687 (14.84 ly)
  {
    id: 'sys-gj687', name: 'GJ 687', slug: 'gj687', systemId: 'gj687-system', seed: 'gj687',
    simbad: 'GJ 687', age_Gyr: 5,
    description: 'A red dwarf in Draco with two confirmed Neptune-mass planets, one temperate and one cold.',
    root: {
      star: {
        key: 'star', name: 'GJ 687', type: 'M3V',
        planetsFrom: 'GJ 687', planetNameBase: 'GJ 687', planetIdPrefix: 'gj687',
        desc: 'One of the brightest M dwarfs in the northern sky, visible in amateur telescopes, with a two-Neptune planetary system.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 876 (15.25 ly)
  {
    id: 'sys-gj876', name: 'GJ 876', slug: 'gj876', systemId: 'gj876-system', seed: 'gj876',
    simbad: 'GJ 876', age_Gyr: 8,
    description: 'A red dwarf carrying four confirmed planets locked in a celebrated 1:2:4 Laplace resonance chain: the first extrasolar echo of Jupiter’s Galilean moons, and the first M dwarf ever found to host a planet.',
    root: {
      star: {
        key: 'star', name: 'GJ 876', type: 'M3.5V',
        planetsFrom: 'GJ 876', planetNameBase: 'GJ 876', planetIdPrefix: 'gj876',
        desc: 'A modest M dwarf with an immodest planetary system: two giants and a super-Earth marching in exact 1:2:4 resonance, plus a hot inner world. Planet-hunting history was made here repeatedly between 1998 and 2010.',
        planetOverrides: {
          'GJ 876 b': { desc: 'A two-Jupiter-mass giant on a 61-day orbit: the first planet ever confirmed around a red dwarf (1998).' },
          'GJ 876 d': { desc: 'One of the first known super-Earths (2005): about 6.8 Earth masses, racing round its star in under two days.' }
        }
      }
    }
  },

  // ---------------------------------------------------------------- GJ 1002 (15.81 ly)
  {
    id: 'sys-gj1002', name: 'GJ 1002', slug: 'gj1002', systemId: 'gj1002-system', seed: 'gj1002',
    simbad: 'GJ 1002', age_Gyr: 8,
    description: 'A quiet red dwarf with two confirmed Earth-mass planets, both inside the habitable zone: one of the most promising nearby systems for temperate terrestrial worlds.',
    root: {
      star: {
        key: 'star', name: 'GJ 1002', type: 'M5.5V',
        planetsFrom: 'GJ 1002', planetNameBase: 'GJ 1002', planetIdPrefix: 'gj1002',
        desc: 'A small, calm M dwarf: no significant flaring, and two roughly Earth-mass planets orbiting where water could stay liquid on both.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 832 (16.19 ly)
  {
    id: 'sys-gj832', name: 'GJ 832', slug: 'gj832', systemId: 'gj832-system', seed: 'gj832',
    simbad: 'GJ 832', age_Gyr: 6,
    description: 'A southern red dwarf with a confirmed cold Jupiter analogue on a decade-long orbit: a miniature Solar System architecture around a small star.',
    root: {
      star: {
        key: 'star', name: 'GJ 832', type: 'M1.5V',
        planetsFrom: 'GJ 832', planetNameBase: 'GJ 832', planetIdPrefix: 'gj832',
        desc: 'A modest M dwarf in Grus. A once-claimed inner super-Earth was retracted in 2022; the outer giant survived scrutiny.'
      }
    }
  },

  // ---------------------------------------------------------------- GJ 682 (16.33 ly)
  {
    id: 'sys-gj682', name: 'GJ 682', slug: 'gj682', systemId: 'gj682-system', seed: 'gj682',
    simbad: 'GJ 682', age_Gyr: 5,
    description: 'A dim red dwarf in Scorpius with two confirmed super-Earths, one of them in the habitable zone.',
    root: {
      star: {
        key: 'star', name: 'GJ 682', type: 'M3.5V',
        planetsFrom: 'GJ 682', planetNameBase: 'GJ 682', planetIdPrefix: 'gj682',
        desc: 'One of the nearest stars in Scorpius, faint enough that its two-planet system went undetected until 2014.'
      }
    }
  },

  // ---------------------------------------------------------------- 40 Eridani (16.34 ly)
  {
    id: 'sys-40eridani', name: '40 Eridani', slug: '40eridani', systemId: '40eridani-system', seed: '40eridani',
    simbad: 'GJ 166 A', age_Gyr: 6.9,
    description: 'A showpiece triple: an orange dwarf attended at 400 AU by a tight white dwarf + red dwarf pair. 40 Eridani B was the first white dwarf ever discovered, and the easiest to see in a small telescope. A once-claimed planet around the primary was retracted in 2024 as stellar activity in disguise.',
    root: {
      bary: [
        { star: { key: 'a', name: '40 Eridani A (Keid)', type: 'K0.5V', massMsun: 0.78, radiusRsun: 0.804, teff: 5126, lumLsun: 0.40, desc: 'A stable K dwarf, naked-eye visible from Earth. The "super-Earth" announced around it in 2018 was shown in 2024 to be an artefact of the star’s own rotation — so its habitable zone still stands empty, awaiting settlers.' } },
        {
          bary: [
            { star: { key: 'b', name: '40 Eridani B', type: 'DA4 (white dwarf)', massMsun: 0.558, radiusKm: 9100, teff: 17200, lumLsun: 0.0135, desc: 'The first white dwarf ever identified, and still the easiest to observe from Earth. A dead star’s core, slowly cooling for the past few billion years.' } },
            { star: { key: 'c', name: '40 Eridani C', type: 'M4.5Ve', massMsun: 0.198, radiusRsun: 0.274, teff: 3167, lumLsun: 0.0065, desc: 'A red flare dwarf circling the white dwarf every 233 years: a live star and a dead one keeping close company.' } }
          ],
          aAU: 35, e: 0.414, periodYr: 233.2, id: 'bc', name: '40 Eridani BC Barycentre'
        }
      ],
      aAU: 400, e: 0.53, id: 'outer', name: '40 Eridani System Barycentre'
    }
  },

  // ---------------------------------------------------------------- Altair (16.73 ly)
  {
    id: 'sys-altair', name: 'Altair', slug: 'altair', systemId: 'altair-system', seed: 'altair',
    simbad: 'Altair', age_Gyr: 0.1,
    description: 'The twelfth-brightest star in Earth’s sky and one of the fastest spinners known: Altair rotates in under nine hours, flattening itself into a visibly oblate spheroid. One of the first stars ever to have its surface imaged.',
    root: { star: { key: 'star', name: 'Altair', type: 'A7V', massMsun: 1.86, radiusRsun: 1.82, teff: 7740, lumLsun: 10.6, rotationHours: 8.9, desc: 'Spinning at nearly 290 km/s at its equator, Altair bulges so much that its poles run over a thousand degrees hotter than its equator. Interferometry has mapped the distortion directly.' } }
  },

  // ---------------------------------------------------------------- Vega (25.04 ly)
  {
    id: 'sys-vega', name: 'Vega', slug: 'vega', systemId: 'vega-system', seed: 'vega',
    simbad: 'Vega', age_Gyr: 0.455,
    description: 'The old northern pole star and the historical zero-point of the magnitude scale, surrounded by the debris disc whose 1983 discovery founded the entire field of exoplanetary science. No planet is yet confirmed, but the disc’s structure hints at unseen shepherds.',
    root: {
      star: {
        key: 'star', name: 'Vega', type: 'A0Va', massMsun: 2.135, radiusRsun: 2.5, teff: 9600, lumLsun: 40.1, rotationHours: 12.5,
        desc: 'A young white star seen nearly pole-on from Earth, spinning at 90% of its own break-up speed. IRAS’s detection of warm dust here in 1983 was the first evidence any other star had planet-forming material.',
        belts: [
          { id: 'vega-warm-belt', name: 'Warm Inner Belt', aAU: 14, widthAU: 8, classes: ['belt/asteroid'], massKg: 1e21, desc: 'A warm asteroid-belt analogue detected in the infrared, hugging the snow line.' },
          { id: 'vega-cold-ring', name: 'Cold Debris Ring', aAU: 85, widthAU: 30, classes: ['belt/ice'], massKg: 5e22, desc: 'The famous outer debris ring: cold dust from colliding comets, the discovery that began debris-disc astronomy.' }
        ]
      }
    }
  },

  // ---------------------------------------------------------------- Zeta Reticuli (39.3 ly)
  {
    id: 'sys-zetareticuli', name: 'Zeta Reticuli', slug: 'zetareticuli', systemId: 'zetareticuli-system', seed: 'zetareticuli',
    simbad: 'zet02 Ret', age_Gyr: 2.8,
    description: 'A rare wide pair of Sun-like stars, visible as a naked-eye double from Earth’s southern hemisphere. Both are near-solar twins; neither has a confirmed planet. A landmark of UFO folklore since the 1960s.',
    root: {
      bary: [
        { star: { key: 'z2', name: 'Zeta 2 Reticuli', type: 'G2V', massMsun: 0.91, radiusRsun: 0.98, teff: 5846, lumLsun: 1.01, desc: 'A near-perfect solar twin. A debris disc once claimed here turned out in 2017 to be background galaxies; any planets remain undetected — officially, at least.' } },
        { star: { key: 'z1', name: 'Zeta 1 Reticuli', type: 'G3-5V', massMsun: 0.95, radiusRsun: 0.92, teff: 5737, lumLsun: 0.80, desc: 'The slightly cooler twin, a comfortable 0.06 light years from its partner: close enough to share an origin, far enough that each would see the other only as a brilliant star.' } }
      ],
      aAU: 3750, e: 0.2, id: 'pair', name: 'Zeta Reticuli Barycentre'
    }
  },

  // ---------------------------------------------------------------- Luhman 16 (6.50 ly)
  {
    id: 'sys-luhman16', name: 'Luhman 16', slug: 'luhman16', systemId: 'luhman16-system', seed: 'luhman16',
    simbad: 'Luhman 16', age_Gyr: 0.51,
    description: 'The third-closest system to Sol, yet only discovered in 2013: a pair of brown dwarfs on the L/T boundary. Luhman 16 B’s surface has been weather-mapped, revealing patchy silicate clouds — the first weather map of any object outside the Solar System.',
    root: {
      bary: [
        { star: { key: 'a', starId: 'luhman16-a', name: 'Luhman 16 A', type: 'L7.5 (brown dwarf)', massMjup: 35.4, radiusRsun: 0.102, teff: 1305, lumLsun: 0.00002, desc: 'An L-type brown dwarf: too light to fuse hydrogen, still glowing from the heat of its formation.' } },
        { star: { key: 'b', starId: 'luhman16-b', name: 'Luhman 16 B', type: 'T0.5 (brown dwarf)', massMjup: 29.4, radiusRsun: 0.102, teff: 1320, lumLsun: 0.00002, desc: 'The first object beyond the Solar System to have its weather mapped: vast silicate cloud banks rotating in and out of view every five hours.' } }
      ],
      aAU: 3.52, e: 0.344, periodYr: 26.55, id: 'pair', baryId: 'luhman16-barycenter', name: 'Luhman 16 Barycentre'
    }
  },

  // ---------------------------------------------------------------- TRAPPIST-1 (40.54 ly)
  {
    id: 'sys-trappist', name: 'TRAPPIST-1', slug: 'trappist-1', systemId: 'trappist-1-system', seed: 'trappist-1-real-data',
    simbad: 'TRAPPIST-1', age_Gyr: 7.6,
    description: 'The most famous planetary system beyond our own: seven Earth-sized worlds around an ultracool dwarf, several in the habitable zone, all in a resonant chain so tight that from any one planet its neighbours loom larger than our Moon. Far beyond the rest of this map, but unmissable.',
    root: {
      star: {
        key: 'star', starId: 'trappist-1-star', name: 'TRAPPIST-1', type: 'M8V',
        planetsFrom: 'TRAPPIST-1', planetNameBase: 'TRAPPIST-1', planetIdPrefix: 'trappist-1', mutualIncMax: 0.3,
        desc: 'A star barely larger than Jupiter, cooler than a candle flame is hot, that will outlive the Sun by trillions of years. Its seven transiting planets are the best-measured rocky worlds outside the Solar System.',
        planetOverrides: {
          'TRAPPIST-1 e': { desc: 'The density champion of the habitable zone: rocky, Earth-sized, receiving two-thirds of Earth’s sunlight. The single most-studied potentially habitable exoplanet.' }
        }
      }
    }
  }
];

// Honest, modest map description (replaces "The definitive map ... all confirmed exoplanets").
export const MAP_A = {
  id: 'starmap-local-neighbourhood',
  file: 'Local_Neighbourhood-Starmap.json',
  name: 'Local Neighbourhood',
  description: 'The Sun’s real neighbourhood: every known star system within about 13 light years, every confirmed planet host out to about 16.5 light years, and a few famous landmarks beyond (Altair, Vega, Zeta Reticuli, TRAPPIST-1). Positions are true 3D positions from Gaia, Hipparcos and SIMBAD astrometry; planets are limited to those listed as confirmed by the NASA Exoplanet Archive (July 2026). Star and planet parameters are real where measured and physics-derived where not.'
};
