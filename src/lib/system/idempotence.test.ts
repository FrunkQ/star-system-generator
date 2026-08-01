// PROCESS IDEMPOTENCE (inbox B13).
//
// `process()` runs on load AND after every edit, so every figure a GM reads is a pass-N figure
// while every figure the rest of the suite pins is a pass-1 figure. Nothing else in the suite runs
// the processor twice, which is why a hundredfold error on Earth's surface radiation reached a
// player-facing card: the physics baseline processes Sol exactly once, so it can never see a bug
// that lives in the repetition.
//
// The assertion is the whole point and it is deliberately blunt: process a system, process the
// RESULT again, and again, and require that nothing anywhere on any body changed. Any read of a
// value another pass writes shows up here as a diff, whatever subsystem it is in.
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { systemProcessor } from '../core/SystemProcessor';
import { fixUpImportedSystem } from './importFixup';
import type { System, RulePack } from '../types';

function deepMerge(target: any, source: any): any {
    const output = { ...target };
    if (isObject(target) && isObject(source)) {
        for (const key of Object.keys(source)) {
            if (isObject(source[key])) {
                if (!(key in target)) Object.assign(output, { [key]: source[key] });
                else output[key] = deepMerge(target[key], source[key]);
            } else Object.assign(output, { [key]: source[key] });
        }
    }
    return output;
}
function isObject(item: any): boolean {
    return item && typeof item === 'object' && !Array.isArray(item);
}
function loadRulePackFromDisk(basePath: string): RulePack {
    let pack = JSON.parse(fs.readFileSync(path.join(basePath, 'main.json'), 'utf-8')) as RulePack;
    const merge = ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json', 'classification.json', 'atmospheres.json'];
    for (const file of merge) {
        const p = path.join(basePath, file);
        if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
    }
    return pack;
}

// Flatten every node to leaf paths -> primitives, so a diff names the exact field rather than
// dumping two multi-megabyte objects at the reader.
function flattenNodes(system: System): Map<string, string | number | boolean> {
    const out = new Map<string, string | number | boolean>();
    const walk = (v: any, prefix: string, depth: number) => {
        if (depth > 8 || v === null || v === undefined) return;
        const t = typeof v;
        if (t === 'number' || t === 'string' || t === 'boolean') { out.set(prefix, v); return; }
        if (Array.isArray(v)) { v.forEach((item, i) => walk(item, `${prefix}[${i}]`, depth + 1)); return; }
        for (const k of Object.keys(v)) walk(v[k], `${prefix}.${k}`, depth + 1);
    };
    for (const node of system.nodes) {
        const id = (node as any).name || node.id;
        // Tags are a set, not a sequence — compare them as one sorted string so a reordering that
        // means nothing does not read as a change.
        const tags = (node as any).tags;
        if (Array.isArray(tags)) {
            out.set(`${id}.tags`, tags.map((t: any) => `${t.key}=${t.value ?? ''}${t.manual ? '*' : ''}`).sort().join('|'));
        }
        for (const k of Object.keys(node)) {
            if (k === 'tags') continue;
            walk((node as any)[k], `${id}.${k}`, 0);
        }
    }
    return out;
}

function diffPasses(a: Map<string, any>, b: Map<string, any>): string[] {
    const keys = new Set([...a.keys(), ...b.keys()]);
    const diffs: string[] = [];
    for (const k of keys) {
        const x = a.get(k);
        const y = b.get(k);
        if (x !== y) diffs.push(`${k}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
    }
    return diffs.sort();
}

// Process three times, comparing 1 vs 2 and 2 vs 3. Two comparisons rather than one because a
// quantity can settle late (or, as the barycentre coupling did, oscillate with period 2 and look
// stable if only one step is checked).
function expectIdempotent(label: string, input: System, pack: RulePack) {
    let cur = JSON.parse(JSON.stringify(input)) as System;
    const snaps: Map<string, any>[] = [];
    for (let p = 0; p < 3; p++) {
        cur = systemProcessor.process(cur, pack);
        snaps.push(flattenNodes(cur));
        cur = JSON.parse(JSON.stringify(cur));
    }
    const d12 = diffPasses(snaps[0], snaps[1]);
    const d23 = diffPasses(snaps[1], snaps[2]);
    const report = (n: number, d: string[]) =>
        `${label}: pass ${n} changed ${d.length} field(s); first 25:\n  ` + d.slice(0, 25).join('\n  ');
    expect(d12, report(2, d12)).toEqual([]);
    expect(d23, report(3, d23)).toEqual([]);
}

const pack = loadRulePackFromDisk(path.resolve('static/rulepacks/starter-sf'));

describe('process() is idempotent', () => {
    // Sol as it is actually shipped and played, not the stripped fixture. The fixture retains
    // `atmosphere.scaleHeightKm` from the authored file, which is exactly the input that hides the
    // belt inner-edge fault, so testing only the fixture would have missed the reported bug.
    const bundledSol = () => {
        const map = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps/Local_Neighbourhood-Starmap.json'), 'utf-8'));
        return JSON.parse(JSON.stringify(map.systems.find((s: any) => s.name === 'Sol').system)) as System;
    };

    it('Sol', () => {
        expectIdempotent('Sol', bundledSol(), pack);
    });

    // THE PATH THE CAMPAIGN TOOK. `fixUpImportedSystem` clears derived sub-structures (correctly),
    // and ImportModal / GenerationWizard / SystemView then call process() ONCE. So whatever that
    // single pass produces is what a GM reads, and it has to be the same answer the second pass
    // gives. Earth read 228 mSv/yr here against 2.3 on the next pass.
    it('Sol, freshly imported', () => {
        expectIdempotent('Sol (imported)', fixUpImportedSystem(bundledSol(), pack), pack);
    });

    // The other bundled map, whose systems mostly carry no atmosphere, rotation period or authored
    // field — a different shape of input entirely, and the one B13 was first measured on.
    it('the Local Neighbourhood, every system', () => {
        const map = JSON.parse(fs.readFileSync(path.resolve('static/example-starmaps/Local_Neighbourhood-Starmap.json'), 'utf-8'));
        for (const entry of map.systems) {
            expectIdempotent(`Local Neighbourhood / ${entry.name}`, entry.system as System, pack);
        }
    });
});
