// Real-sky import — query-layer tests: the sphere→cone+shell translation and
// the TAP transport normalisation. The geometry claims here mirror design doc
// §1b; if they change, change the doc.
import { describe, expect, it } from 'vitest';
import { LY_PER_PC } from './constants.mjs';
import { inSphere, radecToXyzLy } from './positions.mjs';
import {
  SOL_CENTRE, archiveCountAdql, archivePlanetsAdql, gaiaConeAdql,
  regionBounds, runTap, simbadResolveAdql, simbadSearchAdql, simbadComponentsAdql, SUGGEST_LIMIT, tapUrl
} from './query.mjs';

describe('regionBounds', () => {
  it('a Sol-centred sphere is a plain distance shell over the whole sky', () => {
    const b = regionBounds({ centre: SOL_CENTRE, radiusLy: 16.5 });
    expect(b.shellMinPc).toBe(0);
    expect(b.shellMaxPc).toBeCloseTo(16.5 / LY_PER_PC, 10);
    expect(b.coneHalfAngleDeg).toBeNull();
    expect(b.centreXyzLy).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('an off-Sol centre gets a shell plus a cone that CONTAINS the sphere', () => {
    const centre = { raDeg: 219.9, decDeg: -60.83, distLy: 40 };
    const radiusLy = 10;
    const b = regionBounds({ centre, radiusLy });
    expect(b.shellMinPc).toBeCloseTo(30 / LY_PER_PC, 10);
    expect(b.shellMaxPc).toBeCloseTo(50 / LY_PER_PC, 10);
    // The cone must not clip the sphere: every point of the sphere lies inside
    // it. asin(R/(d-R)) is the tangent from Sol to the near edge; check it is
    // at least the half-angle subtended at the true distance.
    const naive = (Math.asin(radiusLy / centre.distLy) * 180) / Math.PI;
    expect(b.coneHalfAngleDeg).toBeGreaterThan(naive);
  });

  it('a sphere that contains Sol degrades to the whole-sky shell', () => {
    const b = regionBounds({ centre: { raDeg: 10, decDeg: 5, distLy: 4 }, radiusLy: 6 });
    expect(b.coneHalfAngleDeg).toBeNull();
    expect(b.shellMinPc).toBe(0);
  });

  it('rejects nonsense radii', () => {
    expect(() => regionBounds({ centre: SOL_CENTRE, radiusLy: 0 })).toThrow(/positive/);
    expect(() => regionBounds({ centre: SOL_CENTRE, radiusLy: NaN })).toThrow(/finite/);
  });
});

describe('over-fetch bounds + exact cut agree', () => {
  it('every point inside the true sphere satisfies the shell bounds', () => {
    const centre = { raDeg: 101.28, decDeg: -16.71, distLy: 8.6 }; // Sirius-ish
    const region = { centre, radiusLy: 5 };
    const b = regionBounds(region);
    // Sample points on and inside the sphere via offsets from the centre.
    const c = radecToXyzLy(centre.raDeg, centre.decDeg, centre.distLy);
    for (const f of [0, 0.5, 0.99]) {
      for (const dir of [[1, 0, 0], [0, 1, 0], [0, 0, -1], [0.577, -0.577, 0.577]]) {
        const p = { x: c.x + dir[0] * 5 * f, y: c.y + dir[1] * 5 * f, z: c.z + dir[2] * 5 * f };
        expect(inSphere(p, c, 5)).toBe(true);
        const dPc = Math.hypot(p.x, p.y, p.z) / LY_PER_PC;
        expect(dPc).toBeGreaterThanOrEqual(b.shellMinPc - 1e-9);
        expect(dPc).toBeLessThanOrEqual(b.shellMaxPc + 1e-9);
      }
    }
  });
});

describe('ADQL builders', () => {
  const region = { centre: SOL_CENTRE, radiusLy: 16.5 };

  it('archive queries select from pscomppars with the shell clause', () => {
    const q = archivePlanetsAdql(region);
    expect(q).toContain('from pscomppars');
    expect(q).toContain('sy_dist <=');
    expect(q).toContain('order by sy_dist');
    expect(archiveCountAdql(region)).toContain('count(distinct hostname)');
  });

  it('off-Sol regions add an ICRS circle', () => {
    const q = archivePlanetsAdql({ centre: { raDeg: 44.8, decDeg: -55.05, distLy: 39.3 }, radiusLy: 5 });
    expect(q).toContain("CIRCLE('ICRS', 44.8");
  });

  it('gaia queries guard the parallax and honour the magnitude cut', () => {
    const q = gaiaConeAdql(region, { magLimit: 12 });
    expect(q).toContain('parallax > 0');
    expect(q).toContain('parallax_over_error > 5');
    expect(q).toContain('phot_g_mean_mag <= 12.00');
    expect(gaiaConeAdql(region, { count: true })).toContain('count(*)');
  });

  it('SIMBAD resolution escapes quotes', () => {
    expect(simbadResolveAdql("Barnard's star")).toContain("Barnard''s star");
  });
});

describe('tapUrl + runTap', () => {
  it('SIMBAD/Gaia get the doQuery envelope, the archive does not', () => {
    expect(tapUrl('simbad', 'select 1')).toContain('request=doQuery');
    expect(tapUrl('gaia', 'select 1')).toContain('request=doQuery');
    expect(tapUrl('archive', 'select 1')).not.toContain('doQuery');
    expect(() => tapUrl('nope', 'select 1')).toThrow(/Unknown TAP service/);
  });

  const stub = (payload) => async () => ({ ok: true, json: async () => payload });

  it('normalises the archive plain-array shape', async () => {
    const rows = await runTap('archive', 'q', { fetchImpl: stub([{ pl_name: 'x b' }]) });
    expect(rows).toEqual([{ pl_name: 'x b' }]);
  });

  it('normalises the VOTable-JSON envelope to keyed rows', async () => {
    const rows = await runTap('simbad', 'q', {
      fetchImpl: stub({ metadata: [{ name: 'main_id' }, { name: 'ra' }], data: [['Sirius', 101.28]] })
    });
    expect(rows).toEqual([{ main_id: 'Sirius', ra: 101.28 }]);
  });

  it('throws on HTTP failure with the service named', async () => {
    const fail = async () => ({ ok: false, status: 503, text: async () => 'busy' });
    await expect(runTap('gaia', 'q', { fetchImpl: fail })).rejects.toThrow(/gaia TAP: HTTP 503/);
  });
});

// WHEN AN EXACT LOOKUP FAILS (D24 follow-on). The shapes here are constrained by MEASURED cost
// against the live service, not by taste — see the timings in query.mjs — so these tests pin the
// properties that keep them fast, because a change that loses one is invisible until someone waits
// eighteen seconds for a search.
describe('the suggestion queries', () => {
  it('asks for one more row than it will show, so "more than 20" needs no second query', () => {
    // A count over the same prefixes costs ~6 seconds, which is why this is not a count.
    expect(simbadSearchAdql('eps')).toContain(`top ${SUGGEST_LIMIT + 1}`);
    expect(simbadSearchAdql('eps', { limit: 5 })).toContain('top 6');
  });

  it('excludes planets and anything without a parallax, and orders nearest first', () => {
    const q = simbadSearchAdql('eps');
    // A planet cannot be a region centre, and no parallax means no distance to place it at.
    expect(q).toContain("otype not in ('Pl', 'Pl?')");
    expect(q).toContain('plx_value > 0');
    expect(q).toContain('order by plx_value desc');
  });

  it("covers SIMBAD's own identifier prefixes", () => {
    const q = simbadSearchAdql('Wolf');
    for (const p of ["like 'Wolf%'", "like '* Wolf%'", "like 'V* Wolf%'", "like 'NAME Wolf%'"]) {
      expect(q).toContain(p);
    }
  });

  it('escapes a quote rather than breaking the query', () => {
    expect(simbadSearchAdql("Barnard's")).toContain("Barnard''s");
    expect(simbadComponentsAdql("* Barnard's star")).toContain("Barnard''s star");
  });

  it('reads components through h_link, aliasing every column', () => {
    const q = simbadComponentsAdql('*  61 Cyg');
    // h_link IS the parent/child relationship; `main_id like '<id> %'` is 3.2 s against 177 ms.
    expect(q).toContain('from h_link h');
    // SIMBAD's parser rejects a QUALIFIED name in order by, and an unqualified plx_value is
    // ambiguous across this join — aliasing every column is the only shape that parses.
    expect(q).toContain('c.plx_value as plx_value');
    expect(q).toContain('order by plx_value desc');
    expect(q).not.toContain('order by c.plx_value');
  });
});
