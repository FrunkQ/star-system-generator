// Universe Sandbox (.ubox) → SSG system converter CLI.
// Run via vite-node so the $lib aliases and TS modules resolve:
//   npx vite-node scripts/ubox2ssg.mjs -- <input.ubox> [--sim <index|name>] [--min-mass <kg>]
//                                          [--out <system.json>] [--review <review.json>] [--list]
import fs from 'node:fs';
import path from 'node:path';
import { importUbox, listUboxSimulations, buildImportReview, UboxError } from '../src/lib/import/ubox/index.ts';
import { fixUpImportedSystem } from '../src/lib/system/importFixup.ts';
import { systemProcessor } from '../src/lib/core/SystemProcessor.ts';

function isObject(x) { return x && typeof x === 'object' && !Array.isArray(x); }
function deepMerge(t, s) {
  const o = { ...t };
  if (isObject(t) && isObject(s)) Object.keys(s).forEach((k) => { o[k] = isObject(s[k]) && k in t ? deepMerge(t[k], s[k]) : s[k]; });
  return o;
}
function loadRulePack() {
  const base = path.resolve('static/rulepacks/starter-sf');
  let pack = JSON.parse(fs.readFileSync(path.join(base, 'main.json'), 'utf-8'));
  for (const f of ['liquids.json', 'classification.json', 'atmospheres.json']) {
    const p = path.join(base, f);
    if (fs.existsSync(p)) pack = deepMerge(pack, JSON.parse(fs.readFileSync(p, 'utf-8')));
  }
  return pack;
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--list') args.list = true;
    else if (a === '--sim') args.sim = argv[++i];
    else if (a === '--min-mass') args.minMass = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else if (a === '--review') args.review = argv[++i];
    else args._.push(a);
  }
  return args;
}

function fmtRow(cols, widths) {
  return cols.map((c, i) => String(c).padEnd(widths[i])).join('  ');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const input = args._[0];
  if (!input) { console.error('usage: ubox2ssg <input.ubox> [--sim n|name] [--min-mass kg] [--out f] [--review f] [--list]'); process.exit(2); }

  const bytes = new Uint8Array(fs.readFileSync(input));

  try {
    if (args.list) {
      const listing = listUboxSimulations(bytes);
      console.log(`${listing.buildName || 'Universe Sandbox'} (build ${listing.buildRevision})`);
      listing.simulations.forEach((s, i) => console.log(`  [${i}] ${s.name}  (${s.path})`));
      return;
    }

    const opts = {};
    if (args.sim !== undefined) opts.simulation = /^\d+$/.test(args.sim) ? Number(args.sim) : args.sim;
    if (Number.isFinite(args.minMass)) opts.minBodyMassKg = args.minMass;

    const result = importUbox(bytes, opts);
    // Snapshot the AUTHORED-INPUTS system before processing (process() mutates nodes in place).
    const authoredJson = JSON.stringify(result.system, null, 2);
    const pack = loadRulePack();
    // Process to convergence: a freshly imported ocean world settles its greenhouse⇄temperature fixed
    // point over a few passes (SSG converges it between passes, not within one). Iterate until stable.
    let processed = systemProcessor.process(fixUpImportedSystem(result.system, pack), pack);
    const maxT = (s) => Math.max(...s.nodes.map((n) => n.temperatureK ?? 0));
    let prev = maxT(processed);
    for (let i = 0; i < 8; i++) {
      processed = systemProcessor.process(processed, pack);
      const now = maxT(processed);
      if (Math.abs(now - prev) < 0.1) break;
      prev = now;
    }
    const review = buildImportReview(processed, result);

    // --- Import Review to stdout ---
    console.log(`\n=== IMPORT REVIEW: ${result.system.name} ===`);
    console.log(`Imported: ${review.counts.stars} star(s), ${review.counts.planets} planet(s), ${review.counts.moons} moon(s), ${review.counts.rings} ring(s)`);
    console.log(`System age: ${result.system.age_Gyr} Gyr`);

    if (review.assumptions.length) {
      console.log('\nAssumptions:');
      for (const a of review.assumptions) console.log(`  - ${a}`);
    }

    if (review.skipped.length) {
      console.log('\nSkipped:');
      for (const s of review.skipped) console.log(`  - ${s.reason}: ${s.count}  (${s.examples.join(', ')})`);
    }

    const buckets = { aligned: 0, explained: 0, unexplained: 0 };
    for (const c of review.comparisons) buckets[c.bucket]++;
    console.log(`\nAudit vs US values: ${buckets.aligned} aligned, ${buckets.explained} explained, ${buckets.unexplained} unexplained`);
    const notable = review.comparisons.filter((c) => c.bucket !== 'aligned');
    if (notable.length) {
      const widths = [22, 20, 12, 12, 12];
      console.log('  ' + fmtRow(['body', 'metric', 'US', 'SSG', 'bucket'], widths));
      for (const c of notable.slice(0, 40)) console.log('  ' + fmtRow([c.body, c.metric, c.us, c.ssg, c.bucket], widths));
      if (buckets.unexplained > 0) console.log(`  ** ${buckets.unexplained} UNEXPLAINED mismatch(es) — worth a look **`);
    }

    if (args.out) { fs.writeFileSync(args.out, authoredJson); console.log(`\nAuthored system written to ${args.out}`); }
    if (args.review) { fs.writeFileSync(args.review, JSON.stringify(review, null, 2)); console.log(`Review written to ${args.review}`); }
  } catch (err) {
    if (err instanceof UboxError) { console.error(`ubox error [${err.code}]: ${err.message}`); process.exit(1); }
    throw err;
  }
}

main();
