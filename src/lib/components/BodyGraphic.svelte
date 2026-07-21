<script lang="ts">
  // The body picture in the Guide document's info block — REUSING the existing renderers, not a bespoke
  // one: PlanetDisc (the 2D disc gallery) for '2D', and the REAL holo view (HoloView / createHoloScene)
  // for '3D' — so the 3D body matches the 3D-view render exactly: photosphere + sunspots, black-hole
  // accretion disc + lensing, the render styles (filled / lo-poly / wireframe), and true/flat/mono
  // colour. Rendered as a positioned overlay above the filtered document canvas.
  import type { CelestialBody, System } from '$lib/types';
  import type { RenderStyle } from '$lib/holo/scene';
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';
  import HoloView from '$lib/holo/HoloView.svelte';
  import { DEFAULT_STYLE } from '$lib/holo/holoStyle';

  export let body: CelestialBody | null = null;
  export let system: System | null = null;              // a single-body system for the 3D holo
  export let mode: 'sphere' | 'disc' | 'flat' = 'disc';
  export let ringed = false;
  export let ringDensity = 0.6;
  export let mono = false;                               // safety net: grey the 2D disc under mono
  export let render: RenderStyle = 'filled';            // 3D: filled / lo-poly / wireframe
  export let bodyStyle: 'textured' | 'flat' | 'white' = 'textured'; // 3D: true / flat / monochrome
  export let bg = '#05070c';                             // 3D scene ground — matches the page colour

  $: is3D = mode === 'sphere';
  // One holo look bundle: frame the single body, auto-turntable it, no starfield/grid, honour the
  // preset's render + colour, keep the black-hole lensing + auroras on. Filter is 'none' (the document's
  // own filter is applied by the surrounding canvas, not here).
  // whole:false + a focus on the body zooms the camera IN so the body fills the thumbnail (a whole-system
  // frame leaves a single small body as a dot).
  $: holoStyle = {
    ...DEFAULT_STYLE,
    whole: false, orbitSpeed: 0.12, angleDeg: 14, skybox: false, grid: 'off',
    lockOverhead: false, lockRotation: false, bodyGfx: 'sphere', render, bodyStyle,
    unlit: false, lensing: true, auroras: true, bodySize: 1, compression: 0,
    background: bg, beltStyle: 'rocks', labelSize: 0, filter: 'none', filterParams: undefined
  };
</script>

{#if is3D && system}
  <div class="bg-3d" class:mono><HoloView {system} style={holoStyle} focusedBodyId={body?.id ?? null} labelsVisible={false} /></div>
{:else if body}
  <div class="bg-2d" class:mono><PlanetDisc {body} {ringed} {ringDensity} showStamp={false} size={220} /></div>
{/if}

<style>
  .bg-3d { width: 100%; height: 100%; }
  .bg-2d { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .bg-2d :global(svg) { max-width: 100%; max-height: 100%; height: auto; width: auto; }
  /* Monochrome safety net for the 2D disc (the 3D holo greys itself via bodyStyle='white'). */
  .mono { filter: grayscale(1) brightness(1.06) contrast(1.02); }
</style>
