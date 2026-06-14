<script lang="ts">
  // A single-track, two-thumb range slider (low/high) — there's no native HTML control for this,
  // so it's two overlaid range inputs with only their thumbs interactive, plus a coloured fill
  // between them. Emits a 'change' event with { low, high } (kept ordered, never crossing).
  import { createEventDispatcher } from 'svelte';
  export let min = 0;
  export let max = 1;
  export let step = 0.01;
  export let low = min;
  export let high = max;

  const dispatch = createEventDispatcher();
  const clamp = (v: number) => Math.min(max, Math.max(min, v));
  $: span = max - min || 1;
  $: pct = (v: number) => ((clamp(v) - min) / span) * 100;

  function setLow(v: number) { low = Math.min(clamp(v), high); dispatch('change', { low, high }); }
  function setHigh(v: number) { high = Math.max(clamp(v), low); dispatch('change', { low, high }); }
</script>

<div class="dual" style="--lo:{pct(low)}%; --hi:{pct(high)}%">
  <div class="track"></div>
  <div class="fill"></div>
  <input class="thumb" type="range" {min} {max} {step} value={low} aria-label="Lower bound"
    on:input={(e) => setLow(parseFloat(e.currentTarget.value))} />
  <input class="thumb" type="range" {min} {max} {step} value={high} aria-label="Upper bound"
    on:input={(e) => setHigh(parseFloat(e.currentTarget.value))} />
</div>

<style>
  .dual { position: relative; flex: 1; min-width: 70px; height: 24px; display: flex; align-items: center; }
  .track, .fill { position: absolute; height: 4px; border-radius: 2px; pointer-events: none; }
  .track { left: 0; right: 0; background: var(--border); }
  .fill { left: var(--lo); right: calc(100% - var(--hi)); background: var(--accent); }
  /* Both inputs sit on top of the same track; only their thumbs catch the pointer. */
  .thumb { position: absolute; left: 0; right: 0; width: 100%; margin: 0; height: 24px; background: none; pointer-events: none; -webkit-appearance: none; appearance: none; }
  .thumb::-webkit-slider-runnable-track { background: none; border: none; }
  .thumb::-moz-range-track { background: none; border: none; }
  .thumb::-webkit-slider-thumb { pointer-events: auto; -webkit-appearance: none; appearance: none; width: 14px; height: 14px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg-panel); cursor: pointer; }
  .thumb::-moz-range-thumb { pointer-events: auto; width: 12px; height: 12px; border-radius: 50%; background: var(--accent); border: 2px solid var(--bg-panel); cursor: pointer; }
</style>
