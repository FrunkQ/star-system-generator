<script lang="ts">
  // A small "true-colour" disc for The Guide — reuses the ORRERY's procedural planet texture
  // (land/ocean/cloud/banding via getPlanetTexture) clipped to a sphere, with a cartoon vignette,
  // a Saturn-style ring, a distinct belt glyph (grey field of rocks by density), and the obligatory
  // [Mostly Harmless] stamp for any world called Earth.
  import type { CelestialBody, ApparentColorStop } from '$lib/types';
  import { starColorFromTempK } from '$lib/rendering/apparentColor';
  import { getPlanetTexture } from '$lib/rendering/planetTexture';
  import { oblatePolarFactor } from '$lib/rendering/bodyShape';
  import { EARTH_MASS_KG } from '$lib/constants';

  export let body: CelestialBody;
  export let ringed = false;
  export let ringDensity = 0.6;   // 0..1 (debris density of the ring); scales its drawn size/opacity
  export let size = 132;

  // Oblate flattening (E4): squash the disc body vertically about the centre (y=50) so a fast rotator
  // reads as flattened. Rings keep their own plane, so only the body group is transformed.
  $: discPolF = oblatePolarFactor(body.oblateness);
  $: discSquash = discPolF < 0.999 ? `translate(0 ${(50 * (1 - discPolF)).toFixed(2)}) scale(1 ${discPolF.toFixed(3)})` : '';

  // Ring geometry from density: sparse rings are a thin faint hoop, dense ones a broad bright band.
  $: ringRx = 38 + ringDensity * 10;       // outer extent 38..48
  $: ringW = 2 + ringDensity * 8;          // band thickness 2..10
  $: ringRy = 9 + ringDensity * 5;         // tilt depth 9..14
  $: ringBackOp = 0.25 + ringDensity * 0.4;
  $: ringFrontOp = 0.4 + ringDensity * 0.5;

  const isStar = (b: CelestialBody) => b.roleHint === 'star';
  const isBelt = (b: CelestialBody) => b.roleHint === 'belt' || b.roleHint === 'ring';

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

  $: base = isStar(body)
    ? (body.apparentColorHex ?? rgbHex(starColorFromTempK(body.temperatureK)))
    : (body.apparentColorHex ?? body.apparentColor?.hex ?? '#8a8f99');

  // The real orrery texture (data URL), when the body carries the apparent-colour palette it needs.
  // Falls back to a flat shaded sphere if unavailable (e.g. no palette, or no canvas in tests).
  $: textureUrl = (() => {
    if (isStar(body) || isBelt(body) || !body.apparentColor) return null;
    try { return getPlanetTexture(body)?.toDataURL() ?? null; } catch { return null; }
  })();

  // Bands only as a FALLBACK (the texture already bands giants).
  $: banding = (textureUrl || isStar(body) || isBelt(body)) ? 0 : (body.apparentColor?.banding ?? 0);
  $: palette = (body.apparentColor?.palette ?? []) as ApparentColorStop[];
  $: bands = (() => {
    if (banding < 2) return [];
    const n = Math.min(banding, 9);
    const cols = palette.length ? palette.map((p) => p.hex) : [base, shade(base, 0.12), shade(base, -0.12)];
    return Array.from({ length: n }, (_, i) => ({ y: (i / n) * 100, h: 100 / n + 0.5, fill: cols[i % cols.length] }));
  })();

  // Belt: a grey field of rocks, sparse → dense by debris density (massKg proxy, log 1e-5..1 Me).
  function densityFrac(massKg: number | undefined): number {
    if (!massKg || massKg <= 0) return 0.35;
    const me = massKg / EARTH_MASS_KG;
    return Math.max(0, Math.min(1, (Math.log(me) - Math.log(1e-5)) / (Math.log(1) - Math.log(1e-5))));
  }
  $: rocks = (() => {
    if (!isBelt(body)) return [] as { x: number; y: number; r: number }[];
    const d = densityFrac(body.massKg);
    const n = Math.round(5 + d * 34); // 5 (sparse) → ~39 (dense)
    let s = 7; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    return Array.from({ length: n }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd());     // fill the ellipse evenly
      return { x: 50 + Math.cos(t) * rr * 44, y: 50 + Math.sin(t) * rr * 13, r: 0.8 + rnd() * 1.6 };
    });
  })();

  $: isEarth = (body.name || '').trim().toLowerCase() === 'earth' && body.roleHint !== 'star';

  // Match the orrery: a day/night terminator (sharper for tidally locked worlds) and equatorial
  // magma patches on tidally volcanic worlds. Lit from the upper-left (same as the vignette).
  $: locked = !!(body as any).tidallyLocked;
  $: tagKeys = (body.tags ?? []).map((t) => t.key);
  $: isLava = tagKeys.includes('tidal/lava-flows');
  // Polar ice caps (Phase G): frost at the cold poles / night side of a world liquid at its mean
  // temperature. Tag-driven (climate/polar-ice), drawn on the surface so the terminator dims them.
  $: hasPolarIce = !isStar(body) && !isBelt(body) && tagKeys.includes('climate/polar-ice');

  // Atmosphere limb-glow (Phase G): a soft halo hugging the limb, its strength from the surface
  // pressure (log-scaled: wispy ~0.02 bar → faint, Earth 1 bar → moderate, thick Venus/giant → full),
  // coloured by the atmosphere/haze palette stop (else a default sky blue).
  $: atmPressure = (body.atmosphere?.pressure_bar ?? (body.atmosphere as any)?.pressure_atm ?? 0) as number;
  $: hasAtmoGlow = !isStar(body) && !isBelt(body) && atmPressure > 0.02;
  $: atmColor = palette.find((p) => p.role === 'atmosphere')?.hex
    ?? palette.find((p) => p.role === 'cloud')?.hex ?? '#9fc6e8';
  $: atmStrength = Math.max(0, Math.min(1, (Math.log10(Math.max(1e-3, atmPressure)) + 2) / 3));
  $: magma = (() => {
    if (isStar(body) || isBelt(body)) return [] as { cx: number; cy: number; r: number }[];
    const volc = isLava || tagKeys.includes('tidal/volcanism') || tagKeys.includes('tidal/hotspots');
    if (!volc) return [];
    const n = isLava ? 7 : tagKeys.includes('tidal/volcanism') ? 5 : 3;
    let s = 11; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    return Array.from({ length: n }, () => {
      const lat = rnd() * 2 - 1; const latEq = lat * lat * lat * 0.6;      // dense near the equator
      const lon = rnd() * 2 - 1;
      return { cx: 50 + lon * 26 * Math.sqrt(Math.max(0, 1 - latEq * latEq)), cy: 50 + latEq * 28, r: 1.8 + rnd() * 3 };
    });
  })();
  $: showShade = !isStar(body) && !isBelt(body);

  const uid = Math.random().toString(36).slice(2, 8);
</script>

<div class="disc-wrap" style="width:{size}px">
  <svg viewBox="0 0 100 100" width={size} height={size} class="planet-disc" role="img"
       aria-label="Rendered impression of {body.name}">
    <defs>
      <radialGradient id="sph-{uid}" cx="38%" cy="34%" r="72%">
        <stop offset="0%" stop-color={shade(base, 0.45)} />
        <stop offset="55%" stop-color={base} />
        <stop offset="100%" stop-color={shade(base, -0.55)} />
      </radialGradient>
      <!-- Roundness vignette laid over the flat texture so it reads as a sphere. -->
      <radialGradient id="vig-{uid}" cx="38%" cy="34%" r="72%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.28)" />
        <stop offset="42%" stop-color="rgba(255,255,255,0)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0.5)" />
      </radialGradient>
      {#if isStar(body)}
        <radialGradient id="glow-{uid}" cx="50%" cy="50%" r="50%">
          <stop offset="55%" stop-color={base} stop-opacity="0.55" />
          <stop offset="100%" stop-color={base} stop-opacity="0" />
        </radialGradient>
      {/if}
      <clipPath id="clip-{uid}"><circle cx="50" cy="50" r="30" /></clipPath>
      <clipPath id="front-{uid}"><rect x="0" y="50" width="100" height="50" /></clipPath>
      <clipPath id="belt-{uid}"><ellipse cx="50" cy="50" rx="46" ry="15" /></clipPath>
      <!-- Day/night terminator, lit from the upper-left → dark lower-right. Locked = sharp. -->
      <linearGradient id="term-{uid}" x1="0%" y1="0%" x2="100%" y2="55%">
        {#if locked}
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="50%" stop-color="rgba(0,0,0,0)" />
          <stop offset="62%" stop-color="rgba(0,0,0,0.45)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.62)" />
        {:else}
          <stop offset="0%" stop-color="rgba(0,0,0,0)" />
          <stop offset="55%" stop-color="rgba(0,0,0,0.05)" />
          <stop offset="100%" stop-color="rgba(0,0,0,0.6)" />
        {/if}
      </linearGradient>
      {#if hasPolarIce}
        <!-- Frost fading from the pole toward the cap edge (top cap fades downward, bottom upward). -->
        <linearGradient id="icetop-{uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(244,250,255,0.96)" />
          <stop offset="62%" stop-color="rgba(228,242,255,0.72)" />
          <stop offset="100%" stop-color="rgba(216,236,255,0)" />
        </linearGradient>
        <linearGradient id="icebot-{uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(216,236,255,0)" />
          <stop offset="38%" stop-color="rgba(228,242,255,0.72)" />
          <stop offset="100%" stop-color="rgba(244,250,255,0.96)" />
        </linearGradient>
      {/if}
      {#if hasAtmoGlow}
        <!-- Halo hugging the limb (peak at r=30), fading out to r=40 and slightly inward. -->
        <radialGradient id="atmglow-{uid}" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="40">
          <stop offset="0" stop-color={atmColor} stop-opacity="0" />
          <stop offset="0.68" stop-color={atmColor} stop-opacity="0" />
          <stop offset="0.75" stop-color={atmColor} stop-opacity={(0.55 * atmStrength).toFixed(2)} />
          <stop offset="0.9" stop-color={atmColor} stop-opacity={(0.16 * atmStrength).toFixed(2)} />
          <stop offset="1" stop-color={atmColor} stop-opacity="0" />
        </radialGradient>
      {/if}
      {#if magma.length}
        <radialGradient id="magma-{uid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color={isLava ? 'rgba(255,244,200,0.98)' : 'rgba(255,210,120,0.98)'} />
          <stop offset="45%" stop-color={isLava ? 'rgba(255,120,20,0.9)' : 'rgba(220,70,18,0.9)'} />
          <stop offset="100%" stop-color={isLava ? 'rgba(255,120,20,0)' : 'rgba(220,70,18,0)'} />
        </radialGradient>
      {/if}
    </defs>

    {#if isBelt(body)}
      <!-- Belt: faint grey annulus field + scattered rocks (more = denser). -->
      <ellipse cx="50" cy="50" rx="46" ry="15" fill="rgba(150,150,160,0.12)" stroke="rgba(170,170,180,0.35)" stroke-width="0.6" />
      <g clip-path="url(#belt-{uid})">
        {#each rocks as rk}
          <circle cx={rk.x} cy={rk.y} r={rk.r} fill="#b8b8c0" opacity="0.85" />
        {/each}
      </g>
    {:else}
      {#if isStar(body)}
        <circle cx="50" cy="50" r="48" fill="url(#glow-{uid})" />
      {/if}

      {#if ringed}
        <ellipse cx="50" cy="50" rx={ringRx} ry={ringRy} fill="none" stroke={shade(base, 0.2)} stroke-width={ringW} opacity={ringBackOp}
                 transform="rotate(-18 50 50)" />
      {/if}

      <!-- Body (oblate-squashed about the centre; rings keep their own plane). -->
      <g transform={discSquash}>
      <!-- Disc: the real orrery texture if we have it, else a flat shaded sphere. -->
      {#if textureUrl}
        <image href={textureUrl} x="20" y="20" width="60" height="60" clip-path="url(#clip-{uid})" preserveAspectRatio="xMidYMid slice" />
        <circle cx="50" cy="50" r="30" fill="url(#vig-{uid})" />
      {:else}
        <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" />
        {#if bands.length}
          <g clip-path="url(#clip-{uid})" opacity="0.5">
            {#each bands as b}<rect x="20" y={b.y} width="60" height={b.h} fill={b.fill} />{/each}
          </g>
          <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" opacity="0.35" />
        {/if}
      {/if}

      <!-- Polar ice caps sit on the surface (under the terminator, so the night side dims them). -->
      {#if hasPolarIce}
        <g clip-path="url(#clip-{uid})">
          <ellipse cx="50" cy="20" rx="26" ry="17" fill="url(#icetop-{uid})" />
          <ellipse cx="50" cy="80" rx="26" ry="17" fill="url(#icebot-{uid})" />
        </g>
      {/if}

      <!-- Terminator first, then self-luminous magma on top so vents glow on the night side. -->
      {#if showShade}
        <circle cx="50" cy="50" r="30" fill="url(#term-{uid})" />
      {/if}
      {#if magma.length}
        <g clip-path="url(#clip-{uid})">
          {#each magma as m}<circle cx={m.cx} cy={m.cy} r={m.r} fill="url(#magma-{uid})" />{/each}
        </g>
      {/if}
      <!-- Atmosphere limb-glow on top (transparent centre leaves the surface untouched). -->
      {#if hasAtmoGlow}
        <circle cx="50" cy="50" r="40" fill="url(#atmglow-{uid})" />
      {/if}
      </g>

      {#if ringed}
        <ellipse cx="50" cy="50" rx={ringRx} ry={ringRy} fill="none" stroke={shade(base, 0.32)} stroke-width={ringW} opacity={ringFrontOp}
                 transform="rotate(-18 50 50)" clip-path="url(#front-{uid})" />
      {/if}
    {/if}
  </svg>

  {#if isEarth}
    <!-- Don't Panic. -->
    <span class="harmless-stamp">Mostly Harmless</span>
  {/if}
</div>

<style>
  .disc-wrap { position: relative; display: inline-block; max-width: 100%; }
  .planet-disc { display: block; max-width: 100%; height: auto; }
  .harmless-stamp {
    position: absolute;
    right: 2%;
    bottom: 14%;
    transform: rotate(-11deg);
    color: #ff4136;
    border: 2px solid #ff4136;
    border-radius: 3px;
    padding: 1px 6px;
    font-family: 'Courier New', monospace;
    font-weight: 700;
    font-size: 0.62rem;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    white-space: nowrap;
    opacity: 0.82;
    pointer-events: none;
  }
</style>
