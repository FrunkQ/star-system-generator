<script lang="ts" context="module">
  // THE BANDED SLIDER — a vocabulary, not a feature of one control (inbox G24).
  //
  // A coloured band under a track saying WHICH SIDE OF THE PHYSICS you are on: green where reality
  // supports the setting, amber where it is possible but unlikely, red where nothing measured looks
  // like it. It is the same principle as "hand authoring is hand authoring — show the problems in
  // tags and allow it", applied to a control instead of a body, and the same shape as the
  // implausibility tags on a star.
  //
  // NOTHING IS FORBIDDEN AT ANY SETTING, and the wording has to carry that. Amber says "few real
  // systems look like this", never "invalid" — the owner's own words for this were "possible, just
  // unlikely", and a slider that scolds a GM for running a deliberately fantastical setting has
  // misunderstood what it is for.
  //
  // THE EDGES ARE PACK DATA (`generation_parameters.realism_bands`), never constants here. That is
  // what lets a GM move the goalposts rather than fight them, and it is why this component takes a
  // band and never computes one.
  import type { RulePack } from '$lib/types';

  /** Green is the inner range; amber is the WIDER range containing it; outside amber is red. */
  export interface RealismBand {
    green: [number, number];
    amber: [number, number];
    why?: string;
  }
  export interface RealismWording { green: string; amber: string; red: string }

  const FALLBACK_WORDING: RealismWording = {
    green: 'about where real systems sit',
    amber: 'few real systems look like this',
    red: 'no measured system looks like this - still allowed, still physical'
  };

  /** Read one control's band out of a pack. Absent → no band, and the slider renders plain. */
  export function realismBandFor(pack: RulePack | null | undefined, control: string): RealismBand | null {
    const bands = (pack?.generation_parameters as any)?.realism_bands;
    const b = bands?.controls?.[control];
    if (!b || !Array.isArray(b.green) || !Array.isArray(b.amber)) return null;
    return { green: b.green, amber: b.amber, why: b.why };
  }

  export function realismWording(pack: RulePack | null | undefined): RealismWording {
    const w = (pack?.generation_parameters as any)?.realism_bands?.wording;
    return { ...FALLBACK_WORDING, ...(w ?? {}) };
  }

  /** Which band a value falls in. Inclusive at both edges, so an edge reads as the kinder band. */
  export function bandOf(value: number, band: RealismBand | null): 'green' | 'amber' | 'red' | null {
    if (!band) return null;
    if (value >= band.green[0] && value <= band.green[1]) return 'green';
    if (value >= band.amber[0] && value <= band.amber[1]) return 'amber';
    return 'red';
  }
</script>

<script lang="ts">
  export let label: string;
  export let value: number;
  export let min = 0;
  export let max = 1;
  export let step = 0.01;
  /** Left and right end captions, e.g. "metal-poor" / "metal-rich". */
  export let loLabel = '';
  export let hiLabel = '';
  /** The prose under the control — what this dial actually does. */
  export let why = '';
  export let band: RealismBand | null = null;
  export let wording: RealismWording = FALLBACK_WORDING;
  /** How the value reads in the corner. Percent by default. */
  export let format: (v: number) => string = (v) => `${Math.round(v * 100)}%`;

  const pct = (v: number) => (100 * (v - min)) / (max - min || 1);
  // Five segments across the track: red, amber, green, amber, red. Any of them can be zero-width,
  // which is how a band that reaches an end (rarity's green starts at 0) renders correctly.
  $: seg = band
    ? [
        { cls: 'red', from: 0, to: pct(band.amber[0]) },
        { cls: 'amber', from: pct(band.amber[0]), to: pct(band.green[0]) },
        { cls: 'green', from: pct(band.green[0]), to: pct(band.green[1]) },
        { cls: 'amber', from: pct(band.green[1]), to: pct(band.amber[1]) },
        { cls: 'red', from: pct(band.amber[1]), to: 100 }
      ].filter((s) => s.to > s.from)
    : [];
  $: here = bandOf(value, band);
  $: verdict = here ? wording[here] : '';
</script>

<div class="knob">
  <div class="knob-head">
    <span>{label}</span>
    <span class="knob-val">{format(value)}</span>
  </div>
  <div class="track">
    <input type="range" {min} {max} {step} bind:value class="slider" />
    <!-- BENEATH the track, not behind it. Drawn behind, a native range input's own runnable track
         paints straight over the strip — verified in the browser: correct geometry, invisible. -->
    {#if seg.length}
      <div class="bands" aria-hidden="true">
        {#each seg as s}
          <div class="seg {s.cls}" style="left:{s.from}%;width:{s.to - s.from}%"></div>
        {/each}
      </div>
    {/if}
  </div>
  <div class="knob-ends">
    <span>{loLabel}</span>
    {#if here}<span class="verdict {here}" title={band?.why ?? ''}>{verdict}</span>{/if}
    <span>{hiLabel}</span>
  </div>
  {#if why}<p class="knob-why">{why}</p>{/if}
</div>

<style>
  .knob { margin-bottom: 10px; }
  .knob-head { display: flex; justify-content: space-between; font-size: 0.85em; }
  .knob-val { color: var(--link); font-variant-numeric: tabular-nums; }
  .knob-ends { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.72em; color: var(--text-faint); }
  .knob-why { margin: 3px 0 0; font-size: 0.74em; line-height: 1.35; color: var(--text-muted, #cfcfcf); }
  .track { position: relative; }
  .slider { width: 100%; display: block; }
  /* A thin strip below the track — it informs, it does not shout. */
  .bands { position: relative; height: 4px; margin: -2px 0 2px; border-radius: 3px;
           overflow: hidden; pointer-events: none; }
  .seg { position: absolute; top: 0; bottom: 0; }
  .seg.green { background: rgba(90, 200, 130, 0.55); }
  .seg.amber { background: rgba(240, 170, 70, 0.5); }
  .seg.red { background: rgba(224, 90, 70, 0.45); }
  .verdict { text-align: center; flex: 1 1 auto; cursor: help; }
  .verdict.green { color: #6fce96; }
  .verdict.amber { color: #f0aa46; }
  .verdict.red { color: #e2705c; }
</style>
