// THE REPORT'S SYSTEM CHART: PINNED AS DRAWN, AND THEN THE ONE THING THAT WAS MEANT TO MOVE.
//
// The chart's row - a body on the line, its moons stacked under it, a slanted name and an AU figure
// above - was written out three times in ReportDocument.svelte (the main star's row, each further
// star's row, and the circumbinary strip). Folding three copies into one is a refactor that must
// move NOTHING, so the first gate renders the real component and compares every element of every
// chart against a recording: tag, every attribute, the text. The recordings live beside this file
// in `__chart__/`, and were first taken from the three-copy version.
//
// The recordings were then re-taken ONCE, for the change the owner asked for: a planetary pair's
// second member is drawn ABOVE the line (moons stay below), and a row is given the room above its
// line that its names need. `git log -p -- src/lib/reports/__chart__` is the record of exactly
// what that moved: the pairs, and names that used to run off the top. `uggi` and `trappist-1`
// have neither and their recordings did not change by a character. The second half of this file
// states the new rule as geometry, so it does not rest on someone having read a recording.
//
// What is compared is the SVG's element list, not its HTML string: Svelte leaves comment anchors
// and whitespace that differ between a block written inline and the same block in a snippet, and
// neither is something a reader or a printer can see.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import ReportDocument from './ReportDocument.svelte';

const example = (file: string) => JSON.parse(readFileSync(`static/examples/${file}`, 'utf8'));

interface ChartEl { chart: number; depth: number; tag: string; attrs: Record<string, string>; text: string; svgNs: boolean }

/** Every element of every chart the report draws for a system, in document order. */
export function chartElements(system: any): ChartEl[] {
  const { container, unmount } = render(ReportDocument, { props: { system, mode: 'Player' } });
  const out: ChartEl[] = [];
  container.querySelectorAll('svg.overview-svg').forEach((svg, i) => {
    const walk = (el: Element, depth: number) => {
      const attrs = Object.fromEntries(Array.from(el.attributes)
        .map((a) => [a.name, a.name === 'class' ? a.value.replace(/\s*\bsvelte-[a-z0-9]+\b/g, '').trim() : a.value]));
      const text = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
      // A row drawn from a snippet declared outside the <svg> is only a drawing if its elements are
      // SVG elements. In the HTML namespace an <ellipse> has the same tag and attributes and paints
      // nothing, so the element list alone would not notice.
      out.push({ chart: i + 1, depth, tag: el.tagName.toLowerCase(), attrs, text, svgNs: el.namespaceURI === 'http://www.w3.org/2000/svg' });
      Array.from(el.children).forEach((c) => walk(c, depth + 1));
    };
    walk(svg, 0);
  });
  unmount();
  return out;
}

/** One line per element: tag, attributes sorted by name, then its own text. */
export function chartSignature(system: any): string {
  const lines: string[] = [];
  let chart = 0;
  for (const el of chartElements(system)) {
    if (el.chart !== chart) { chart = el.chart; lines.push(`# chart ${chart}`); }
    if (!el.svgNs) lines.push(`!! ${el.tag} is not in the SVG namespace`);
    const attrs = Object.entries(el.attrs).sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, v]) => `${k}="${v}"`).join(' ');
    lines.push(`${'  '.repeat(el.depth)}<${el.tag}${attrs ? ' ' + attrs : ''}>${el.text}`);
  }
  return lines.join('\n') + '\n';
}

/** Sol, with moons hung on BOTH members of its one planetary pair - a binary with moons. */
export function solWithBinaryMoons(): any {
  const sol = example('Sol_2030-System.json');
  const byName = (n: string) => sol.nodes.find((x: any) => x.name === n);
  const moon = (id: string, name: string, host: any, aAU: number, radiusKm: number) => ({
    id, name, kind: 'body', roleHint: 'moon', parentId: host.id, radiusKm, massKg: 1e16,
    orbit: { hostId: host.id, hostMu: 1, t0: 0, elements: { a_AU: aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } }
  });
  const pluto = byName('Pluto'), charon = byName('Charon');
  sol.nodes.push(
    moon('t-nix', 'Nix', pluto, 0.00033, 25), moon('t-hydra', 'Hydra', pluto, 0.00043, 30),
    moon('t-vulcan', 'A Very Long Moon Name Indeed', charon, 0.0001, 12)
  );
  return sol;
}

/**
 * A planetary pair with moons on both members, a ringed world with moons and a belt, hung on any
 * host - so the second star's row and the circumbinary strip are pinned on the SAME shapes as the
 * main row, not only on whatever the bundled maps happen to put there.
 */
export function withPairRingAndBelt(system: any, hostId: string, tag: string): any {
  const orbit = (host: string, aAU: number) =>
    ({ hostId: host, hostMu: 1, t0: 0, elements: { a_AU: aAU, e: 0, i_deg: 0, omega_deg: 0, Omega_deg: 0, M0_rad: 0 } });
  const body = (id: string, name: string, roleHint: string, host: string, aAU: number, radiusKm: number, massKg: number, extra: any = {}) =>
    ({ id: `${tag}-${id}`, name, kind: 'body', roleHint, parentId: host, radiusKm, massKg, orbit: orbit(host, aAU), ...extra });
  const pair = `${tag}-pair`;
  system.nodes.push(
    { id: pair, name: `${tag} Twins Barycenter`, kind: 'barycenter', parentId: hostId, memberIds: [`${tag}-castor`, `${tag}-pollux`], orbit: orbit(hostId, 2.5) },
    body('castor', 'Castor', 'planet', pair, 0.0001, 6000, 5e24),
    body('pollux', 'Pollux the Lesser Twin', 'planet', pair, 0.0004, 4000, 2e24),
    body('c1', 'Castor I', 'moon', `${tag}-castor`, 0.001, 400, 1e20),
    body('c2', 'Castor II', 'moon', `${tag}-castor`, 0.002, 900, 1e21),
    body('p1', 'Pollux I', 'moon', `${tag}-pollux`, 0.001, 300, 1e19),
    body('hoop', 'Hoop', 'planet', hostId, 5.2, 58000, 5e26, { oblateness: 0.09 }),
    body('hoop-ring', 'Hoop Rings', 'ring', `${tag}-hoop`, 0.0008, 1, 1),
    body('h1', 'Hoop I', 'moon', `${tag}-hoop`, 0.003, 2500, 1e23),
    body('h2', 'Hoop II', 'moon', `${tag}-hoop`, 0.006, 700, 1e21),
    body('rubble', 'The Rubble', 'belt', hostId, 9, 1, 1, { radiusInnerKm: 1.2e9, radiusOuterKm: 1.5e9 })
  );
  return system;
}
const idOf = (system: any, name: string) => system.nodes.find((n: any) => n.name === name).id;

// Every shape the three copies drew: one star with moons, rings, a belt and a planetary pair (Sol);
// the same with moons under both members of the pair; further stars with their own planets and a
// circumbinary strip (Alpha Centauri, Uggi); and a plain single star (TRAPPIST-1).
export const CHARTS: Array<[string, () => any]> = [
  ['sol', () => example('Sol_2030-System.json')],
  ['sol-binary-with-moons', solWithBinaryMoons],
  ['alpha-centauri', () => example('Triple-Alpha_Centauri-System.json')],
  ['uggi', () => example('Uggi_(Traveller_Example)-System.json')],
  ['trappist-1', () => example('TRAPPIST-1-System.json')],
  // ...and the full set of shapes on a SECOND STAR's row, and on the circumbinary strip.
  ['second-star-pair-ring-belt', () => { const s = example('Triple-Alpha_Centauri-System.json'); return withPairRingAndBelt(s, idOf(s, 'Toliman'), 'tol'); }],
  ['circumbinary-pair-ring-belt', () => { const s = example('Uggi_(Traveller_Example)-System.json'); return withPairRingAndBelt(s, idOf(s, 'Uggi'), 'ugg'); }]
];

describe('the report chart draws exactly what its recording says', () => {
  for (const [name, load] of CHARTS) {
    it(name, async () => {
      const sig = chartSignature(load());
      expect(sig.split('\n').length).toBeGreaterThan(10); // a chart was actually found and walked
      await expect(sig).toMatchFileSnapshot(`./__chart__/${name}.txt`);
    });
  }
});

// ---- THE RULE, AS GEOMETRY ---------------------------------------------------------------------

interface Disc { name: string; cx: number; cy: number; r: number; moon: boolean }
/** The named discs of one chart: each body ellipse with the slanted name that follows it. */
function discs(els: ChartEl[], chart = 1): Disc[] {
  const mine = els.filter((e) => e.chart === chart);
  const out: Disc[] = [];
  mine.forEach((e, i) => {
    if (e.tag !== 'ellipse' || e.attrs.fill === 'none') return;
    const label = mine.slice(i + 1, i + 3).find((n) => n.tag === 'text' && n.attrs.class === 'orbit-label');
    out.push({ name: label?.text ?? '', cx: +e.attrs.cx, cy: +e.attrs.cy, r: +e.attrs.rx, moon: e.attrs.fill === '#333' });
  });
  return out;
}
const named = (ds: Disc[], name: string) => { const d = ds.find((x) => x.name === name); if (!d) throw new Error(`no disc named ${name}`); return d; };
// The chart's own figures for a slanted 8px name: 3.4 up per character, and 5 for the glyphs.
const nameTop = (e: ChartEl) => +e.attrs.y - e.text.length * 3.4 - 5;
const viewBoxH = (els: ChartEl[], chart = 1) => +els.find((e) => e.chart === chart && e.tag === 'svg')!.attrs.viewBox.split(' ')[3];

describe('a pair is drawn with its second member ABOVE the line, and every moon below it', () => {
  it('lifts Charon above Pluto on the bundled Sol, and moves nothing else on the line', () => {
    const ds = discs(chartElements(example('Sol_2030-System.json')));
    const pluto = named(ds, 'Pluto'), charon = named(ds, 'Charon'), earth = named(ds, 'Earth');
    expect(pluto.cy).toBe(76);            // the line, where it has always been
    expect(earth.cy).toBe(76);
    expect(charon.cx).toBe(pluto.cx);     // same orbit, same column
    expect(charon.cy).toBeLessThan(pluto.cy);
  });

  it('keeps both members\' moons below the line, the upper member\'s under a divider', () => {
    const els = chartElements(solWithBinaryMoons());
    const ds = discs(els);
    const pluto = named(ds, 'Pluto'), charon = named(ds, 'Charon');
    const nix = named(ds, 'Nix'), hydra = named(ds, 'Hydra'), charons = named(ds, 'A Very Long Moon Name Indeed');
    expect(charon.cy).toBeLessThan(pluto.cy);
    for (const moon of [nix, hydra, charons]) {
      expect(moon.moon).toBe(true);
      expect(moon.cy).toBeGreaterThan(pluto.cy);
      expect(moon.cx).toBe(pluto.cx);
    }
    expect([nix.cy, hydra.cy, charons.cy]).toEqual([76 + 14, 76 + 28, 76 + 56]); // slot 3 is the divider
    const divider = els.filter((e) => e.tag === 'line' && +e.attrs.x1 < pluto.cx && +e.attrs.x2 > pluto.cx);
    expect(divider).toHaveLength(1);
    expect(+divider[0].attrs.y1).toBeGreaterThan(hydra.cy);
    expect(+divider[0].attrs.y1).toBeLessThan(charons.cy);
  });

  it('does the same on a further star\'s row and on the circumbinary strip', () => {
    for (const [name, chart, lineOf] of [['second-star-pair-ring-belt', 1, 'Hoop'], ['circumbinary-pair-ring-belt', 2, 'Hoop']] as const) {
      const ds = discs(chartElements(CHARTS.find((c) => c[0] === name)![1]()), chart);
      const line = named(ds, lineOf).cy;
      const castor = named(ds, 'Castor'), pollux = named(ds, 'Pollux the Lesser Twin');
      expect(castor.cy, name).toBe(line);
      expect(pollux.cy, name).toBeLessThan(line);
      for (const moon of ['Castor I', 'Castor II', 'Pollux I']) expect(named(ds, moon).cy, `${name} ${moon}`).toBeGreaterThan(line);
    }
  });

  it('leaves a world with moons and no pair-mate exactly as it was: nothing above its line', () => {
    const ds = discs(chartElements(example('Sol_2030-System.json')));
    expect(ds.filter((d) => d.cy < 76).map((d) => d.name)).toEqual(['Charon']);
  });
});

describe('the row has the headroom the pair and the names need', () => {
  it('clears the pair-mate from its partner, from the AU figure and from the partner\'s slanted name', () => {
    for (const [name, chart] of [['sol', 1], ['second-star-pair-ring-belt', 1], ['circumbinary-pair-ring-belt', 2]] as const) {
      const els = chartElements(CHARTS.find((c) => c[0] === name)![1]()).filter((e) => e.chart === chart);
      const ds = discs(els, chart);
      const [low, high] = name === 'sol' ? [named(ds, 'Pluto'), named(ds, 'Charon')] : [named(ds, 'Castor'), named(ds, 'Pollux the Lesser Twin')];
      // the two discs do not touch
      expect(low.cy - high.cy, `${name}: discs`).toBeGreaterThan(low.r + high.r);
      // the AU figure (7px, right-aligned on the column, just above the lower disc) is clear of the upper disc
      const au = els.find((e) => e.attrs.class === 'au-label' && +e.attrs.x === low.cx)!;
      expect(au, `${name}: the pair still carries its AU figure`).toBeTruthy();
      expect(+au.attrs.y - 7 - (high.cy + high.r), `${name}: AU figure`).toBeGreaterThanOrEqual(0);
      // the lower member's name slants up past the upper disc: perpendicular distance from the
      // disc's centre to the name's baseline, less the disc and the 6-unit glyph height
      const label = els.find((e) => e.attrs.class === 'orbit-label' && e.text === low.name)!;
      const dist = Math.abs((high.cx - +label.attrs.x) + (high.cy - +label.attrs.y)) / Math.SQRT2;
      expect(dist - high.r - 6, `${name}: slanted name`).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every slanted name inside the top of its chart - on every recorded system', () => {
    for (const [name, load] of CHARTS) {
      for (const e of chartElements(load())) {
        if (e.attrs.class !== 'orbit-label') continue;
        expect(nameTop(e), `${name}: "${e.text}" runs off the top of chart ${e.chart}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('fits a name far longer than the eighteen characters the printed report used to cut off', () => {
    const plain = example('TRAPPIST-1-System.json');
    const long = example('TRAPPIST-1-System.json');
    const target = long.nodes.find((n: any) => n.roleHint === 'planet');
    const before = chartElements(plain);
    target.name = 'The Long Dark Teatime Of The Soul IV'; // 36 characters
    const after = chartElements(long);
    const label = after.find((e) => e.text === target.name)!;
    expect(nameTop(label)).toBeGreaterThanOrEqual(0);
    // ...by growing the chart downward from the top, not by squeezing anything
    const grew = viewBoxH(after) - viewBoxH(before);
    expect(grew).toBeGreaterThan(40);
    const y = (els: ChartEl[]) => +els.find((e) => e.tag === 'circle')!.attrs.cy;
    expect(y(after) - y(before)).toBe(grew);
  });

  it('adds nothing where nothing is needed: an ordinary chart keeps its line at 76', () => {
    for (const file of ['TRAPPIST-1-System.json', 'Uggi_(Traveller_Example)-System.json', 'Sol_2030-System.json']) {
      expect(+chartElements(example(file)).find((e) => e.tag === 'circle')!.attrs.cy, file).toBe(76);
    }
  });
});
