<script lang="ts">
  // Design-token proposal preview. Open /palette. Renders every token from
  // $lib/styles/tokens.css so the chrome palette + the (preserved) domain colours can be
  // reviewed/approved before sweeping them across the app. Not linked from the app.
  import '$lib/styles/tokens.css';

  type Sw = { name: string; v: string; hex: string; note?: string };

  const surfaces: Sw[] = [
    { name: 'bg-app', v: '--bg-app', hex: '#08090d' },
    { name: 'bg-panel', v: '--bg-panel', hex: '#14161c' },
    { name: 'bg-control', v: '--bg-control', hex: '#1b1e26' },
    { name: 'bg-control-hover', v: '--bg-control-hover', hex: '#232733' },
    { name: 'border', v: '--border', hex: '#2a2d36' },
    { name: 'border-soft', v: '--border-soft', hex: '#1c1f27' }
  ];
  const text: Sw[] = [
    { name: 'text', v: '--text', hex: '#e8e8e8' },
    { name: 'text-muted', v: '--text-muted', hex: '#8a8f9a' },
    { name: 'text-faint', v: '--text-faint', hex: '#5a5f6a' }
  ];
  const semantic: Sw[] = [
    { name: 'link', v: '--link', hex: '#88ccff' },
    { name: 'status-ok', v: '--status-ok', hex: '#4caf50', note: 'possible / valid' },
    { name: 'status-bad', v: '--status-bad', hex: '#f44336', note: 'impossible / invalid' },
    { name: 'warning', v: '--warning', hex: '#ffcc00' }
  ];
  const bodies: Sw[] = [
    { name: 'body-terrestrial', v: '--body-terrestrial', hex: '#cc6600' },
    { name: 'body-gas-giant', v: '--body-gas-giant', hex: '#cc0000' },
    { name: 'body-ice-giant', v: '--body-ice-giant', hex: '#add8e6' },
    { name: 'body-brown-dwarf', v: '--body-brown-dwarf', hex: '#5d4037' },
    { name: 'body-habitable', v: '--body-habitable', hex: '#007bff', note: 'earth-like (blue)' },
    { name: 'body-biosphere', v: '--body-biosphere', hex: '#00ff00', note: 'collides w/ zone-habitable' },
    { name: 'body-construct', v: '--body-construct', hex: '#f0f0f0' }
  ];
  const stars: Sw[] = [
    { name: 'O', v: '--star-o', hex: '#9bb0ff' },
    { name: 'B', v: '--star-b', hex: '#aabfff' },
    { name: 'A', v: '--star-a', hex: '#cad8ff' },
    { name: 'F', v: '--star-f', hex: '#f8f7ff' },
    { name: 'G', v: '--star-g', hex: '#fff4ea' },
    { name: 'K', v: '--star-k', hex: '#ffd2a1' },
    { name: 'M', v: '--star-m', hex: '#ffc46f' },
    { name: 'L', v: '--star-l', hex: '#8a4a4a' },
    { name: 'T', v: '--star-t', hex: '#4a2a2a' },
    { name: 'Y', v: '--star-y', hex: '#2a1a1a' },
    { name: 'WD', v: '--star-wd', hex: '#f0f0f0' },
    { name: 'NS', v: '--star-ns', hex: '#c0c0ff' },
    { name: 'magnetar', v: '--star-magnetar', hex: '#800080' },
    { name: 'BH', v: '--star-bh', hex: '#000000' },
    { name: 'red-giant', v: '--star-red-giant', hex: '#8b0000' }
  ];
  const zones: Sw[] = [
    { name: 'zone-habitable', v: '--zone-habitable', hex: '#00ff00', note: 'goldilocks' },
    { name: 'zone-roche', v: '--zone-roche', hex: '#b40000' },
    { name: 'zone-rock-line', v: '--zone-rock-line', hex: '#a52a2a' },
    { name: 'zone-soot-line', v: '--zone-soot-line', hex: '#696969' },
    { name: 'zone-frost-line', v: '--zone-frost-line', hex: '#add8e6' },
    { name: 'zone-co2-ice', v: '--zone-co2-ice', hex: '#ffffff' },
    { name: 'zone-co-ice', v: '--zone-co-ice', hex: '#0000ff' }
  ];
  const placement: Sw[] = [
    { name: 'orbit-surface', v: '--orbit-surface', hex: '#5a5a5a' },
    { name: 'orbit-low', v: '--orbit-low', hex: '#3b82f6' },
    { name: 'orbit-mid', v: '--orbit-mid', hex: '#10b981', note: 'collides w/ tier-earthlike' },
    { name: 'orbit-high', v: '--orbit-high', hex: '#a855f7' },
    { name: 'orbit-geo', v: '--orbit-geo', hex: '#facc15' }
  ];
  const hazard: Sw[] = [
    { name: '0 negligible', v: '--hazard-0', hex: '#4ade80' },
    { name: '1 low', v: '--hazard-1', hex: '#84cc16' },
    { name: '2 moderate', v: '--hazard-2', hex: '#eab308' },
    { name: '3 high', v: '--hazard-3', hex: '#f97316' },
    { name: '4 very high', v: '--hazard-4', hex: '#ef4444' },
    { name: '5 extreme', v: '--hazard-5', hex: '#7f1d1d' }
  ];
  const temp: Sw[] = [
    { name: 'temp-cold', v: '--temp-cold', hex: '#60a5fa' },
    { name: 'temp-habitable', v: '--temp-habitable', hex: '#4ade80' },
    { name: 'temp-warm', v: '--temp-warm', hex: '#fb923c' },
    { name: 'temp-hot', v: '--temp-hot', hex: '#ef4444' }
  ];
  const tier: Sw[] = [
    { name: 'tier-earthlike', v: '--tier-earthlike', hex: '#10b981' },
    { name: 'tier-human', v: '--tier-human', hex: '#f59e0b' },
    { name: 'tier-alien', v: '--tier-alien', hex: '#8b5cf6' },
    { name: 'tier-none', v: '--tier-none', hex: '#ef4444' }
  ];
  const provenance: Sw[] = [
    { name: 'data-fixed', v: '--data-fixed', hex: '#ff3e00', note: 'you typed this' },
    { name: 'data-derived', v: '--data-derived', hex: '#007bff', note: 'computed' }
  ];
</script>

<svelte:head><title>Design tokens — SSE v2</title></svelte:head>

<div class="page">
  <h1>SSE v2 — design token proposal</h1>
  <p class="lead">
    Two layers. <strong>Chrome</strong> = themeable UI surfaces (unifies the look).
    <strong>Domain</strong> = colour that means something — preserved verbatim from
    today's code, just made canonical. Approve, or tell me what to tweak, then I sweep it
    across the app.
  </p>

  <section class="accent-choice">
    <h2>① Accent — pick one</h2>
    <div class="accent-row">
      <div class="accent-card" style="--c: var(--accent)">
        <div class="chip" style="background: var(--accent)"></div>
        <div>
          <strong>#ff5a1f</strong> — new shell orange (proposed)
          <button style="background: var(--accent); color: var(--on-accent)">Primary button</button>
        </div>
      </div>
      <div class="accent-card">
        <div class="chip" style="background: var(--accent-legacy)"></div>
        <div>
          <strong>#ff3e00</strong> — current brand orange (Svelte)
          <button style="background: var(--accent-legacy); color: #fff">Primary button</button>
        </div>
      </div>
    </div>
  </section>

  <section>
    <h2>Chrome</h2>
    <h3>Surfaces</h3>
    <div class="grid">
      {#each surfaces as s}
        <div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code></div>
      {/each}
    </div>
    <h3>Text</h3>
    <div class="grid">
      {#each text as s}
        <div class="sw"><div class="chip text-chip" style="color: var({s.v})">Aa</div><b>{s.name}</b><code>{s.hex}</code></div>
      {/each}
    </div>
    <h3>Semantic</h3>
    <div class="grid">
      {#each semantic as s}
        <div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code>{#if s.note}<span class="note">{s.note}</span>{/if}</div>
      {/each}
    </div>
  </section>

  <section>
    <h2>Domain — colour as information (preserved)</h2>

    <h3>Body types</h3>
    <div class="grid">
      {#each bodies as s}
        <div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code>{#if s.note}<span class="note">{s.note}</span>{/if}</div>
      {/each}
    </div>

    <h3>Star spectral class (varies by type)</h3>
    <div class="ramp">
      {#each stars as s}
        <div class="ramp-cell" style="background: var({s.v})"><span style="color: {['L','T','Y','BH','magnetar','red-giant'].includes(s.name) ? '#fff' : '#000'}">{s.name}</span></div>
      {/each}
    </div>

    <h3>Zone bands</h3>
    <div class="grid">
      {#each zones as s}
        <div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code>{#if s.note}<span class="note">{s.note}</span>{/if}</div>
      {/each}
    </div>

    <h3>Orbital placement identity</h3>
    <div class="grid">
      {#each placement as s}
        <div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code>{#if s.note}<span class="note">{s.note}</span>{/if}</div>
      {/each}
    </div>

    <h3>Hazard ramp (radiation / belt density: safe → deadly)</h3>
    <div class="ramp">
      {#each hazard as s}
        <div class="ramp-cell wide" style="background: var({s.v})"><span style="color: {['4 very high','5 extreme'].includes(s.name) ? '#fff' : '#000'}">{s.name}</span></div>
      {/each}
    </div>

    <h3>Temperature comfort band</h3>
    <div class="ramp">
      {#each temp as s}<div class="ramp-cell wide" style="background: var({s.v})"><span style="color:#000">{s.name}</span></div>{/each}
    </div>

    <h3>Habitability tier</h3>
    <div class="grid">
      {#each tier as s}<div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code></div>{/each}
    </div>

    <h3>Data provenance legend</h3>
    <div class="grid">
      {#each provenance as s}<div class="sw"><div class="chip" style="background: var({s.v})"></div><b>{s.name}</b><code>{s.hex}</code><span class="note">{s.note}</span></div>{/each}
    </div>
  </section>

  <section class="collisions">
    <h2>⚠ Collisions to resolve</h2>
    <ul>
      <li><code>#00ff00</code> green = both <b>body-biosphere</b> and <b>zone-habitable</b>.</li>
      <li><code>#10b981</code> green = both <b>orbit-mid</b> and <b>tier-earthlike</b>.</li>
      <li>blue is spread across <b>body-habitable</b> (#007bff), <b>data-derived</b> (#007bff), <b>orbit-low</b> (#3b82f6).</li>
    </ul>
    <p class="note">These are in the code today — not new. They're only a problem where two meanings appear in the same view; I can nudge one of each pair if you want them visually distinct.</p>
  </section>
</div>

<style>
  .page { background: var(--bg-app); color: var(--text); font-family: var(--font-ui); min-height: 100vh; padding: 24px; box-sizing: border-box; }
  h1 { color: var(--accent); margin: 0 0 6px; }
  h2 { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-top: 32px; }
  h3 { color: var(--text-muted); margin: 18px 0 8px; font-size: 0.95rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .lead { color: var(--text-muted); max-width: 720px; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px; }
  .sw { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px; display: flex; flex-direction: column; gap: 2px; }
  .chip { height: 44px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  .text-chip { display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 1.4rem; background: var(--bg-control); }
  .sw b { font-size: 0.82rem; }
  code { color: var(--text-muted); font-family: var(--font-mono); font-size: 0.75rem; }
  .note { color: var(--accent-soft); font-size: 0.72rem; }
  .ramp { display: flex; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); }
  .ramp-cell { flex: 1; height: 48px; display: flex; align-items: center; justify-content: center; font-size: 0.72rem; }
  .ramp-cell.wide { height: 56px; font-weight: 600; }
  .accent-choice { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 14px; margin-top: 20px; }
  .accent-row { display: flex; gap: 20px; flex-wrap: wrap; }
  .accent-card { display: flex; gap: 12px; align-items: center; }
  .accent-card .chip { width: 56px; height: 56px; flex: 0 0 auto; }
  .accent-card button { display: block; margin-top: 6px; border: none; border-radius: var(--radius-md); padding: 8px 14px; cursor: default; }
  .collisions { background: #1a1410; border: 1px solid #5a3a20; border-radius: var(--radius-lg); padding: 12px 16px; margin-top: 28px; }
  .collisions code { color: var(--accent-soft); }
</style>
