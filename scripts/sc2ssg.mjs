// SpaceEngine (.sc / .pak) → SSG system converter CLI.
//   npx vite-node scripts/sc2ssg.mjs -- <input.sc|input.pak> [--min-mass <kg>] [--out <f>] [--review <f>]
import fs from 'node:fs';
import path from 'node:path';
import { importSc, buildImportReview, reviewToText, ScError } from '../src/lib/import/spaceengine/index.ts';
import { fixUpImportedSystem } from '../src/lib/system/importFixup.ts';
import { systemProcessor } from '../src/lib/core/SystemProcessor.ts';

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t, s) { const o = { ...t }; if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; }); return o; }
function loadRulePack() {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) { const p = path.join(base, f); if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8'))); }
  return pack;
}
function parseArgs(argv) { const a = { _: [] }; for (let i = 0; i < argv.length; i++) { const x = argv[i]; if (x === '--min-mass') a.minMass = Number(argv[++i]); else if (x === '--out') a.out = argv[++i]; else if (x === '--review') a.review = argv[++i]; else a._.push(x); } return a; }
const pad = (c, w) => c.map((x, i) => String(x).padEnd(w[i])).join('  ');

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];
  if (!input) { console.error('usage: sc2ssg <input.sc|.pak> [--min-mass kg] [--out f] [--review f]'); process.exit(2); }
  const bytes = new Uint8Array(fs.readFileSync(input));
  try {
    const result = importSc(bytes, Number.isFinite(args.minMass) ? { minBodyMassKg: args.minMass } : {});
    const authoredJson = JSON.stringify(result.system, null, 2);
    const pack = loadRulePack();
    let processed = systemProcessor.process(fixUpImportedSystem(result.system, pack), pack);
    const maxT = (s) => Math.max(0, ...s.nodes.map((n) => n.temperatureK ?? 0));
    let prev = maxT(processed);
    for (let i = 0; i < 8; i++) { processed = systemProcessor.process(processed, pack); const now = maxT(processed); if (Math.abs(now - prev) < 0.1) break; prev = now; }
    const review = buildImportReview(processed, result);

    console.log(`\n=== IMPORT REVIEW: ${result.system.name} ===`);
    console.log(`Imported: ${review.counts.stars} star(s), ${review.counts.planets} planet(s), ${review.counts.moons} moon(s), ${review.counts.other} barycentre(s)`);
    console.log(`System age: ${result.system.age_Gyr} Gyr`);
    if (review.assumptions.length) { console.log('\nAssumptions:'); for (const a of review.assumptions.slice(0, 12)) console.log(`  - ${a}`); }
    if (review.skipped.length) { console.log('\nSkipped:'); for (const s of review.skipped) console.log(`  - ${s.reason}: ${s.count}  (${s.examples.join(', ')})`); }
    const buckets = { aligned: 0, explained: 0, unexplained: 0 }; for (const c of review.comparisons) buckets[c.bucket]++;
    console.log(`\nAudit vs source: ${buckets.aligned} aligned, ${buckets.explained} explained, ${buckets.unexplained} unexplained`);
    const notable = review.comparisons.filter((c) => c.bucket !== 'aligned');
    if (notable.length) { const w = [24, 16, 14, 14, 18]; console.log('  ' + pad(['body', 'metric', 'source', 'SSG', 'why'], w)); for (const c of notable.slice(0, 30)) console.log('  ' + pad([c.body, c.metric, c.us, c.ssg, c.reason ?? c.bucket], w)); }

    if (args.out) { fs.writeFileSync(args.out, authoredJson); console.log(`\nAuthored system written to ${args.out}`); }
    if (args.review) { fs.writeFileSync(args.review, JSON.stringify(review, null, 2)); }
  } catch (err) {
    if (err instanceof ScError) { console.error(`sc error [${err.code}]: ${err.message}`); process.exit(1); }
    throw err;
  }
}
main();
