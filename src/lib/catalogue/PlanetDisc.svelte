<script lang="ts">
  // A small "true-colour" disc for The Guide — reuses the ORRERY's procedural planet texture
  // (land/ocean/cloud/banding via getPlanetTexture) clipped to a sphere, with a cartoon vignette,
  // a Saturn-style ring, a distinct belt glyph (grey field of rocks by density), and the obligatory
  // [Mostly Harmless] stamp for any world called Earth.
  import type { CelestialBody, ApparentColorStop } from '$lib/types';
  import { starColorFromTempK } from '$lib/rendering/apparentColor';
  import { getPlanetTexture } from '$lib/rendering/planetTexture';
  import { oblatePolarFactor } from '$lib/rendering/bodyShape';
  import { auroraEmitter } from '$lib/physics/aurora';
  import { EARTH_MASS_KG } from '$lib/constants';

  export let body: CelestialBody;
  export let ringed = false;
  export let ringDensity = 0.6;   // 0..1 (debris density of the ring); scales its drawn size/opacity
  export let size = 132;

  // Oblate flattening (E4): squash the disc body vertically about the centre (y=50) so a fast rotator
  // reads as flattened. Rings keep their own plane, so only the body group is transformed.
  $: discPolF = oblatePolarFactor(body.oblateness);
  $: discSquash = discPolF < 0.999 ? `translate(0 ${(50 * (1 - discPolF)).toFixed(2)}) scale(1 ${discPolF.toFixed(3)})` : '';

  // Rotationally unstable (Phase G): a body spun past ~0.8 of its break-up limit has flown apart into a
  // ring — draw a true torus (a tilted annulus with a hole) instead of an ever-thinner lens. Oblateness
  // 0.8 corresponds to spin fraction ~0.8 (the near-breakup / toroidal regime).
  $: isToroid = !isStar(body) && !isBelt(body) && (body.oblateness ?? 0) >= 0.8;

  // Light direction for the day/night terminator + specular highlight. Default (null) is the stylised
  // upper-left look the stand-alone Guide uses; the orrery passes the true angle (radians) toward the
  // primary star so the terminator is physically correct when this disc is reused there.
  export let lightAngle: number | null = null;
  export let showStamp = true;   // The Guide's "Mostly Harmless" Earth easter egg; off when reused in the orrery
  // The whole body group is rotated by the axial tilt as its final step (so the squash, bands, rings and
  // poles all tilt together). The day/night terminator must still point at the STAR, so we express its
  // light direction in the BODY frame — the real angle MINUS the tilt — and let the group's rotation put
  // it back. (Default null light = the Guide's stylised upper-left.)
  const DEFAULT_LIGHT_ANGLE = Math.atan2(-0.55, -0.4);   // upper-left
  $: bodyTiltRad = ((body.axial_tilt_deg ?? 0) * Math.PI) / 180;
  $: _effLA = (lightAngle ?? DEFAULT_LIGHT_ANGLE) - bodyTiltRad;
  $: _lux = Math.cos(_effLA);
  $: _luy = Math.sin(_effLA);
  $: termC = { x1: 50 + 50 * _lux, y1: 50 + 50 * _luy, x2: 50 - 50 * _lux, y2: 50 - 50 * _luy };
  $: hlCx = Math.round(50 + 16 * _lux);
  $: hlCy = Math.round(50 + 16 * _luy);

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
  // Emission colour for a self-luminous brown dwarf by effective temperature (K): cool → deep red, hot
  // young L-dwarf → amber. Interpolates between calibrated blackbody-ish stops (never blue — BDs are cool).
  function bdGlowColour(teff: number): string {
    const stops: [number, string][] = [
      [250, '#3a0f06'], [600, '#6e1808'], [1000, '#a3320c'], [1400, '#c85614'],
      [1800, '#e07d22'], [2300, '#f2a03e'], [2800, '#ffbf6e']
    ];
    if (teff <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      if (teff <= stops[i][0]) {
        const [t0, c0] = stops[i - 1], [t1, c1] = stops[i];
        const f = (teff - t0) / (t1 - t0);
        const a = hexToRgb(c0), b = hexToRgb(c1);
        return rgbHex([a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f]);
      }
    }
    return stops[stops.length - 1][1];
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

  // Self-luminous brown dwarf (thermal/self-luminous, value = its effective temperature): it radiates
  // its OWN heat, so it glows like a dim, cool star — an emission halo coloured by that temperature
  // (deep red when cold → amber when a hot young L-dwarf). Never blue: brown dwarfs are cool.
  $: selfLumTag = (body.tags ?? []).find((t) => t.key === 'thermal/self-luminous');
  $: isSelfLuminous = !!selfLumTag && !isStar(body) && !isBelt(body);
  $: selfLumTeff = selfLumTag ? (Number(selfLumTag.value) || 0) : 0;
  $: selfLumColor = bdGlowColour(selfLumTeff);

  // Atmosphere limb-glow (Phase G): a soft halo hugging the limb, its strength from the surface
  // pressure (log-scaled: wispy ~0.02 bar → faint, Earth 1 bar → moderate, thick Venus/giant → full),
  // coloured by the atmosphere/haze palette stop (else a default sky blue).
  $: atmPressure = (body.atmosphere?.pressure_bar ?? (body.atmosphere as any)?.pressure_atm ?? 0) as number;
  $: hasAtmoGlow = !isStar(body) && !isBelt(body) && atmPressure > 0.02;
  $: atmColor = palette.find((p) => p.role === 'atmosphere')?.hex
    ?? palette.find((p) => p.role === 'cloud')?.hex ?? '#9fc6e8';
  $: atmStrength = Math.max(0, Math.min(1, (Math.log10(Math.max(1e-3, atmPressure)) + 2) / 3));

  // Cratered surface (Phase G flourish): an old, airless, geologically DEAD world has no atmosphere to
  // burn up impactors and no resurfacing to erase the scars, so it accumulates craters (Mercury, the
  // Moon, Callisto). Driven by that airless + inactive condition, or an explicit impact-record tag.
  $: hasCraters = !isStar(body) && !isBelt(body) && atmPressure < 0.02
    && (tagKeys.includes('geology/inactive') || tagKeys.includes('science/impact-record'));
  $: craters = (() => {
    if (!hasCraters) return [] as { cx: number; cy: number; r: number }[];
    let s = 41; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const n = 12 + Math.floor(rnd() * 6);                       // 12..17 craters, seeded by the body id
    return Array.from({ length: n }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd()) * 26; // spread over the disc, inside the limb
      return { cx: 50 + Math.cos(t) * rr, cy: 50 + Math.sin(t) * rr, r: 1.1 + rnd() * rnd() * 4 };
    });
  })();

  // Auroras (Phase G): a spiky glowing OVAL ringing each magnetic pole (Hubble-Jupiter style), driven by
  // the aurora/* tag's strength. Colour comes from the atmosphere's dominant auroral emitter, like real
  // skies: atomic oxygen → green, nitrogen → blue-violet, hydrogen/helium giants → red-pink, CO₂ → violet.
  $: auroraTag = (body.tags ?? []).find((t) => t.key.startsWith('aurora/'));
  $: auroraStr = auroraTag ? Math.max(0, Math.min(1.3, parseFloat(auroraTag.value ?? '0') || 0)) : 0;
  $: hasAurora = !isStar(body) && !isBelt(body) && auroraStr > 0;
  $: auroraBrilliant = auroraStr >= 0.55;
  $: auroraCol = (() => { const e = auroraEmitter(body); return { core: e.hex, tip: e.tip }; })();
  // Spiky, swirled oval ringing a pole — a foreshortened ellipse whose points alternate out into spikes
  // (auroral curtains) and drift tangentially (a swirl), so it hugs the pole rather than floating flat.
  function auroraOval(cy: number, off: number): string {
    let s = 23 + off; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    const rx = 11 + auroraStr * 10, ry = 4.5 + auroraStr * 3.5, N = 44, spikeAmp = 0.16 + auroraStr * 0.5;
    let d = '';
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * 2 * Math.PI + (rnd() - 0.5) * 0.16;             // swirl: jitter the angle
      const spike = 1 + (i % 2 === 0 ? spikeAmp * (0.4 + rnd() * 1.0) : 0); // outward curtains
      const x = 50 + Math.cos(a) * rx * spike;
      const y = cy + Math.sin(a) * ry * spike;
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1) + ' ';
    }
    return d + 'Z';
  }
  // Sit tight to the poles when faint, extend toward the equator as strength grows. The far (bottom)
  // oval is pulled up a touch so its VISIBLE lower arc stays on the disc (the upper half is clipped
  // away behind the planet), rather than dropping off the bottom limb.
  $: auroraTopCy = 22 + auroraStr * 9;
  $: auroraBotCy = 76 - auroraStr * 3;
  $: auroraTop = hasAurora ? auroraOval(auroraTopCy, 3) : '';
  $: auroraBot = hasAurora ? auroraOval(auroraBotCy, 8) : '';
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
      <radialGradient id="sph-{uid}" cx="{hlCx}%" cy="{hlCy}%" r="72%">
        <stop offset="0%" stop-color={shade(base, 0.45)} />
        <stop offset="55%" stop-color={base} />
        <stop offset="100%" stop-color={shade(base, -0.55)} />
      </radialGradient>
      <!-- Roundness vignette laid over the flat texture so it reads as a sphere. -->
      <radialGradient id="vig-{uid}" cx="{hlCx}%" cy="{hlCy}%" r="72%">
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
      <linearGradient id="term-{uid}" x1="{termC.x1}%" y1="{termC.y1}%" x2="{termC.x2}%" y2="{termC.y2}%">
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
      {#if isSelfLuminous}
        <!-- Self-luminous emission halo: strong at the limb (r≈30), glowing outward to r=52 (rendered
             behind the disc, so it reads as a glow ringing the body — a dim, cool "failed star"). -->
        <radialGradient id="bdglow-{uid}" gradientUnits="userSpaceOnUse" cx="50" cy="50" r="52">
          <stop offset="0" stop-color={selfLumColor} stop-opacity="0.85" />
          <stop offset="0.55" stop-color={selfLumColor} stop-opacity="0.72" />
          <stop offset="0.62" stop-color={selfLumColor} stop-opacity="0.5" />
          <stop offset="0.82" stop-color={selfLumColor} stop-opacity="0.18" />
          <stop offset="1" stop-color={selfLumColor} stop-opacity="0" />
        </radialGradient>
      {/if}
      {#if hasAurora}
        <filter id="aurblur-{uid}" x="-40%" y="-40%" width="180%" height="180%">
          <feGaussianBlur stdDeviation={(0.8 + auroraStr * 1.3).toFixed(2)} />
        </filter>
        <!-- Auroras glow a touch ABOVE the atmosphere, so clip to a disc slightly larger than the
             sphere (r=30) — they poke a little past the limb instead of stopping dead at the edge. -->
        <clipPath id="aurclip-{uid}"><circle cx="50" cy="50" r="33" /></clipPath>
        <!-- Slight top-down view: the far (bottom) pole's oval recedes behind the planet. Fade its
             upper half out SOFTLY (a vertical gradient mask) rather than a hard "half-painted" cut. -->
        <linearGradient id="aurbotgrad-{uid}" gradientUnits="userSpaceOnUse" x1="0" y1={(auroraBotCy - 5).toFixed(1)} x2="0" y2={(auroraBotCy + 4).toFixed(1)}>
          <stop offset="0" stop-color="#000" />
          <stop offset="1" stop-color="#fff" />
        </linearGradient>
        <mask id="aurbotmask-{uid}"><rect x="0" y="0" width="100" height="100" fill="url(#aurbotgrad-{uid})" /></mask>
      {/if}
      {#if magma.length}
        <radialGradient id="magma-{uid}" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stop-color={isLava ? 'rgba(255,244,200,0.98)' : 'rgba(255,210,120,0.98)'} />
          <stop offset="45%" stop-color={isLava ? 'rgba(255,120,20,0.9)' : 'rgba(220,70,18,0.9)'} />
          <stop offset="100%" stop-color={isLava ? 'rgba(255,120,20,0)' : 'rgba(220,70,18,0)'} />
        </radialGradient>
      {/if}
      {#if isToroid}
        <mask id="torus-{uid}">
          <ellipse cx="50" cy="50" rx="34" ry="10" fill="white" />
          <ellipse cx="50" cy="50" rx="15" ry="4.4" fill="black" />
        </mask>
        <linearGradient id="torusfill-{uid}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color={shade(base, 0.28)} />
          <stop offset="45%" stop-color={base} />
          <stop offset="100%" stop-color={shade(base, -0.42)} />
        </linearGradient>
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
    {:else if isToroid}
      <!-- Spun past break-up → a ring. A tilted annulus with a hole, shaded for a little volume. -->
      <ellipse cx="50" cy="50" rx="34" ry="10" fill="url(#torusfill-{uid})" mask="url(#torus-{uid})" />
      <path d="M16 50 A34 10 0 0 0 84 50" fill="none" stroke={shade(base, 0.5)} stroke-width="0.8" opacity="0.55" />
      <ellipse cx="50" cy="50" rx="15" ry="4.4" fill="none" stroke={shade(base, -0.5)} stroke-width="0.6" opacity="0.5" />
    {:else}
      <!-- FINAL axial-tilt rotation for the WHOLE body system — glow, RINGS (equatorial plane) and the
           squashed body with all its surface features — so the oblate squash, bands, poles and rings all
           tilt together. The terminator's light is pre-compensated (above) so it still points at the star. -->
      <g transform="rotate({(body.axial_tilt_deg ?? 0).toFixed(1)} 50 50)">
      {#if isStar(body)}
        <circle cx="50" cy="50" r="48" fill="url(#glow-{uid})" />
      {/if}
      {#if isSelfLuminous}
        <!-- A self-luminous brown dwarf glows like a dim, cool star (behind the disc → a halo). -->
        <circle cx="50" cy="50" r="52" fill="url(#bdglow-{uid})" />
      {/if}

      {#if ringed}
        <ellipse cx="50" cy="50" rx={ringRx} ry={ringRy} fill="none" stroke={shade(base, 0.2)} stroke-width={ringW} opacity={ringBackOp}
                 transform="rotate(-18 50 50)" />
      {/if}

      <!-- Body (oblate-squashed about the centre; the whole group above carries the axial tilt). -->
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

      <!-- Impact craters on an old airless surface: a dark bowl with a faint sunlit rim. -->
      {#if hasCraters}
        <g clip-path="url(#clip-{uid})">
          {#each craters as c}
            <circle cx={c.cx} cy={c.cy} r={c.r} fill="rgba(0,0,0,0.16)" stroke="rgba(236,236,240,0.16)" stroke-width={Math.max(0.25, c.r * 0.16)} />
          {/each}
        </g>
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
      <!-- Auroral ovals ringing the poles: spiky glowing rings, colour set by the atmosphere gas. -->
      {#if hasAurora}
        {@const gw = 2.4 + auroraStr * 3.4}
        {@const cw = 0.7 + auroraStr * 1.1}
        {@const go = Math.min(0.5, 0.2 + auroraStr * 0.45)}
        {@const co = Math.min(0.95, 0.45 + auroraStr * 0.55)}
        {@const fo = 0.1 + auroraStr * 0.14}
        <!-- The magnetic poles follow the spin axis; the outer body-group rotation carries the tilt. -->
        <!-- Near pole (top): the whole oval faces us; pokes slightly past the limb. -->
        <g clip-path="url(#aurclip-{uid})">
          <path d={auroraTop} fill={auroraCol.core} fill-opacity={fo} stroke={auroraCol.core} stroke-width={gw} stroke-linejoin="round" opacity={go} filter="url(#aurblur-{uid})" />
          <path d={auroraTop} fill="none" stroke={auroraCol.core} stroke-width={cw} stroke-linejoin="round" opacity={co} />
          {#if auroraBrilliant}
            <path d={auroraTop} fill="none" stroke={auroraCol.tip} stroke-width={cw * 0.6} stroke-linejoin="round" opacity="0.6" />
          {/if}
        </g>
        <!-- Far pole (bottom): upper half fades behind the planet; lower arc pokes past the bottom limb. -->
        <g clip-path="url(#aurclip-{uid})" mask="url(#aurbotmask-{uid})">
          <path d={auroraBot} fill={auroraCol.core} fill-opacity={fo} stroke={auroraCol.core} stroke-width={gw} stroke-linejoin="round" opacity={go} filter="url(#aurblur-{uid})" />
          <path d={auroraBot} fill="none" stroke={auroraCol.core} stroke-width={cw} stroke-linejoin="round" opacity={co} />
          {#if auroraBrilliant}
            <path d={auroraBot} fill="none" stroke={auroraCol.tip} stroke-width={cw * 0.6} stroke-linejoin="round" opacity="0.6" />
          {/if}
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
      </g>
    {/if}
  </svg>

  {#if isEarth && showStamp}
    <!-- Don't Panic. (Guide only — suppressed when this disc is reused as an orrery overlay.) -->
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
