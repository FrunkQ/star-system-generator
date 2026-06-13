<script lang="ts">
  // A small procedural "true-colour" disc — the cartoon orrery look (apparent-colour sphere,
  // latitudinal bands for giants, a Saturn-style ring) as a self-contained SVG. Used by The Guide
  // theme instead of a photo, so the companion app matches the orrery's aesthetic. Reads the
  // body's derived apparentColor (palette + banding) that the processor already stored.
  import type { CelestialBody, ApparentColorStop } from '$lib/types';
  import { starColorFromTempK } from '$lib/rendering/apparentColor';

  export let body: CelestialBody;
  export let ringed = false;
  export let size = 132;

  const isStar = (b: CelestialBody) => b.roleHint === 'star';

  function rgbHex(rgb: [number, number, number]): string {
    const c = (v: number) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
    return `#${c(rgb[0])}${c(rgb[1])}${c(rgb[2])}`;
  }
  function hexToRgb(hex: string): [number, number, number] {
    const h = hex.replace('#', '');
    const n = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    return [parseInt(n.slice(0, 2), 16), parseInt(n.slice(2, 4), 16), parseInt(n.slice(4, 6), 16)];
  }
  function shade(hex: string, f: number): string {
    const [r, g, b] = hexToRgb(hex);
    return f >= 0 ? rgbHex([r + (255 - r) * f, g + (255 - g) * f, b + (255 - b) * f])
                  : rgbHex([r * (1 + f), g * (1 + f), b * (1 + f)]);
  }

  // Base colour: the body's own derived apparent colour, else a star colour, else neutral grey.
  $: base = isStar(body)
    ? (body.apparentColorHex ?? rgbHex(starColorFromTempK(body.temperatureK)))
    : (body.apparentColorHex ?? body.apparentColor?.hex ?? '#8a8f99');

  // Latitudinal bands for giants — drawn from the palette so Jupiter reads banded, not flat.
  $: banding = isStar(body) ? 0 : (body.apparentColor?.banding ?? 0);
  $: palette = (body.apparentColor?.palette ?? []) as ApparentColorStop[];
  $: bands = (() => {
    if (banding < 2) return [];
    const n = Math.min(banding, 9);
    const cols = palette.length ? palette.map((p) => p.hex) : [base, shade(base, 0.12), shade(base, -0.12)];
    const out: { y: number; h: number; fill: string }[] = [];
    for (let i = 0; i < n; i++) {
      out.push({ y: (i / n) * 100, h: 100 / n + 0.5, fill: cols[i % cols.length] });
    }
    return out;
  })();

  const uid = Math.random().toString(36).slice(2, 8);
</script>

<svg viewBox="0 0 100 100" width={size} height={size} class="planet-disc" role="img"
     aria-label="Rendered impression of {body.name}">
  <defs>
    <!-- Cartoon sphere shading: bright highlight upper-left → dark terminator lower-right. -->
    <radialGradient id="sph-{uid}" cx="38%" cy="34%" r="72%">
      <stop offset="0%" stop-color={shade(base, 0.45)} />
      <stop offset="55%" stop-color={base} />
      <stop offset="100%" stop-color={shade(base, -0.55)} />
    </radialGradient>
    {#if isStar(body)}
      <radialGradient id="glow-{uid}" cx="50%" cy="50%" r="50%">
        <stop offset="55%" stop-color={base} stop-opacity="0.55" />
        <stop offset="100%" stop-color={base} stop-opacity="0" />
      </radialGradient>
    {/if}
    <clipPath id="clip-{uid}"><circle cx="50" cy="50" r="30" /></clipPath>
    <clipPath id="front-{uid}"><rect x="0" y="50" width="100" height="50" /></clipPath>
  </defs>

  {#if isStar(body)}
    <circle cx="50" cy="50" r="48" fill="url(#glow-{uid})" />
  {/if}

  <!-- Ring: back half behind the disc. -->
  {#if ringed}
    <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke={shade(base, 0.2)} stroke-width="6" opacity="0.55"
             transform="rotate(-18 50 50)" />
  {/if}

  <!-- The body disc. -->
  <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" />
  {#if bands.length}
    <g clip-path="url(#clip-{uid})" opacity="0.5">
      {#each bands as b}
        <rect x="20" y={b.y} width="60" height={b.h} fill={b.fill} />
      {/each}
    </g>
    <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" opacity="0.35" />
  {/if}

  <!-- Ring: front half over the lower disc, for the Saturn look. -->
  {#if ringed}
    <ellipse cx="50" cy="50" rx="46" ry="13" fill="none" stroke={shade(base, 0.32)} stroke-width="6" opacity="0.75"
             transform="rotate(-18 50 50)" clip-path="url(#front-{uid})" />
  {/if}
</svg>

<style>
  .planet-disc { display: block; max-width: 100%; height: auto; }
</style>
