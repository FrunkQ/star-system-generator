<script lang="ts">
  // WHAT IT LOOKS LIKE ON THAT WORLD — a familiar reference, re-lit by the world's own spectrum,
  // with a slider to wipe between home and there.
  //
  // The point is a table one, not a technical one. "Its sun is red" is a fact a GM can state and a
  // player will nod at. Sliding a colour chart until red and brown become the same swatch is a fact
  // a player ARGUES with, which is when it has landed. It is also the honest answer to "cut the red
  // wire" — a question that has a different difficulty on every world.
  //
  // Everything here is a CONSUMER. The re-lighting is `relightImage` against the same surface
  // spectrum the pigment model and the apparent colour read; this file decides only what to show.
  import { onMount } from 'svelte';
  import type { RulePack, CelestialBody } from '$lib/types';
  import { deriveSurfaceSpectrum } from '$lib/physics/surfaceSpectrum';
  import { blackbodySpectrum, gridShare } from '$lib/physics/spectrum';
  import { lightOperator, relightImage, colourUnderOperator, confusability } from '$lib/physics/imageUnderLight';

  let { body = null, light = null, pack = null, height = 260 }:
    { body?: CelestialBody | null; light?: number[] | null; pack?: RulePack | null; height?: number } = $props();

  let split = $state(50);          // where the wipe sits, as a percentage
  let adapt = $state(true);        // after your eyes settle, vs the moment you step out
  let scene = $state('chart');

  // The world's light: handed in, or rebuilt from the body's stored spectrum summary.
  const surfaceLight = $derived.by(() => {
    if (light) return light;
    const s0 = body?.surfaceSpectrum;
    if (!s0) return null;
    const r = deriveSurfaceSpectrum(body!, { starTempK: s0.starTempK, luminositySolar: 1, distanceAU: s0.distanceAU }, pack);
    return r?.curves.surface ?? null;
  });

  const op = $derived(surfaceLight ? lightOperator(surfaceLight) : null);
  // Daylight is the reference the confusability figures are quoted against — "half as easy to tell
  // apart as at home" says something; an abstract number does not.
  const daylightOp = lightOperator(blackbodySpectrum(5778, 1000 * gridShare(5778)));

  // ── The scenes ────────────────────────────────────────────────────────────────────────────────
  // Drawn rather than sourced, deliberately: a photograph would need a licence and an attribution
  // trail, and the thing a GM actually needs at the table is a chart of NAMED colours they can point
  // at. The viewer takes any image, so photographs can be added later with their credits.
  const CHART = [
    ['#7a4a3a', 'skin'], ['#c4a06a', 'sand'], ['#4d6f8c', 'sky'], ['#5a6b3a', 'foliage'],
    ['#7f7fb5', 'flower'], ['#5fbfae', 'cyan'], ['#d4762f', 'orange'], ['#3b4a9c', 'blue'],
    ['#c4404f', 'red'], ['#5c3566', 'purple'], ['#9fc23a', 'yellow-green'], ['#e0a32a', 'amber'],
    ['#2f3a8c', 'deep blue'], ['#4a8f4a', 'green'], ['#a8323a', 'crimson'], ['#e0c72a', 'yellow'],
    ['#b0409c', 'magenta'], ['#2a86a8', 'teal'],
    ['#ffffff', 'white'], ['#c8c8c8', 'light grey'], ['#909090', 'grey'],
    ['#5a5a5a', 'dark grey'], ['#303030', 'charcoal'], ['#111111', 'black']
  ] as [string, string][];

  // The wires, because it is the example everyone reaches for and it deserves a straight answer.
  const WIRES = [
    ['#c4262b', 'red'], ['#d4762f', 'orange'], ['#7a4a2a', 'brown'], ['#e0c72a', 'yellow'],
    ['#2f8f3a', 'green'], ['#2a5fb0', 'blue'], ['#1a1a1a', 'black'], ['#e8e8e8', 'white']
  ] as [string, string][];

  const hexToRgb = (hex: string): [number, number, number] => {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };

  // Pairs chosen because they fail in DIFFERENT ways: two long-wavelength colours that a red star
  // keeps apart, two short-wavelength ones it cannot, and a dark/coloured pair that goes when the
  // channel carrying the difference runs out of light.
  const PAIRS: [string, string][] = [
    ['red', 'brown'], ['red', 'orange'], ['blue', 'green'], ['blue', 'black'], ['green', 'black']
  ];
  const wireOf = (name: string) => WIRES.find((w) => w[1] === name)![0];
  const confusions = $derived(op
    ? PAIRS.map(([a, b]) => ({
        a, b,
        ratio: confusability(hexToRgb(wireOf(a)), hexToRgb(wireOf(b)), op, daylightOp)
      }))
    : []);

  let canvas: HTMLCanvasElement;
  const W = 640;

  function draw() {
    if (!canvas || !op) return;
    const ctx = canvas.getContext('2d')!;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (scene === 'chart') drawChart(ctx, H);
    else drawLandscape(ctx, H);
    // Re-light only the right-hand side; the wipe edge is the comparison.
    const x0 = Math.round((split / 100) * W);
    if (x0 < W) {
      const img = ctx.getImageData(x0, 0, W - x0, H);
      relightImage(img.data, op, adapt);
      ctx.putImageData(img, x0, 0);
    }
    // The seam, so the eye knows where the comparison is.
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillRect(x0 - 1, 0, 2, H);
  }

  function drawChart(ctx: CanvasRenderingContext2D, H: number) {
    const cols = 6, rows = 4, pad = 6;
    const cw = (W - pad) / cols, chH = (H * 0.62 - pad) / rows;
    CHART.forEach(([hex], i) => {
      ctx.fillStyle = hex;
      ctx.fillRect(pad + (i % cols) * cw, pad + Math.floor(i / cols) * chH, cw - pad, chH - pad);
    });
    // The wire row underneath, labelled by position rather than text so the text is not re-lit too.
    const wy = H * 0.66, wh = H - wy - 6, ww = (W - pad) / WIRES.length;
    WIRES.forEach(([hex], i) => {
      ctx.fillStyle = hex;
      ctx.fillRect(pad + i * ww, wy, ww - pad, wh);
    });
  }

  function drawLandscape(ctx: CanvasRenderingContext2D, H: number) {
    // A schematic scene rather than a photograph: sky, hills, a treeline, water and a few built
    // shapes. Crude on purpose — what is being compared is the COLOUR, and a drawing keeps the
    // licence question out of it entirely.
    const sky = ctx.createLinearGradient(0, 0, 0, H * 0.55);
    sky.addColorStop(0, '#5b8fc9'); sky.addColorStop(1, '#bcd6ea');
    ctx.fillStyle = sky; ctx.fillRect(0, 0, W, H * 0.55);
    ctx.fillStyle = '#f2e6c8';
    ctx.beginPath(); ctx.arc(W * 0.78, H * 0.16, H * 0.07, 0, 7); ctx.fill();
    ctx.fillStyle = '#6f7f5a';
    ctx.beginPath(); ctx.moveTo(0, H * 0.55);
    for (let x = 0; x <= W; x += 16) ctx.lineTo(x, H * 0.55 - Math.sin(x / 90) * H * 0.07 - Math.sin(x / 31) * H * 0.02);
    ctx.lineTo(W, H); ctx.lineTo(0, H); ctx.fill();
    ctx.fillStyle = '#3f6b3a';
    for (let i = 0; i < 26; i++) {
      const x = 12 + (i * 97) % (W - 24), y = H * 0.58 + ((i * 53) % Math.round(H * 0.18));
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 9, y + 22); ctx.lineTo(x - 9, y + 22); ctx.fill();
    }
    ctx.fillStyle = '#3d6f8f'; ctx.fillRect(0, H * 0.84, W, H * 0.16);
    ['#b8563a', '#c9b48a', '#8a8f96'].forEach((c, i) => {
      ctx.fillStyle = c; ctx.fillRect(W * (0.12 + i * 0.24), H * 0.62, 46, 40);
      ctx.fillStyle = '#e8d9a8'; ctx.fillRect(W * (0.12 + i * 0.24) + 8, H * 0.66, 10, 12);
    });
  }

  $effect(() => { split; adapt; scene; op; draw(); });
  onMount(draw);
</script>

<div class="under-light">
  {#if !op}
    <p class="none">This world has no star to be lit by, so there is nothing to compare.</p>
  {:else}
    <div class="controls">
      <label class="scene">
        <select bind:value={scene}>
          <option value="chart">Colour chart &amp; wires</option>
          <option value="landscape">A landscape</option>
        </select>
      </label>
      <label class="wipe">
        <span>Home <b>|</b> there</span>
        <input type="range" min="0" max="100" step="1" bind:value={split} />
      </label>
      <label class="adapt">
        <input type="checkbox" bind:checked={adapt} />
        <span>once your eyes adjust</span>
      </label>
    </div>

    <canvas bind:this={canvas} width={W} height={height}
            aria-label="A familiar colour reference, with this world's own daylight applied to the right of the slider."></canvas>

    <p class="note">
      Left of the line is home. Right of it is the same surfaces under this world's own daylight.
      {#if adapt}
        Your eyes have adjusted, so an overall cast has been taken out — what is left is what this
        light genuinely <em>cannot</em> carry.
      {:else}
        This is the moment you step outside, before your eyes settle: the star's cast and its
        brightness are both still in it.
      {/if}
    </p>

    <div class="confusions">
      {#each confusions as c}
        <span class="pair" class:bad={c.ratio < 0.5} class:worse={c.ratio < 0.25}>
          <span class="sw" style="background:{colourUnderOperator(hexToRgb(wireOf(c.a)), op, true)}"></span>
          <span class="sw" style="background:{colourUnderOperator(hexToRgb(wireOf(c.b)), op, true)}"></span>
          {c.a} / {c.b}
          <b>{c.ratio >= 0.95 ? 'as at home' : `${Math.round(c.ratio * 100)}% as distinct`}</b>
        </span>
      {/each}
    </div>
    <p class="note small">
      Measured after adaptation, which is the fair test: a cast is something a person adjusts to within
      the hour, but two colours this light cannot separate stay inseparable however long they stand there.
    </p>
    <p class="note small">
      A caveat worth saying at the table: the reference is treated as a set of SURFACES, so this is
      "the same things under a different sun" rather than a simulation of a scene. It also says nothing
      about how bright it is — that is on the spectrum plot.
    </p>
  {/if}
</div>

<style>
  .under-light { margin: 12px 0; }
  .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; font-size: 0.8em; margin-bottom: 6px; }
  .controls select {
    padding: 3px 6px; background: var(--bg-control, #1b1e26); color: var(--text, #eee);
    border: 1px solid var(--border, #2a2d36); border-radius: 4px;
  }
  .wipe { display: flex; flex-direction: column; gap: 2px; flex: 1 1 220px; min-width: 180px; }
  .wipe input { width: 100%; }
  .adapt { display: flex; align-items: center; gap: 6px; }
  canvas {
    width: 100%; height: auto; display: block; border-radius: 6px;
    border: 1px solid var(--border, #2a2d36); background: #000;
  }
  .note { font-size: 0.8em; color: var(--text-muted, #cfcfcf); margin: 6px 0 0; }
  .note.small { font-size: 0.74em; color: var(--text-faint, #8a8f9a); }
  .none { font-size: 0.85em; color: var(--text-faint, #8a8f9a); }
  .confusions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-size: 0.78em; color: var(--text-muted, #cfcfcf); }
  .pair { display: inline-flex; align-items: center; gap: 5px; }
  .pair .sw { width: 13px; height: 13px; border-radius: 3px; border: 1px solid var(--border, #2a2d36); }
  .pair b { font-variant-numeric: tabular-nums; }
  .pair.bad b { color: #e0a32a; }
  .pair.worse b { color: #e74c3c; }
</style>
