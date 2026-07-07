<script lang="ts">
  // Phase A — the generation wizard. Step 1: pick stars (an example to bypass everything, a one-click
  // preset, or the HR diagram). Step 2: age (with a live preview of the star evolving) + the physical
  // knobs. "Create stars only" bails after step 1 → the GM populates by hand via §4c.
  import { createEventDispatcher } from 'svelte';
  import type { RulePack, System } from '$lib/types';
  import HRDiagram from './HRDiagram.svelte';
  import { ageStar, isEngulfedAt, getStarLifespanGyr, deriveStarFromHR, classifyStar, determineSpectralClass, type StarSeed } from '$lib/physics/stellar-evolution';
  import { generateSystemFromConfig, planStarHierarchy, type GenerationKnobs, type StarPlanNode } from '$lib/generation/generateFromConfig';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { SOLAR_MASS_KG } from '$lib/constants';
  import UboxImportModal from './UboxImportModal.svelte';

  export let rulePack: RulePack;
  export let exampleSystems: string[] = [];

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  // Universe Sandbox import (.ubox) — opens a dedicated modal that converts + shows the diff.
  let uboxBytes: Uint8Array | null = null;
  let uboxFileName = '';

  let step: 1 | 2 = 1;
  let selectedStars: StarSeed[] = [];
  let ageGyr = 4.6;
  let knobs: GenerationKnobs = { metallicity: 0.5, diskMass: 0.5, dynamicalHistory: 0.5, rarity:0.5 };
  let naming: 'catalogue' | 'scientific' | 'named' = 'scientific';  // lead with a plausible Bayer style
  let busy = false;
  let chosenExample = '';

  // CHARACTER presets — these only nudge the STEP-2 sliders (age + physical knobs); they do NOT pick a
  // star (that's step 1, already done by the time you see these). Star-bound flavours like "Sol-like"
  // or "red-dwarf system" were dropped — the star is your choice on the HR diagram, not a preset's.
  const PRESETS: Array<{ name: string; age: number; k: GenerationKnobs; note: string }> = [
    { name: 'Calm & mature', age: 4.6, k: { metallicity: 0.55, diskMass: 0.5, dynamicalHistory: 0.2, rarity:0.2 }, note: 'Settled, circular orbits — a Solar-System temperament.' },
    { name: 'Violent migration', age: 2, k: { metallicity: 0.7, diskMass: 0.7, dynamicalHistory: 0.95, rarity:0.6 }, note: 'Giants flung inward — hot-Jupiter chaos.' },
    { name: 'Ancient & fading', age: 12, k: { metallicity: 0.4, diskMass: 0.4, dynamicalHistory: 0.3, rarity:0.3 }, note: 'Old and settled — radiogenic heat long spent.' },
    { name: 'Young & fiery', age: 0.4, k: { metallicity: 0.6, diskMass: 0.8, dynamicalHistory: 0.7, rarity:0.5 }, note: 'Fresh, primordial, still violent.' },
    { name: 'Exotic zoo', age: 4, k: { metallicity: 0.6, diskMass: 0.7, dynamicalHistory: 0.6, rarity: 1 }, note: 'Push the rarity dial to the wall — legendary worlds.' }
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
  let hovered: StarSeed | null = null;  // live readout of the point under the cursor on the HR diagram
  // Order by mass (heaviest = primary) so the hierarchy reads primary → companions.
  $: ordered = [...selectedStars].sort((a, b) => b.massKg - a.massKg);

  // --- Hand-editing a clicked star (type M/T/L for a specific star) + sanity-check + Fix ---
  // Temperature & Luminosity are the canonical HR pair (mass/radius/class derive from them). The fields
  // are never blocked — we only flag what's physically off and offer a one-click Fix.
  let edited: Record<string, { t?: boolean; l?: boolean; m?: boolean }> = {};
  $: statuses = new Map(selectedStars.map((s) => [s.id, starStatus(s)]));

  function starStatus(s: StarSeed) {
    const mSolar = s.massKg / SOL;
    const derivedMSolar = deriveStarFromHR(s.temperatureK, s.luminositySolar).massKg / SOL;
    const cat = classifyStar({ tempK: s.temperatureK, lumSolar: s.luminositySolar, massKg: s.massKg, ageGyr: 0 }).category;
    const impossible = /invalid/i.test(cat);
    const tBad = !(s.temperatureK >= 1000 && s.temperatureK <= 60000);
    const lBad = !(s.luminositySolar >= 1e-6 && s.luminositySolar <= 1e7);
    const mBad = derivedMSolar > 0 && Math.abs(mSolar - derivedMSolar) / derivedMSolar > 0.3;
    return { tBad, lBad, mBad, impossible, anyBad: tBad || lBad || mBad || impossible };
  }

  function setStarField(s: StarSeed, field: 't' | 'l' | 'm', raw: string) {
    const v = parseFloat(raw);
    if (!Number.isFinite(v)) return;
    if (field === 't') s.temperatureK = v;
    else if (field === 'l') s.luminositySolar = v;
    else s.massKg = v * SOL;
    s.spectralClass = determineSpectralClass(s.temperatureK);
    edited[s.id] = { ...(edited[s.id] ?? {}), [field]: true };
    selectedStars = selectedStars; // re-derive ordering/hierarchy, redraw the HR diagram
  }

  // Recompute the NON-edited figures to be consistent. Trusts T & L (the HR position); if only mass was
  // typed, solves a main-sequence star of that mass instead. If still impossible, label it Exotic — never block.
  function fixStar(s: StarSeed) {
    const e = edited[s.id] ?? {};
    let T = s.temperatureK, L = s.luminositySolar;
    if (e.m && !e.t && !e.l) {
      const mSolar = Math.max(0.05, s.massKg / SOL);
      L = Math.pow(mSolar, 3.5);                       // mass→luminosity (L ∝ M^3.5)
      T = Math.pow(10, (Math.log10(L) + 24.5) / 6.5);  // invert the main-sequence L(T) used by classifyStar
    }
    const d = deriveStarFromHR(T, L);
    s.temperatureK = d.temperatureK; s.luminositySolar = d.luminositySolar;
    s.massKg = d.massKg; s.radiusKm = d.radiusKm;
    s.spectralClass = d.spectralClass; s.category = d.category; s.luminosityClass = d.luminosityClass;
    if (/invalid/i.test(d.category)) s.category = 'Exotic';
    edited[s.id] = {};
    selectedStars = selectedStars;
  }

  // The planned hierarchy (the EXACT pairing the generator will build) → a flattened, depth-indented
  // preview + a compact diagram, so you feel the close/wide binary structure before generating.
  const LETTERS = 'ABCDEFGHIJKLMNOP';
  function flattenPlan(node: StarPlanNode | null, depth: number, rows: any[]): any[] {
    if (!node) return rows;
    if (node.kind === 'pair') {
      rows.push({ type: 'pair', depth, sepAU: node.sepAU });
      flattenPlan(node.a, depth + 1, rows);
      flattenPlan(node.b, depth + 1, rows);
    } else {
      rows.push({ type: 'star', depth, seed: node.seed, index: node.index });
    }
    return rows;
  }
  function planString(node: StarPlanNode | null): string {
    if (!node) return '';
    return node.kind === 'star' ? (LETTERS[node.index] ?? '?') : `(${planString(node.a)} · ${planString(node.b)})`;
  }
  const sepLabel = (au: number) =>
    au < 0.3 ? `very close · ${fmt(au, 2)} AU` : au < 2 ? `close · ${fmt(au, 1)} AU`
    : au < 20 ? `wide · ${fmt(au, 0)} AU` : `very wide · ${fmt(au, 0)} AU`;
  $: plan = selectedStars.length ? planStarHierarchy(selectedStars) : null;
  $: planRows = plan ? flattenPlan(plan, 0, []) : [];

  // LOG age axis: the slider runs from 1 Myr to the LONGEST-LIVED star's death, so a massive star can
  // collapse to a remnant long before an M dwarf even matures. Death ≈ 1.3× the main-sequence life.
  const AGE_MIN = 0.001; // Gyr (1 Myr)
  $: deaths = selectedStars.map((s) => getStarLifespanGyr(s.massKg) * 1.3);
  $: maxDeathGyr = Math.min(2000, Math.max(13.8, ...(deaths.length ? deaths : [13.8])));
  $: longestLived = selectedStars.length
    ? selectedStars.reduce((a, b) => (getStarLifespanGyr(a.massKg) > getStarLifespanGyr(b.massKg) ? a : b)) : null;
  const ageFromPos = (pos: number) => +(AGE_MIN * Math.pow(maxDeathGyr / AGE_MIN, pos)).toFixed(3);
  const posOfAge = (gyr: number) => Math.log(Math.max(AGE_MIN, gyr) / AGE_MIN) / Math.log(maxDeathGyr / AGE_MIN);

  // Each star aged to the chosen age, with STATUS: has it changed (left the main sequence / died),
  // is it flaring (young & active, or a low-mass flare star), and what it is NOW.
  const dotColorFor = (a: any) => a.aged.isDead
    ? (a.aged.category?.includes('Black') ? '#444a55' : a.aged.category?.includes('Neutron') ? '#dfe7ff' : '#cfe8ff')
    : (SPECTRAL_COLOR[a.aged.spectralClass] ?? '#ffd2a1');
  const nowLabelFor = (a: any) => a.aged.isDead ? a.aged.category
    : a.aged.phase === 'pre-main-sequence' ? `${a.seed.spectralClass}-type (forming)`
    : a.aged.phase === 'giant' ? 'Red giant'
    : a.aged.phase === 'subgiant' ? 'Subgiant'
    : `${a.aged.spectralClass}-type main sequence`;
  $: agedStars = ordered.map((s) => {
    const aged = ageStar(s, ageGyr * 1e9);
    const tMS = getStarLifespanGyr(s.massKg);
    const changed = aged.isDead || aged.phase === 'subgiant' || aged.phase === 'giant';
    const onSequence = (aged.phase ?? 'main-sequence') === 'main-sequence' || aged.phase === 'pre-main-sequence';
    const flaring = !aged.isDead && onSequence
      && (aged.phase === 'pre-main-sequence' || ageGyr < 0.3 || (['M', 'K'].includes(s.spectralClass) && ageGyr < 2) || s.luminositySolar > 1000);
    return { seed: s, aged, tMS, changed, flaring };
  });

  // The primary (heaviest) star — gates generation.
  $: primary = ordered[0];
  const lifespanLabel = (tMS: number) =>
    tMS < 0.1 ? `MS life ~${fmt(tMS * 1000, 0)} Myr` : `MS life ~${fmt(tMS)} Gyr`;

  function newSystem(emptyPlanets: boolean) {
    if (!primary) return;
    busy = true;
    try {
      const seed = `gen-${Date.now()}-${Math.floor(Math.random() * 1e5)}`;
      const system = generateSystemFromConfig(seed, rulePack, { seeds: selectedStars, ageGyr, emptyPlanets, knobs, naming });
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

  // Load a previously-SAVED system file (what the in-system "Load System" does) and drop it in at the
  // clicked position, same as loading an example. Accepts a single-system JSON or a starmap (first system).
  let fileInput: HTMLInputElement;
  async function loadSystemFile(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    // A Universe Sandbox save goes through the .ubox converter modal instead of the JSON path.
    if (file.name.toLowerCase().endsWith('.ubox')) {
      uboxFileName = file.name;
      uboxBytes = new Uint8Array(await file.arrayBuffer());
      input.value = '';
      return;
    }
    busy = true;
    try {
      const raw = JSON.parse(await file.text());
      const rawSystem = Array.isArray(raw?.nodes) ? raw : raw?.systems?.[0]?.system;
      if (!rawSystem || !Array.isArray(rawSystem.nodes)) throw new Error('not a system file');
      const system = systemProcessor.process(fixUpImportedSystem(rawSystem as System, rulePack), rulePack);
      dispatch('generate', { system });
    } catch (err) {
      console.error('Failed to load system file', err);
      alert('Could not load that file — pick a saved system (or starmap) JSON.');
    } finally { busy = false; input.value = ''; }
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
          <div class="row load-saved">
            <span class="muted">or load one you saved earlier —</span>
            <button class="ghost" disabled={busy} on:click={() => fileInput?.click()}>Load saved system…</button>
            <input type="file" accept="application/json,.json,.ubox" bind:this={fileInput} on:change={loadSystemFile} style="display:none" />
          </div>
          <p class="muted accepts">Accepts an SSE v1 or v2 system file (.json) or a Universe Sandbox save (.ubox).</p>
        </section>

        <section class="block">
          <h3>Or build your own — click the HR diagram to add star(s)</h3>
          <div class="hr-wrap"><HRDiagram bind:selectedStars
            on:select={(e) => { if (selectedStars.length < 50) selectedStars = [...selectedStars, e.detail]; }}
            on:hover={(e) => (hovered = e.detail)} /></div>
          <div class="hr-readout">
            {#if hovered}
              <span class="ro-cls" style="color:{starColor(hovered)}">{hovered.category} ({hovered.spectralClass})</span>
              <span>{fmt(hovered.temperatureK, 0)} K</span>
              <span>{fmt(hovered.luminositySolar, hovered.luminositySolar < 10 ? 3 : 0)} L☉</span>
              <span>{fmt(massSolar(hovered), 2)} M☉</span>
              <span class="muted">— click to add</span>
            {:else}
              <span class="muted">Hover the diagram to read a point's temperature · luminosity · mass before adding.</span>
            {/if}
          </div>

          <div class="hierarchy">
            <div class="hier-title">System hierarchy <span class="muted">— tight pairs nest deepest; click the diagram to add stars</span></div>
            {#if selectedStars.length}
              {#if plan && plan.kind === 'pair'}<div class="diagram">{planString(plan)}</div>{/if}
              {#each planRows as row}
                {#if row.type === 'pair'}
                  <div class="pair-row" style="padding-left:{row.depth * 16}px">
                    <span class="pair-bracket">⌐</span><span class="pair-label">binary — {sepLabel(row.sepAU)}</span>
                  </div>
                {:else}
                  {@const st = statuses.get(row.seed.id)}
                  <div class="hier-row" style="padding-left:{row.depth * 16}px">
                    <span class="star-dot" style="background:{starColor(row.seed)}"></span>
                    <span class="role">{LETTERS[row.index] ?? '?'}</span>
                    <span class="star-edit">
                      <input class="se-num" class:bad={st?.tBad} type="number" min="0" title="Temperature (K)"
                             value={Math.round(row.seed.temperatureK)} on:change={(e) => setStarField(row.seed, 't', e.currentTarget.value)} /><span class="se-u">K</span>
                      <input class="se-num" class:bad={st?.lBad} type="number" min="0" step="any" title="Luminosity (Sol = 1)"
                             value={+row.seed.luminositySolar.toPrecision(3)} on:change={(e) => setStarField(row.seed, 'l', e.currentTarget.value)} /><span class="se-u">L☉</span>
                      <input class="se-num" class:bad={st?.mBad} type="number" min="0" step="any" title="Mass (Sol = 1)"
                             value={+massSolar(row.seed).toPrecision(3)} on:change={(e) => setStarField(row.seed, 'm', e.currentTarget.value)} /><span class="se-u">M☉</span>
                      <span class="se-cls" class:bad={st?.impossible}>{st?.impossible ? 'Exotic' : `${row.seed.spectralClass}-type`}</span>
                      {#if st?.anyBad}<button class="se-fix" title="Recompute the other figures (and type) to be physically consistent" on:click={() => fixStar(row.seed)}>Fix</button>{/if}
                    </span>
                    <button class="x" title="Remove" on:click={() => (selectedStars = selectedStars.filter((x) => x.id !== row.seed.id))}>×</button>
                  </div>
                {/if}
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
          <h3>Naming <span class="muted">— charts the system; rename anything afterwards</span></h3>
          <div class="seg">
            {#each [['catalogue', 'Catalogue', 'HD 184738 · GJ 412'], ['scientific', 'Scientific', 'Epsilon Eridani'], ['named', 'Named', 'Hogan’s Star']] as [val, label, eg]}
              <button class="seg-btn" class:on={naming === val} on:click={() => (naming = val)} title={`e.g. ${eg}`}>
                <span class="seg-label">{label}</span><span class="seg-eg">{eg}</span>
              </button>
            {/each}
          </div>
          <p class="note">Planets are numbered by their star; habitable worlds get a proper name on Scientific &amp; Named.</p>
        </section>

        <section class="block">
          <h3>System age: {ageGyr < 1 ? `${fmt(ageGyr * 1000, 0)} Myr` : `${fmt(ageGyr)} Gyr`}</h3>
          <!-- LOG age axis to the longest-lived star's death: a massive star can die before an M dwarf
               matures. value/on:input keep ageGyr canonical while the thumb moves in log space. -->
          <input type="range" min="0" max="1" step="0.001" class="slider"
            value={posOfAge(ageGyr)} on:input={(e) => (ageGyr = ageFromPos(+e.currentTarget.value))} />
          <div class="age-scale muted">
            <span>1 Myr</span>
            <span>runs to {maxDeathGyr < 1 ? `${fmt(maxDeathGyr * 1000, 0)} Myr` : `${fmt(maxDeathGyr, 0)} Gyr`}{longestLived ? ` — ${longestLived.spectralClass}-type's death` : ''}</span>
          </div>
          <!-- Per-star state at this age: what it is NOW, whether it has changed, flaring, lifespan. -->
          <div class="star-ages">
            {#each agedStars as a}
              <div class="star-age" class:dead={a.aged.isDead}>
                <span class="star-dot" style="background:{dotColorFor(a)}"></span>
                <span class="sa-now">{nowLabelFor(a)}</span>
                {#if a.changed}<span class="sa-from">(from {a.seed.spectralClass}-type)</span>{/if}
                {#if a.flaring}<span class="sa-flag flare">⚡ flaring</span>{/if}
                <span class="sa-life">{lifespanLabel(a.tMS)}</span>
                {#if isEngulfedAt(a.aged, 1)}<span class="warn">⚠ swollen past 1 AU</span>{/if}
              </div>
            {/each}
          </div>
        </section>

        <section class="block">
          <h3>Physical character</h3>
          {#each [['metallicity','Metallicity','metal-poor (icy/gassy)','metal-rich (rocky/iron)'],['diskMass','Disk mass','sparse','crowded'],['dynamicalHistory','Dynamical history','calm, circular','violent, eccentric'],['rarity','Rarity','common worlds','legendary exotica']] as [key, label, lo, hi]}
            <div class="knob">
              <div class="knob-head"><span>{label}</span><span class="knob-val">{Math.round((knobs[key] ?? 0.5) * 100)}%</span></div>
              <input type="range" min="0" max="1" step="0.01" bind:value={knobs[key]} class="slider" />
              <div class="knob-ends"><span>{lo}</span><span>{hi}</span></div>
            </div>
          {/each}
          <p class="note">Rarity picks how eccentric the worlds are (the loot-box tiers in the add-type picker); metallicity, disk mass &amp; dynamical history shape standard worlds. All stay physically plausible.</p>
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

{#if uboxBytes}
  <UboxImportModal
    bytes={uboxBytes}
    fileName={uboxFileName}
    {rulePack}
    on:close={() => (uboxBytes = null)}
    on:load={(e) => { uboxBytes = null; dispatch('generate', { system: e.detail.system }); }}
  />
{/if}

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 3vh 2vw; }
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
  .row.load-saved { margin-top: 8px; align-items: center; }
  .accepts { margin: 4px 0 0; font-size: 0.78em; }
  .row.load-saved .muted { font-size: 0.8em; color: var(--text-muted, #cfcfcf); }
  .ghost { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: transparent; color: var(--link); cursor: pointer; font-size: 0.85em; }
  .ghost:hover:not(:disabled) { background: var(--bg-control); border-color: var(--accent); }
  .ghost:disabled { opacity: 0.5; cursor: default; }
  select, .row select { flex: 1; padding: 8px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); }
  .presets { display: flex; flex-wrap: wrap; gap: 6px; }
  .preset { padding: 6px 12px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--link); cursor: pointer; font-size: 0.85em; }
  .preset:hover { background: var(--bg-control); border-color: var(--accent); }
  .seg { display: flex; gap: 6px; flex-wrap: wrap; }
  .seg-btn { flex: 1 1 0; min-width: 120px; display: flex; flex-direction: column; gap: 2px; padding: 7px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--bg-panel); color: var(--text); cursor: pointer; text-align: left; }
  .seg-btn:hover { border-color: var(--accent); }
  .seg-btn.on { border-color: var(--accent, #ff5a1f); background: color-mix(in srgb, var(--accent, #ff5a1f) 16%, var(--bg-panel)); }
  .seg-label { font-size: 0.85em; font-weight: 600; }
  .seg-eg { font-size: 0.72em; color: var(--text-faint, #8a8a8a); font-family: ui-monospace, monospace; }
  .hr-wrap { border: 1px solid var(--border); border-radius: 8px; overflow: hidden; min-height: 240px; }
  .muted { color: var(--text-faint, #8a8a8a); font-weight: 400; font-size: 0.85em; }
  .slider { width: 100%; }

  /* System hierarchy preview (built live as you click the HR diagram) */
  .hierarchy { margin-top: 10px; border: 1px solid var(--border); border-radius: 8px; padding: 8px 10px; background: var(--bg-panel, #14161c); }
  .hier-title { font-size: 0.78rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--text-muted, #cfcfcf); margin-bottom: 6px; }
  .hier-empty { font-size: 0.82em; color: var(--text-faint, #8a8a8a); font-style: italic; }
  .diagram { font-family: ui-monospace, monospace; font-size: 0.86em; color: var(--accent, #ff5a1f); margin-bottom: 6px; letter-spacing: 0.02em; }
  .pair-row { display: flex; align-items: center; gap: 6px; padding: 1px 0; font-size: 0.74em; color: var(--text-faint, #8a8a8a); text-transform: uppercase; letter-spacing: 0.04em; }
  .pair-bracket { color: var(--link); font-weight: 700; }
  .hier-row { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
  .star-dot { width: 12px; height: 12px; border-radius: 50%; flex: 0 0 auto; box-shadow: 0 0 6px rgba(255,255,255,0.25); }
  .role { font-size: 0.78em; font-weight: 700; color: var(--link); min-width: 84px; }
  .star-edit { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; flex: 1; font-size: 0.82em; }
  .se-num { width: 62px; background: var(--bg-control); border: 1px solid var(--border); color: var(--text); border-radius: 4px; padding: 2px 5px; font-size: 0.95em; }
  .se-num.bad { border-color: #cc5555; background: rgba(204, 85, 85, 0.12); color: #ff9a9a; }
  .se-u { color: var(--text-faint); margin-right: 4px; }
  .se-cls { color: var(--text-muted); margin-left: 2px; }
  .se-cls.bad { color: #cc5555; font-weight: 600; }
  .se-fix { background: var(--accent, #ff5a1f); border: none; color: #fff; border-radius: 4px; padding: 2px 8px; cursor: pointer; font-size: 0.95em; }
  .hier-row .x { background: none; border: none; color: var(--text-muted); cursor: pointer; font-size: 1.1em; line-height: 0.5; }
  .hier-row .x:hover { color: var(--accent, #ff5a1f); }

  /* HR hover readout */
  .hr-readout { display: flex; flex-wrap: wrap; gap: 12px; align-items: baseline; margin-top: 6px; font-size: 0.82em; color: var(--text-muted, #cfcfcf); font-variant-numeric: tabular-nums; min-height: 1.2em; }
  .ro-cls { font-weight: 700; }

  /* Age slider scale caption */
  .age-scale { display: flex; justify-content: space-between; font-size: 0.72em; margin-top: 2px; }

  /* Per-star age feedback on step 2 */
  .star-ages { display: flex; flex-direction: column; gap: 5px; margin-top: 8px; }
  .star-age { display: flex; align-items: center; gap: 8px; font-size: 0.82em; flex-wrap: wrap; }
  .star-age.dead { opacity: 0.85; }
  .sa-now { font-weight: 700; color: var(--accent); text-transform: capitalize; }
  .star-age.dead .sa-now { color: #8fc7ff; }
  .sa-from { color: var(--text-faint, #8a8a8a); font-style: italic; }
  .sa-flag.flare { color: #ffd24d; font-weight: 600; }
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
