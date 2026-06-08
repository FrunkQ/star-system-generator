<script lang="ts">
  // Phase A — the generation wizard. Step 1: pick stars (an example to bypass everything, a one-click
  // preset, or the HR diagram). Step 2: age (with a live preview of the star evolving) + the physical
  // knobs. "Create stars only" bails after step 1 → the GM populates by hand via §4c.
  import { createEventDispatcher } from 'svelte';
  import type { RulePack, System } from '$lib/types';
  import HRDiagram from './HRDiagram.svelte';
  import { deriveStarFromHR, ageStar, stellarRadiusAU, isEngulfedAt, type StarSeed } from '$lib/physics/stellar-evolution';
  import { generateSystemFromConfig, type GenerationKnobs } from '$lib/generation/generateFromConfig';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import { systemProcessor } from '$lib/core/SystemProcessor';

  export let rulePack: RulePack;
  export let exampleSystems: string[] = [];

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  let step: 1 | 2 = 1;
  let selectedStars: StarSeed[] = [];
  let ageGyr = 4.6;
  let knobs: GenerationKnobs = { metallicity: 0.5, diskMass: 0.5, dynamicalHistory: 0.5, weirdness: 0.5 };
  let busy = false;
  let chosenExample = '';

  // Presets — just saved (representative star + knobs + age). One click for people who don't want to
  // think about metallicity. The user can still tweak afterwards.
  const PRESETS: Array<{ name: string; star: [number, number]; age: number; k: GenerationKnobs; note: string }> = [
    { name: 'Sol-like', star: [5778, 1], age: 4.6, k: { metallicity: 0.55, diskMass: 0.5, dynamicalHistory: 0.2, weirdness: 0.2 }, note: 'A calm, mature Sun-like system.' },
    { name: 'Hot-Jupiter Chaos', star: [6200, 1.8], age: 2, k: { metallicity: 0.7, diskMass: 0.7, dynamicalHistory: 0.95, weirdness: 0.6 }, note: 'Violent migration — giants flung inward.' },
    { name: 'Ancient & Dead', star: [5400, 0.7], age: 12, k: { metallicity: 0.4, diskMass: 0.4, dynamicalHistory: 0.3, weirdness: 0.3 }, note: 'An old, settled, fading system.' },
    { name: 'Young & Fiery', star: [9000, 30], age: 0.3, k: { metallicity: 0.6, diskMass: 0.8, dynamicalHistory: 0.7, weirdness: 0.5 }, note: 'Hot, fresh, primordial.' },
    { name: 'Exotic Menagerie', star: [5778, 1], age: 4, k: { metallicity: 0.6, diskMass: 0.7, dynamicalHistory: 0.6, weirdness: 1 }, note: 'Maximise the weird.' },
    { name: 'Metal-poor Dwarf', star: [3500, 0.04], age: 8, k: { metallicity: 0.1, diskMass: 0.3, dynamicalHistory: 0.3, weirdness: 0.3 }, note: 'A frugal red-dwarf system.' }
  ];
  function applyPreset(p: typeof PRESETS[number]) {
    selectedStars = [deriveStarFromHR(p.star[0], p.star[1])];
    ageGyr = p.age;
    knobs = { ...p.k };
    step = 2;
  }

  // Live preview of the primary star aged to the chosen age.
  $: primary = selectedStars[0];
  $: aged = primary ? ageStar(primary, ageGyr * 1e9) : null;
  $: agedRadiusAU = aged ? stellarRadiusAU(aged) : 0;

  function newSystem(emptyPlanets: boolean) {
    if (!primary) return;
    busy = true;
    try {
      const seed = `gen-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
      const system = generateSystemFromConfig(seed, rulePack, { seeds: selectedStars, ageGyr, emptyPlanets, knobs });
      dispatch('generate', { system });
    } finally { busy = false; }
  }

  async function loadExample(name: string) {
    if (!name) return;
    busy = true;
    try {
      const res = await fetch(`/examples/${name}`);
      const raw = await res.json() as System;
      const system = systemProcessor.process(fixUpImportedSystem(raw), rulePack);
      dispatch('generate', { system });
    } catch (e) {
      console.error('Failed to load example', e); alert('Could not load that example.');
    } finally { busy = false; }
  }

  const pretty = (n: string) => n.replace(/-System\.json$/, '').replace(/_/g, ' ').replace(/-/g, ' ');
  const fmt = (n: number, d = 1) => n.toLocaleString(undefined, { maximumFractionDigits: d });
</script>

<div class="overlay" on:click|self={close} role="presentation">
  <div class="modal" role="dialog" aria-label="Generate a new system">
    <header>
      <div>
        <h2>New system <span class="stepchip">Step {step} of 2</span></h2>
        <p class="sub">{step === 1 ? 'Pick your star(s) — an example, a preset, or the HR diagram.' : 'Set the age and the physical character, then generate.'}</p>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>

    <div class="content">
      {#if step === 1}
        <section class="block">
          <h3>Quick start: load an example</h3>
          <div class="row">
            <select bind:value={chosenExample}>
              <option value="">Choose an example system…</option>
              {#each exampleSystems as ex}<option value={ex}>{pretty(ex)}</option>{/each}
            </select>
            <button class="primary" disabled={!chosenExample || busy} on:click={() => loadExample(chosenExample)}>Load</button>
          </div>
        </section>

        <section class="block">
          <h3>Or a preset (sets the sliders for you)</h3>
          <div class="presets">
            {#each PRESETS as p}
              <button class="preset" title={p.note} on:click={() => applyPreset(p)}>{p.name}</button>
            {/each}
          </div>
        </section>

        <section class="block">
          <h3>Or build your own — click the HR diagram to pick star(s)</h3>
          <div class="hr-wrap"><HRDiagram bind:selectedStars on:select={() => (selectedStars = selectedStars)} /></div>
          {#if selectedStars.length}
            <div class="chips">
              {#each selectedStars as s, i}
                <span class="chip">{s.spectralClass} · {fmt(s.temperatureK, 0)} K
                  <button class="x" on:click={() => (selectedStars = selectedStars.filter((_, j) => j !== i))}>×</button>
                </span>
              {/each}
            </div>
          {/if}
        </section>
      {:else}
        <section class="block">
          <h3>Presets</h3>
          <div class="presets">
            {#each PRESETS as p}<button class="preset" title={p.note} on:click={() => { ageGyr = p.age; knobs = { ...p.k }; }}>{p.name}</button>{/each}
          </div>
        </section>

        <section class="block">
          <h3>System age: {fmt(ageGyr)} Gyr</h3>
          <input type="range" min="0.1" max="13.5" step="0.1" bind:value={ageGyr} class="slider" />
          {#if aged}
            <div class="preview">
              <span class="ph">{aged.phase?.replace(/-/g, ' ')}</span>
              <span>{fmt(aged.temperatureK, 0)} K · {fmt(aged.luminositySolar, aged.luminositySolar < 10 ? 2 : 0)} L☉ · {fmt(agedRadiusAU, 3)} AU radius</span>
              {#if isEngulfedAt(aged, 1)}<span class="warn">⚠ swollen past 1 AU — inner planets engulfed</span>{/if}
              {#if aged.isDead}<span class="warn">stellar remnant — inner system cleared</span>{/if}
            </div>
          {/if}
        </section>

        <section class="block">
          <h3>Physical character</h3>
          {#each [['metallicity','Metallicity','metal-poor (icy/gassy)','metal-rich (rocky/iron)'],['diskMass','Disk mass','sparse','crowded'],['dynamicalHistory','Dynamical history','calm, circular','violent, eccentric'],['weirdness','Weirdness','mundane','exotic']] as [key, label, lo, hi]}
            <div class="knob">
              <div class="knob-head"><span>{label}</span><span class="knob-val">{Math.round((knobs[key] ?? 0.5) * 100)}%</span></div>
              <input type="range" min="0" max="1" step="0.01" bind:value={knobs[key]} class="slider" />
              <div class="knob-ends"><span>{lo}</span><span>{hi}</span></div>
            </div>
          {/each}
          <p class="note">Weirdness is reserved (exotic type-draw biasing is a follow-up); the rest shape the worlds now.</p>
        </section>
      {/if}
    </div>

    <footer>
      {#if step === 1}
        <span class="hint">{selectedStars.length ? `${selectedStars.length} star${selectedStars.length > 1 ? 's' : ''} selected` : 'Pick at least one star to continue'}</span>
        <div class="actions">
          <button disabled={!selectedStars.length || busy} on:click={() => newSystem(true)}>Create stars only</button>
          <button class="primary" disabled={!selectedStars.length || busy} on:click={() => (step = 2)}>Next: age &amp; options →</button>
        </div>
      {:else}
        <button on:click={() => (step = 1)}>← Back</button>
        <button class="primary" disabled={busy} on:click={() => newSystem(false)}>{busy ? 'Generating…' : 'Generate system'}</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 1000; padding: 3vh 2vw; }
  .modal { background: var(--bg-app, #0b0d12); border: 1px solid var(--border, #2a2d36); border-radius: 10px; width: min(820px, 97vw); max-height: 92vh; display: flex; flex-direction: column; color: var(--text, #e8e8e8); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
  header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border, #2a2d36); }
  h2 { margin: 0; font-size: 1.1rem; color: var(--accent, #ff5a1f); }
  .stepchip { font-size: 0.7rem; background: var(--bg-control, #232733); color: var(--text-muted, #cfcfcf); border-radius: 999px; padding: 2px 8px; margin-left: 8px; }
  .sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-muted, #cfcfcf); }
  .close { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.6rem; line-height: 1; cursor: pointer; }
  .content { overflow-y: auto; padding: 14px 18px; }
  .block { margin-bottom: 18px; }
  .block h3 { margin: 0 0 8px; font-size: 0.9rem; color: var(--text, #fff); }
  .row { display: flex; gap: 8px; }
  select, .row select { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; }
  .preset { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--link); cursor: pointer; font-size: 0.85em; }
  .preset:hover { background: var(--bg-control); border-color: var(--accent); }
  .hr-wrap { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; min-height: 240px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; }
  .chip { background: var(--bg-control); border-radius: 4px; padding: 3px 8px; font-size: 0.8em; display: flex; align-items: center; gap: 6px; }
  .chip .x { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1em; line-height: 0.5; }
  .slider { width: 100%; }
  .preview { display: flex; flex-wrap: wrap; gap: 10px; align-items: baseline; margin-top: 6px; font-size: 0.85em; color: var(--text-muted); }
  .preview .ph { text-transform: capitalize; color: var(--accent); font-weight: 600; }
  .preview .warn { color: var(--warning, #e08a4a); }
  .knob { margin-bottom: 10px; }
  .knob-head { display: flex; justify-content: space-between; font-size: 0.85em; }
  .knob-val { color: var(--link); font-variant-numeric: tabular-nums; }
  .knob-ends { display: flex; justify-content: space-between; font-size: 0.72em; color: var(--text-faint); }
  .note { font-size: 0.76em; color: var(--text-faint); }
  footer { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border, #2a2d36); }
  .hint { font-size: 0.8em; color: var(--text-faint); }
  .actions { display: flex; gap: 8px; }
  footer button, .row button { padding: 8px 14px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--text); cursor: pointer; }
  footer button.primary, .row button.primary { background: var(--accent, #ff5a1f); color: #fff; border-color: var(--accent, #ff5a1f); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
