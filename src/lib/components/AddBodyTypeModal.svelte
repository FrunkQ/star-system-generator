<script lang="ts">
  // §4c — the location-aware "add by type" picker. Shows only the types VIABLE at the orbit the GM
  // clicked (their T_eq band contains this spot), so the Goldilocks zone offers life/ocean worlds
  // and a hot orbit offers lava. Pick one → a body with matching randomised params is dropped in.
  import { createEventDispatcher } from 'svelte';
  import type { Fingerprint, RulePack } from '$lib/types';
  import { judgeTypesAt, ALL_GATES, type ViabilityGates } from '$lib/generation/generateBodyOfType';
  import { rarityOf, rarityTier } from '$lib/generation/typeDraw';
  import { thumbUrl } from '$lib/util/thumbs';
  import { fmt } from '$lib/stores';
  import { EARTH_MASS_KG } from '$lib/constants';
  import { foreground } from '$lib/ui/foreground';

  export let rulePack: RulePack;
  export let teqK: number;
  export let role: 'planet' | 'moon';
  export let hostMassKg: number = 0; // host body's mass — moons are mass-gated by it (few for a terrestrial, more for a giant)
  export let ageGyr: number | undefined = undefined; // the system's age — late formers and early formers gate on it
  export let canTidallyLock: boolean | undefined = undefined; // can this orbit despin a planet in the time available?

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  // THE GATES ARE THE GM'S TO SWITCH OFF. Each is physics guidance on where a type can be born; all
  // start ON, and turning one off widens the menu DESPITE the physics — hand authoring is hand
  // authoring, and the tags will say what is implausible about the result. The generator uses the
  // very same model with every gate on, so the picker and the generator can never disagree about
  // what is viable, only about whether the GM chose to override it.
  let gates: ViabilityGates = { ...ALL_GATES };
  const GATE_LABELS: Array<{ key: keyof ViabilityGates; label: string; hint: string; needs?: () => boolean }> = [
    { key: 'temperature', label: 'Temperature', hint: 'Only types whose temperature band contains this orbit.' },
    { key: 'mass', label: 'Mass', hint: role === 'moon' ? 'Only types small enough to be a satellite of this host.' : 'Only planet-mass types — asteroids, comets and planetesimals stay off a primary orbit.' },
    { key: 'age', label: 'Age', hint: 'Only types that can have formed by this system\'s age — protoplanets are young, stripped and cratered worlds are old.', needs: () => typeof ageGyr === 'number' },
    { key: 'tidalLock', label: 'Tidal lock', hint: 'Types that need a star-locked world, only where this orbit can produce one.', needs: () => typeof canTidallyLock === 'boolean' },
    { key: 'hostFit', label: 'Host', hint: 'A moon cannot be a giant; a substantial moon needs a giant host.', needs: () => role === 'moon' },
  ];
  $: shownGates = GATE_LABELS.filter((g) => !g.needs || g.needs());

  $: fingerprints = (rulePack.classifier?.fingerprints ?? []) as Fingerprint[];
  $: images = (rulePack.classifier as any)?.planetImages ?? {};
  $: verdicts = judgeTypesAt({ role, teqK, hostMassKg, ageGyr, canTidallyLock }, fingerprints, gates);
  $: viable = verdicts.filter((v) => v.ok).map((v) => v.fp)
    .slice()
    .sort((a, b) => a.class.localeCompare(b.class));
  $: hiddenCount = verdicts.length - viable.length;

  // Moons are ALSO gated by the host's mass (a terrestrial can only hold small airless/icy moons; a
  // giant can hold larger, icy, atmosphered ones). Surface that second gate in the header.
  $: hostMe = hostMassKg / EARTH_MASS_KG;
  $: hostMassLabel = hostMe >= 300 ? `${(hostMe / 317.8).toFixed(1)} M♃` : hostMe >= 10 ? `${Math.round(hostMe)} M⊕` : `${hostMe.toFixed(2)} M⊕`;
  $: hostIsGiant = hostMe >= 15;
  $: massGated = role === 'moon' && hostMassKg > 0;

  const pretty = (cls: string) => cls.replace('planet/', '').replace(/-/g, ' ');
  const tierOf = (cls: string) => rarityTier(rarityOf(cls, rulePack));
  const LEGEND = [
    { label: 'Common', color: '#b8c0cc' }, { label: 'Uncommon', color: '#4caf50' },
    { label: 'Rare', color: '#3b82f6' }, { label: 'Epic', color: '#a855f7' }, { label: 'Legendary', color: '#f5a623' }
  ];
</script>

<div class="overlay" on:click|self={close} role="presentation" use:foreground>
  <div class="modal" role="dialog" aria-label="Add body by type">
    <header>
      <div>
        <h2>Add {role === 'moon' ? 'moon' : 'planet'} — pick a type</h2>
        {#if massGated}
          <p class="sub">Viable at this orbit (~{$fmt.tempK(teqK)}) <strong>and</strong> this host's mass ({hostMassLabel} — {hostIsGiant ? 'a giant, so larger, icy &amp; atmosphered moons are on the menu' : 'terrestrial, so only small airless / icy moons'}). {viable.length} types.</p>
        {:else}
          <p class="sub">All viable at this orbit (~{$fmt.tempK(teqK)}) — rarity just signals how eccentric. {viable.length} types.</p>
        {/if}
        <div class="legend">
          {#each LEGEND as l}<span class="leg"><span class="dot" style="background:{l.color}"></span>{l.label}</span>{/each}
        </div>
        <div class="gates" role="group" aria-label="Physics filters">
          <span class="gates-label">Filters</span>
          {#each shownGates as g}
            <label class="gate" class:off={!gates[g.key]} title={g.hint}>
              <input type="checkbox" bind:checked={gates[g.key]} />
              {g.label}
            </label>
          {/each}
          {#if hiddenCount > 0}<span class="hidden-note">{hiddenCount} hidden by the filters</span>{/if}
        </div>
      </div>
      <button class="close" on:click={close} aria-label="Close">×</button>
    </header>
    <div class="grid">
      {#each viable as fp}
        {@const tier = tierOf(fp.class)}
        <button class="card" style="--tier:{tier.color}" on:click={() => dispatch('select', { fp })}
          title="{pretty(fp.class)} — {tier.label}{fp.note ? `: ${fp.note}` : ''}">
          {#if images[fp.class]}
            <img src={thumbUrl(images[fp.class])} alt={pretty(fp.class)} loading="lazy" width="80" height="80" />
          {:else}
            <div class="noimg">{pretty(fp.class).slice(0, 2)}</div>
          {/if}
          <span class="name">{pretty(fp.class)}</span>
        </button>
      {/each}
      {#if viable.length === 0}
        <p class="empty">No catalogued types pass the filters here{hiddenCount > 0 ? ' — switch one off above to widen the menu' : ''}.</p>
      {/if}
    </div>
  </div>
</div>

<style>
  .overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.6); display: flex; align-items: center; justify-content: center; z-index: 2000; padding: 4vh 2vw; }
  .modal { background: var(--bg-app, #0b0d12); border: 1px solid var(--border, #2a2d36); border-radius: 10px; width: min(760px, 96vw); max-height: 88vh; display: flex; flex-direction: column; overflow: hidden; color: var(--text, #e8e8e8); box-shadow: 0 12px 48px rgba(0,0,0,0.5); }
  header { display: flex; align-items: flex-start; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--border, #2a2d36); }
  h2 { margin: 0; font-size: 1.05rem; color: var(--accent, #ff5a1f); }
  .sub { margin: 3px 0 0; font-size: 0.82rem; color: var(--text-muted, #cfcfcf); }
  .legend { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 6px; }
  .leg { display: flex; align-items: center; gap: 4px; font-size: 0.68rem; color: var(--text-faint, #8a8a8a); text-transform: uppercase; letter-spacing: 0.04em; }
  .leg .dot { width: 9px; height: 9px; border-radius: 50%; }
  /* The physics filters. Each starts ON; an OFF one dims and the menu widens despite the physics. */
  .gates { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; margin-top: 8px; }
  .gates-label { font-size: 0.68rem; color: var(--text-faint, #8a8a8a); text-transform: uppercase; letter-spacing: 0.04em; }
  .gate { display: inline-flex; align-items: center; gap: 4px; font-size: 0.74rem; color: var(--text-muted, #cfcfcf); cursor: pointer; padding: 2px 8px; border: 1px solid var(--border, #2a2d36); border-radius: 999px; user-select: none; }
  .gate input { margin: 0; accent-color: var(--accent, #ff5a1f); }
  .gate.off { color: var(--text-faint, #8a8a8a); border-style: dashed; }
  .hidden-note { font-size: 0.7rem; color: var(--text-faint, #8a8a8a); font-style: italic; }
  .close { background: none; border: none; color: var(--text-muted, #cfcfcf); font-size: 1.6rem; line-height: 1; cursor: pointer; }
  .close:hover { color: var(--text, #fff); }
  .grid { overflow-y: auto; -webkit-overflow-scrolling: touch; min-height: 0; padding: 14px 16px; display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 10px; }
  /* Loot-box rarity: each card is ringed + tinted by its type's tier (common→legendary). */
  .card { position: relative; display: flex; flex-direction: column; align-items: center; gap: 6px; padding: 8px; background: var(--bg-panel, #14161c); border: 1px solid color-mix(in srgb, var(--tier) 55%, var(--border, #2a2d36)); border-radius: 8px; cursor: pointer; transition: box-shadow 0.15s, transform 0.1s, border-color 0.15s; }
  .card:hover { border-color: var(--tier); transform: translateY(-2px); box-shadow: 0 0 12px color-mix(in srgb, var(--tier) 60%, transparent); }
  .card img { width: 80px; height: 80px; object-fit: cover; border-radius: 50%; border: 2px solid var(--tier); box-shadow: 0 0 8px color-mix(in srgb, var(--tier) 45%, transparent); }
  .noimg { width: 80px; height: 80px; border-radius: 50%; background: var(--bg-control, #232733); border: 2px solid var(--tier); display: flex; align-items: center; justify-content: center; text-transform: uppercase; color: var(--text-faint, #8a8a8a); font-weight: 700; }
  .name { font-size: 0.78rem; text-transform: capitalize; text-align: center; color: var(--text, #e8e8e8); line-height: 1.2; }
  .empty { grid-column: 1 / -1; color: var(--text-faint, #8a8a8a); text-align: center; padding: 24px; }
  /* Phone: take the whole screen and shrink the thumbnails so the grid fits + scrolls. */
  @media (max-width: 600px), (pointer: coarse) and (max-height: 700px) {
    .overlay { padding: 0; align-items: stretch; justify-content: stretch; }
    .modal { width: 100%; height: 100dvh; max-height: 100dvh; border-radius: 0; border: none; }
    .grid { grid-template-columns: repeat(auto-fill, minmax(86px, 1fr)); gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); }
    .card { padding: 6px; }
    .card img, .noimg { width: 56px; height: 56px; }
    .name { font-size: 0.72rem; }
  }
</style>
