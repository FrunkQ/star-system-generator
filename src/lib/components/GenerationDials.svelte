<script lang="ts" context="module">
  // THE ONE SET OF DIALS — used by the wizard AND by every importer's infill step. A GM who has learned
  // what "disk mass" does when creating a system from a star has learned what it does when filling out
  // an imported one; the explainers are the same words in both places because they are the same rows.
  // These are broad inputs a wider generator will one day set automatically (a cluster shares its
  // metallicity); set by hand here they give a system its flavour.
  import type { GenerationKnobs } from '$lib/generation/generateFromConfig';
  export const KNOB_ROWS: Array<{ key: keyof GenerationKnobs; label: string; lo: string; hi: string; why: string }> = [
    { key: 'metallicity', label: 'Metallicity', lo: 'metal-poor', hi: 'metal-rich',
      why: 'How much rock and metal the disc had to build with. Poor: a few small rocky worlds and hardly a giant — the gas was there but not the solids to seed one. Rich: dense iron and carbon worlds, and far more gas giants. Our Sun sits a little above the middle.' },
    { key: 'diskMass', label: 'Disk mass', lo: 'sparse', hi: 'massive',
      why: 'How much material there was in total. Sparse gives a few worlds close in; massive gives many, and the system reaches further out because each new orbit sits beyond the last.' },
    { key: 'dynamicalHistory', label: 'Dynamical history', lo: 'calm', hi: 'violent',
      why: 'How rough the system\'s past was. Calm keeps orbits circular and the star upright, because everything condensed from one disc; violent stretches orbits, tips the star over, and captures worlds spinning backwards.' },
    { key: 'rarity', label: 'Rarity', lo: 'ordinary', hi: 'legendary',
      why: 'How strange the worlds are. The default is the realistic mix; push right and rarer types become steadily likelier until the legendary outnumbers the common. Nothing is ever ruled out at any setting — only made more or less likely.' },
  ];
  // Defaults sit at each dial's REALISTIC point, which is not the middle: rarity at 0.25 (below it a
  // system only gets duller), metallicity at 0.65 (the Sun is a little metal-rich). Keep in step with
  // the pack's `realistic_dial` values.
  export const DEFAULT_KNOBS: GenerationKnobs = { metallicity: 0.65, diskMass: 0.5, dynamicalHistory: 0.5, rarity: 0.25 };
</script>

<script lang="ts">
  import type { AgeGuess } from '$lib/physics/systemAge';

  export let knobs: GenerationKnobs;
  /**
   * When given, an AGE control is shown above the dials, BOUND to the star's own life: the slider runs
   * from the youngest the star could plausibly be to just before it swells, explodes or collapses.
   * A flaring marker sits at the young end where the star's dynamo is still violent — that IS an
   * option a GM might want. Absent (the wizard has its own age step) the control is not shown.
   */
  export let age: AgeGuess | undefined = undefined;
  export let ageGyr: number | undefined = undefined;
  export let showPhysicsLink = true;

  $: band = age?.bandGyr ?? [0.001, 13];
  // Log scale on the age slider: the band spans decades (an A star lives 1 Gyr, an M dwarf 1000) and
  // a linear slider would put every interesting young age in its first pixel.
  const toLog = (v: number) => Math.log10(Math.max(1e-4, v));
  $: logLo = toLog(band[0]);
  $: logHi = toLog(band[1]);
  $: logAge = ageGyr != null ? toLog(Math.min(band[1], Math.max(band[0], ageGyr))) : toLog(age?.ageGyr ?? 4.6);
  const onAgeInput = (e: Event) => { ageGyr = +Math.pow(10, +(e.target as HTMLInputElement).value).toPrecision(3); };
  $: flarePct = age?.flaringBelowGyr && age.flaringBelowGyr > band[0]
    ? Math.max(0, Math.min(100, 100 * (toLog(age.flaringBelowGyr) - logLo) / (logHi - logLo)))
    : 0;
  const fmtGyr = (v: number) => v >= 1 ? `${v.toFixed(v < 10 ? 2 : 1)} Gyr` : v >= 0.001 ? `${(v * 1000).toFixed(0)} Myr` : `${(v * 1e6).toFixed(0)} kyr`;
</script>

{#if age}
  <div class="knob age">
    <div class="knob-head">
      <span>System age {#if age.estimated}<span class="est" title={age.note}>estimated</span>{/if}</span>
      <span class="knob-val">{fmtGyr(ageGyr ?? age.ageGyr)}</span>
    </div>
    <div class="track">
      {#if flarePct > 0}<div class="flare" style="width:{flarePct}%" title="Below here the star's dynamo is still violent — it flares hard. A young, flaring system is a real option."></div>{/if}
      <input type="range" min={logLo} max={logHi} step="0.01" value={logAge} on:input={onAgeInput} class="slider" />
    </div>
    <div class="knob-ends"><span>{fmtGyr(band[0])}{#if flarePct > 0} · <em>flaring</em>{/if}</span><span>{fmtGyr(band[1])} · before it {age.source === 'giant-late-life' ? 'ends' : 'leaves the main sequence'}</span></div>
    <p class="knob-why">{age.note} The range is what this star's own life allows — the slider stops before it swells, explodes or collapses. Imported worlds are kept as they are; only worlds generated into the system are born into this era.</p>
  </div>
{/if}

{#each KNOB_ROWS as k}
  <div class="knob">
    <div class="knob-head"><span>{k.label}</span><span class="knob-val">{Math.round((knobs[k.key] ?? 0.5) * 100)}%</span></div>
    <input type="range" min="0" max="1" step="0.01" bind:value={knobs[k.key]} class="slider" />
    <div class="knob-ends"><span>{k.lo}</span><span>{k.hi}</span></div>
    <p class="knob-why">{k.why}</p>
  </div>
{/each}
{#if showPhysicsLink}
  <p class="note">All four stay inside the physics: they change how likely each kind of world is, never whether it could exist where it sits.
    <a href="/physics#generation" target="_blank" rel="noopener">How generation works</a>.</p>
{/if}

<style>
  .knob { margin-bottom: 10px; }
  .knob-head { display: flex; justify-content: space-between; font-size: 0.85em; }
  .knob-val { color: var(--link); font-variant-numeric: tabular-nums; }
  .knob-ends { display: flex; justify-content: space-between; font-size: 0.72em; color: var(--text-faint); }
  .knob-ends em { color: #f0a050; font-style: normal; }
  .knob-why { margin: 3px 0 0; font-size: 0.74em; line-height: 1.35; color: var(--text-muted, #cfcfcf); }
  .slider { width: 100%; position: relative; z-index: 1; }
  .track { position: relative; }
  .flare { position: absolute; left: 0; top: 40%; height: 20%; background: linear-gradient(90deg, rgba(240,160,80,0.55), rgba(240,160,80,0.15)); border-radius: 3px; pointer-events: none; }
  .est { font-size: 0.72em; margin-left: 6px; padding: 1px 6px; border-radius: 8px; background: rgba(255,255,255,0.08); color: var(--text-faint); cursor: help; }
  .note { font-size: 0.76em; color: var(--text-faint); }
  .note a { color: var(--link); }
</style>
