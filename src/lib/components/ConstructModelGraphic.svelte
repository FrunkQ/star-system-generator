<script lang="ts">
  // G3 stage 4: the construct's 3D model in the info block's reserved gap - the construct
  // counterpart of BodyGraphic, with the SAME contract (getCanvas() for the A38 filter capture).
  // Uses the one shared turntable (modelViewer.ts), so this is pixel-for-pixel the import
  // modal's preview.
  //
  // A model the local store does not hold (a player machine the binary has not reached yet -
  // the broadcast side-channel is a recorded follow-up) falls back to the authored icon glyph
  // via the shared constructIcon vocabulary: exactly what the document would have drawn had
  // there been no model, so degradation lands on yesterday's look, never on a blank.
  import { onMount, onDestroy } from 'svelte';
  import type { ModelRef } from '$lib/types';
  import { getModel } from '$lib/constructs/modelStore';
  import { parseModel } from '$lib/constructs/modelImport';
  import { createModelViewer, type ModelViewer } from '$lib/constructs/modelViewer';
  import { requestModel } from '$lib/constructs/modelFetch';
  import { constructIconShape, traceConstructIcon } from '$lib/constructs/constructIcon';

  export let model: ModelRef;
  export let tint = '#ffd24d';       // the construct's icon_color - drives the material-less finish
  export let iconType: string | undefined = undefined; // for the store-miss glyph fallback
  export let mono = false;
  export let interactive = false;
  export let seed = ''; // the construct's id - two ships sharing a hull each get their own livery
  // Live drive state, when the host knows it (the GM's data block): lights the plume exactly as
  // the map does. null = not burning / unknown.
  export let burn: { thrust01: number; braking: boolean; colorHex?: string } | null = null;

  let root: HTMLDivElement;
  let glCanvas: HTMLCanvasElement;
  let fallbackCanvas: HTMLCanvasElement;
  let viewer: ModelViewer | null = null;
  let ro: ResizeObserver | null = null;
  let missing = false;               // store miss -> glyph fallback
  let loadedKey: string | null = null; // hash + tint actually shown, so reloads only happen on change

  export function getCanvas(): HTMLCanvasElement | null {
    return missing ? fallbackCanvas ?? null : glCanvas ?? null;
  }

  $: displayTint = mono ? '#c8cdd6' : tint || '#ffd24d';

  let unrequest: (() => void) | null = null;
  async function load(hash: string, tintNow: string) {
    const want = `${hash}|${tintNow}|${model.finish ?? ''}`;
    const stored = await getModel(hash).catch(() => null);
    if (want !== `${model.hash}|${displayTint}|${model.finish ?? ''}`) return; // subject/tint/finish changed while reading
    if (!stored) {
      // Not on this machine (a remote player, most likely): show the glyph and ask the transport
      // for the binary by hash - when it lands in the store, retry and the glyph gives way.
      missing = true; drawFallback();
      unrequest?.();
      unrequest = requestModel(hash, () => { loadedKey = null; load(model.hash, displayTint); });
      return;
    }
    unrequest?.(); unrequest = null;
    missing = false;
    try {
      const parsed = await parseModel('stored.glb', stored.bytes);
      if (want !== `${model.hash}|${displayTint}|${model.finish ?? ''}`) return;
      viewer?.setObject(parsed.object, { hadMaterials: model.hadMaterials ?? true, tintHex: tintNow, finish: model.finish ?? null, seed });
      viewer?.setOrient(model.orient ?? null);
      // The GM placed these; every surface that draws the ship must honour them, not just the
      // editor's preview. Empty = the default single plume at the stern.
      viewer?.setNozzles(model.nozzles ?? [], model.nozzleScale ?? 1, false);
      loadedKey = want;
    } catch {
      missing = true; drawFallback();
    }
  }

  function drawFallback() {
    if (!fallbackCanvas) return;
    const w = root?.clientWidth || 120, h = root?.clientHeight || 120;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    fallbackCanvas.width = w * dpr; fallbackCanvas.height = h * dpr;
    const ctx = fallbackCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);
    const size = Math.min(w, h) * 0.55;
    traceConstructIcon(ctx, constructIconShape(iconType), w / 2, h / 2, size);
    ctx.fillStyle = displayTint;
    ctx.globalAlpha = 0.92;
    ctx.fill();
  }

  onMount(() => {
    viewer = createModelViewer(glCanvas, { interactive, spin: true, background: null, capture: true });
    const size = () => {
      const w = root.clientWidth, h = root.clientHeight;
      viewer?.setSize(w, h);
      if (missing) drawFallback();
    };
    ro = new ResizeObserver(size);
    ro.observe(root);
    size();
  });
  onDestroy(() => { ro?.disconnect(); viewer?.dispose(); unrequest?.(); });

  // The plume follows the live burn on every frame the host re-evaluates it.
  $: viewer?.setBurn(burn);
  $: viewer?.setNozzles(model.nozzles ?? [], model.nozzleScale ?? 1, false);

  // One keyed reload covers first mount, subject change, live retint and finish change alike.
  $: if (viewer && `${model.hash}|${displayTint}|${model.finish ?? ''}` !== loadedKey) load(model.hash, displayTint);
</script>

<div class="cmg-root" bind:this={root}>
  <canvas bind:this={glCanvas} class:hidden={missing}></canvas>
  <canvas bind:this={fallbackCanvas} class:hidden={!missing}></canvas>
</div>

<style>
  .cmg-root { position: relative; width: 100%; height: 100%; }
  canvas { display: block; width: 100%; height: 100%; touch-action: none; }
  canvas.hidden { display: none; }
</style>
