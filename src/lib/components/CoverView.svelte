<script lang="ts">
  // Reusable cover / hold screen for the unified player view (design §2 layer 1, §11.1 "reusable
  // element"). Renders a CoverConfig + preset theme (accent, font, company/footer). Must be able to
  // recreate "DON'T PANIC" and equally "ACME — CONFIDENTIAL + logo". Used in the editor preview now;
  // the same component renders in the player window later.
  import type { CoverConfig, PlayerAsset, GraphicPlacement } from '$lib/player/presetTypes';

  export let cover: CoverConfig;
  export let accentColor = '#6aa0ff';
  export let font = 'system-ui';
  export let companyName = '';
  export let footerText = '';
  export let assets: PlayerAsset[] = []; // for the cover graphic, by id

  function asset(g: GraphicPlacement | null): PlayerAsset | undefined {
    return g ? assets.find((a) => a.id === g.assetId) : undefined;
  }
  // Map a 9-point pin to flex alignment for the graphic layer.
  const PIN_ALIGN: Record<string, string> = {
    'top-left': 'flex-start flex-start', 'top-center': 'center flex-start', 'top-right': 'flex-end flex-start',
    'center-left': 'flex-start center', 'center': 'center center', 'center-right': 'flex-end center',
    'bottom-left': 'flex-start flex-end', 'bottom-center': 'center flex-end', 'bottom-right': 'flex-end flex-end'
  };
  $: g = cover.graphic;
  $: gAsset = asset(g);
  $: gAlign = g ? PIN_ALIGN[g.pin] ?? 'center center' : 'center center';
</script>

<div class="cover" style="--accent:{accentColor}; font-family:{font};">
  {#if gAsset}
    <div class="graphic-layer" style="justify-content:{gAlign.split(' ')[0]}; align-items:{gAlign.split(' ')[1]};">
      <img src={gAsset.dataUrl} alt="" style="width:{g?.sizePct ?? 40}%; opacity:{g?.opacity ?? 1};" />
    </div>
  {/if}

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
  .graphic-layer { position: absolute; inset: 4%; display: flex; pointer-events: none; }
  .graphic-layer img { max-height: 100%; object-fit: contain; }
  .content { position: relative; z-index: 1; display: flex; flex-direction: column; align-items: center; gap: 0.6rem; max-width: 90%; }
  .label { font-size: 0.8rem; letter-spacing: 0.28em; text-transform: uppercase; color: var(--accent); border: 1px solid var(--accent); border-radius: 4px; padding: 3px 12px; }
  .title { margin: 0; font-size: clamp(2rem, 9vw, 5rem); line-height: 1.02; font-weight: 800; color: var(--accent); text-wrap: balance; text-shadow: 0 0 30px color-mix(in srgb, var(--accent) 45%, transparent); }
  .subtitle { margin: 0; font-size: clamp(1rem, 2.6vw, 1.5rem); opacity: 0.9; }
  .body { margin: 0.4rem 0 0; font-size: clamp(0.8rem, 1.7vw, 1rem); opacity: 0.72; line-height: 1.5; max-width: 46ch; white-space: pre-wrap; }
  .foot { position: absolute; bottom: 5%; font-size: 0.72rem; letter-spacing: 0.08em; opacity: 0.55; text-transform: uppercase; }
</style>
