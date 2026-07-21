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
  import { getClassColor } from '$lib/rendering/colors';
  import { shade } from '$lib/rendering/planetAppearance';

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
  // Simple disc = a plain coloured circle BY TYPE (the schematic's flat class colour — brown/red/blue),
  // as opposed to 'flat' which reuses the full 2D-gallery render (PlanetDisc). Kept stable regardless of
  // the true/flat colour toggle; mono bleaches it via the .mono class.
  $: discColor = body ? getClassColor(body) : '#8892a4';
  $: discHi = shade(discColor, 0.42);
  $: discLo = shade(discColor, -0.5);
  $: discUid = (body?.id ?? 'bg').replace(/[^a-z0-9]/gi, '').slice(-8) || 'bg';
  $: subjectIsStar = ((body as any)?.kind === 'star') || (((body as any)?.classes ?? []).some((c: string) => /star|dwarf/i.test(String(c))));
  // A black hole reads best looking DOWN onto its accretion disc (a wide ellipse), not edge-on.
  $: isBH = !!(body as any)?.isBH || (((body as any)?.classes ?? []).some((c: string) => /black.?hole/i.test(String(c))));
  // Portrait key light: only a NON-luminous body needs one (a star / black hole lights itself). Coloured by
  // the real star so "the sun provides the right colour"; a warm white fallback if the star has no colour.
  $: portrait = (subjectIsStar || isBH) ? null : (starHex || '#fff4e0');
  // One holo look bundle: frame the single body (whole:false + focus zooms it in so it fills the
  // thumbnail), auto-turntable it, no starfield/grid, honour the preset's render + colour, keep the
  // black-hole lensing on. Filter is 'none' (the document's own filter wraps this separately).
  // angleDeg tilts from overhead (0 = straight down, 85 = nearly edge-on): a black hole is framed almost
  // edge-on with a slight tilt above the disc plane — the iconic accretion-disc look (disc as a band with
  // the far side lensed up over the top), matching static/images/star_types/BH_accretion_disk.png.
  $: holoStyle = {
    ...DEFAULT_STYLE,
    whole: false, orbitSpeed: 0.12, angleDeg: isBH ? 82 : 20, skybox: false, grid: 'off',
    lockOverhead: false, lockRotation: false, bodyGfx: 'sphere', render, bodyStyle,
    // auroras OFF for the isolated thumbnail — zoomed to fill the frame their additive shell blooms into a
    // "massive glow"; the full 3D view keeps them. Portrait key light gives the day/night terminator instead.
    unlit: false, lensing: true, auroras: false, bodySize: 1, compression: 0, portrait,
    background: bg, beltStyle: 'rocks', labelSize: 0, filter: 'none', filterParams: undefined
  };
</script>

{#if is3D && system}
  <div class="bg-3d" class:mono><HoloView {system} style={holoStyle} focusedBodyId={body?.id ?? null} labelsVisible={false} /></div>
{:else if mode === 'flat' && body}
  <!-- Flat shape = the full 2D-gallery render (PlanetDisc: texture + surface features + terminator). -->
  <div class="bg-2d" class:mono><PlanetDisc {body} {ringed} {ringDensity} showStamp={false} size={220} /></div>
{:else if body}
  <!-- Simple disc = a plain coloured circle by body TYPE (no texture/features) — the lightweight look. -->
  <div class="bg-2d" class:mono>
    <svg viewBox="0 0 100 100" width="220" height="220" role="img" aria-label="{body.name} (type colour)">
      <defs>
        <radialGradient id="sd-{discUid}" cx="38%" cy="34%" r="72%">
          <stop offset="0%" stop-color={discHi} />
          <stop offset="55%" stop-color={discColor} />
          <stop offset="100%" stop-color={discLo} />
        </radialGradient>
        <clipPath id="sdfront-{discUid}"><rect x="0" y="50" width="100" height="50" /></clipPath>
      </defs>
      {#if ringed}
        <!-- Back half of the ring (behind the body), then the body, then the front half clipped below. -->
        <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke={shade(discColor, 0.2)} stroke-width="4" opacity="0.4" transform="rotate(-18 50 50)" />
      {/if}
      <circle cx="50" cy="50" r="30" fill="url(#sd-{discUid})" />
      {#if ringed}
        <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke={shade(discColor, 0.34)} stroke-width="4" opacity="0.5" transform="rotate(-18 50 50)" clip-path="url(#sdfront-{discUid})" />
      {/if}
    </svg>
  </div>
{/if}

<style>
  .bg-3d { width: 100%; height: 100%; }
  .bg-2d { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; }
  .bg-2d :global(svg) { max-width: 100%; max-height: 100%; height: auto; width: auto; }
  /* Monochrome safety net for the 2D disc (the 3D holo greys itself via bodyStyle='white'). */
  .mono { filter: grayscale(1) brightness(1.06) contrast(1.02); }
</style>
