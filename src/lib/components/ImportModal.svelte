<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { RulePack, System } from '$lib/types';
  import { systemProcessor } from '$lib/core/SystemProcessor';
  import { fixUpImportedSystem } from '$lib/system/importFixup';
  import { reviewToText, type ImportReview } from '$lib/import/shared/review';
  import type { ImportAdapter, ImportResultLike } from '$lib/import/adapters';
  import { foreground } from '$lib/ui/foreground';
  import GenerationDials, { DEFAULT_KNOBS } from './GenerationDials.svelte';
  import { infillSystem, type InfillResult } from '$lib/generation/infill';
  import { guessSystemAge, type AgeGuess } from '$lib/physics/systemAge';
  import type { GenerationKnobs } from '$lib/generation/generateFromConfig';
  import type { CelestialBody } from '$lib/types';

  export let bytes: Uint8Array;
  export let fileName = '';
  export let rulePack: RulePack;
  export let source: ImportAdapter;   // the format adapter (Universe Sandbox / SpaceEngine / …)

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  type Phase = 'preview' | 'importing' | 'review' | 'error';
  let phase: Phase = 'preview';
  let errorMsg = '';

  let sims: { name: string }[] = [];
  let subtitle = '';
  let selectedSim = 0;
  let bodies: { name: string; mass: number }[] = [];
  let previewNote = '';

  // mass slider (log scale). logThreshold in log10(kg); bodies with mass >= threshold are imported.
  let logThreshold = Math.log10(source.recommendedMinMass);
  let logMin = 15, logMax = 30;
  $: threshold = Math.pow(10, logThreshold);
  // The endpoint thresholds are derived from a body's own mass via log10→pow10, whose round-trip lands a
  // hair off; a tiny relative tolerance keeps the boundary body counted (fixes an off-by-one at the ends).
  $: effectiveThreshold = threshold * (1 - 1e-9);
  $: includedCount = bodies.filter((b) => b.mass >= effectiveThreshold).length;
  $: totalBodies = bodies.length;
  $: heavyImport = includedCount > 150;

  let review: ImportReview | null = null;
  let processedSystem: System | null = null;
  let systemName = '';
  let copied = false;

  // ---- INFILL: always offered after an import (owner, G32), same dials as the wizard ----
  // The raw imported system BEFORE processing is kept so infill can add to it and re-process; the
  // processed one is what the review and the Load button use.
  let rawSystem: System | null = null;
  let infillOn = false;
  let infillKnobs: GenerationKnobs = { ...DEFAULT_KNOBS };
  let ageGuess: AgeGuess | undefined;
  let chosenAgeGyr: number | undefined;
  let infillResult: InfillResult | null = null;
  let infillBusy = false;
  $: importedPlanets = processedSystem ? processedSystem.nodes.filter((n: any) => n.roleHint === 'planet' && !(n.tags ?? []).some((t: any) => t.key === 'origin/generated')).length : 0;
  $: hasStar = !!processedSystem?.nodes.some((n: any) => n.roleHint === 'star' && (n.massKg ?? 0) > 0);

  function primeInfill(sys: System) {
    const stars = sys.nodes.filter((n: any) => n.roleHint === 'star' && (n.massKg ?? 0) > 0) as CelestialBody[];
    const primary = stars.sort((a, b) => (b.massKg ?? 0) - (a.massKg ?? 0))[0];
    ageGuess = guessSystemAge(primary ? { massKg: primary.massKg, temperatureK: primary.temperatureK, classes: primary.classes, statedAgeGyr: sys.ageEstimated ? null : sys.age_Gyr } : null);
    chosenAgeGyr = sys.age_Gyr;
    // Default ON when the import is sparse (fewer than three planets round the primary), OFF when it
    // already carries a system — a 34-body Universe Sandbox scene does not want three more worlds.
    const planets = sys.nodes.filter((n: any) => n.roleHint === 'planet').length;
    infillOn = planets < 3;
    infillResult = null;
  }

  async function applyInfill() {
    if (!rawSystem) return;
    infillBusy = true;
    await new Promise((r) => setTimeout(r, 20));
    try {
      // Start from a fresh copy of the raw import each time so re-running with new dials does not
      // stack generated worlds on top of the last run's.
      const base = JSON.parse(JSON.stringify(rawSystem)) as System;
      base.age_Gyr = chosenAgeGyr ?? base.age_Gyr;
      base.ageEstimated = ageGuess?.estimated && chosenAgeGyr === ageGuess.ageGyr;
      const fixed = fixUpImportedSystem(base, rulePack);
      infillResult = infillOn ? infillSystem(fixed, rulePack, { knobs: infillKnobs, ageGyr: base.age_Gyr }) : null;
      let sys = systemProcessor.process(fixed, rulePack) as System;
      for (let i = 0; i < 6; i++) sys = systemProcessor.process(sys, rulePack) as System;
      // Stamp the pack that actually processed this import, so a SAVED file carries it - the
      // converters write '' and the load-side gate should be the backstop, not the source of
      // truth (inbox D26; the owner: 'we are managing to export bad files').
      if (!sys.rulePackId) { sys.rulePackId = (rulePack as any)?.id ?? ''; (sys as any).rulePackVersion = (sys as any).rulePackVersion || (rulePack as any)?.version || ''; }
      processedSystem = sys;
      review = source.buildReview(sys, { assumptions: (rawSystem as any).__assumptions ?? [], skipped: (rawSystem as any).__skipped ?? [] } as any);
    } catch (e) { fail(e); }
    finally { infillBusy = false; }
  }

  onMount(() => {
    try {
      sims = source.systems(bytes);
      subtitle = source.subtitle(bytes);
      loadPreview(0);
    } catch (e) { fail(e); }
  });

  function loadPreview(idx: number) {
    try {
      selectedSim = idx;
      const p = source.preview(bytes, idx);
      bodies = p.bodies;
      previewNote = p.note ?? '';
      if (bodies.length) {
        logMin = Math.log10(bodies[bodies.length - 1].mass);
        logMax = Math.log10(bodies[0].mass);
        logThreshold = Math.min(logMax, Math.max(logMin, Math.log10(source.recommendedMinMass)));
      }
      phase = 'preview';
    } catch (e) { fail(e); }
  }

  function fail(e: unknown) {
    errorMsg = (e as Error)?.message ?? String(e);
    phase = 'error';
  }

  async function runImport() {
    phase = 'importing';
    await new Promise((r) => setTimeout(r, 20)); // let the "importing" state paint
    try {
      const result: ImportResultLike = source.convert(bytes, selectedSim, effectiveThreshold);
      // Keep the RAW import so the infill step can add to it and re-process; stash the review inputs on it.
      rawSystem = JSON.parse(JSON.stringify(result.system));
      (rawSystem as any).__assumptions = result.assumptions; (rawSystem as any).__skipped = result.skipped;
      // Process to convergence: a fresh ocean world settles its greenhouse over a few passes.
      let sys = systemProcessor.process(fixUpImportedSystem(result.system, rulePack), rulePack) as System;
      const maxT = (s: System) => Math.max(0, ...s.nodes.map((n: any) => n.temperatureK ?? 0));
      let prev = maxT(sys);
      for (let i = 0; i < 8; i++) {
        sys = systemProcessor.process(sys, rulePack) as System;
        const now = maxT(sys);
        if (Math.abs(now - prev) < 0.1) break;
        prev = now;
      }
      // Stamp the pack that actually processed this import, so a SAVED file carries it - the
      // converters write '' and the load-side gate should be the backstop, not the source of
      // truth (inbox D26; the owner: 'we are managing to export bad files').
      if (!sys.rulePackId) { sys.rulePackId = (rulePack as any)?.id ?? ''; (sys as any).rulePackVersion = (sys as any).rulePackVersion || (rulePack as any)?.version || ''; }
      processedSystem = sys;
      systemName = result.system.name;
      review = source.buildReview(sys, result);
      primeInfill(sys);
      phase = 'review';
    } catch (e) { fail(e); }
  }

  async function copyReview() {
    if (!review) return;
    const text = reviewToText(review, { title: systemName || fileName, ageGyr: processedSystem?.age_Gyr });
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); copied = true; setTimeout(() => (copied = false), 2000); } catch { /* give up quietly */ }
      ta.remove();
    }
  }

  function loadSystem() { if (processedSystem) dispatch('load', { system: processedSystem }); }

  // Always show Earth masses (the natural unit for the slider), with kg alongside.
  const fmtMass = (kg: number) => {
    const me = kg / 5.972e24;
    const meStr = me >= 10 ? me.toFixed(0) : me >= 0.01 ? me.toFixed(2) : me >= 1e-4 ? me.toFixed(4) : me.toExponential(1);
    return `${meStr} M⊕ (${kg.toExponential(1)} kg)`;
  };
  const bucketLabel = { aligned: 'aligned', explained: 'explained', unexplained: 'needs a look' } as const;
</script>

<div class="overlay" on:click|self={close} role="presentation" use:foreground>
  <div class="modal" role="dialog" aria-label="Import a system">
    <header>
      <div>
        <h2>Import from {source.label}</h2>
        <p class="sub">{fileName}{subtitle ? ` · ${subtitle}` : ''}</p>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>

    <div class="content">
      {#if phase === 'error'}
        <div class="err">
          <strong>Could not import this file.</strong>
          <p>{errorMsg}</p>
        </div>

      {:else if phase === 'importing'}
        <div class="busy">
          <div class="spinner"></div>
          <p>Converting {includedCount} bodies and deriving the physics…</p>
        </div>

      {:else if phase === 'preview'}
        {#if sims.length > 1}
          <section class="block">
            <h3>System</h3>
            <select on:change={(e) => loadPreview((e.target as HTMLSelectElement).selectedIndex)}>
              {#each sims as s, i}<option value={i} selected={i === selectedSim}>{s.name}</option>{/each}
            </select>
          </section>
        {/if}

        <section class="block">
          <h3>What to bring in</h3>
          <p class="muted">
            This file can hold many small bodies. Drag toward the smaller masses to include more of them —
            your browser does the work, so it's your call.
          </p>
          <div class="slider-row">
            <span class="end">All bodies</span>
            <input type="range" min={logMin} max={logMax} step="0.01" bind:value={logThreshold} />
            <span class="end">Largest only</span>
          </div>
          <div class="readout">
            <strong>{includedCount}</strong> of {totalBodies} bodies
            <span class="muted">· cutoff ≥ {fmtMass(threshold)}</span>
            {#if previewNote}<span class="muted">· {previewNote}</span>{/if}
          </div>
          {#if heavyImport}
            <p class="warn">Importing {includedCount} bodies — large systems can be slow to render and edit in the browser.</p>
          {/if}
        </section>

        <section class="block hint">
          <p class="muted">
            Only the essentials come across (mass, radius, orbit, composition). SSG derives temperature,
            climate, classification, geology and habitability itself — and afterwards shows you a review of
            anything it derived differently from {source.label}, so you can check what looks off.
          </p>
        </section>

      {:else if phase === 'review' && review}
        <section class="block">
          <h3>Imported</h3>
          <div class="counts">
            <span>{review.counts.stars} star(s)</span>
            <span>{review.counts.planets} planet(s)</span>
            <span>{review.counts.moons} moon(s)</span>
            {#if review.counts.other}<span>{review.counts.other} barycentre(s)</span>{/if}
            {#if review.counts.rings}<span>{review.counts.rings} ring(s)</span>{/if}
            {#if processedSystem}<span class="muted">age {processedSystem.age_Gyr} Gyr</span>{/if}
          </div>
        </section>

        <section class="block infill">
          <div class="audit-head">
            <h3>Fill out the system</h3>
            <label class="toggle"><input type="checkbox" bind:checked={infillOn} disabled={!hasStar} /> {infillOn ? 'On' : 'Off'}</label>
          </div>
          {#if !hasStar}
            <p class="muted">No star was found in this import, so there is nothing to generate around. Load it as-is and add a star, or check the source file.</p>
          {:else}
            <p class="muted">Add plausible worlds around the star{processedSystem && processedSystem.nodes.filter((n) => (n as any).roleHint === 'star').length > 1 ? 's' : ''} where the import left gaps. Imported worlds are never moved or changed — a generated world that would crowd one is dropped, not the import. {importedPlanets >= 3 ? 'This import already carries a system, so this starts off.' : 'This import is sparse, so this starts on.'} Same dials as creating from a star.</p>
            <GenerationDials bind:knobs={infillKnobs} bind:ageGyr={chosenAgeGyr} age={ageGuess} {rulePack} showPhysicsLink={false} />
            <div class="infill-actions">
              <button class="ghost small" disabled={infillBusy} on:click={applyInfill}>{infillBusy ? 'Working…' : infillResult ? 'Re-run with these settings' : (infillOn ? 'Fill out' : 'Apply age only')}</button>
              {#if infillResult}
                <span class="muted">{infillResult.noStar ? 'No star to seed from.' : `Added ${infillResult.addedPlanets} planet(s), ${infillResult.addedMoons} moon(s); ${infillResult.droppedNearAnchors} dropped for crowding an imported world.`}</span>
              {/if}
            </div>
            <p class="note">The age is a guess from the star unless the file stated one — the slider runs over what this star's own life allows. Imported worlds keep their current state; only generated worlds are born into the chosen era. Skip this and Load to bring the import in exactly as it is.</p>
          {/if}
        </section>

        {#if review.assumptions.length}
          <section class="block">
            <h3>Assumptions</h3>
            <ul class="notes">{#each review.assumptions as a}<li>{a}</li>{/each}</ul>
          </section>
        {/if}

        {#if review.skipped.length}
          <section class="block">
            <h3>Skipped</h3>
            <ul class="notes">{#each review.skipped as s}<li><span class="tag">{s.reason}</span> {s.count}{#if s.examples.length} — <span class="muted">{s.examples.join(', ')}</span>{/if}</li>{/each}</ul>
          </section>
        {/if}

        <section class="block">
          <div class="audit-head">
            <h3>Diff vs {source.label}</h3>
            <button class="ghost small" on:click={copyReview}>{copied ? 'Copied ✓' : 'Copy for review'}</button>
          </div>
          <p class="muted">SSG derives its own physics — "explained" differences are expected. Anything marked <em>needs a look</em> is worth investigating.</p>
          <div class="table">
            {#each [...review.comparisons].sort((a, b) => (a.bucket === 'unexplained' ? -1 : b.bucket === 'unexplained' ? 1 : a.bucket === 'explained' ? -1 : 1)) as r}
              <div class="trow {r.bucket}" class:has-note={!!r.note} title={r.note ?? ''}>
                <span class="dot"></span>
                <span class="body">{r.body}</span>
                <span class="metric muted">{r.metric}</span>
                <span class="vals">{r.us} → {r.ssg}</span>
                <span class="bk">{r.reason ?? bucketLabel[r.bucket]}</span>
              </div>
            {/each}
          </div>
        </section>
      {/if}
    </div>

    <footer>
      {#if phase === 'preview'}
        <button class="ghost" on:click={close}>Cancel</button>
        <button class="primary" disabled={!bodies.length || includedCount === 0} on:click={runImport}>Import {includedCount} bodies</button>
      {:else if phase === 'review'}
        <button class="ghost" on:click={() => (phase = 'preview')}>Adjust selection</button>
        <button class="primary" on:click={loadSystem}>Load system</button>
      {:else if phase === 'error'}
        <button class="ghost" on:click={close}>Close</button>
      {/if}
    </footer>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 3000; }
  .modal { background: var(--bg-panel, #1a1d24); color: var(--text, #e6e6e6); border: 1px solid var(--border, #333); border-radius: 8px; width: min(680px, 94vw); max-height: 90vh; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: flex-start; padding: 16px 18px 12px; border-bottom: 1px solid var(--border, #333); }
  h2 { margin: 0; font-size: 1.15em; }
  .sub { margin: 4px 0 0; font-size: 0.82em; color: var(--text-muted, #9aa); }
  .close { background: none; border: none; color: var(--text-muted, #9aa); font-size: 1.5em; line-height: 1; cursor: pointer; }
  .content { padding: 14px 18px; overflow-y: auto; }
  .block { margin-bottom: 16px; }
  .block.hint { margin-bottom: 4px; }
  h3 { margin: 0 0 8px; font-size: 0.82em; text-transform: uppercase; letter-spacing: 0.04em; color: var(--link, #6aa0d8); }
  .muted { color: var(--text-muted, #9aa); font-size: 0.85em; }
  select { width: 100%; padding: 8px; background: var(--bg-control, #23262e); color: var(--text); border: 1px solid var(--border, #333); border-radius: 4px; }
  .slider-row { display: flex; align-items: center; gap: 10px; margin: 10px 0 6px; }
  .slider-row input[type=range] { flex: 1; }
  .end { font-size: 0.75em; color: var(--text-faint, #778); white-space: nowrap; }
  .readout { font-size: 0.9em; }
  .warn { color: var(--warning, #e08a4a); font-size: 0.85em; margin: 8px 0 0; }
  .counts { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 0.95em; }
  .notes { margin: 0; padding-left: 18px; font-size: 0.85em; color: var(--text-muted, #9aa); line-height: 1.5; }
  .tag { font-size: 0.7em; text-transform: uppercase; letter-spacing: 0.03em; border: 1px solid var(--border, #333); border-radius: 3px; padding: 0 4px; color: var(--text-faint, #778); }
  .audit-head { display: flex; justify-content: space-between; align-items: center; }
  .table { display: flex; flex-direction: column; gap: 2px; margin-top: 8px; }
  .trow { display: grid; grid-template-columns: 12px 1fr 1.1fr 1.4fr auto; gap: 8px; align-items: center; padding: 5px 8px; border-radius: 4px; font-size: 0.85em; background: var(--bg-control, #23262e); }
  .trow .dot { width: 8px; height: 8px; border-radius: 50%; }
  .trow.aligned .dot { background: var(--ok, #5aa469); }
  .trow.explained .dot { background: var(--warning, #e08a4a); }
  .trow.unexplained .dot { background: var(--danger, #d5564f); }
  .trow.unexplained { outline: 1px solid var(--danger, #d5564f); }
  .vals { font-variant-numeric: tabular-nums; }
  .bk { font-size: 0.78em; color: var(--text-faint, #778); white-space: nowrap; }
  .trow.has-note { cursor: help; }
  .trow.explained .bk { color: var(--warning, #e08a4a); border-bottom: 1px dotted currentColor; }
  .trow.unexplained .bk { color: var(--danger, #d5564f); font-weight: 600; }
  footer { display: flex; justify-content: flex-end; gap: 10px; padding: 12px 18px; border-top: 1px solid var(--border, #333); }
  button.primary { background: var(--accent, #ff5a1f); color: #fff; border: none; padding: 8px 16px; border-radius: 5px; cursor: pointer; font-weight: 600; }
  button.primary:disabled { opacity: 0.5; cursor: not-allowed; }
  button.ghost { background: none; border: 1px solid var(--border, #333); color: var(--text); padding: 8px 14px; border-radius: 5px; cursor: pointer; }
  button.ghost.small { padding: 4px 10px; font-size: 0.8em; }
  .err { color: var(--danger, #d5564f); }
  .err p { color: var(--text-muted, #9aa); }
  .busy { display: flex; flex-direction: column; align-items: center; gap: 14px; padding: 30px; }
  .spinner { width: 28px; height: 28px; border: 3px solid var(--border, #333); border-top-color: var(--accent, #ff5a1f); border-radius: 50%; animation: spin 0.8s linear infinite; }
  @keyframes spin { to { transform: rotate(360deg); } }
  .infill .toggle { font-size: 0.85em; display: flex; align-items: center; gap: 6px; cursor: pointer; }
  .infill-actions { display: flex; align-items: center; gap: 10px; margin: 6px 0 4px; font-size: 0.8em; }
  .infill .note { font-size: 0.74em; color: var(--text-faint); margin: 4px 0 0; }
</style>
