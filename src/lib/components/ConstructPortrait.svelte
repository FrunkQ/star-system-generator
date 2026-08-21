<script lang="ts">
  // The GM view's construct picture (G3 follow-up): the SAME priority chain the player document
  // uses - 3D model first, then the uploaded image, then the authored icon glyph - kept simple,
  // no orientation chrome: its job on the GM surface is to show what is loaded.
  import type { CelestialBody, RulePack } from '$lib/types';
  import ConstructModelGraphic from './ConstructModelGraphic.svelte';
  import { constructIconShape, traceConstructIcon } from '$lib/constructs/constructIcon';
  import { shipBurnAt } from '$lib/constructs/shipBurn';
  import { calculateFullConstructSpecs } from '$lib/construct-logic';

  export let construct: CelestialBody;
  // Bigger by default than the first cut: this is the GM's look at their own ship, and a plume
  // needs room to read. The plume itself is allowed to run off the edge (the hull stays centred).
  export let height = 190;
  // Live drive state needs the clock (which segment is running) and the pack (the ship's own
  // capability + its engine's authored exhaust colour). Omit either and the plume simply
  // does not light - the portrait still works.
  export let nowMs: number | null = null;
  export let rulePack: RulePack | null = null;

  $: burn = (() => {
    if (nowMs == null) return null;
    const b = shipBurnAt(construct, nowMs);
    if (!b.thrusting) return null;
    let cap = 10; // fallback ceiling, as the scene uses
    let colorHex: string | undefined;
    if (rulePack) {
      const defs = (rulePack as any)?.engineDefinitions?.entries ?? [];
      const fuels = (rulePack as any)?.fuelDefinitions?.entries ?? [];
      try {
        const g = calculateFullConstructSpecs(construct, defs, fuels, null).maxVacuumG;
        if (g > 0) cap = g * 9.81;
      } catch { /* unresolvable engines: the fallback stands */ }
      let bestThrust = -1;
      for (const inst of (construct as any).engines ?? []) {
        const def = defs.find((d: any) => d.id === inst.engine_id);
        const total = (def?.thrust_kN ?? 0) * (inst.quantity ?? 1);
        if (def?.exhaust_color_hex && total > bestThrust) { bestThrust = total; colorHex = def.exhaust_color_hex; }
      }
    }
    return { thrust01: Math.min(1, b.accelMs2 / Math.max(0.01, cap)), braking: b.braking, colorHex };
  })();

  $: model = (construct as any).model ?? null;
  $: imageUrl = !model && construct.image?.url ? construct.image.url : null;

  let glyphCanvas: HTMLCanvasElement | null = null;
  $: if (glyphCanvas && !model && !imageUrl) drawGlyph(glyphCanvas, construct);
  function drawGlyph(cnv: HTMLCanvasElement, c: CelestialBody) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = cnv.clientWidth || 130, h = cnv.clientHeight || height;
    cnv.width = w * dpr; cnv.height = h * dpr;
    const ctx = cnv.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    traceConstructIcon(ctx, constructIconShape((c as any).icon_type), w / 2, h / 2, Math.min(w, h) * 0.5);
    ctx.fillStyle = (c as any).icon_color || '#ffd24d';
    ctx.globalAlpha = 0.92;
    ctx.fill();
  }
</script>

<div class="portrait" style="height:{height}px">
  {#if model}
    <ConstructModelGraphic {model} tint={(construct as any).icon_color || '#ffd24d'}
      iconType={(construct as any).icon_type} seed={construct.id} {burn} interactive={true} />
  {:else if imageUrl}
    <img src={imageUrl} alt="{construct.name} artwork" />
  {:else}
    <canvas bind:this={glyphCanvas}></canvas>
  {/if}
</div>

<style>
  /* The plume is allowed to run past the edges - the hull is what stays centred. */
  .portrait { width: 100%; display: flex; align-items: center; justify-content: center; overflow: hidden; cursor: grab; }
  .portrait:active { cursor: grabbing; }
  .portrait img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .portrait canvas { width: 100%; height: 100%; }
</style>
