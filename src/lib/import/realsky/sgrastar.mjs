// Real-sky import — the Sagittarius A* S-star cluster, hand-curated
// (design doc §5c phase 5: "S-star elements hand-curated first").
//
// This is the cluster gate's flagship: the one place in the sky where stars
// demonstrably orbit on PLAYABLE timescales, because 4.3 million solar masses
// sit in the middle. S2 completes an orbit every ~16 years at e = 0.88; S55
// in under 13. The gate maths (clusterGate.mjs) classifies this region
// 'system', and this module builds that system.
//
// Data honesty, per the bundled-map conventions:
// - PERIODS and ECCENTRICITIES are the published values (Gillessen et al.
//   2017, ApJ 837:30, Table 3; S2 refined by GRAVITY Collaboration 2019).
//   Semi-major axes are DERIVED from the period via Kepler around the black
//   hole's measured mass, so orbit and hostMu can never disagree.
// - ORIENTATIONS (i/Omega/omega/phase) are deterministic hashes: the real
//   S-stars swarm in three dimensions and their published angles are quoted
//   in the sky plane, which SSE does not use. The description says so.
// - Stellar masses/radii/temperatures are "typical early B main sequence"
//   estimates (S2 itself ~14 Msun) and are labelled as estimates.

import { AU_KM, G, SECONDS_PER_YEAR, SOLAR_MASS_KG, SOLAR_RADIUS_KM, EPOCH, DEFAULT_MAP_CENTRE_PX } from './constants.mjs';
import { hash01, round } from './positions.mjs';
import { dynamicalTimeYr } from './clusterGate.mjs';

export const SGR_A_MASS_MSUN = 4.297e6; // GRAVITY Collaboration 2019
const SGR_A_MASS_KG = SGR_A_MASS_MSUN * SOLAR_MASS_KG;
// Schwarzschild radius for that mass: 2GM/c^2 ~ 1.27e7 km.
const SGR_A_RADIUS_KM = Math.round((2 * G * SGR_A_MASS_KG) / (299792458 ** 2) / 1000);

// name, period (yr), eccentricity, spectral estimate. Gillessen 2017 Table 3.
const S_STARS = [
  { name: 'S1',  periodYr: 166.0, e: 0.556 },
  { name: 'S2',  periodYr: 16.05, e: 0.884, massMsun: 13.6, radiusRsun: 5.5, teff: 28500, note: 'The most famous star in the galaxy: its 2018 pericentre passage, at 2.7% of lightspeed, confirmed general relativity in the black hole’s grip. Period and eccentricity are the measured values.' },
  { name: 'S4',  periodYr: 77.0,  e: 0.393 },
  { name: 'S8',  periodYr: 92.9,  e: 0.803 },
  { name: 'S9',  periodYr: 51.3,  e: 0.644 },
  { name: 'S12', periodYr: 58.9,  e: 0.888 },
  { name: 'S13', periodYr: 49.0,  e: 0.425 },
  { name: 'S14', periodYr: 55.3,  e: 0.976, note: 'Plunges from ~2,900 AU down to almost touching distance every 55 years: the most eccentric well-measured orbit in the cluster.' },
  { name: 'S38', periodYr: 19.2,  e: 0.81 },
  { name: 'S55', periodYr: 12.8,  e: 0.721, note: 'The shortest well-measured period in the cluster: a full orbit inside 13 years.' }
];

const aAUFromPeriod = (periodYr) => {
  const T = periodYr * SECONDS_PER_YEAR;
  return Math.cbrt((G * SGR_A_MASS_KG * T * T) / (4 * Math.PI * Math.PI)) / (AU_KM * 1000);
};

export function buildSgrAStarSystem() {
  const tDyn = round(dynamicalTimeYr(0.02, SGR_A_MASS_KG), 1);
  const bhId = 'sgr-a-star';
  const nodes = [
    {
      id: bhId, parentId: null, name: 'Sagittarius A*', kind: 'body', roleHint: 'star',
      classes: ['star/BH'],
      massKg: SGR_A_MASS_KG,
      radiusKm: SGR_A_RADIUS_KM,
      accretionEddington: 0,
      radiationOutput: 0,
      tags: [],
      description:
        'The supermassive black hole at the centre of the Milky Way: 4.3 million solar masses inside a horizon smaller than Mercury’s orbit, measured by the stars that swing around it. Currently quiescent — it feeds so weakly that its glow is fainter than a single bright star. The 2020 Nobel Prize in Physics was awarded for the observations this system reproduces, and the Event Horizon Telescope photographed its shadow in 2022.'
    }
  ];
  for (const s of S_STARS) {
    const id = `sgr-${s.name.toLowerCase()}`;
    const aAU = round(aAUFromPeriod(s.periodYr), 1);
    nodes.push({
      id, parentId: bhId, name: s.name, kind: 'body', roleHint: 'star',
      classes: ['star/B'],
      massKg: (s.massMsun ?? 10) * SOLAR_MASS_KG,
      radiusKm: Math.round((s.radiusRsun ?? 5) * SOLAR_RADIUS_KM),
      temperatureK: s.teff ?? 22000,
      radiationOutput: s.massMsun ? 10000 : 5000,
      image: { url: '/images/star_types/B.webp' },
      orbit: {
        hostId: bhId, hostMu: G * SGR_A_MASS_KG, t0: EPOCH,
        elements: {
          a_AU: aAU,
          e: s.e,
          // Orientations are illustrative: the real swarm is three-dimensional
          // and its published angles are sky-plane values SSE does not use.
          i_deg: round(hash01(id + '|i') * 150 - 75, 1),
          omega_deg: round(hash01(id + '|w') * 360, 1),
          Omega_deg: round(hash01(id + '|W') * 360, 1),
          M0_rad: round(hash01(id + '|M') * 2 * Math.PI, 4)
        }
      },
      tags: [],
      description: `${s.note ?? `A young B-type star of the S-cluster.`} Orbital period ${s.periodYr} years, eccentricity ${s.e} — the published values (Gillessen et al. 2017); the star itself is a typical early B dwarf, parameters estimated.`
    });
  }
  // The rest of the cluster, honestly unresolved rather than pretended absent.
  nodes.push({
    id: 'sgr-s-cluster-glow', parentId: bhId, name: 'S-cluster (unresolved members)', kind: 'body', roleHint: 'belt',
    classes: ['belt/asteroid'],
    radiusInnerKm: Math.round(5000 * AU_KM), radiusOuterKm: Math.round(25000 * AU_KM),
    massKg: 1e33,
    orbit: {
      hostId: bhId, hostMu: G * SGR_A_MASS_KG, t0: EPOCH,
      elements: { a_AU: 15000, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: round(hash01('sgr-glow') * 2 * Math.PI, 4) }
    },
    tags: [],
    description: 'Dozens more S-stars and thousands of fainter cluster members whose orbits are not individually charted here. The ten brightest, best-measured stars fly above; this ring stands for the rest.'
  });

  return {
    id: 'sys-sgr-a-star',
    name: 'Sagittarius A*',
    position: { x: DEFAULT_MAP_CENTRE_PX.x, y: DEFAULT_MAP_CENTRE_PX.y, z: 0 },
    system: {
      id: 'sgr-a-star-system', name: 'Sagittarius A*', seed: 'realsky-sgr-a-star',
      epochT0: EPOCH, age_Gyr: 8,
      nodes, rulePackId: '', rulePackVersion: '', tags: [],
      credits: { author: 'Star System Explorer', created: 'real-sky import', version: '1' }
    },
    // The gate readout the UI quotes before importing.
    gate: { tDynYr: tDyn, headline: 'These stars orbit the black hole on playable timescales — S55 completes a lap in under 13 years.' }
  };
}

export const SGR_A_MAP_META = {
  name: 'Sagittarius A* — the S-star cluster',
  description:
    'The centre of the Milky Way as one star system: Sagittarius A* with the ten best-measured S-stars swinging around it on their real periods and eccentricities — S2’s 16-year, e = 0.88 orbit included. This is the cluster gate’s flagship case: a region so dominated by one mass that a starmap would be the wrong container, because the stars visibly MOVE. Orbit sizes, shapes and periods are the published measurements (Gillessen et al. 2017; GRAVITY 2019); orientations are illustrative. 26,670 light years from Sol — this map stands alone rather than sharing the Local Neighbourhood’s frame.'
};
