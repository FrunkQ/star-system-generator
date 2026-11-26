// Real-sky import — query-layer tests: the sphere→cone+shell translation and
// the TAP transport normalisation. The geometry claims here mirror design doc
// §1b; if they change, change the doc.
import { beforeEach, describe, expect, it } from 'vitest';
import { LY_PER_PC } from './constants.mjs';
import { inSphere, radecToXyzLy } from './positions.mjs';
import {
  SOL_CENTRE, archiveCountAdql, archivePlanetsAdql, gaiaConeAdql,
  regionBounds, runTap, simbadResolveAdql, simbadSearchAdql, simbadComponentsAdql, SUGGEST_LIMIT, tapUrl,
  TAP_SERVICES, TAP_MIRRORS, resetTapHostPreference, skyBoxForCone, inSkyBox, simbadStarsAdql
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

  // v3.2.2: the archive now 403s any WHERE with a parenthesis, so its cone is a box. SIMBAD's
  // region queries keep the real ICRS circle.
  it('off-Sol regions add a sky limit: a box for the archive, an ICRS circle for SIMBAD', () => {
    const region = { centre: { raDeg: 44.8, decDeg: -55.05, distLy: 39.3 }, radiusLy: 5 };
    const q = archivePlanetsAdql(region);
    expect(q).toContain('dec >= -63.433021 AND dec <= -46.666979 AND ra >= 30.056387 AND ra <= 59.543613');
    expect(q).not.toContain('CIRCLE');
    expect(simbadStarsAdql(region)).toContain("CIRCLE('ICRS', 44.8");
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

// THE NASA ARCHIVE REFUSES A PARENTHESIS IN A WHERE CLAUSE (v3.2.2). Measured 2026-11-26: a cone,
// a DISTANCE() test or `(ra - x) * (ra - x)` all came back 403 from the archive's firewall, while
// plain comparisons, BETWEEN and NOT BETWEEN passed. These pin the two halves of the fix: the
// archive's WHERE has no parenthesis at all, and the box that replaces the cone never loses a point
// the cone held - near the poles, across RA 0, and for wide cones.
describe('the archive gets the cone as a box it will accept', () => {
  const where = (q) => q.slice(q.indexOf(' where ') + 7).replace(/ order by .*$/, '');
  const centres = [
    { raDeg: 37.95, decDeg: 89.26 },   // Polaris: the cone reaches the pole
    { raDeg: 219.9, decDeg: -60.83 },  // Alpha Centauri
    { raDeg: 0.5, decDeg: 10 },        // crosses RA 0 on the low side
    { raDeg: 359.5, decDeg: -20 },     // crosses RA 0 on the high side
    { raDeg: 180, decDeg: 0 },         // the equator
    { raDeg: 90, decDeg: -85 }         // near the south pole
  ];

  it('no WHERE the archive receives contains a parenthesis', () => {
    for (const c of centres) {
      for (const radiusLy of [2, 5, 16.5]) {
        const region = { centre: { ...c, distLy: 40 }, radiusLy };
        expect(where(archivePlanetsAdql(region))).not.toMatch(/[()]/);
        expect(where(archiveCountAdql(region))).not.toMatch(/[()]/);
      }
    }
    // A Sol-centred region has no sky limit at all, as before.
    expect(where(archivePlanetsAdql({ centre: SOL_CENTRE, radiusLy: 16.5 }))).not.toMatch(/ra|dec/);
  });

  it('every point inside the cone is inside the box', () => {
    const rad = Math.PI / 180;
    const ang = (ra1, d1, ra2, d2) => Math.acos(Math.min(1,
      Math.sin(d1 * rad) * Math.sin(d2 * rad) + Math.cos(d1 * rad) * Math.cos(d2 * rad) * Math.cos((ra1 - ra2) * rad))) / rad;
    let checked = 0;
    for (const c of centres) {
      for (const r of [0.5, 6, 25, 60]) {
        const box = skyBoxForCone(c.raDeg, c.decDeg, r);
        for (let i = 0; i < 720; i++) {
          // Points on and just inside the cone's edge, all the way round, plus the centre.
          const bearing = (i / 720) * 2 * Math.PI;
          for (const f of [0, 0.5, 0.999]) {
            const d = r * f * rad;
            const lat = Math.asin(Math.sin(c.decDeg * rad) * Math.cos(d) + Math.cos(c.decDeg * rad) * Math.sin(d) * Math.cos(bearing));
            const lon = c.raDeg * rad + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(c.decDeg * rad), Math.cos(d) - Math.sin(c.decDeg * rad) * Math.sin(lat));
            const ra = (((lon / rad) % 360) + 360) % 360;
            const dec = lat / rad;
            expect(ang(ra, dec, c.raDeg, c.decDeg)).toBeLessThanOrEqual(r + 1e-6);
            if (!inSkyBox(box, ra, dec)) throw new Error(`lost (${ra.toFixed(4)}, ${dec.toFixed(4)}) from the ${r} deg cone at (${c.raDeg}, ${c.decDeg})`);
            checked++;
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(50000);
  });

  it('a range across RA 0 is written as the RA it excludes, and a cone over a pole leaves RA open', () => {
    const wrap = skyBoxForCone(0.5, 10, 5);
    expect(wrap.ra.wraps).toBe(true);
    expect(inSkyBox(wrap, 359, 10)).toBe(true);
    expect(inSkyBox(wrap, 180, 10)).toBe(false);
    expect(archivePlanetsAdql({ centre: { raDeg: 0.5, decDeg: 10, distLy: 40 }, radiusLy: 2 })).toContain('ra NOT BETWEEN');
    const pole = skyBoxForCone(37.95, 89.26, 6);
    expect(pole.ra).toBeNull();
    expect(pole.decHi).toBe(90);
  });

  it('the box is not wildly bigger than the cone it replaces', () => {
    // Away from the poles a box over-fetches its corners: about 4/pi of the cone's area.
    const box = skyBoxForCone(180, 0, 5);
    expect(box.decHi - box.decLo).toBeLessThan(10.01);
    expect(box.ra.hi - box.ra.lo).toBeLessThan(10.02);
  });
});

// A HOST THAT CANNOT BE REACHED IS NOT A CATALOGUE THAT SAID NO (v3.2.1). CDS Strasbourg went down
// in November 2026 and every real-sky import failed with ERR_NAME_NOT_RESOLVED, while SIMBAD's CfA
// mirror answered the same query with the same row. These pin when runTap moves to the mirror and,
// as importantly, when it must not.
describe('runTap falls back to a mirror only when the host could not answer', () => {
  beforeEach(() => resetTapHostPreference());

  const PRIMARY = TAP_SERVICES.simbad;
  const MIRROR = TAP_MIRRORS.simbad[0];
  const POLARIS = { metadata: [{ name: 'main_id' }], data: [['* alf UMi']] };
  const ok = (payload) => ({ ok: true, status: 200, json: async () => payload });
  const status = (code, text = 'err') => ({ ok: false, status: code, text: async () => text });
  // A fetch stub that answers per host and records which hosts were asked, in order.
  function hosts(byHost) {
    const asked = [];
    const fetchImpl = async (url) => {
      const host = Object.keys(byHost).find((h) => url.startsWith(h + '?'));
      asked.push(host === PRIMARY ? 'primary' : host === MIRROR ? 'mirror' : url);
      const answer = byHost[host];
      return typeof answer === 'function' ? answer() : answer;
    };
    return { fetchImpl, asked };
  }
  const unreachable = () => { throw new TypeError('Failed to fetch'); };

  it('the mirror is a different host serving the same TAP path', () => {
    expect(MIRROR).not.toBe(PRIMARY);
    expect(MIRROR).toMatch(/^https:\/\/[^/]+\/simbad\/sim-tap\/sync$/);
  });

  it('an unreachable primary (DNS failure, refused, CORS-less error) goes to the mirror', async () => {
    const { fetchImpl, asked } = hosts({ [PRIMARY]: unreachable, [MIRROR]: ok(POLARIS) });
    const rows = await runTap('simbad', 'q', { fetchImpl });
    expect(rows).toEqual([{ main_id: '* alf UMi' }]);
    expect(asked).toEqual(['primary', 'mirror']);
  });

  it('a primary answering 5xx goes to the mirror', async () => {
    const { fetchImpl, asked } = hosts({ [PRIMARY]: status(503, 'busy'), [MIRROR]: ok(POLARIS) });
    expect(await runTap('simbad', 'q', { fetchImpl })).toHaveLength(1);
    expect(asked).toEqual(['primary', 'mirror']);
  });

  it('a primary answering 200 with a page that is not JSON goes to the mirror', async () => {
    const html = { ok: true, status: 200, json: async () => { throw new SyntaxError('Unexpected token <'); } };
    const { fetchImpl, asked } = hosts({ [PRIMARY]: html, [MIRROR]: ok(POLARIS) });
    expect(await runTap('simbad', 'q', { fetchImpl })).toHaveLength(1);
    expect(asked).toEqual(['primary', 'mirror']);
  });

  it('a 4xx is the catalogue rejecting the query: no mirror, the error comes through as before', async () => {
    const { fetchImpl, asked } = hosts({ [PRIMARY]: status(400, 'Incorrect ADQL query'), [MIRROR]: ok(POLARIS) });
    await expect(runTap('simbad', 'q', { fetchImpl })).rejects.toThrow(/simbad TAP: HTTP 400/);
    expect(asked).toEqual(['primary']);
  });

  it('a cancelled or timed-out request is the caller\'s decision: no mirror', async () => {
    const ctl = new AbortController();
    ctl.abort();
    const aborted = () => { throw new DOMException('The operation was aborted.', 'AbortError'); };
    const a = hosts({ [PRIMARY]: aborted, [MIRROR]: ok(POLARIS) });
    await expect(runTap('simbad', 'q', { fetchImpl: a.fetchImpl, signal: ctl.signal })).rejects.toThrow(/aborted/);
    expect(a.asked).toEqual(['primary']);
    const timedOut = () => { throw new DOMException('signal timed out', 'TimeoutError'); };
    const b = hosts({ [PRIMARY]: timedOut, [MIRROR]: ok(POLARIS) });
    await expect(runTap('simbad', 'q', { fetchImpl: b.fetchImpl })).rejects.toThrow(/timed out/);
    expect(b.asked).toEqual(['primary']);
  });

  it('once the mirror has answered, later queries go to it first and do not retry the dead host', async () => {
    const { fetchImpl, asked } = hosts({ [PRIMARY]: unreachable, [MIRROR]: ok(POLARIS) });
    await runTap('simbad', 'q1', { fetchImpl });
    await runTap('simbad', 'q2', { fetchImpl });
    await runTap('simbad', 'q3', { fetchImpl });
    expect(asked).toEqual(['primary', 'mirror', 'mirror', 'mirror']);
  });

  it('if the preferred mirror later fails, the primary is tried again', async () => {
    let mirrorUp = true;
    const { fetchImpl, asked } = hosts({
      [PRIMARY]: () => (mirrorUp ? unreachable() : ok(POLARIS)),
      [MIRROR]: () => (mirrorUp ? ok(POLARIS) : unreachable())
    });
    await runTap('simbad', 'q1', { fetchImpl });
    mirrorUp = false;
    expect(await runTap('simbad', 'q2', { fetchImpl })).toHaveLength(1);
    expect(asked).toEqual(['primary', 'mirror', 'mirror', 'primary']);
  });

  it('when every host is unreachable the network error reaches the caller unchanged', async () => {
    const { fetchImpl, asked } = hosts({ [PRIMARY]: unreachable, [MIRROR]: unreachable });
    await expect(runTap('simbad', 'q', { fetchImpl })).rejects.toThrow(/Failed to fetch/);
    expect(asked).toEqual(['primary', 'mirror']);
  });

  it('a service with no mirror behaves exactly as before', async () => {
    const asked = [];
    const fetchImpl = async (url) => { asked.push(url); throw new TypeError('Failed to fetch'); };
    await expect(runTap('archive', 'q', { fetchImpl })).rejects.toThrow(/Failed to fetch/);
    expect(asked).toHaveLength(1);
    expect(asked[0].startsWith(TAP_SERVICES.archive + '?')).toBe(true);
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
