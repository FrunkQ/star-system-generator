<script lang="ts">
  // Appearance settings / master colour reference. Open /palette. Every design token from
  // $lib/styles/tokens.css is editable here: pick a colour -> it previews live and persists
  // (via paletteStore -> localStorage -> :root override); reset returns it to the default.
  // Once the app is swept onto var(--token) + the canvas reads the tokens, edits here will
  // reskin the whole UI, and colour-blind presets become a one-click swap.
  import '$lib/styles/tokens.css';
  import { paletteOverrides, setToken, resetToken, resetAll } from '$lib/styles/paletteStore';

  type Tok = { name: string; v: string; hex: string; note?: string };
  type Group = { title: string; layer: 'chrome' | 'domain'; ramp?: boolean; items: Tok[] };

  const groups: Group[] = [
    { title: 'Surfaces', layer: 'chrome', items: [
      { name: 'bg-app', v: '--bg-app', hex: '#08090d' },
      { name: 'bg-panel', v: '--bg-panel', hex: '#14161c' },
      { name: 'bg-control', v: '--bg-control', hex: '#1b1e26' },
      { name: 'bg-control-hover', v: '--bg-control-hover', hex: '#232733' },
      { name: 'border', v: '--border', hex: '#2a2d36' },
      { name: 'border-soft', v: '--border-soft', hex: '#1c1f27' }
    ]},
    { title: 'Text', layer: 'chrome', items: [
      { name: 'text', v: '--text', hex: '#e8e8e8' },
      { name: 'text-muted', v: '--text-muted', hex: '#8a8f9a' },
      { name: 'text-faint', v: '--text-faint', hex: '#5a5f6a' }
    ]},
    { title: 'Accent', layer: 'chrome', items: [
      { name: 'accent', v: '--accent', hex: '#ff5a1f', note: 'brand alt: #ff3e00' },
      { name: 'accent-hover', v: '--accent-hover', hex: '#ff8a5c' },
      { name: 'accent-soft', v: '--accent-soft', hex: '#ffb27a' }
    ]},
    { title: 'Semantic', layer: 'chrome', items: [
      { name: 'link', v: '--link', hex: '#88ccff' },
      { name: 'status-ok', v: '--status-ok', hex: '#4caf50', note: 'possible / valid' },
      { name: 'status-bad', v: '--status-bad', hex: '#f44336', note: 'impossible / invalid' },
      { name: 'warning', v: '--warning', hex: '#ffcc00' }
    ]},
    { title: 'Body types', layer: 'domain', items: [
      { name: 'terrestrial', v: '--body-terrestrial', hex: '#cc6600' },
      { name: 'gas-giant', v: '--body-gas-giant', hex: '#cc0000' },
      { name: 'ice-giant', v: '--body-ice-giant', hex: '#add8e6' },
      { name: 'brown-dwarf', v: '--body-brown-dwarf', hex: '#5d4037' },
      { name: 'habitable', v: '--body-habitable', hex: '#007bff', note: 'earth-like' },
      { name: 'biosphere', v: '--body-biosphere', hex: '#00ff00', note: 'shares green w/ goldilocks (intended)' },
      { name: 'construct', v: '--body-construct', hex: '#ffd24d', note: 'default construct (yellow)' }
    ]},
    { title: 'Star spectral class', layer: 'domain', ramp: true, items: [
      { name: 'O', v: '--star-o', hex: '#9bb0ff' }, { name: 'B', v: '--star-b', hex: '#aabfff' },
      { name: 'A', v: '--star-a', hex: '#cad8ff' }, { name: 'F', v: '--star-f', hex: '#f8f7ff' },
      { name: 'G', v: '--star-g', hex: '#fff4ea' }, { name: 'K', v: '--star-k', hex: '#ffd2a1' },
      { name: 'M', v: '--star-m', hex: '#ffc46f' }, { name: 'L', v: '--star-l', hex: '#8a4a4a' },
      { name: 'T', v: '--star-t', hex: '#4a2a2a' }, { name: 'Y', v: '--star-y', hex: '#2a1a1a' },
      { name: 'WD', v: '--star-wd', hex: '#f0f0f0' }, { name: 'NS', v: '--star-ns', hex: '#c0c0ff' },
      { name: 'magnetar', v: '--star-magnetar', hex: '#800080' }, { name: 'BH', v: '--star-bh', hex: '#000000' },
      { name: 'red-giant', v: '--star-red-giant', hex: '#8b0000' }
    ]},
    { title: 'Zone bands', layer: 'domain', items: [
      { name: 'habitable (goldilocks)', v: '--zone-habitable', hex: '#00ff00' },
      { name: 'roche', v: '--zone-roche', hex: '#b40000' },
      { name: 'rock-line', v: '--zone-rock-line', hex: '#a52a2a' },
      { name: 'soot-line', v: '--zone-soot-line', hex: '#696969' },
      { name: 'frost-line', v: '--zone-frost-line', hex: '#add8e6' },
      { name: 'co2-ice', v: '--zone-co2-ice', hex: '#ffffff' },
      { name: 'co-ice', v: '--zone-co-ice', hex: '#0000ff' }
    ]},
    { title: 'Orbital placement', layer: 'domain', items: [
      { name: 'surface', v: '--orbit-surface', hex: '#5a5a5a' },
      { name: 'low', v: '--orbit-low', hex: '#3b82f6' },
      { name: 'mid', v: '--orbit-mid', hex: '#10b981' },
      { name: 'high', v: '--orbit-high', hex: '#a855f7' },
      { name: 'geo', v: '--orbit-geo', hex: '#facc15' }
    ]},
    { title: 'Hazard ramp (safe → deadly)', layer: 'domain', ramp: true, items: [
      { name: '0', v: '--hazard-0', hex: '#4ade80' }, { name: '1', v: '--hazard-1', hex: '#84cc16' },
      { name: '2', v: '--hazard-2', hex: '#eab308' }, { name: '3', v: '--hazard-3', hex: '#f97316' },
      { name: '4', v: '--hazard-4', hex: '#ef4444' }, { name: '5', v: '--hazard-5', hex: '#7f1d1d' }
    ]},
    { title: 'Temperature band', layer: 'domain', ramp: true, items: [
      { name: 'cold', v: '--temp-cold', hex: '#60a5fa' }, { name: 'habitable', v: '--temp-habitable', hex: '#4ade80' },
      { name: 'warm', v: '--temp-warm', hex: '#fb923c' }, { name: 'hot', v: '--temp-hot', hex: '#ef4444' }
    ]},
    { title: 'Habitability tier', layer: 'domain', items: [
      { name: 'earth-like', v: '--tier-earthlike', hex: '#10b981' },
      { name: 'human', v: '--tier-human', hex: '#f59e0b' },
      { name: 'alien', v: '--tier-alien', hex: '#8b5cf6' },
      { name: 'none', v: '--tier-none', hex: '#ef4444' }
    ]},
    { title: 'Data provenance', layer: 'domain', items: [
      { name: 'fixed', v: '--data-fixed', hex: '#ff3e00', note: 'you typed this' },
      { name: 'derived', v: '--data-derived', hex: '#007bff', note: 'computed' }
    ]}
  ];

  $: overridden = $paletteOverrides;
  $: count = Object.keys(overridden).length;
  function valueOf(t: Tok) { return overridden[t.v] ?? t.hex; }
</script>

<svelte:head><title>Appearance — SSE v2</title></svelte:head>

<div class="page">
  <header class="top">
    <div>
      <h1>Appearance</h1>
      <p class="lead">Master colour reference. Edit any token — it previews live and is saved.
        <strong>Chrome</strong> unifies the UI; <strong>domain</strong> colours encode meaning
        (preserved). {#if count}<span class="badge">{count} customised</span>{/if}</p>
    </div>
    <button class="reset-all" disabled={count === 0} on:click={resetAll}>Reset all to defaults</button>
  </header>

  {#each ['chrome', 'domain'] as layer}
    <h2>{layer === 'chrome' ? 'Chrome (themeable)' : 'Domain — colour as information (preserved)'}</h2>
    {#each groups.filter(g => g.layer === layer) as g}
      <h3>{g.title}</h3>
      {#if g.ramp}
        <div class="ramp">
          {#each g.items as t}
            <label class="ramp-cell" style="background: var({t.v})" title="{t.name} · {t.v}">
              <span class="ramp-name">{t.name}</span>
              <input type="color" value={valueOf(t)} on:input={(e) => setToken(t.v, e.currentTarget.value)} />
              {#if overridden[t.v]}<button class="r" title="Reset" on:click={() => resetToken(t.v)}>↺</button>{/if}
            </label>
          {/each}
        </div>
      {:else}
        <div class="grid">
          {#each g.items as t}
            <div class="sw" class:edited={overridden[t.v]}>
              <div class="chip" style="background: var({t.v})"></div>
              <div class="meta">
                <b>{t.name}</b>
                <code>{valueOf(t)}</code>
                {#if t.note}<span class="note">{t.note}</span>{/if}
              </div>
              <div class="controls">
                <input type="color" value={valueOf(t)} on:input={(e) => setToken(t.v, e.currentTarget.value)} />
                {#if overridden[t.v]}<button class="r" title="Reset to default" on:click={() => resetToken(t.v)}>↺</button>{/if}
              </div>
            </div>
          {/each}
        </div>
      {/if}
    {/each}
  {/each}

  <section class="footnote">
    <p><strong>Not yet wired app-wide.</strong> Tokens are loaded only on this page for now;
      once the app is swept onto <code>var(--token)</code> and the canvas reads the tokens,
      edits here reskin the whole UI and colour-blind presets become a one-click swap.</p>
    <p class="note">Known intended overlap: <code>#00ff00</code> green = biosphere + goldilocks (both = life-friendly).</p>
  </section>
</div>

<style>
  .page { background: var(--bg-app); color: var(--text); font-family: var(--font-ui); min-height: 100vh; padding: 24px; box-sizing: border-box; }
  .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; flex-wrap: wrap; }
  h1 { color: var(--accent); margin: 0 0 4px; }
  h2 { border-bottom: 1px solid var(--border); padding-bottom: 6px; margin-top: 30px; }
  h3 { color: var(--text-muted); margin: 16px 0 8px; font-size: 0.9rem; text-transform: uppercase; letter-spacing: 0.04em; }
  .lead { color: var(--text-muted); max-width: 760px; margin: 0; }
  .badge { background: var(--accent); color: var(--on-accent); border-radius: var(--radius-pill); padding: 1px 8px; font-size: 0.75rem; margin-left: 6px; }
  .reset-all { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px 12px; cursor: pointer; }
  .reset-all:disabled { opacity: 0.4; cursor: default; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
  .sw { background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-md); padding: 8px; display: flex; gap: 8px; align-items: center; }
  .sw.edited { border-color: var(--accent); }
  .chip { width: 40px; height: 40px; flex: 0 0 auto; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  .meta { flex: 1 1 auto; min-width: 0; display: flex; flex-direction: column; }
  .meta b { font-size: 0.82rem; }
  code { color: var(--text-muted); font-family: var(--font-mono); font-size: 0.72rem; }
  .note { color: var(--accent-soft); font-size: 0.68rem; }
  .controls { display: flex; align-items: center; gap: 4px; flex: 0 0 auto; }
  input[type='color'] { width: 30px; height: 30px; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-sm); background: none; cursor: pointer; }
  .r { width: 26px; height: 26px; border: 1px solid var(--border); border-radius: var(--radius-sm); background: var(--bg-control); color: var(--text); cursor: pointer; }
  .ramp { display: flex; border-radius: var(--radius-md); overflow: hidden; border: 1px solid var(--border); flex-wrap: wrap; }
  .ramp-cell { flex: 1 1 60px; min-height: 60px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px; position: relative; }
  .ramp-name { font-size: 0.7rem; color: #000; background: rgba(255,255,255,0.65); border-radius: 3px; padding: 0 3px; }
  .ramp-cell input[type='color'] { width: 24px; height: 18px; }
  .ramp-cell .r { width: 20px; height: 18px; font-size: 0.7rem; }
  .footnote { margin-top: 30px; background: var(--bg-panel); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 12px 16px; }
  .footnote code { color: var(--accent-soft); }
</style>
