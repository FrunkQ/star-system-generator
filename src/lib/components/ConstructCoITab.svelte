<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import { coiCategories, toggleCoI, constructHasCoI, type CoICategory } from '$lib/constructs/coi';

  export let construct: CelestialBody;
  const dispatch = createEventDispatcher();

  // Re-read after each toggle so chips reflect the construct's current tags.
  let tick = 0;
  function toggle(cat: CoICategory, key: string) {
    toggleCoI(construct, cat, key);
    tick++;
    dispatch('update');
  }
  $: cats = $coiCategories;
  $: has = (key: string) => { void tick; return constructHasCoI(construct, key); };
</script>

<div class="coi-tab">
  <p class="hint">Tag this construct by hand. <strong>Owner</strong> sets how punctual it is (its tardiness); <strong>Purpose</strong> describes what it does. These travel with the starmap and feed autopilot later.</p>

  {#each cats as cat (cat.id)}
    <div class="cat">
      <div class="cat-head">
        <span class="swatch" style="background:{cat.color || '#666'}"></span>
        <span class="cat-label">{cat.label}</span>
        {#if cat.single}<span class="one">choose one</span>{/if}
      </div>
      <div class="chips">
        {#each cat.tags as t (t.key)}
          <button
            class="chip"
            class:on={has(t.key)}
            style={has(t.key) ? `background:${cat.color || '#444'}; color:${cat.textColor || '#fff'}; border-color:${cat.color || '#444'}` : ''}
            title={t.tardiness !== undefined ? `Tardiness ${t.tardiness}` : ''}
            on:click={() => toggle(cat, t.key)}
          >{t.label}</button>
        {/each}
      </div>
    </div>
  {/each}
</div>

<style>
  .coi-tab { display: flex; flex-direction: column; gap: 14px; padding: 10px; }
  .hint { font-size: 0.82em; color: var(--text-faint, #8a8f9a); margin: 0; line-height: 1.4; }
  .cat { display: flex; flex-direction: column; gap: 6px; }
  .cat-head { display: flex; align-items: center; gap: 8px; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; display: inline-block; }
  .cat-label { font-weight: 600; color: var(--text, #e8e8e8); }
  .one { font-size: 0.72em; color: var(--text-faint, #8a8f9a); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip {
    padding: 3px 10px; border-radius: 999px; font-size: 0.8em; cursor: pointer;
    background: var(--bg-control, #20232b); color: var(--text-muted, #b8bcc4);
    border: 1px solid var(--border, #333); transition: all 0.1s;
  }
  .chip:hover { border-color: var(--accent, #5b8def); }
  .chip.on { font-weight: 600; }
</style>
