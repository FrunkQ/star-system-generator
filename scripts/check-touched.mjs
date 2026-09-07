// SVELTE-CHECK ON WHAT YOU CHANGED — the check `npm run build` cannot do.
//
// WHY THIS EXISTS, and it is one specific crash. `+page.svelte` referenced `focusedBodyId`, a name
// that lives in `SystemView.svelte` and was never declared in the route. `npm run build` was GREEN,
// because the Svelte compiler does not typecheck (engine map RENDER-S46), and the app threw
// `focusedBodyId is not defined` the moment the paste screen opened - on beta, in front of the
// owner. `svelte-check` had the answer the whole time: "+page.svelte:2438 Cannot find name
// 'focusedBodyId'". Nobody ran it, because its output is 1,366 errors long.
//
// THIS IS A REPORT, NOT AN EXIT CODE, and that is a measured conclusion rather than laziness.
// Three scopings were tried and all three have a dirty baseline:
//   - whole FILE: a 3,000-line route carries a dozen pre-existing errors, so touching six lines of
//     it would fail;
//   - changed LINES: svelte-check's line numbers do not line up with git's hunks on a .svelte file
//     (measured - an error reported at 2443 against a hunk at 2491), so the filter silently misses;
//   - the crash's own error CLASS: there are already 147 "Cannot find name" errors repo-wide, 12 of
//     them in `SystemView.svelte` alone, from missing type imports.
// A gate nobody can pass gets deleted rather than obeyed. So this narrows the 1,366 down to the
// handful in files you touched, and you READ them. Making the baseline clean enough to gate on is a
// real job and a separate one; it is worth doing.
//
//   node scripts/check-touched.mjs                  # files changed vs origin/beta, plus uncommitted
//   node scripts/check-touched.mjs src/foo.svelte   # or an explicit list
//   node scripts/check-touched.mjs --strict         # exit 1 on any hit, once a file IS clean
import { execSync } from 'node:child_process';

const strict = process.argv.includes('--strict');
const NL = String.fromCharCode(10);
const BACKSLASH = String.fromCharCode(92);

const sh = (cmd) => {
  try {
    return execSync(cmd, { encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return '';
  }
};

const norm = (p) => p.split(BACKSLASH).join('/').toLowerCase();

/** Every .svelte / .ts file this working tree has changed, committed or not. */
function touchedFiles() {
  const out = new Set();
  const cmds = [
    'git diff --name-only origin/beta...HEAD',
    'git diff --name-only',
    'git diff --name-only --cached'
  ];
  for (const cmd of cmds) {
    for (const line of sh(cmd).split(NL)) {
      const f = line.trim();
      if (/\.(svelte|ts)$/.test(f)) out.add(norm(f));
    }
  }
  return [...out];
}

const explicit = process.argv.filter((a) => /\.(svelte|ts)$/.test(a)).map(norm);
const files = explicit.length ? explicit : touchedFiles();
if (!files.length) {
  console.log('check-touched: nothing changed to check.');
  process.exit(0);
}

let out = '';
try {
  out = execSync('npx svelte-check --threshold error --output human', {
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe']
  });
} catch (e) {
  // svelte-check exits non-zero whenever ANY error exists anywhere, which is always true here.
  out = String(e.stdout || '') + String(e.stderr || '');
}

const strip = (s) => s.replace(/\[[0-9;]*m/g, '').replace(/\[[0-9;]+m/g, '');
const lines = out.split(NL).map(strip);
const hits = [];
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^(.*\.(?:svelte|ts)):(\d+):(\d+)\s*$/);
  if (!m) continue;
  const detail = (lines[i + 1] || '').trim();
  if (!/^Error/i.test(detail)) continue;
  const path = norm(m[1]);
  if (!files.some((f) => path.endsWith(f))) continue;
  hits.push(m[1] + ':' + m[2] + ':' + m[3] + '  ' + detail);
}

const total = (out.match(/svelte-check found (\d+) errors/) || [])[1] || '?';
console.log('check-touched: ' + hits.length + ' error(s) in ' + files.length + ' changed file(s). (' + total + ' repo-wide.)');
if (hits.length) {
  console.log('READ THESE. Some are pre-existing and none of your business; the ones on lines you');
  console.log('wrote are what ships as a runtime crash, because npm run build does not typecheck.');
  console.log('');
  for (const h of hits) console.log('  ' + h);
}
process.exit(strict && hits.length ? 1 : 0);
