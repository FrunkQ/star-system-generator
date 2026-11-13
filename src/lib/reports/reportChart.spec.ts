// THE REPORT'S SYSTEM CHART, PINNED AS DRAWN.
//
// The chart's row - a body on the line, its moons stacked under it, a slanted name and an AU figure
// above - was written out three times in ReportDocument.svelte (the main star's row, each further
// star's row, and the circumbinary strip). Folding three copies into one is a refactor that must
// move NOTHING, so this file renders the real component and compares every element of every chart
// against a recording taken from the three-copy version: tag, every attribute, the text. The
// recordings live beside this file in `__chart__/`.
//
// What is compared is the SVG's element list, not its HTML string: Svelte leaves comment anchors
// and whitespace that differ between a block written inline and the same block in a snippet, and
// neither is something a reader or a printer can see.
import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/svelte';
import { readFileSync } from 'node:fs';
import ReportDocument from './ReportDocument.svelte';

const example = (file: string) => JSON.parse(readFileSync(`static/examples/${file}`, 'utf8'));

/** One line per element, in document order: tag, attributes sorted by name, then its own text. */
export function chartSignature(system: any): string {
  const { container, unmount } = render(ReportDocument, { props: { system, mode: 'Player' } });
  const lines: string[] = [];
  container.querySelectorAll('svg.overview-svg').forEach((svg, i) => {
    lines.push(`# chart ${i + 1}`);
    const walk = (el: Element, depth: number) => {
      // A row drawn from a snippet declared outside the <svg> is only a drawing if its elements are
      // SVG elements. In the HTML namespace an <ellipse> has the same tag and attributes and paints
      // nothing, so the element list alone would not notice.
      if (el.namespaceURI !== 'http://www.w3.org/2000/svg') lines.push(`!! ${el.tagName} is not in the SVG namespace`);
      const attrs = Array.from(el.attributes)
        .map((a) => [a.name, a.name === 'class' ? a.value.replace(/\s*\bsvelte-[a-z0-9]+\b/g, '').trim() : a.value])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1))
        .map(([k, v]) => `${k}="${v}"`).join(' ');
      const own = Array.from(el.childNodes).filter((n) => n.nodeType === 3).map((n) => n.textContent ?? '').join('').replace(/\s+/g, ' ').trim();
      lines.push(`${'  '.repeat(depth)}<${el.tagName.toLowerCase()}${attrs ? ' ' + attrs : ''}>${own}`);
      Array.from(el.children).forEach((c) => walk(c, depth + 1));
    };
    walk(svg, 0);
  });
  unmount();
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

describe('the report chart draws exactly what it drew before the three rows became one', () => {
  for (const [name, load] of CHARTS) {
    it(name, async () => {
      const sig = chartSignature(load());
      expect(sig.split('\n').length).toBeGreaterThan(10); // a chart was actually found and walked
      await expect(sig).toMatchFileSnapshot(`./__chart__/${name}.txt`);
    });
  }
});
