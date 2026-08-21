// Real-sky import — converter tests, run against the build kit's COMMITTED
// archive cache (real pscomppars rows, no network).
//
// Also the STALENESS guard for `src/lib/generated/bundledArchiveHosts.mjs`
// (D15): that file is generated from the roster by the build kit, so this
// walks the roster itself and fails naming the host if the two disagree. Add
// a planet host to a bundled system and this goes red until the kit is
// re-run — which is the whole point of generating it rather than keeping a
// second copy by hand.
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { systems as roster } from '../../../../scripts/starmap-build/data/systems-real.mjs';
import { SOL_CENTRE } from './query.mjs';
import { BUNDLED_ARCHIVE_HOSTS, convertArchiveRows, hostSlug } from './convert.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const cache = JSON.parse(readFileSync(
  resolve(here, join('..', '..', '..', '..', 'scripts', 'starmap-build', 'data', 'cache', 'archive-pscomppars.json')), 'utf-8'
));

// Every planetsFrom in the roster, wherever it hides in the component tree.
function rosterHosts() {
  const hosts = [];
  const walk = (spec) => {
    if (!spec) return;
    if (spec.star) {
      if (spec.star.planetsFrom) hosts.push(spec.star.planetsFrom);
      return;
    }
    if (spec.bary) spec.bary.forEach(walk);
  };
  for (const s of roster) walk(s.root);
  return hosts;
}

describe('the generated bundled-host map is not stale', () => {
  it('every roster planet host is protected, and nothing extra is', () => {
    const fromRoster = new Set(rosterHosts());
    const protectedHosts = new Set(Object.keys(BUNDLED_ARCHIVE_HOSTS));
    // Failure here means: re-run `node scripts/starmap-build/build-starmaps.mjs`.
    expect([...fromRoster].filter((h) => !protectedHosts.has(h))).toEqual([]);
    expect([...protectedHosts].filter((h) => !fromRoster.has(h))).toEqual([]);
  });

  it('points each host at the system id that actually curates it', () => {
    // Not just the same NAMES — the same mapping. A host aimed at the wrong
    // system would report a misleading collision to the GM.
    const rosterPairs = new Map();
    const walk = (spec, sysId) => {
      if (!spec) return;
      if (spec.star) { if (spec.star.planetsFrom) rosterPairs.set(spec.star.planetsFrom, sysId); return; }
      if (spec.bary) spec.bary.forEach((s) => walk(s, sysId));
    };
    for (const s of roster) walk(s.root, s.id);
    expect(Object.fromEntries([...rosterPairs].sort())).toEqual(
      Object.fromEntries(Object.entries(BUNDLED_ARCHIVE_HOSTS).sort())
    );
  });
});

describe('convertArchiveRows over the committed cache', () => {
  const region = { centre: SOL_CENTRE, radiusLy: 25 };
  const out = convertArchiveRows(cache, { region, generated: 'test' });

  // The bug this replaced: collisions were reported against the BUNDLED maps
  // rather than the target map, so importing the Local Neighbourhood into a
  // NEW starmap produced nothing at all — every host in it is curated on a map
  // the GM was not importing into.
  it('imports every host when the target map is empty', () => {
    expect(out.collisions).toEqual([]);
    const names = out.systems.map((s) => s.name);
    expect(names).toContain('Proxima Cen');
    expect(names).toContain('GJ 876');
  });

  it('a 16.5 ly new map is the whole local neighbourhood, not an empty map', () => {
    const local = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 16.5 }, generated: 'test' });
    expect(local.systems.length).toBeGreaterThan(15);
    expect(local.collisions).toEqual([]);
  });

  it('skips a host the target map already holds under the bundled stable id', () => {
    const onto = convertArchiveRows(cache, {
      region: { centre: SOL_CENTRE, radiusLy: 25 }, generated: 'test',
      existingSystemIds: Object.values(BUNDLED_ARCHIVE_HOSTS)
    });
    const collided = new Set(onto.collisions.map((c) => c.hostname));
    expect(collided.has('Proxima Cen')).toBe(true);   // present as sys-alphacen
    expect(collided.has('GJ 876')).toBe(true);
    for (const c of onto.collisions) expect(c.systemId).toBeTruthy();
    // …while a host the map does NOT hold still imports.
    expect(onto.systems.map((s) => s.name)).toContain('GJ 581');
  });

  it('skips a host already present under the id this import would mint', () => {
    const onto = convertArchiveRows(cache, {
      region: { centre: SOL_CENTRE, radiusLy: 25 }, generated: 'test',
      existingSystemIds: ['sys-gj-581']
    });
    expect(onto.collisions.map((c) => c.hostname)).toContain('GJ 581');
    expect(onto.systems.map((s) => s.name)).not.toContain('GJ 581');
  });

  it('non-bundled hosts inside the region convert to well-formed systems', () => {
    expect(out.systems.length).toBeGreaterThan(5); // GJ 581, HD 219134, 61 Vir...
    for (const s of out.systems) {
      expect(s.id.startsWith('sys-')).toBe(true);
      expect(Number.isFinite(s.position.x) && Number.isFinite(s.position.y) && Number.isFinite(s.position.z)).toBe(true);
      const ids = s.system.nodes.map((n) => n.id);
      expect(new Set(ids).size).toBe(ids.length); // unique node ids (D3)
      const star = s.system.nodes.find((n) => n.roleHint === 'star');
      expect(star.massKg).toBeGreaterThan(0);
      expect(star.classes.length).toBeGreaterThan(0);
      for (const p of s.system.nodes.filter((n) => n.roleHint === 'planet')) {
        expect(p.orbit.hostMu).toBeGreaterThan(0);
        expect(p.orbit.elements.a_AU).toBeGreaterThan(0);
        expect(p.orbit.elements.i_deg).toBeLessThanOrEqual(1.2); // mutual, never sky-plane
        expect(p.autoClassify).toBe(true);
        expect(p.description).toMatch(/Confirmed/);
      }
    }
  });

  it('HD 219134 arrives with its six confirmed planets', () => {
    const hd = out.systems.find((s) => s.name === 'HD 219134');
    expect(hd).toBeDefined();
    expect(hd.system.nodes.filter((n) => n.roleHint === 'planet').length).toBe(6);
  });

  it('the exact sphere cut trims hosts the shell over-fetched', () => {
    const tight = convertArchiveRows(cache, { region: { centre: SOL_CENTRE, radiusLy: 12 }, generated: 'test' });
    const names = new Set(tight.systems.map((s) => s.name));
    expect(names.has('HD 219134')).toBe(false); // 21.3 ly — outside 12
  });

  it('an off-Sol centre re-centres positions on that star', () => {
    // Centre on Sirius-ish coordinates: Sirius's own position lands at the origin.
    const centre = { raDeg: 101.287, decDeg: -16.716, distLy: 8.6 };
    const offset = convertArchiveRows(cache, { region: { centre, radiusLy: 15 }, generated: 'test' });
    for (const s of offset.systems) {
      const dLyPx = Math.hypot(s.position.x - 400, s.position.y - 300, s.position.z) / 43.30127018922193;
      expect(dLyPx).toBeLessThanOrEqual(15.01);
    }
  });

  it('skips are named, not silent', () => {
    for (const s of out.skipped) {
      expect(s.hostname).toBeTruthy();
      expect(s.reason).toBeTruthy();
    }
  });

  it('slugs are stable and filesystem-safe', () => {
    expect(hostSlug('HD 219134')).toBe('hd-219134');
    expect(hostSlug("Teegarden's Star")).toBe('teegarden-s-star');
  });
});
