import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

/**
 * G34 addendum (2026-09-07): A SKIN CANNOT REPAINT A LITERAL. The first light skin exposed the body
 * description box as dark-on-dark: its background was `#252525`, which is exactly what the card
 * token carries on a dark skin, written out by hand where no skin can reach it. Twenty more sites
 * had done the same with the other chrome defaults. This scan fails on any component background
 * that spells out one of those defaults without going through a token. The list is the chrome
 * greys from tokens.css plus the three unnamed greys that had been used as "a recessed box";
 * canvases (#000), slider thumbs and hazard stripes are not on it because those are not chrome.
 */
const OFFENDERS = /background(?:-color)?\s*:[^;]*#(?:252525|14161c|1b1e26|232733|08090d|1c1f27|1f1f1f|181818|2b2b2b)\b/i;
const ROOTS = ['src/lib/components', 'src/routes'];
const SKIP = ['src/routes/shell-preview']; // a developer page that mocks the shell on purpose

function* svelteFiles(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) yield* svelteFiles(p);
    else if (name.endsWith('.svelte')) yield p;
  }
}

describe('skins can reach every chrome background', () => {
  it('no component writes a chrome grey as a literal where a token exists', () => {
    const hits: string[] = [];
    for (const root of ROOTS) {
      for (const file of svelteFiles(root)) {
        const rel = relative(process.cwd(), file).replace(/\\/g, '/');
        if (SKIP.some((s) => rel.startsWith(s))) continue;
        const lines = readFileSync(file, 'utf8').split(/\r?\n/);
        lines.forEach((line, i) => {
          if (OFFENDERS.test(line) && !line.includes('var(')) hits.push(`${rel}:${i + 1}: ${line.trim().slice(0, 80)}`);
        });
      }
    }
    expect(hits, `literal chrome backgrounds a skin cannot repaint:\n${hits.join('\n')}`).toEqual([]);
  });
});
