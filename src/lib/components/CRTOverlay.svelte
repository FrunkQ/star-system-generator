<script lang="ts">
  // Tunable CRT effect layers for the Monochrome Terminal skin (driven by the crtControls store).
  // The brightness/contrast/invert/skew/roll/corners are applied to the screen CONTENT by the
  // catalogue page; this overlay supplies the additive layers: scanlines, vignette, white noise,
  // a rolling noise bar and brightness flicker. Inline CSS vars carry the live slider values.
  import { crtControls } from '$lib/catalogue/crtControls';
  $: c = $crtControls;
  $: barDur = c.noiseBarSpeed !== 0 ? Math.max(0.4, 6 / (Math.abs(c.noiseBarSpeed) * 14)) : 0;
</script>

<div class="crt-overlay"
     style="--scan:{c.scanlineIntensity}; --scanw:{c.scanlineWidth}px; --vig:{c.vignette}; --noise:{c.interference}; --flick:{c.flicker};
            --barh:{c.noiseBarWidth}%; --bardur:{barDur}s; --bardir:{c.noiseBarSpeed < 0 ? 'reverse' : 'normal'};">
  {#if c.scanlineIntensity > 0}<div class="scanlines"></div>{/if}
  {#if c.vignette > 0}<div class="vignette"></div>{/if}
  {#if c.interference > 0}<div class="noise"></div>{/if}
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

  /* Animated white noise (SVG turbulence), opacity = interference. */
  .noise {
    opacity: var(--noise);
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
    background-size: 180px 180px;
    mix-blend-mode: screen;
    animation: noiseShift 0.18s steps(3) infinite;
  }

  /* A bright horizontal noise bar that rolls vertically. */
  .noisebar {
    height: var(--barh);
    inset: auto 0 auto 0;
    top: 0;
    background: linear-gradient(to bottom, rgba(255,255,255,0) 0%, rgba(255,255,255,0.18) 50%, rgba(255,255,255,0) 100%);
    mix-blend-mode: screen;
    animation: barRoll var(--bardur) linear infinite var(--bardir);
  }

  /* Brightness flicker — a faint black veil pulsing at the flicker amount. */
  .flicker {
    background: #000;
    opacity: 0;
    animation: flick 0.09s steps(2) infinite;
    --flickMax: var(--flick);
  }

  @keyframes noiseShift {
    0% { background-position: 0 0; }
    33% { background-position: -40px 30px; }
    66% { background-position: 30px -20px; }
    100% { background-position: -10px 10px; }
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
