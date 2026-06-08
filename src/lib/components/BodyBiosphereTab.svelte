<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';

  export let body: CelestialBody;
  export let rulePack: RulePack;

  const dispatch = createEventDispatcher();

  const complexities = ['none', 'simple', 'complex', 'sapient'];
  const biochemistries = ['water-carbon', 'ammonia-silicon', 'methane-carbon'];
  const energySources = ['photosynthesis', 'chemosynthesis', 'thermosynthesis'];
  const morphologies = ['microbial', 'fungal', 'flora', 'fauna'];

  let currentMorphologies: string[] = body.biosphere?.morphologies || [];
  
  let habitabilityTier = 'None';
  let tierColor = 'var(--tier-none)';

  // Habitability is computed authoritatively by the processor and read from body.habitabilityBreakdown
  // (see the reactive `bd` below) — no local recompute, so the bars, modifiers and headline agree.

  function getTierColor(tier: string) {
      switch (tier) {
          case 'earth-like': return 'var(--tier-earthlike)';
          case 'human': return 'var(--tier-human)';
          case 'alien': return 'var(--tier-alien)';
          default: return 'var(--tier-none)';
      }
  }

  $: tierTag = body.tags?.find(t => t.key.startsWith('habitability/'))?.key.split('/')[1] || 'none';
  $: habitabilityTier = tierTag.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '); // Title Case
  $: tierColor = getTierColor(tierTag);
  // The AUTHORITATIVE breakdown from the processor (one calc — not the old local recompute).
  $: bd = body.habitabilityBreakdown;

  function toggleBiosphere() {
      if (!body.biosphere || body.biosphere.complexity === 'none') {
          body.biosphere = { 
              complexity: 'simple',
              coverage: 0.1,
              biochemistry: 'water-carbon',
              energy_source: 'photosynthesis',
              morphologies: ['microbial']
          };
      } else {
          body.biosphere = undefined;
      }
      dispatch('update');
  }

  function toggleMorphology(morph: string) {
      if (!body.biosphere) return;
      if (body.biosphere.morphologies.includes(morph)) {
          body.biosphere.morphologies = body.biosphere.morphologies.filter(m => m !== morph);
      } else {
          body.biosphere.morphologies = [...body.biosphere.morphologies, morph];
      }
      currentMorphologies = body.biosphere.morphologies;
      dispatch('update');
  }

  function handleUpdate() {
      dispatch('update');
  }
</script>

<div class="tab-panel">
    <div class="habitability-section">
        <div class="total-score-header">
            <h4>Habitability Score</h4>
            <span class="tier-badge" style="background-color: {tierColor}">{habitabilityTier} ({body.habitabilityScore?.toFixed(0) || 0}%)</span>
        </div>
        
        <div class="total-progress-bar-bg">
            <div class="threshold" style="left: 40%" title="Alien Habitable (40%)"></div>
            <div class="threshold" style="left: 60%" title="Human Habitable (60%)"></div>
            <div class="threshold" style="left: 90%" title="Earth-like (90%)"></div>
            <div class="progress-bar-fill" style="width: {body.habitabilityScore || 0}%; background-color: {tierColor}"></div>
        </div>

        <div class="score-breakdown">
            {#if bd}
                {#each bd.factors as factor}
                    <div class="score-row">
                        <div class="score-header">
                            <span class="label">{factor.label}</span>
                            <span class="score-val">{factor.points}/{factor.max}</span>
                        </div>
                        <div class="score-details">
                            <span class="current">{factor.value}</span>
                            {#if factor.ideal}<span class="ideal">(Target: {factor.ideal})</span>{/if}
                        </div>
                        <div class="progress-bar-bg">
                            <div class="progress-bar-fill" style="width: {Math.min(100, (factor.points / factor.max) * 100)}%"></div>
                        </div>
                    </div>
                {/each}
                <div class="subtotal-row"><span>Surface subtotal</span><span>{bd.surfaceScore} / 100</span></div>
                {#if bd.modifiers.length}
                    <div class="modifiers">
                        <div class="mod-title">Long-term modifiers — geology &amp; magnetism</div>
                        {#each bd.modifiers as m}
                            <div class="mod-row" class:neg={m.delta < 0} class:pos={m.delta > 0}>
                                <span>{m.label}</span><span class="mod-delta">{m.delta > 0 ? '+' : ''}{m.delta}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
                <div class="final-row"><span>Final habitability</span><span>{bd.finalScore}%</span></div>
            {:else}
                <p class="no-bd">No habitability breakdown (re-process the system to compute it).</p>
            {/if}
        </div>
    </div>

    <hr />

    <div class="form-group checkbox-row">
        <input type="checkbox" id="hasBio" checked={body.biosphere && body.biosphere.complexity !== 'none'} on:change={toggleBiosphere} />
        <label for="hasBio">Has Evolved Biosphere</label>
    </div>

    {#if body.biosphere && body.biosphere.complexity !== 'none'}
        <hr />
        <h4>Biosphere Details</h4>

        <div class="form-group">
            <label>Complexity</label>
            <select bind:value={body.biosphere.complexity} on:change={handleUpdate}>
                {#each complexities as comp}
                    <option value={comp}>{comp}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Biochemistry</label>
            <select bind:value={body.biosphere.biochemistry} on:change={handleUpdate}>
                {#each biochemistries as bio}
                    <option value={bio}>{bio}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <label>Energy Source</label>
            <select bind:value={body.biosphere.energy_source} on:change={handleUpdate}>
                {#each energySources as energy}
                    <option value={energy}>{energy}</option>
                {/each}
            </select>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Coverage ({Math.round(body.biosphere.coverage * 100)}%)</label>
                <input type="number" min="0" max="100" step="1" value={Math.round(body.biosphere.coverage * 100)} on:input={(e) => { body.biosphere.coverage = e.currentTarget.value / 100; handleUpdate(); }} style="width: 60px;" />
            </div>
            <input 
                type="range" 
                min="0" 
                max="1" 
                step="0.01" 
                bind:value={body.biosphere.coverage} 
                on:input={handleUpdate} 
                class="full-width-slider" 
            />
        </div>

        <div class="form-group">
            <label>Morphologies</label>
            <div class="morphology-checkboxes">
                {#each morphologies as morph}
                    <label class="checkbox-label">
                        <input type="checkbox" checked={currentMorphologies.includes(morph)} on:change={() => toggleMorphology(morph)} />
                        {morph.charAt(0).toUpperCase() + morph.slice(1)}
                    </label>
                {/each}
            </div>
        </div>
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: var(--text-muted); font-size: 0.9em; }
  input, select { padding: 8px; border-radius: 4px; border: 1px solid var(--border); background-color: var(--bg-control); color: var(--text); }

  .full-width-slider { width: 100%; margin: 0; }

  .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
  }
  .checkbox-row label { margin: 0; }
  
  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }
  h4 { margin: 0; color: var(--link); font-size: 0.9em; text-transform: uppercase; }

  .habitability-section {
      background-color: var(--bg-panel);
      border-radius: 4px;
  }
  
  .score-breakdown {
      display: flex;
      flex-direction: column;
      gap: 8px;
      margin-top: 10px;
  }
  
  .total-score-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px; }
  .tier-badge { font-size: 0.9em; font-weight: bold; color: white; padding: 2px 8px; border-radius: 10px; }
  
  .total-progress-bar-bg {
      height: 10px;
      background-color: var(--bg-panel);
      border-radius: 5px;
      position: relative;
      margin-bottom: 15px;
      overflow: hidden;
  }
  .threshold {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 2px;
      background-color: rgba(255,255,255,0.3);
      z-index: 1;
  }

  .score-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
  }
  
  .score-header {
      display: flex;
      justify-content: space-between;
      font-size: 0.9em;
      font-weight: bold;
      color: #ddd;
  }
  
  .score-details {
      display: flex;
      justify-content: space-between;
      font-size: 0.8em;
      color: var(--text-muted);
  }

  .progress-bar-bg {
      height: 4px;
      background-color: var(--bg-control);
      border-radius: 2px;
      overflow: hidden;
  }
  
  .progress-bar-fill {
      height: 100%;
      background-color: var(--tier-earthlike);
  }

  .morphology-checkboxes {
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
  }
  .checkbox-label {
      display: flex;
      align-items: center;
      gap: 5px;
      color: var(--text);
      font-size: 0.9em;
      cursor: pointer;
  }
  .checkbox-label input[type="checkbox"] { width: auto; margin: 0; }
</style>
