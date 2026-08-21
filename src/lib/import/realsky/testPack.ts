// Test-only rule-pack loader for the realsky specs. Mirrors the APP's loader
// (src/lib/rulepack-loader.ts): merge main.json's own `imports` list via deep
// merge, then the explicitly-fetched definition files. Exists because four
// specs each carried their own trimmed copy of pack assembly and one of them
// drifted — it skipped `imports`, so `statTemplates` (stars.json) was missing
// and starFieldFromPack silently returned undefined. One loader, one truth.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { RulePack } from '$lib/types';

const PACK_DIR = resolve(__dirname, '..', '..', '..', '..', 'static', 'rulepacks', 'starter-sf');

function deepMerge(target: any, source: any): any {
  const output = { ...target };
  for (const key of Object.keys(source ?? {})) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key]) && key in target && typeof target[key] === 'object' && !Array.isArray(target[key])) {
      output[key] = deepMerge(target[key], source[key]);
    } else output[key] = source[key];
  }
  return output;
}

let cached: RulePack | null = null;

export function loadStarterPack(): RulePack {
  if (cached) return cached;
  let pack: any = JSON.parse(readFileSync(join(PACK_DIR, 'main.json'), 'utf-8'));
  // The pack's own imports list, exactly as fetchAndLoadRulePack merges it.
  for (const rel of pack.imports ?? []) {
    const p = join(PACK_DIR, rel.replace('./', ''));
    if (existsSync(p)) pack = deepMerge(pack, JSON.parse(readFileSync(p, 'utf-8')));
  }
  // The loader's explicitly-fetched files.
  for (const f of ['construct_templates.json', 'engine-definitions.json', 'fuel-definitions.json', 'liquids.json']) {
    const p = join(PACK_DIR, f);
    if (existsSync(p)) pack = deepMerge(pack, JSON.parse(readFileSync(p, 'utf-8')));
  }
  cached = pack as RulePack;
  return cached;
}
