<script lang="ts">
  // Phase A — the generation wizard. Step 1: pick stars (an example to bypass everything, a one-click
  // preset, or the HR diagram). Step 2: age (with a live preview of the star evolving) + the physical
  // knobs. "Create stars only" bails after step 1 → the GM populates by hand via §4c.
  import { createEventDispatcher } from 'svelte';
  import type { RulePack, System } from '$lib/types';
  import HRDiagram from './HRDiagram.svelte';
  import { ageStar, isEngulfedAt, getStarLifespanGyr, type StarSeed } from '$lib/physics/stellar-evolution';
  import { generateSystemFromConfig, type GenerationKnobs } from '$lib/generation/generateFromConfig';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { SOLAR_MASS_KG } from '$lib/constants';

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

  // CHARACTER presets — these only nudge the STEP-2 sliders (age + physical knobs); they do NOT pick a
  // star (that's step 1, already done by the time you see these). Star-bound flavours like "Sol-like"
  // or "red-dwarf system" were dropped — the star is your choice on the HR diagram, not a preset's.
  const PRESETS: Array<{ name: string; age: number; k: GenerationKnobs; note: string }> = [
    { name: 'Calm & mature', age: 4.6, k: { metallicity: 0.55, diskMass: 0.5, dynamicalHistory: 0.2, weirdness: 0.2 }, note: 'Settled, circular orbits — a Solar-System temperament.' },
    { name: 'Violent migration', age: 2, k: { metallicity: 0.7, diskMass: 0.7, dynamicalHistory: 0.95, weirdness: 0.6 }, note: 'Giants flung inward — hot-Jupiter chaos.' },
    { name: 'Ancient & fading', age: 12, k: { metallicity: 0.4, diskMass: 0.4, dynamicalHistory: 0.3, weirdness: 0.3 }, note: 'Old and settled — radiogenic heat long spent.' },
    { name: 'Young & fiery', age: 0.4, k: { metallicity: 0.6, diskMass: 0.8, dynamicalHistory: 0.7, weirdness: 0.5 }, note: 'Fresh, primordial, still violent.' },
    { name: 'Maximise weird', age: 4, k: { metallicity: 0.6, diskMass: 0.7, dynamicalHistory: 0.6, weirdness: 1 }, note: 'Push the exotic dial to the wall.' }
  ];
  function applyCharacter(p: typeof PRESETS[number]) {
    ageGyr = p.age;
    knobs = { ...p.k };
  }

  // --- Star helpers for the hierarchy preview + age feedback ---
  const SOL = SOLAR_MASS_KG;
  const SPECTRAL_COLOR: Record<string, string> = { O: '#9bb0ff', B: '#aabfff', A: '#cad7ff', F: '#f8f7ff', G: '#fff4ea', K: '#ffd2a1', M: '#ffb56b' };
  const starColor = (s: { spectralClass: string }) => SPECTRAL_COLOR[s.spectralClass] ?? '#ffd2a1';
  const massSolar = (s: { massKg: number }) => s.massKg / SOL;
  // Order by mass (heaviest = primary) so the hierarchy reads primary → companions.
  $: ordered = [...selectedStars].sort((a, b) => b.massKg - a.massKg);
  // Each star aged to the chosen age + its main-sequence lifetime, so you can see who has aged out
  // (a heavy star → white dwarf) while an M dwarf sits on the main sequence forever (WD/M binaries).
  $: agedStars = ordered.map((s) => ({ seed: s, aged: ageStar(s, ageGyr * 1e9), tMS: getStarLifespanGyr(s.massKg) }));

  // The primary (heaviest) star — gates generation.
  $: primary = ordered[0];
  const lifespanLabel = (tMS: number) =>
    tMS > 13.8 ? 'outlives the universe'
    : tMS < 0.1 ? `ages out at ~${fmt(tMS * 1000, 0)} Myr`
    : `ages out at ~${fmt(tMS)} Gyr`;

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
      const system = systemProcessor.process(fixUpImportedSystem(raw, rulePack), rulePack);
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
          <h3>Or build your own — click the HR diagram to add star(s)</h3>
          <div class="hr-wrap"><HRDiagram bind:selectedStars on:select={(e) => { if (selectedStars.length < 50) selectedStars = [...selectedStars, e.detail]; }} /></div>

          <div class="hierarchy">
            <div class="hier-title">System hierarchy <span class="muted">— click the diagram to add stars</span></div>
            {#if selectedStars.length}
              {#each ordered as s, i}
                <div class="hier-row" style="padding-left: {i === 0 ? 0 : 14}px">
                  <span class="star-dot" style="background:{starColor(s)}"></span>
                  <span class="role">{i === 0 ? 'Primary' : `Companion ${i}`}</span>
                  <span class="star-meta">{s.spectralClass}-type {s.category?.includes('Dwarf') && s.spectralClass === 'M' ? '(red dwarf)' : ''} · {fmt(s.temperatureK, 0)} K · {fmt(massSolar(s), 2)} M☉</span>
                  <button class="x" title="Remove" on:click={() => (selectedStars = selectedStars.filter((x) => x.id !== s.id))}>×</button>
                </div>
              {/each}
            {:else}
              <div class="hier-empty">No stars yet — click a point on the diagram above.</div>
            {/if}
          </div>
        </section>
      {:else}
        <section class="block">
          <h3>Character presets <span class="muted">— nudge the sliders below</span></h3>
          <div class="presets">
            {#each PRESETS as p}<button class="preset" title={p.note} on:click={() => applyCharacter(p)}>{p.name}</button>{/each}
          </div>
        </section>

        <section class="block">
          <h3>System age: {fmt(ageGyr)} Gyr</h3>
          <input type="range" min="0.1" max="13.5" step="0.1" bind:value={ageGyr} class="slider" />
          <!-- Per-star life feedback: who is still burning, who has aged out. Slide forward and watch a
               heavy star swell and die to a white dwarf while an M dwarf burns on — the WD/M binary. -->
          <div class="star-ages">
            {#each agedStars as a}
              <div class="star-age" class:dead={a.aged.isDead}>
                <span class="star-dot" style="background:{a.aged.isDead ? '#cfe8ff' : starColor(a.seed)}"></span>
                <span class="sa-cls">{a.seed.spectralClass}-type</span>
                <span class="sa-phase">{a.aged.isDead ? a.aged.category : (a.aged.phase ?? 'main-sequence').replace(/-/g, ' ')}</span>
                <span class="sa-life">{lifespanLabel(a.tMS)}</span>
                {#if isEngulfedAt(a.aged, 1)}<span class="warn">⚠ swollen past 1 AU</span>{/if}
              </div>
            {/each}
          </div>
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
  .muted { color: var(--text-faint, #8a8a8a); font-weight: 400; font-size: 0.85em; }
  .slider { width: 100%; }

  /* System hierarchy preview (built live as you click the HR diagram) */
  .hierarchy { margin-top: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--bg-panel, #14161c); }
  .hier-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #cfcfcf); margin-bottom: 6px; }
  .hier-empty { font-size: 0.82em; color: var(--text-faint, #8a8a8a); font-style: italic; }
  .hier-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .star-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 6px rgba(255,255,255,0.25); }
  .role { font-size: 0.78em; font-weight: 700; color: var(--link); min-width: 84px; }
  .star-meta { font-size: 0.82em; color: var(--text-muted, #cfcfcf); flex: 1; }
  .hier-row .x { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1em; line-height: 0.5; }
  .hier-row .x:hover { color: var(--accent, #ff5a1f); }

  /* Per-star age feedback on step 2 */
  .star-ages { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
  .star-age { display: flex; align-items: center; gap: 8px; font-size: 0.82em; flex-wrap: wrap; }
  .star-age.dead { opacity: 0.85; }
  .sa-cls { font-weight: 700; color: var(--text, #fff); min-width: 56px; }
  .sa-phase { text-transform: capitalize; color: var(--accent); font-weight: 600; }
  .star-age.dead .sa-phase { color: #8fc7ff; }
  .sa-life { color: var(--text-faint, #8a8a8a); }
  .warn { color: var(--warning, #e08a4a); }
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
