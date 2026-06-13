<script lang="ts">
  // Pop-up sliders for the Monochrome Terminal CRT effect (mirrors the Mappadux retro_sci_fi
  // filter's controls, grouped). Bound live to the crtControls store.
  import { crtControls, resetCrtControls, CRT_PARAM_DEFS, type CrtControls } from '$lib/catalogue/crtControls';
  import { createEventDispatcher } from 'svelte';
  const dispatch = createEventDispatcher();

  const GROUPS = ['Display', 'CRT', 'Distortion', 'Signal'] as const;
  function defsFor(g: string) { return CRT_PARAM_DEFS.filter((d) => d.group === g); }
  function setNum(id: keyof CrtControls, v: string) {
    crtControls.update((c) => ({ ...c, [id]: parseFloat(v) }));
  }
  function setBool(id: keyof CrtControls, v: boolean) {
    crtControls.update((c) => ({ ...c, [id]: v }));
  }
</script>

<div class="crt-panel" role="dialog" aria-label="CRT controls">
  <header>
    <span>CRT Controls</span>
    <div class="head-btns">
      <button class="link" on:click={resetCrtControls} title="Reset to defaults">Reset</button>
      <button class="close" on:click={() => dispatch('close')} aria-label="Close">×</button>
    </div>
  </header>
  <div class="body">
    {#each GROUPS as g}
      <div class="group">
        <h4>{g}</h4>
        {#each defsFor(g) as d}
          <label class="row">
            <span class="lbl">{d.label}</span>
            {#if d.type === 'toggle'}
              <input type="checkbox" checked={$crtControls[d.id] as boolean}
                     on:change={(e) => setBool(d.id, e.currentTarget.checked)} />
            {:else}
              <input type="range" min={d.min} max={d.max} step={d.step}
                     value={$crtControls[d.id] as number}
                     on:input={(e) => setNum(d.id, e.currentTarget.value)} />
              <span class="val">{(+($crtControls[d.id] as number)).toFixed(d.step && d.step < 0.01 ? 3 : 2)}</span>
            {/if}
          </label>
        {/each}
      </div>
    {/each}
  </div>
</div>

<style>
  .crt-panel {
    position: fixed;
    right: 14px;
    top: 64px;
    width: 280px;
    max-height: 78vh;
    overflow-y: auto;
    z-index: 9500;
    background: color-mix(in srgb, var(--mono, #74f7b0) 6%, #05080c);
    border: 1px solid color-mix(in srgb, var(--mono, #74f7b0) 50%, transparent);
    border-radius: 8px;
    color: var(--mono, #74f7b0);
    font-family: 'Courier New', ui-monospace, monospace;
    font-size: 12px;
    box-shadow: 0 8px 30px rgba(0,0,0,0.6);
  }
  header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 8px 10px; position: sticky; top: 0;
    background: color-mix(in srgb, var(--mono, #74f7b0) 10%, #05080c);
    border-bottom: 1px solid color-mix(in srgb, var(--mono, #74f7b0) 30%, transparent);
    font-weight: 700; letter-spacing: 0.08em;
  }
  .head-btns { display: flex; align-items: center; gap: 8px; }
  .link { background: none; border: none; color: inherit; cursor: pointer; font: inherit; opacity: 0.8; }
  .link:hover { opacity: 1; text-decoration: underline; }
  .close { background: none; border: none; color: inherit; font-size: 18px; line-height: 1; cursor: pointer; }
  .body { padding: 6px 10px 12px; }
  .group { margin-top: 8px; }
  .group h4 { margin: 6px 0 4px; font-size: 11px; opacity: 0.7; text-transform: uppercase; letter-spacing: 0.1em; }
  .row { display: grid; grid-template-columns: 92px 1fr 34px; align-items: center; gap: 6px; padding: 2px 0; }
  .row .lbl { opacity: 0.9; }
  .row input[type="range"] { width: 100%; accent-color: var(--mono, #74f7b0); }
  .row input[type="checkbox"] { accent-color: var(--mono, #74f7b0); justify-self: start; }
  .row .val { text-align: right; opacity: 0.7; font-variant-numeric: tabular-nums; }
</style>
