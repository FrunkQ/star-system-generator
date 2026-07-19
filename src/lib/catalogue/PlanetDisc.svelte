<script lang="ts">
  // A small "true-colour" disc for The Guide — reuses the ORRERY's procedural planet texture
  // (land/ocean/cloud/banding via getPlanetTexture) clipped to a sphere, with a cartoon vignette,
  // a Saturn-style ring, a distinct belt glyph (grey field of rocks by density), and the obligatory
  // [Mostly Harmless] stamp for any world called Earth.
  import type { CelestialBody } from '$lib/types';
  import { getPlanetTexture } from '$lib/rendering/planetTexture';
  import { debrisDensityFrac } from '$lib/rendering/debris';
  import { smallBodyOutline } from './smallBodyShape';
  // THE shared appearance model — resolves every tag/property-driven surface feature (see WS1).
  // This component just draws what the model decides; the orrery + 3D holo read the same model.
  import { deriveAppearance, shade } from '$lib/rendering/planetAppearance';

  export let body: CelestialBody;
  export let ringed = false;
  export let ringDensity = 0.6;   // 0..1 (debris density of the ring); scales its drawn size/opacity
  export let size = 132;

  // Everything tag/property-driven about this body's look, resolved once (WS1). The SVG below just
  // draws what the model decides; seeded geometry (crater/magma/rock positions, aurora paths) is still
  // generated here from the model's flags/counts, so the disc renders identically to before.
  $: a = deriveAppearance(body);

  // Oblate flattening (E4): squash the disc body vertically about the centre (y=50) so a fast rotator
  // reads as flattened. Rings keep their own plane, so only the body group is transformed.
  $: discPolF = a.oblatePolarFactor;
  $: discSquash = discPolF < 0.999 ? `translate(0 ${(50 * (1 - discPolF)).toFixed(2)}) scale(1 ${discPolF.toFixed(3)})` : '';

  // Rotationally unstable (Phase G): a body spun past ~0.8 of its break-up limit has flown apart into a
  // ring — draw a true torus (a tilted annulus with a hole) instead of an ever-thinner lens.
  $: isToroid = a.isToroid;

  // SMALL BODY (composition redesign stage 4): below ~300 km (or any asteroid/* class) a solid body
  // lacks the self-gravity to pull round, so the sphere becomes a seeded IRREGULAR outline (colour still
  // comes from the composition-derived apparent colour like every other body).
  $: isSmallBody = a.isSmallBody;
  $: smallBodyPath = isSmallBody ? smallBodyOutline(body) : '';

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

  $: base = a.baseColorHex;

  // The real orrery texture (data URL), when the body carries the apparent-colour palette it needs.
  // Falls back to a flat shaded sphere if unavailable (e.g. no palette, or no canvas in tests).
  $: textureUrl = (() => {
    if (isStar(body) || isBelt(body) || !body.apparentColor) return null;
    try { return getPlanetTexture(body)?.toDataURL() ?? null; } catch { return null; }
  })();

  // Bands only as a FALLBACK (the texture already bands giants); the model already zeroes stars/belts.
  $: banding = textureUrl ? 0 : a.bandingRaw;
  $: palette = a.palette;
  $: bands = (() => {
    if (banding < 2) return [];
    const n = Math.min(banding, 9);
    const cols = palette.length ? palette.map((p) => p.hex) : [base, shade(base, 0.12), shade(base, -0.12)];
    return Array.from({ length: n }, (_, i) => ({ y: (i / n) * 100, h: 100 / n + 0.5, fill: cols[i % cols.length] }));
  })();

  // Belt: a grey field of rocks, sparse → dense by debris density. Shared rule (rendering/debris).
  const densityFrac = debrisDensityFrac;
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

  $: isEarth = a.isEarth;

  // Day/night terminator is sharper for tidally locked worlds (drawn from this flag below).
  $: locked = a.tidallyLocked;
  // Polar ice caps: frost drawn on the surface (the terminator dims the night side). Model-driven.
  $: hasPolarIce = a.polarIce;

  // Self-luminous brown dwarf: an emission halo coloured by its effective temperature (model-derived).
  $: isSelfLuminous = !!a.selfLumGlow;
  $: selfLumColor = a.selfLumGlow?.colorHex ?? '#a3320c';

  // Atmosphere limb-glow: a soft halo hugging the limb, strength log-scaled from pressure, coloured by
  // the atmosphere/cloud palette stop (model-derived).
  $: hasAtmoGlow = !!a.atmGlow;
  $: atmColor = a.atmGlow?.colorHex ?? '#9fc6e8';
  $: atmStrength = a.atmGlow?.strength ?? 0;

  // Seeded PRNG (by body id + a salt) — every feature seeds its own positions so the look is stable.
  function seeded(salt: number) {
    let s = salt; for (let k = 0; k < body.id.length; k++) s = (s * 31 + body.id.charCodeAt(k)) & 0xffffff;
    return () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  }

  // Cratered surface: count scales with the model's crater DENSITY (surface age); a tidally-locked
  // world biases craters to its LEADING (left) hemisphere. The decision + params are the model's; the
  // seeded positions are generated here.
  $: hasCraters = !!a.craters;
  $: craters = (() => {
    if (!a.craters) return [] as { cx: number; cy: number; r: number }[];
    const rnd = seeded(41);
    const n = Math.round(4 + a.craters.density * 22);          // 4..26 craters by density
    const lead = a.craters.leadBias;
    return Array.from({ length: n }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd()) * 26; // spread over the disc, inside the limb
      let cx = 50 + Math.cos(t) * rr;
      const cy = 50 + Math.sin(t) * rr;
      if (lead > 0 && rnd() < lead) cx = 50 - Math.abs(cx - 50); // reflect onto the leading limb
      return { cx, cy, r: 1.1 + rnd() * rnd() * 4 };
    });
  })();
  // Fresh rayed craters: a bright pit with radiating ejecta, punched into an old surface.
  $: rayedCraters = (() => {
    if (!a.craters || a.craters.rayed <= 0) return [] as { cx: number; cy: number; r: number; rays: string }[];
    const rnd = seeded(83);
    return Array.from({ length: a.craters.rayed }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd()) * 22;
      const cx = 50 + Math.cos(t) * rr, cy = 50 + Math.sin(t) * rr, r = 1.6 + rnd() * 1.8;
      let rays = '';
      const nr = 7 + Math.floor(rnd() * 4);
      for (let i = 0; i < nr; i++) {
        const ang = (i / nr) * 2 * Math.PI + rnd() * 0.3, len = r * (2.5 + rnd() * 2.5);
        rays += `M${cx.toFixed(1)} ${cy.toFixed(1)} L${(cx + Math.cos(ang) * len).toFixed(1)} ${(cy + Math.sin(ang) * len).toFixed(1)} `;
      }
      return { cx, cy, r, rays };
    });
  })();
  // Ice cracks / ridges (Europa lineae): a network of thin bowed chords across the icy crust.
  $: iceCracks = (() => {
    if (!a.iceCracks) return [] as string[];
    const rnd = seeded(59), n = Math.round(4 + a.iceCracks.severity * 12);
    return Array.from({ length: n }, () => {
      const a1 = rnd() * 2 * Math.PI, a2 = a1 + (0.5 + rnd()) * Math.PI;
      const x1 = 50 + Math.cos(a1) * 29, y1 = 50 + Math.sin(a1) * 29;
      const x2 = 50 + Math.cos(a2) * 29, y2 = 50 + Math.sin(a2) * 29;
      const mx = (x1 + x2) / 2 + (rnd() - 0.5) * 12, my = (y1 + y2) / 2 + (rnd() - 0.5) * 12;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    });
  })();
  // Crustal rifts (Charon canyon): one or two bold chasms slicing the crust.
  $: rifts = (() => {
    if (!a.rifts) return [] as string[];
    const rnd = seeded(97), n = Math.round(1 + a.rifts.extent * 2);
    return Array.from({ length: n }, () => {
      const a1 = rnd() * 2 * Math.PI, a2 = a1 + Math.PI + (rnd() - 0.5) * 0.8;
      const x1 = 50 + Math.cos(a1) * 30, y1 = 50 + Math.sin(a1) * 30;
      const x2 = 50 + Math.cos(a2) * 30, y2 = 50 + Math.sin(a2) * 30;
      const mx = (x1 + x2) / 2 + (rnd() - 0.5) * 8, my = (y1 + y2) / 2 + (rnd() - 0.5) * 8;
      return `M${x1.toFixed(1)} ${y1.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
    });
  })();
  // Tholin mottling (irradiated organics): reddish patches (Pluto) or a whole-disc haze tint (Titan).
  $: tholinPatches = (() => {
    if (!a.tholin || a.tholin.atmospheric) return [] as { cx: number; cy: number; r: number }[];
    const rnd = seeded(131), n = 3 + Math.round(a.tholin.strength * 4);
    return Array.from({ length: n }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd()) * 22;
      return { cx: 50 + Math.cos(t) * rr, cy: 50 + Math.sin(t) * rr, r: 6 + rnd() * 9 };
    });
  })();
  // Frost: bright volatile-ice patches (retained N2/CO2/water/SO2).
  $: frostPatches = (() => {
    if (!a.frost) return [] as { cx: number; cy: number; r: number }[];
    const rnd = seeded(163), n = 3 + Math.round(a.frost.coverage * 5);
    return Array.from({ length: n }, () => {
      const t = rnd() * 2 * Math.PI, rr = Math.sqrt(rnd()) * 24;
      return { cx: 50 + Math.cos(t) * rr, cy: 50 + Math.sin(t) * rr, r: 5 + rnd() * 8 };
    });
  })();

  // Auroras: a spiky glowing OVAL ringing each magnetic pole (Hubble-Jupiter style). Strength + emitter
  // colour are model-derived; the swirled oval PATHS are generated here (auroraOval).
  $: auroraStr = a.aurora?.strength ?? 0;
  $: hasAurora = !!a.aurora;
  $: auroraBrilliant = a.aurora?.brilliant ?? false;
  $: auroraCol = { core: a.aurora?.coreHex ?? '#8fe6a0', tip: a.aurora?.tipHex ?? '#dfffe6' };
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
  $: isLava = !!a.magma?.lava;
  $: magma = (() => {
    if (!a.magma) return [] as { cx: number; cy: number; r: number }[];
    const n = a.magma.vents;
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
      <clipPath id="clip-{uid}">{#if isSmallBody}<path d={smallBodyPath} />{:else}<circle cx="50" cy="50" r="30" />{/if}</clipPath>
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
        {#if isSmallBody}
          <path d={smallBodyPath} fill="url(#vig-{uid})" />
        {:else}
          <circle cx="50" cy="50" r="30" fill="url(#vig-{uid})" />
        {/if}
      {:else if isSmallBody}
        <path d={smallBodyPath} fill="url(#sph-{uid})" />
      {:else}
        <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" />
        {#if bands.length}
          <g clip-path="url(#clip-{uid})" opacity="0.5">
            {#each bands as b}<rect x="20" y={b.y} width="60" height={b.h} fill={b.fill} />{/each}
          </g>
          <circle cx="50" cy="50" r="30" fill="url(#sph-{uid})" opacity="0.35" />
        {/if}
      {/if}

      <!-- Tholin mottling: irradiated organics stain the crust. Atmospheric (Titan) = a whole-disc haze
           tint; surface (Pluto) = dark-red patches. Drawn under craters/frost as base albedo. -->
      {#if a.tholin}
        <g clip-path="url(#clip-{uid})">
          {#if a.tholin.atmospheric}
            <circle cx="50" cy="50" r="30" fill={a.tholin.colorHex} opacity={0.28 + a.tholin.strength * 0.4} />
          {:else}
            {#each tholinPatches as p}
              <circle cx={p.cx} cy={p.cy} r={p.r} fill={a.tholin.colorHex} opacity={0.18 + a.tholin.strength * 0.32} />
            {/each}
          {/if}
        </g>
      {/if}

      <!-- Frost: bright volatile-ice patches (retained N2/CO2/water = white-blue, SO2 = sulphur-yellow). -->
      {#if a.frost}
        <g clip-path="url(#clip-{uid})">
          {#each frostPatches as p}
            <circle cx={p.cx} cy={p.cy} r={p.r} fill={a.frost.colorHex} opacity={0.2 + a.frost.coverage * 0.4} />
          {/each}
        </g>
      {/if}

      <!-- Impact craters on an old airless surface: a dark bowl with a faint sunlit rim. -->
      {#if hasCraters}
        <g clip-path="url(#clip-{uid})">
          {#each craters as c}
            <circle cx={c.cx} cy={c.cy} r={c.r} fill="rgba(0,0,0,0.16)" stroke="rgba(236,236,240,0.16)" stroke-width={Math.max(0.25, c.r * 0.16)} />
          {/each}
        </g>
      {/if}

      <!-- Fresh rayed craters: a bright pit with radiating ejecta rays over the older terrain. -->
      {#if rayedCraters.length}
        <g clip-path="url(#clip-{uid})">
          {#each rayedCraters as c}
            <path d={c.rays} stroke="rgba(240,244,252,0.5)" stroke-width="0.4" fill="none" />
            <circle cx={c.cx} cy={c.cy} r={c.r} fill="rgba(0,0,0,0.22)" stroke="rgba(245,248,255,0.75)" stroke-width="0.5" />
          {/each}
        </g>
      {/if}

      <!-- Ice cracks / ridges: a network of fine lineae threading the icy crust (Europa). -->
      {#if iceCracks.length}
        <g clip-path="url(#clip-{uid})">
          {#each iceCracks as d}
            <path {d} fill="none" stroke={a.iceCracks?.colorHex} stroke-width={0.5 + (a.iceCracks?.severity ?? 0) * 0.6} opacity="0.55" />
          {/each}
        </g>
      {/if}

      <!-- Crustal rifts: bold chasms where a frozen former ocean split the crust (Charon). -->
      {#if rifts.length}
        <g clip-path="url(#clip-{uid})">
          {#each rifts as d}
            <path {d} fill="none" stroke="rgba(20,26,36,0.55)" stroke-width="2.4" />
            <path {d} fill="none" stroke="rgba(210,222,238,0.5)" stroke-width="0.6" />
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
        {#if isSmallBody}
          <path d={smallBodyPath} fill="url(#term-{uid})" />
        {:else}
          <circle cx="50" cy="50" r="30" fill="url(#term-{uid})" />
        {/if}
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
