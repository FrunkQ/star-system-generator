<script lang="ts">
  // The body picture in the Guide document's info block — REUSING the existing renderers, not a bespoke
  // one: PlanetDisc (the 2D disc gallery) for '2D', and the holo single-body scene (the 3D gallery
  // spin) for '3D'. Rendered as a positioned overlay above the filtered document canvas.
  import { onDestroy } from 'svelte';
  import type { CelestialBody } from '$lib/types';
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';

  export let body: CelestialBody | null = null;
  export let mode: 'sphere' | 'disc' | 'flat' = 'disc';
  export let ringed = false;
  export let ringDensity = 0.6;
  export let mono = false; // bleach to grey (for a tinting filter / monochrome scheme)

  $: is3D = mode === 'sphere';

  let canvas: HTMLCanvasElement;
  let scene: { dispose(): void } | null = null;
  let builtId: string | null = null;

  // (Re)build the 3D scene when the body changes or 3D turns on; tear it down otherwise.
  $: maybeBuild(is3D, canvas, body?.id);
  async function maybeBuild(on: boolean, cv: HTMLCanvasElement | undefined, id: string | undefined) {
    if (!on || !cv || !body) { scene?.dispose(); scene = null; builtId = null; return; }
    if (id === builtId && scene) return;
    scene?.dispose(); scene = null; builtId = id ?? null;
    const { createBodyScene } = await import('$lib/holo/singleBodyScene');
    if (canvas && body && body.id === builtId) scene = createBodyScene(canvas, body, { ringed });
  }
  onDestroy(() => scene?.dispose());
</script>

{#if is3D}
  <canvas class="bg-3d" class:mono bind:this={canvas}></canvas>
{:else if body}
  <div class="bg-2d" class:mono><PlanetDisc {body} {ringed} {ringDensity} showStamp={false} size={220} /></div>
{/if}

<style>
  .bg-3d { width: 100%; height: 100%; display: block; }
  .bg-2d { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .bg-2d :global(svg) { max-width: 100%; max-height: 100%; height: auto; width: auto; }
  /* Monochrome scheme: bleach the picture to grey so a tinting filter (CRT/NV) colours it. */
  .mono { filter: grayscale(1) brightness(1.06) contrast(1.02); }
</style>
