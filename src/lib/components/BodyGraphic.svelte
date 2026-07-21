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
  export let starHex: string | null = null;              // 3D: colour of the system's star (lights the portrait)

  $: is3D = mode === 'sphere';
  $: subjectIsStar = ((body as any)?.kind === 'star') || (((body as any)?.classes ?? []).some((c: string) => /star|dwarf/i.test(String(c))));
  // A black hole reads best looking DOWN onto its accretion disc (a wide ellipse), not edge-on.
  $: isBH = !!(body as any)?.isBH || (((body as any)?.classes ?? []).some((c: string) => /black.?hole/i.test(String(c))));
  // Portrait key light: only a NON-luminous body needs one (a star / black hole lights itself). Coloured by
  // the real star so "the sun provides the right colour"; a warm white fallback if the star has no colour.
  $: portrait = (subjectIsStar || isBH) ? null : (starHex || '#fff4e0');
  // One holo look bundle: frame the single body (whole:false + focus zooms it in so it fills the
  // thumbnail), auto-turntable it, no starfield/grid, honour the preset's render + colour, keep the
  // black-hole lensing on. Filter is 'none' (the document's own filter wraps this separately).
  // angleDeg tilts from overhead (0 = straight down, 64 = 3/4): a black hole is framed nearly top-down
  // so we look DOWN onto the accretion disc (its full face), not edge-on where it collapses to a line.
  $: holoStyle = {
    ...DEFAULT_STYLE,
    whole: false, orbitSpeed: 0.12, angleDeg: isBH ? 14 : 20, skybox: false, grid: 'off',
    lockOverhead: false, lockRotation: false, bodyGfx: 'sphere', render, bodyStyle,
    // auroras OFF for the isolated thumbnail — zoomed to fill the frame their additive shell blooms into a
    // "massive glow"; the full 3D view keeps them. Portrait key light gives the day/night terminator instead.
    unlit: false, lensing: true, auroras: false, bodySize: 1, compression: 0, portrait,
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
