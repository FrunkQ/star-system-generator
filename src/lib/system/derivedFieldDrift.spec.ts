// B82 — THE STRIP LIST IS DERIVED FROM WHAT THE PROCESSOR ACTUALLY WRITES, NOT FROM READING IT.
//
// `DERIVED_FIELDS` had fallen eight releases behind the engine, so every save and every bundled
// example carried stale derived physics — the exact fossil DATA-R8 warns about, and it had already
// produced two wrong findings on consecutive days. It drifted because nothing connected the list to
// the processor: a new derived field is added in `SystemProcessor` and nobody thinks about
// `importFixup`.
//
// THIS TEST IS THAT CONNECTION. It processes the bundled Sol and diffs every body's authored slice
// against the processed body — both the keys the processor ADDS and the authored keys it OVERWRITES,
// because a key-set diff alone cannot see `rotation_period_hours` moving on a tidally-locked moon.
// Every field it finds must be either stripped for export or DECLARED in `NOT_STRIPPED` with a
// reason. A new derived field therefore turns this test red on the commit that adds it, and the
// author has to say which it is. That is the only thing that stops the list drifting again.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { SystemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem, stripSystemForExport, NOT_STRIPPED } from './importFixup';

function loadPack(): any {
  const base = 'static/rulepacks/starter-sf';
  const merge = (a: any, b: any): any => {
    const o: any = { ...a };
    for (const [k, v] of Object.entries(b)) o[k] = v && typeof v === 'object' && !Array.isArray(v) && a?.[k] ? merge(a[k], v) : v;
    return o;
  };
  let p: any = JSON.parse(readFileSync(`${base}/main.json`, 'utf8'));
  for (const f of ['stars.json', 'planets.json', 'generation.json', 'orbital_constants.json', 'classification.json', 'atmospheres.json', 'liquids.json']) {
    try { p = merge(p, JSON.parse(readFileSync(`${base}/${f}`, 'utf8'))); } catch { /* optional */ }
  }
  return p;
}

const pack = loadPack();
const input = JSON.parse(readFileSync('tests/fixtures/solar-system-input.json', 'utf8'));
const source = (input.system ?? input);
const clone = () => JSON.parse(JSON.stringify(source));

/** What a SAVE carries today, and what the processor makes of it. */
function slices() {
  const processed = new SystemProcessor().process(fixUpImportedSystem(clone(), pack), pack);
  // Strip the PROCESSED system: this is precisely what a save written after an edit would contain.
  const saved = stripSystemForExport(JSON.parse(JSON.stringify(processed)), pack);
  return { processed, saved };
}

describe('B82 — no derived field escapes the export strip', () => {
  it('every field the processor writes is stripped or declared', () => {
    const { processed, saved } = slices();
    const savedById = new Map((saved.nodes as any[]).map((n) => [n.id, n]));
    // The authored INPUT, for telling "the processor added this" from "the author wrote it".
    const authored = stripSystemForExport(clone(), pack);
    const authoredById = new Map((authored.nodes as any[]).map((n) => [n.id, n]));

    const escaped = new Map<string, Set<string>>();
    for (const node of processed.nodes as any[]) {
      const savedNode = savedById.get(node.id);
      const authoredNode = authoredById.get(node.id);
      if (!savedNode || !authoredNode) continue;
      for (const key of Object.keys(node)) {
        const addedByProcessor = !(key in authoredNode);
        const overwritten = !addedByProcessor && JSON.stringify(authoredNode[key]) !== JSON.stringify(node[key]);
        if (!addedByProcessor && !overwritten) continue;      // untouched authored input
        if (!(key in savedNode)) continue;                    // stripped — correct
        if (key in NOT_STRIPPED) continue;                    // declared, with a reason
        if (!escaped.has(key)) escaped.set(key, new Set());
        escaped.get(key)!.add(node.roleHint ?? node.kind);
      }
    }

    const report = [...escaped.entries()].sort().map(([k, v]) => `${k} (on ${[...v].sort().join(', ')})`);
    const guidance = [
      'A field the processor writes survives stripSystemForExport and is not declared.',
      'Every save and every bundled example will now carry it as a fossil (DATA-R8).',
      'Decide which it is and do ONE of:',
      '  - add it to DERIVED_FIELDS in importFixup.ts, if the processor always re-derives it;',
      '  - add it to NOT_STRIPPED with the reason, if it is authored input;',
      '  - strip it conditionally in stripBody, if it is authored for SOME bodies only',
      '    (magneticField, tidallyLocked and rotation_period_hours are the worked examples).',
      'Fields found:'
    ].join('\n');
    expect(report, guidance + '\n' + report.join('\n')).toEqual([]);
  });

  it('the fields B82 named are gone from a saved file', () => {
    const { saved } = slices();
    // Stars are excluded: a star's magnetic field is authored and never re-derived (see below).
    const seen = new Set<string>();
    for (const node of saved.nodes as any[]) {
      if (node.roleHint === 'star') continue;
      for (const k of Object.keys(node)) seen.add(k);
    }
    for (const f of ['orbitalRadiation', 'irradiationDose', 'volatiles', 'surfaceSpectrum',
                     'vegetation', 'beltInnerEdgeRadii', 'magneticField']) {
      expect(seen.has(f), `${f} still survives the strip`).toBe(false);
    }
    // ...and the hazard namespace, which was missing from DERIVED_TAG_PREFIXES.
    const tagKeys = (saved.nodes as any[]).flatMap((n) => (n.tags ?? []).map((t: any) => t.key));
    expect(tagKeys.filter((k: string) => k.startsWith('hazard/'))).toEqual([]);
  });

  it('KEEPS the rotation period even on a locked body, because Mercury is why', () => {
    // B82 recommended stripping this on a tidally-locked body and the recommendation is WRONG.
    // The engine does rewrite it for a locked body (Luna's moved 659.0 -> 538.1 h when Earth gained
    // mass, which is what B82 measured) — but it is AUTHORED input for a body in a SPIN-ORBIT
    // RESONANCE, and nothing can tell those apart once the value is gone. Stripping it cost Mercury
    // its real 1407.6 h day: the engine read the absence as a synchronous lock, handed it its
    // 88-day year, and reclassified it planet/terrestrial -> planet/hot-eyeball.
    const { processed, saved } = slices();
    const luna = (processed.nodes as any[]).find((n) => n.name === 'Luna');
    expect(luna?.tidallyLocked).toBe(true);
    const savedLuna = (saved.nodes as any[]).find((n) => n.name === 'Luna');
    const savedEarth = (saved.nodes as any[]).find((n) => n.name === 'Earth');
    const savedMercury = (saved.nodes as any[]).find((n) => n.name === 'Mercury');
    expect(savedLuna?.rotation_period_hours).toBeGreaterThan(0);
    expect(savedEarth?.rotation_period_hours).toBeCloseTo(23.9, 1);
    // The one that matters: Mercury's 3:2 resonance day, which no model re-derives.
    expect(savedMercury?.rotation_period_hours).toBeCloseTo(1407.6, 0);
  });

  it('a star keeps the three inputs nothing re-derives', () => {
    // temperatureK and radiationOutput were already special-cased; magneticField JOINS them, because
    // the processor writes a field for moons and planets and never for a star (measured) — so
    // stripping it would zero every star, exactly as stripping temperatureK once did.
    // The bundled Sol authors no temperatureK on its star, so this SETS one rather than hoping the
    // fixture exercises the rule.
    const sys = clone();
    const star = (sys.nodes as any[]).find((n: any) => n.roleHint === 'star');
    star.temperatureK = 5778;
    const processed = new SystemProcessor().process(fixUpImportedSystem(sys, pack), pack);
    const saved = stripSystemForExport(JSON.parse(JSON.stringify(processed)), pack);
    const sun = (saved.nodes as any[]).find((n) => n.roleHint === 'star');
    expect(sun.temperatureK).toBe(5778);
    expect(sun.radiationOutput).toBeGreaterThan(0);
    expect(sun.magneticField?.strengthGauss).toBeGreaterThan(0);
  });

  it('a GM-uploaded image survives, and a derived type image does not', () => {
    // The processor re-derives the TYPE image from the class on every run — that is what keeps the
    // picture matching a world whose type has changed — so a stored one is a fossil. A GM UPLOAD is
    // not: it sets `image.custom`, and SystemProcessor:1485 explicitly skips re-deriving over it.
    const sys = clone();
    const mars = (sys.nodes as any[]).find((n: any) => n.name === 'Mars');
    const earth = (sys.nodes as any[]).find((n: any) => n.name === 'Earth');
    mars.image = { url: 'blob:gm-upload', custom: true };
    const processed = new SystemProcessor().process(fixUpImportedSystem(sys, pack), pack);
    const saved = stripSystemForExport(JSON.parse(JSON.stringify(processed)), pack);
    const savedMars = (saved.nodes as any[]).find((n) => n.name === 'Mars');
    const savedEarth = (saved.nodes as any[]).find((n) => n.name === 'Earth');
    expect(savedMars.image).toEqual({ url: 'blob:gm-upload', custom: true });
    expect(savedEarth.image).toBeUndefined();
    // ...and the derived one comes straight back on the next load.
    const reloaded = new SystemProcessor().process(fixUpImportedSystem(JSON.parse(JSON.stringify(saved)), pack), pack);
    const reloadedEarth = (reloaded.nodes as any[]).find((n) => n.name === 'Earth');
    const processedEarth = (processed.nodes as any[]).find((n) => n.name === 'Earth');
    expect(reloadedEarth.image).toEqual(processedEarth.image);
  });

  it('a GM-pinned field and a GM-pinned lock both survive a save', () => {
    // The manual flags are what separate an override from a fossil. Nothing in the bundled Sol sets
    // either, so this builds the case rather than hoping to find one.
    const sys = clone();
    const mars = (sys.nodes as any[]).find((n: any) => n.name === 'Mars');
    mars.magneticField = { strengthGauss: 4.2, manual: true };
    mars.tidalLockManual = true;
    mars.tidallyLocked = true;
    mars.rotation_period_hours = 99;
    const processed = new SystemProcessor().process(fixUpImportedSystem(sys, pack), pack);
    const saved = stripSystemForExport(JSON.parse(JSON.stringify(processed)), pack);
    const savedMars = (saved.nodes as any[]).find((n) => n.name === 'Mars');
    expect(savedMars.magneticField).toEqual({ strengthGauss: 4.2, manual: true });
    expect(savedMars.tidallyLocked).toBe(true);
    // The rotation period survives too — see the Mercury case above for why it is never stripped.
    expect(savedMars.rotation_period_hours).toBeGreaterThan(0);
  });
});
