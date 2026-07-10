<script lang="ts">
  // Unified Player View — preset EDITOR (design doc step 4 + §7). A separate modal off the picker:
  // the full look controls on the left, a LIVE holo preview on the right, driven by a draft copy of
  // the preset. Save writes the draft to the campaign. Controls are progressively disclosed by the
  // chosen view module (holo controls only for the 3D holo view). The existing catalogue is untouched.
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import { get } from 'svelte/store';
  import type { System } from '$lib/types';
  import type { PlayerPreset, ViewModule } from '$lib/player/presetTypes';
  import { holoStyleOf } from '$lib/player/presets';
  import { updatePreset } from '$lib/player/presetStore';
  import { systemStore } from '$lib/stores';
  import { fetchAndLoadRulePack } from '$lib/rulepack-loader';
  import HoloView from '$lib/holo/HoloView.svelte';
  import FilterParamControls from './FilterParamControls.svelte';
  import CoverView from './CoverView.svelte';
  import type { RulePack } from '$lib/types';

  let previewMode: 'system' | 'cover' = 'system';

  export let preset: PlayerPreset;

  const dispatch = createEventDispatcher();

  // Edit a DRAFT; commit on Save so Cancel is a clean discard.
  let draft: PlayerPreset = structuredClone(preset);
  $: holoStyle = holoStyleOf(draft);

  const FILTERS = [
    { id: 'none', label: 'No filter' },
    { id: 'crt', label: 'CRT Terminal' },
    { id: 'night_vision', label: 'Night Vision' },
    { id: 'thermal', label: 'Thermal' }
  ];

  // Preview system + rulepack. Prefer the currently-open system; else a bundled example so the preview
  // always has something rich to show.
  let previewSystem: System | null = get(systemStore);
  let rulePack: RulePack | null = null;
  let currentTime = 0;
  let previewTime = 0;
  let raf = 0;

  onMount(() => {
    (async () => {
      try { rulePack = await fetchAndLoadRulePack('/rulepacks/starter-sf/main.json'); } catch { /* preview still ok */ }
      if (!previewSystem && browser) {
        try {
          const r = await fetch('/examples/Sol_2030-System.json');
          if (r.ok) previewSystem = await r.json();
        } catch { /* no preview system */ }
      }
    })();
    // A gently advancing clock so the preview is alive (planets move, rings shear).
    currentTime = 0;
    let last = 0;
    const tick = (t: number) => {
      if (last) currentTime += (t - last) * 3600; // ~1s ≈ 1h
      last = t;
      previewTime = currentTime;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  function save() {
    updatePreset(draft);
    dispatch('saved', draft);
    dispatch('close');
  }

  $: isHolo = draft.systemView === 'holo3d';
</script>

<!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
<div class="modal-bg" on:click={() => dispatch('close')}>
  <!-- svelte-ignore a11y-click-events-have-key-events a11y-no-static-element-interactions -->
  <div class="modal" on:click|stopPropagation>
    <header>
      <h2>Edit preset — {draft.name}</h2>
      <div class="hbtns">
        <button on:click={() => dispatch('close')}>Cancel</button>
        <button class="primary" on:click={save}>Save</button>
      </div>
    </header>

    <div class="body">
      <div class="controls">
        <fieldset>
          <legend>Preset</legend>
          <label>Name <input type="text" bind:value={draft.name} /></label>
          <label>Description <input type="text" bind:value={draft.description} /></label>
          <label>System view
            <select bind:value={draft.systemView}>
              <option value="list">Text list</option>
              <option value="diagram2d">2D map</option>
              <option value="holo3d">3D holo</option>
            </select>
          </label>
          <label class="chk"><input type="checkbox" bind:checked={draft.followGM} /> Follows the GM</label>
          <label class="chk"><input type="checkbox" bind:checked={draft.interactive} /> Players can interact</label>
        </fieldset>

        <fieldset>
          <legend>Cover page</legend>
          <label class="chk"><input type="checkbox" bind:checked={draft.cover.enabled} /> Show a cover / hold screen</label>
          {#if draft.cover.enabled}
            <label>Title <input type="text" bind:value={draft.cover.title} placeholder="DON'T PANIC" /></label>
            <label>Subtitle <input type="text" bind:value={draft.cover.subtitle} /></label>
            <label>Body <input type="text" bind:value={draft.cover.body} /></label>
            <label>Label / stamp <input type="text" bind:value={draft.cover.label} placeholder="CONFIDENTIAL" /></label>
            <label>Company / footer <input type="text" bind:value={draft.companyName} /></label>
          {/if}
        </fieldset>

        <fieldset>
          <legend>Look</legend>
          <label>Filter
            <select bind:value={draft.filter}>{#each FILTERS as f}<option value={f.id}>{f.label}</option>{/each}</select>
          </label>
          {#if draft.filter !== 'none'}
            <div class="filter-params">
              <FilterParamControls filterId={draft.filter} values={draft.filterParams}
                on:change={(e) => (draft = { ...draft, filterParams: e.detail })} />
            </div>
          {/if}
          <label>Colour
            <select bind:value={draft.bodyStyle}>
              <option value="textured">True colour</option>
              <option value="flat">Flat colour</option>
              <option value="white">White</option>
            </select>
          </label>
          {#if isHolo}
            <label>Render
              <select bind:value={draft.render}>
                <option value="filled">Filled</option>
                <option value="wire-glow">Wireframe (glow)</option>
                <option value="wire-flat">Wireframe (flat)</option>
              </select>
            </label>
            <label>Grid
              <select bind:value={draft.grid}>
                <option value="off">Off</option>
                <option value="plain">Grid</option>
                <option value="scaled">Grid + scale</option>
              </select>
            </label>
            <label>Spread <span>{Math.round(draft.compression * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.compression} /></label>
            <label>Body size <span>{draft.bodySize === 0 ? 'true' : draft.bodySize >= 1 ? 'readable' : Math.round(draft.bodySize * 100) + '%'}</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.bodySize} /></label>
            <label>View angle <span>{Math.round(draft.angleDeg)}°</span><input type="range" min="0" max="80" step="1" bind:value={draft.angleDeg} disabled={draft.lockOverhead} /></label>
            <label class="chk"><input type="checkbox" bind:checked={draft.lockOverhead} /> Lock overhead (2D look)</label>
            <label>Belt detail <span>{Math.round(draft.beltDetail * 100)}%</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.beltDetail} /></label>
            <label>View orbit <span>{draft.orbitSpeed === 0 ? 'off' : Math.round(draft.orbitSpeed * 100) + '%'}</span><input type="range" min="0" max="1" step="0.05" bind:value={draft.orbitSpeed} /></label>
            <label>Label size <span>{draft.labelSize}px</span><input type="range" min="8" max="24" step="1" bind:value={draft.labelSize} /></label>
            <label class="chk"><input type="checkbox" bind:checked={draft.whole} /> Frame whole system</label>
            <label class="chk"><input type="checkbox" bind:checked={draft.skybox} /> Starfield</label>
          {:else}
            <p class="hint">3D look controls appear when the system view is set to 3D holo.</p>
          {/if}
          <label>Background
            <select bind:value={draft.background}>
              <option value="space">Space</option>
              <option value="green">Greenscreen</option>
              <option value="blue">Bluescreen</option>
              <option value="black">Black</option>
            </select>
          </label>
          <label>Accent <input type="color" bind:value={draft.accentColor} /></label>
        </fieldset>
      </div>

      <div class="preview-col">
        <div class="preview-tabs">
          <button class:on={previewMode === 'system'} on:click={() => (previewMode = 'system')}>System view</button>
          <button class:on={previewMode === 'cover'} on:click={() => (previewMode = 'cover')} disabled={!draft.cover.enabled} title={draft.cover.enabled ? '' : 'Enable the cover page first'}>Cover</button>
        </div>
        <div class="preview">
          {#if previewMode === 'cover' && draft.cover.enabled}
            <CoverView cover={draft.cover} accentColor={draft.accentColor} font={draft.font} companyName={draft.companyName} footerText={draft.footerText} assets={[]} />
          {:else if isHolo && previewSystem && rulePack}
            <HoloView system={previewSystem} currentTime={previewTime} style={holoStyle} />
          {:else if isHolo}
            <div class="ph">Loading preview…</div>
          {:else}
            <div class="ph">Live preview is available for the 3D holo view. Other view modules render in the player window.</div>
          {/if}
        </div>
      </div>
    </div>
  </div>
</div>

<style>
  .modal-bg { position: fixed; inset: 0; background: rgba(0,0,0,0.72); display: flex; justify-content: center; align-items: center; z-index: 2100; }
  .modal { background: var(--bg-panel); color: var(--text); border-radius: 8px; width: 1040px; max-width: 97vw; height: 88vh; max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 1rem; padding: 0.9rem 1.2rem; border-bottom: 1px solid var(--border); }
  header h2 { margin: 0; font-size: 1.05rem; }
  .hbtns { display: flex; gap: 0.5rem; }
  .body { display: grid; grid-template-columns: 320px 1fr; min-height: 0; flex: 1; }
  .controls { overflow-y: auto; padding: 0.9rem 1rem; display: flex; flex-direction: column; gap: 1rem; border-right: 1px solid var(--border); }
  fieldset { border: 1px solid var(--border); border-radius: 6px; padding: 0.6rem 0.8rem 0.8rem; display: flex; flex-direction: column; gap: 0.5rem; margin: 0; }
  legend { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.06em; color: var(--text-muted); padding: 0 4px; }
  label { display: flex; flex-direction: column; gap: 3px; font-size: 0.75rem; color: var(--text-muted); }
  label span { color: var(--text); font-size: 0.72rem; }
  label.inline, label.chk { flex-direction: row; align-items: center; gap: 8px; font-size: 0.8rem; color: var(--text); }
  input[type=text], select { background: var(--bg-control); color: var(--text); border: 1px solid var(--border); border-radius: 4px; padding: 5px 7px; font: inherit; }
  input[type=range] { width: 100%; accent-color: var(--accent, #6aa0ff); }
  .hint { font-size: 0.72rem; color: var(--text-muted); font-style: italic; margin: 0; }
  .filter-params { border-left: 2px solid var(--border); padding-left: 8px; margin: 2px 0; }
  .preview-col { display: flex; flex-direction: column; min-height: 0; }
  .preview-tabs { display: flex; gap: 4px; padding: 6px 8px; border-bottom: 1px solid var(--border); background: var(--bg-panel); }
  .preview-tabs button { font-size: 0.72rem; padding: 3px 10px; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text-muted); cursor: pointer; }
  .preview-tabs button.on { color: var(--text); border-color: var(--accent); }
  .preview-tabs button:disabled { opacity: 0.4; cursor: not-allowed; }
  .preview { position: relative; background: #05070c; min-height: 0; flex: 1; }
  .ph { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; text-align: center; padding: 2rem; color: var(--text-muted); font-size: 0.85rem; }
  button { padding: 7px 15px; cursor: pointer; border-radius: 4px; border: 1px solid var(--border); background: var(--bg-control); color: var(--text); font: inherit; }
  button.primary { background: var(--accent); border-color: var(--accent); }
</style>
