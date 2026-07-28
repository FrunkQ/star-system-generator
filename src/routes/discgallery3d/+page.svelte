<script lang="ts">
  // 3D reference gallery — the holo counterpart of /discgallery. Renders every example body in one
  // grid so all the 3D renderings (textures, glows, volcanic vents, cryo plumes, star types, black-hole
  // accretion discs) can be reviewed at a glance. Drag to orbit, scroll to zoom, right-drag to pan.
  import { onMount } from 'svelte';

  let canvas: HTMLCanvasElement;

  onMount(() => {
    let handle: { dispose(): void } | null = null;
    let cancelled = false;
    (async () => {
      const { createGalleryScene } = await import('$lib/holo/galleryScene');
      if (cancelled || !canvas) return;
      handle = createGalleryScene(canvas);
    })();
    return () => { cancelled = true; handle?.dispose(); };
  });
</script>

<div class="page">
  <header>
    <h1>Rendered worlds — 3D reference gallery</h1>
    <p>Every example body in the holo engine: surfaces, glows, volcanic vents, cryovolcanic plumes, star
      types and black-hole accretion discs. Drag to orbit · scroll to zoom · right-drag to pan.
      <a href="/discgallery">2D disc gallery →</a></p>
  </header>
  <canvas bind:this={canvas}></canvas>
</div>

<style>
  .page { position: fixed; inset: 0; display: flex; flex-direction: column; background: #05070c; }
  header { padding: 0.6rem 1rem; color: #cdd6e2; border-bottom: 1px solid #1b2230; z-index: 2; }
  header h1 { margin: 0; font-size: 1.05rem; }
  header p { margin: 0.25rem 0 0; font-size: 0.8rem; color: #8fa0b6; }
  header a { color: #6fb0ff; }
  canvas { flex: 1; width: 100%; height: 100%; display: block; touch-action: none; }
</style>
