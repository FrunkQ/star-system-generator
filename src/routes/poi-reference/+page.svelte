<script lang="ts">
  // Reference for hand-building PoI rule conditions in raw JSON. Generated from POI_FIELDS so the
  // field list / ranges always match what the engine actually reads (one common data set).
  import { POI_FIELDS, POI_ROLES } from '$lib/physics/reasonsToVisit';

  const range = (f: typeof POI_FIELDS[number]) =>
    f.type === 'number' ? (f.max !== undefined ? `${f.min ?? 0} – ${f.max}` : `≥ ${f.min ?? 0}`)
    : f.type === 'bool' ? 'true / false'
    : (f.values ? f.values.join(' · ') : 'text');

  const EXPRS = [
    { sig: 'true', desc: 'Always matches (the rule depends only on its chance + Applies-to).' },
    { sig: '{ "all": [ … ] }', desc: 'Every listed condition must hold (logical AND).' },
    { sig: '{ "any": [ … ] }', desc: 'At least one listed condition holds (logical OR).' },
    { sig: '{ "not": <condition> }', desc: 'Negates the inner condition.' },
    { sig: '{ "gt": ["field", n] }', desc: 'field > n. Also lt (<), gte (≥), lte (≤).' },
    { sig: '{ "between": ["field", lo, hi] }', desc: 'lo ≤ field ≤ hi (inclusive).' },
    { sig: '{ "eq": ["field", value] }', desc: 'field equals value (string / number / boolean).' },
    { sig: '{ "hasTag": "namespace/key" }', desc: 'The body carries that exact tag.' },
    { sig: '{ "hasTagPrefix": "namespace/" }', desc: 'The body carries any tag in that namespace.' }
  ];

  const EXAMPLES = [
    { title: 'A metal-rich rocky world', json: '{ "all": [ { "gte": ["makeup.metal", 0.3] }, { "gte": ["makeup.rock", 0.3] } ] }' },
    { title: 'A gas giant OR an ice-covered world', json: '{ "any": [ { "eq": ["isGiant", true] }, { "gte": ["makeup.ice", 0.4] } ] }' },
    { title: 'Habitable but NOT already tagged for life', json: '{ "all": [ { "eq": ["hasBio", true] }, { "not": { "hasTag": "habitability/none" } } ] }' },
    { title: 'A cold belt', json: '{ "between": ["teqK", 0, 150] }' }
  ];
</script>

<svelte:head><title>PoI rule reference</title></svelte:head>

<main>
  <p class="back"><a href="/">← Back to the app</a></p>
  <h1>Point-of-Interest rule reference</h1>
  <p class="lede">
    A PoI rule tags a body with a "reason to visit" when its <code>when</code> condition holds and a
    seeded roll comes in under its <code>chance</code>. The visual builder covers most conditions; for
    nested all/any or tag-prefix logic you edit the <code>when</code> as raw JSON. This page lists
    every operator and field available — the field list is generated straight from the engine, so the
    names and ranges below are exactly what it reads.
  </p>

  <h2>Rule shape</h2>
  <pre>{`{
  "tag": "category/your-hook",      // category prefix + your name
  "category": "category",            // sets prefix + colour
  "chance": 0.5,                     // 0..1 probability when the condition holds
  "appliesTo": ["planet", "moon"],  // body kinds (optional)
  "label": "Your Hook",              // player-facing name (optional)
  "description": "Hover text…",      // tooltip (optional)
  "when": { … }                       // the condition (below)
}`}</pre>
  <p class="muted">Applies-to kinds: {POI_ROLES.join(' · ')}.</p>

  <h2>Condition operators (<code>when</code>)</h2>
  <table>
    <thead><tr><th>Form</th><th>Meaning</th></tr></thead>
    <tbody>
      {#each EXPRS as e}<tr><td><code>{e.sig}</code></td><td>{e.desc}</td></tr>{/each}
    </tbody>
  </table>

  <h2>Fields ({POI_FIELDS.length})</h2>
  <p class="muted">Use these programmatic names in <code>gt/lt/gte/lte/between/eq</code>.</p>
  <table>
    <thead><tr><th>Field</th><th>Type</th><th>Range / values</th><th>What it means</th></tr></thead>
    <tbody>
      {#each POI_FIELDS as f}
        <tr><td><code>{f.field}</code></td><td>{f.type}</td><td>{range(f)}</td><td>{f.note}</td></tr>
      {/each}
    </tbody>
  </table>
  <p class="muted">You can also test a body's own custom tags with <code>hasTag</code> / <code>hasTagPrefix</code>.</p>

  <h2>Examples</h2>
  {#each EXAMPLES as ex}
    <p class="ex-title">{ex.title}</p>
    <pre>{ex.json}</pre>
  {/each}
</main>

<style>
  main { max-width: 880px; margin: 0 auto; padding: 28px 20px 80px; color: var(--text, #e8e8e8); font-family: sans-serif; line-height: 1.5; }
  .back { margin: 0 0 12px; }
  a { color: var(--link, #6aa0d8); }
  h1 { margin: 0 0 8px; }
  h2 { margin: 32px 0 10px; border-bottom: 1px solid var(--border, #2a2d36); padding-bottom: 6px; }
  .lede { color: var(--text-muted, #aab); }
  .muted { color: var(--text-faint, #8a8f9a); font-size: 0.88em; }
  code { font-family: var(--font-mono, monospace); background: var(--bg-control, #1c1f27); padding: 1px 5px; border-radius: 3px; font-size: 0.9em; }
  pre { background: var(--bg-control, #1c1f27); border: 1px solid var(--border, #2a2d36); border-radius: 6px; padding: 12px; overflow-x: auto; font-family: var(--font-mono, monospace); font-size: 0.82em; }
  table { width: 100%; border-collapse: collapse; font-size: 0.86em; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border, #2a2d36); vertical-align: top; }
  th { color: var(--text-muted, #aab); font-weight: 600; }
  td code { background: none; padding: 0; }
  td:first-child code { color: var(--accent, #6aa0d8); }
  .ex-title { margin: 14px 0 4px; font-weight: 600; }
</style>
