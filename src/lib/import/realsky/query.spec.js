// Real-sky import — query-layer tests: the sphere→cone+shell translation and
// the TAP transport normalisation. The geometry claims here mirror design doc
// §1b; if they change, change the doc.
import { describe, expect, it } from 'vitest';
import { LY_PER_PC } from './constants.mjs';
import { inSphere, radecToXyzLy } from './positions.mjs';
import {
  SOL_CENTRE, archiveCountAdql, archivePlanetsAdql, gaiaConeAdql,
  regionBounds, runTap, simbadResolveAdql, tapUrl
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
