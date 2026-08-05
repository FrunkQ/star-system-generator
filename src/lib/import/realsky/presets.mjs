// Real-sky import — region presets for the import dialogue.
//
// Each preset is a worked example of the feature: a centre, a radius and a
// blurb. Centres are BAKED (resolved once from SIMBAD) so the presets work
// offline from the bundled catalogue cache; the free-text star search is the
// live path. The Sagittarius A* entry is not a region at all but the cluster
// gate's flagship demo — a hand-curated single-system import (sgrastar.mjs).

export const REGION_PRESETS = [
  {
    key: 'local',
    name: 'Local Neighbourhood',
    kind: 'archive',
    centre: { raDeg: 0, decDeg: 0, distLy: 0 }, centreLabel: 'Sol',
    radiusLy: 16.5,
    blurb: 'Every confirmed planet host within 16.5 light years of Sol, fetched live from the archive — the same census the bundled map curates by hand, built fresh from the catalogue.'
  },
  {
    key: 'extended',
    name: 'Extended Neighbourhood',
    kind: 'archive',
    centre: { raDeg: 0, decDeg: 0, distLy: 0 }, centreLabel: 'Sol',
    radiusLy: 30,
    blurb: 'Confirmed planet hosts to 30 light years: everything the bundled map curates plus the next shell out — GJ 581, HD 219134, 61 Virginis, AU Microscopii and more arrive as new systems.'
  },
  {
    key: 'trappist',
    name: 'Around TRAPPIST-1',
    kind: 'archive',
    // SIMBAD ICRS, resolved 2026-08-03 and baked so the preset works offline.
    centre: { raDeg: 346.6224, decDeg: -5.0414, distLy: 40.66 }, centreLabel: 'TRAPPIST-1',
    radiusLy: 15,
    blurb: 'A 15 light-year sphere centred on TRAPPIST-1, forty light years from home: the same importer, somebody else’s neighbourhood.'
  },
  {
    key: 'sgra',
    name: 'Sagittarius A* — the S-star cluster',
    kind: 'cluster-demo',
    blurb: 'The centre of the galaxy as ONE SYSTEM: 4.3 million solar masses with the ten best-measured S-stars swinging around it on their real periods — S2’s 16-year, e = 0.88 orbit included. This is the cluster gate’s flagship case: a region so mass-dominated that a starmap would be the wrong container, because the stars visibly move.'
  }
];
