<script lang="ts">
  // Tunable CRT effect layers for the Monochrome Terminal skin (driven by the crtControls store).
  // The brightness/contrast/invert/skew/roll/corners are applied to the screen CONTENT by the
  // catalogue page; this overlay supplies the additive layers: scanlines, vignette, white noise,
  // a rolling noise bar and brightness flicker. Inline CSS vars carry the live slider values.
  import { crtControls } from '$lib/catalogue/crtControls';
  export let color = '#74f7b0';   // the terminal's --mono colour
  $: c = $crtControls;
  $: barDur = c.noiseBarSpeed !== 0 ? Math.max(0.4, 6 / (Math.abs(c.noiseBarSpeed) * 14)) : 0;
  // Noise/bar speckles are the FOREGROUND colour: green on the black screen, black on the inverted
  // (greenscreen) view. Screen-blend adds bright speckles on dark; multiply darkens on the green.
  $: fg = c.invert ? '#04070b' : color;
  $: speckBlend = c.invert ? 'multiply' : 'screen';
  // Normalised fg RGB (0..1) for the SVG colour-matrix that tints the static.
  function norm(hex: string): [number, number, number] {
    const h = hex.replace('#', ''); const n = h.length === 3 ? h.split('').map((x) => x + x).join('') : h;
    return [parseInt(n.slice(0, 2), 16) / 255, parseInt(n.slice(2, 4), 16) / 255, parseInt(n.slice(4, 6), 16) / 255];
  }
  $: fgN = norm(fg);
  const uid = Math.random().toString(36).slice(2, 8);
</script>

<div class="crt-overlay"
     style="--fg:{fg}; --speckblend:{speckBlend}; --scan:{c.scanlineIntensity}; --scanw:{c.scanlineWidth}px; --vig:{c.vignette}; --noise:{c.interference}; --flick:{c.flicker};
            --barh:{c.noiseBarWidth}%; --bardur:{barDur}s; --bardir:{c.noiseBarSpeed < 0 ? 'reverse' : 'normal'};">
  {#if c.scanlineIntensity > 0}<div class="scanlines"></div>{/if}
  {#if c.vignette > 0}<div class="vignette"></div>{/if}
  {#if c.interference > 0}
    <!-- TV static: the feTurbulence SEED is animated, so the grain regenerates each step instead of
         a fixed pattern scrolling. feColorMatrix tints it to the foreground colour + thresholds alpha. -->
    <svg class="noise" preserveAspectRatio="none" viewBox="0 0 320 200" style="opacity:{c.interference}; mix-blend-mode:{speckBlend}">
      <filter id="crtnoise-{uid}" x="0" y="0" width="100%" height="100%" color-interpolation-filters="sRGB">
        <feTurbulence type="fractalNoise" baseFrequency="0.7" numOctaves="2" stitchTiles="stitch" seed="1" result="t">
          <animate attributeName="seed" values="1;13;29;41;57;73;89" dur="0.6s" calcMode="discrete" repeatCount="indefinite" />
        </feTurbulence>
        <feColorMatrix in="t" type="matrix"
          values="0 0 0 0 {fgN[0]}  0 0 0 0 {fgN[1]}  0 0 0 0 {fgN[2]}  0.9 0 0 0 -0.32" />
      </filter>
      <rect width="100%" height="100%" filter="url(#crtnoise-{uid})" />
    </svg>
  {/if}
  {#if c.noiseBarWidth > 0}<div class="noisebar"></div>{/if}
  {#if c.flicker > 0}<div class="flicker"></div>{/if}
</div>

<style>
  .crt-overlay {
    position: fixed;
    inset: 0;
    pointer-events: none;
    z-index: 9000;
  }
  .crt-overlay > div { position: absolute; inset: 0; }

  /* Scanlines — spacing = width, darkness = intensity. */
  .scanlines {
    background: repeating-linear-gradient(
      to bottom,
      rgba(0,0,0,0) 0,
      rgba(0,0,0,0) calc(var(--scanw) * 0.5),
      rgba(0,0,0,calc(var(--scan) * 0.7)) var(--scanw)
    );
    mix-blend-mode: multiply;
  }

  /* Vignette + soft inner glow, scaled by the vignette amount. */
  .vignette {
    background: radial-gradient(circle,
      rgba(0,0,0,0) 55%,
      rgba(0,0,0,calc(var(--vig) * 0.45)) 88%,
      rgba(0,0,0,calc(var(--vig) * 0.85)) 100%);
    box-shadow: inset 0 0 150px rgba(0,0,0,calc(var(--vig) * 0.7));
  }

  /* TV-static layer (animated-seed turbulence, foreground-colour-tinted). The low-res viewBox is
     stretched to fill, giving chunky CRT grain and keeping the per-frame filter cheap. */
  .noise { width: 100%; height: 100%; }

  /* A horizontal noise bar in the foreground colour that rolls vertically. */
  .noisebar {
    height: var(--barh);
    inset: auto 0 auto 0;
    top: 0;
    background: linear-gradient(to bottom,
      transparent 0%,
      color-mix(in srgb, var(--fg) 60%, transparent) 50%,
      transparent 100%);
    mix-blend-mode: var(--speckblend);
    animation: barRoll var(--bardur) linear infinite var(--bardir);
  }

  /* Brightness flicker — a faint black veil pulsing at the flicker amount. */
  .flicker {
    background: #000;
    opacity: 0;
    animation: flick 0.09s steps(2) infinite;
    --flickMax: var(--flick);
  }

  @keyframes barRoll {
    0% { top: -10%; }
    100% { top: 110%; }
  }
  @keyframes flick {
    0%, 100% { opacity: 0; }
    50% { opacity: var(--flickMax); }
  }
</style>
