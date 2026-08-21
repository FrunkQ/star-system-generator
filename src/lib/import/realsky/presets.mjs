// Real-sky import — region presets for the import dialogue.
//
// Each preset is a worked example of the feature: a centre, a radius and a
// blurb. Centres are BAKED (resolved once from SIMBAD) so the presets work
// offline from the bundled catalogue cache; the free-text star search is the
// live path. The Sagittarius A* entry is not a region at all but the cluster
// gate's flagship demo — a hand-curated single-system import (sgrastar.mjs).
//
// THE BLURBS ARE PART OF THE CONTRACT, so they moved when the behaviour did (D18). They used to say
// "every confirmed planet host", which was honest while the importer selected from the Exoplanet
// Archive — and became a lie the moment the census became STELLAR. A preset that describes the old
// feature is worse than no blurb: it is the first thing a GM reads, and it told them the import
// would omit exactly the stars it now includes.

export const REGION_PRESETS = [
  {
    key: 'local',
    name: 'Local Neighbourhood',
    kind: 'archive',
    centre: { raDeg: 0, decDeg: 0, distLy: 0 }, centreLabel: 'Sol',
    radiusLy: 16.5,
    blurb: 'Every known star within 16.5 light years of Sol — including Sol itself, and the ones with no planets, which is most of them. Confirmed planets are attached where the archive has them. The same neighbourhood the bundled map curates by hand, built fresh from the catalogues.'
  },
  {
    key: 'extended',
    name: 'Extended Neighbourhood',
    kind: 'archive',
    centre: { raDeg: 0, decDeg: 0, distLy: 0 }, centreLabel: 'Sol',
    radiusLy: 30,
    blurb: 'Every known star to 30 light years: the bundled map’s neighbourhood plus the next shell out, with GJ 581, HD 219134, 61 Virginis and AU Microscopii among the planet hosts that arrive. Several hundred systems — most of them a single star.'
  },
  {
    key: 'trappist',
    name: 'Around TRAPPIST-1',
    kind: 'archive',
    // SIMBAD ICRS, resolved 2026-08-03 and baked so the preset works offline.
    centre: { raDeg: 346.6224, decDeg: -5.0414, distLy: 40.66 }, centreLabel: 'TRAPPIST-1',
    radiusLy: 15,
    blurb: 'A 15 light-year sphere centred on TRAPPIST-1, forty light years from home: the same importer, somebody else’s neighbourhood — and no Sol in it, because the region does not reach us.'
  },
  {
    key: 'sgra',
    name: 'Sagittarius A* — the S-star cluster',
    kind: 'cluster-demo',
    blurb: 'The centre of the galaxy as ONE SYSTEM: 4.3 million solar masses with the ten best-measured S-stars swinging around it on their real periods — S2’s 16-year, e = 0.88 orbit included. This is the cluster gate’s flagship case: a region so mass-dominated that a starmap would be the wrong container, because the stars visibly move.'
  }
];
