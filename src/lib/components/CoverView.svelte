<script lang="ts">
  // Reusable cover / hold screen for the unified player view (design §2 layer 1, §11.1 "reusable
  // element"). Renders a CoverConfig + preset theme (accent, font, company/footer). Must be able to
  // recreate "DON'T PANIC" and equally "ACME — CONFIDENTIAL + logo". Used in the editor preview now;
  // the same component renders in the player window later.
  import type { CoverConfig, PlayerAsset } from '$lib/player/presetTypes';
  import { isRainbow, accentSolid, RAINBOW_GRADIENT } from '$lib/player/presets';
  import GraphicLayer from './GraphicLayer.svelte';

  export let cover: CoverConfig;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let companyName = '';
  export let footerText = '';
  export let assets: PlayerAsset[] = []; // for the cover graphic, by id

  $: rainbow = isRainbow(accentColor);
  $: solid = accentSolid(accentColor);
</script>

<div class="cover" class:rainbow style="--accent:{solid}; --rainbow:{RAINBOW_GRADIENT}; font-family:{font};">
  <GraphicLayer placement={cover.graphic} {assets} />

  <div class="content">
    {#if cover.label}<span class="label">{cover.label}</span>{/if}
    {#if cover.title}<h1 class="title">{cover.title}</h1>{/if}
    {#if cover.subtitle}<p class="subtitle">{cover.subtitle}</p>{/if}
    {#if cover.body}<p class="body">{cover.body}</p>{/if}
  </div>

  {#if companyName || footerText}
    <footer class="foot">{companyName}{companyName && footerText ? ' · ' : ''}{footerText}</footer>
  {/if}
</div>

<style>
  .cover { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #eef2f7; overflow: hidden; padding: 8%; }
  .content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; max-width: 90%; }
  .label { font-size: 0.8rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 3px 12px; }
  .title { margin: 0; font-size: clamp(2rem, 9vw, 5rem); line-height: 1.02; font-weight: 800; color: var(--accent); text-wrap: balance; text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 45%, transparent); }
  /* Rainbow accent (The Guide, original): gradient fill on the title + label border. */
  .cover.rainbow .title { background: var(--rainbow); -webkit-background-clip: text; background-clip: text; color: transparent; text-shadow: none; }
  .cover.rainbow .label { border-image: var(--rainbow) 1; color: #fff; }
  .subtitle { margin: 0; font-size: clamp(1rem, 2.6vw, 1.5rem); opacity: 0.9; }
  .body { margin: 0.4rem 0 0; font-size: clamp(0.8rem, 1.7vw, 1rem); opacity: 0.72; line-height: 1.5; max-width: 46ch; white-space: pre-wrap; }
  .foot { position: absolute; bottom: 5%; font-size: 0.72rem; letter-spacing: 0.08em; opacity: 0.55; text-transform: uppercase; }
</style>
