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
  import { deriveVisibility, distanceWords, LAMPS } from '$lib/physics/visibility';
  import { surfaceSceneFor, drawSky, drawMaterials, drawMarkers, drawEmissive, drawSpectrumEdges } from './surfaceScene';
  import { blackbodySpectrum, gridShare, spectrumToHex } from '$lib/physics/spectrum';
  import {
    lightOperator, relightImage, colourUnderOperator, confusability,
    homeDaylight, homeDaylightSpectrum, brightnessVs, brightnessWords
  } from '$lib/physics/imageUnderLight';

  let { body = null, light = null, pack = null, height = 260, standalone = false,
        fixedScene = null, compact = null }:
    { body?: CelestialBody | null; light?: number[] | null; pack?: RulePack | null;
      height?: number; standalone?: boolean;
      /** Pin the scene and hide its picker — for a host that already offers the choice itself. */
      fixedScene?: 'chart' | 'landscape' | null;
      /** Drop the explanation and link to it instead. Defaults on wherever the scene is pinned,
       *  because that host is the body panel, where the GM wants the tool and not the lesson. */
      compact?: boolean | null } = $props();

  let split = $state(50);          // where the wipe sits, as a percentage
  let adapt = $state(true);        // after your eyes settle, vs the moment you step out
  let trueLevel = $state(false);   // shown at the real light level, rather than normalised
  let scene = $state('chart');
  const terse = $derived(compact ?? fixedScene !== null);
  // A host that offers the scene as its own control owns it; the picker below then just repeats it.
  const activeScene = $derived(fixedScene ?? scene);

  // ── Standalone controls ───────────────────────────────────────────────────────────────────────
  // Deliberately just TWO, and they are the two that change a colour. Luminosity and distance move
  // how BRIGHT a world is, which matters enormously to a pigment deciding whether it can afford to
  // be choosy and hardly at all to what a wire looks like. A star's colour and its sky are what do
  // the work here, so they are the whole control set.
  //
  // It also starts somewhere that SHOWS something. Defaulting to a G star behind Earth's air is
  // defaulting to home, where by construction nothing moves.
  let demoTempK = $state(3200);
  let demoSky = $state('thick');

  const SKIES: Record<string, { label: string; atm: any }> = {
    none:  { label: 'No atmosphere', atm: undefined },
    earth: { label: 'Earth-like air, 1 bar', atm: { pressure_bar: 1, molarMassKg: 0.02896, composition: { N2: 0.78, O2: 0.21, Ar: 0.009, CO2: 0.0004, H2O: 0.004 } } },
    thick: { label: 'Thick carbon dioxide, 10 bar', atm: { pressure_bar: 10, molarMassKg: 0.044, composition: { CO2: 0.95, N2: 0.05 } } },
    titan: { label: 'Methane haze, 1.5 bar', atm: { pressure_bar: 1.5, molarMassKg: 0.028, composition: { N2: 0.94, CH4: 0.056 } } },
    venus: { label: 'Venus-like, 92 bar', atm: { pressure_bar: 92, molarMassKg: 0.044, composition: { CO2: 0.965, N2: 0.035 } } },
    sulphur: { label: 'Sulphurous, 5 bar', atm: { pressure_bar: 5, molarMassKg: 0.064, composition: { SO2: 0.6, CO2: 0.35, N2: 0.05 } } }
  };

  const demoBody = $derived({
    id: 'under-light-demo', kind: 'body', name: 'demo', roleHint: 'planet',
    makeup: { rock: 0.7, metal: 0.3 }, calculatedGravity_ms2: 9.81,
    atmosphere: SKIES[demoSky].atm
  } as unknown as CelestialBody);

  // The world's light: its own controls when standalone, else handed in, else rebuilt from the
  // body's stored spectrum summary.
  const surfaceLight = $derived.by(() => {
    if (standalone) {
      const r = deriveSurfaceSpectrum(demoBody, { starTempK: demoTempK, luminositySolar: 1, distanceAU: 1 }, pack);
      return r?.curves.surface ?? null;
    }
    if (light) return light;
    const s0 = body?.surfaceSpectrum;
    if (!s0) return null;
    const r = deriveSurfaceSpectrum(body!, { starTempK: s0.starTempK, luminositySolar: 1, distanceAU: s0.distanceAU }, pack);
    return r?.curves.surface ?? null;
  });

  // What that star looks like on its own, for the slider's swatch — the colour being chosen.
  const starHex = $derived(spectrumToHex(blackbodySpectrum(demoTempK, 1000 * gridShare(demoTempK))));
  const starWord = $derived(
    demoTempK < 3000 ? 'ember red' : demoTempK < 4000 ? 'deep orange' : demoTempK < 5000 ? 'amber'
    : demoTempK < 6200 ? 'sunlight' : demoTempK < 8000 ? 'cold white' : 'blue-white');
  // How much of the light gets down at all — the honest companion to any colour claim.
  const reaching = $derived.by(() => {
    if (!standalone) return null;
    const r = deriveSurfaceSpectrum(demoBody, { starTempK: demoTempK, luminositySolar: 1, distanceAU: 1 }, pack);
    return r ? Math.round(100 * r.summary.totalSurfaceWm2 / r.summary.totalTopWm2) : null;
  });

  const op = $derived(surfaceLight ? lightOperator(surfaceLight) : null);
  // Home is the reference every ratio is quoted against — "half as easy to tell apart as at home"
  // says something; an abstract number does not. It is Earth's own ground-level daylight.
  const daylightOp = homeDaylight();

  // HOW MUCH LIGHT, as opposed to what colour it is — the two are independent and the second one is
  // what the eye adapts away. Venus is the case that makes the distinction earn its keep: a fifth of
  // the star's ENERGY reaches the ground, but it comes down peaking at 920 nm, so barely a
  // sixtieth of the visible light does.
  // HOW FAR YOU CAN SEE — the other half of "what is it like to be there", and the half that decides
  // whether the thing in the murk gets a surprise round.
  const sight = $derived(body ? deriveVisibility(body, pack) : standalone ? deriveVisibility(demoBody, pack) : null);

  // The scene IS the world: its own ground, its own sky, its life if it has any, and markers standing
  // out to where its air gives up. `homeScene` is the same set of surfaces under Earth's sky, which
  // is what the left of the wipe means.
  const world = $derived(surfaceSceneFor(body ?? (standalone ? demoBody : null), pack, surfaceLight));
  const homeWorld = $derived(world ? { ...world, skyLowHex: '#bcd6ea', skyHighHex: '#5b8fc9', airless: false } : null);
  // Earth's own extinction, so the near markers on the home side fade the way they really do.
  const HOME_EXTINCTION = 1.155e-5;
  let matCanvas: HTMLCanvasElement | null = null;

  const level = $derived(op ? brightnessVs(op, daylightOp) : 1);
  const levelPct = $derived(
    level >= 0.1 ? `${Math.round(level * 100)}%`
    : level >= 0.001 ? `${(level * 100).toPrecision(2)}%`
    : level > 0 ? `1 part in ${Math.round(1 / level).toLocaleString()}`
    : 'none');

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
    const x0 = Math.round((split / 100) * W);
    if (activeScene === 'chart') {
      drawChart(ctx, H);
      // Re-light only the right-hand side; the wipe edge is the comparison.
      if (x0 < W) {
        const img = ctx.getImageData(x0, 0, W - x0, H);
        relightImage(img.data, op, adapt, trueLevel ? level : 1);
        ctx.putImageData(img, x0, 0);
      }
      return;
    }

    // THE SURFACE VIEW. Sky and star are LIGHT and are painted in their final colour on each side;
    // ground, water, plants and the reference blocks are REFLECTANCES and go through the operator.
    // Keeping them apart is the whole reason there are two layers: re-lighting a sky asks what it
    // looks like when lit by itself, and painting the ground pre-lit would show the world under its
    // own sun on the "at home" side too.
    if (!world) return;
    const home = homeWorld ?? world;
    ctx.save();
    ctx.beginPath(); ctx.rect(0, 0, x0, H); ctx.clip();
    drawSky(ctx, W, H, home);
    ctx.restore();
    ctx.save();
    ctx.beginPath(); ctx.rect(x0, 0, W - x0, H); ctx.clip();
    drawSky(ctx, W, H, world);
    ctx.restore();

    const mat = matCanvas ?? (matCanvas = document.createElement('canvas'));
    mat.width = W; mat.height = H;
    const mctx = mat.getContext('2d')!;
    mctx.clearRect(0, 0, W, H);
    drawMaterials(mctx, W, H, world);
    if (x0 < W) {
      // relightImage leaves fully transparent pixels alone, so the sky behind shows through with no
      // masking of its own.
      const img = mctx.getImageData(x0, 0, W - x0, H);
      relightImage(img.data, op, adapt, trueLevel ? level : 1);
      mctx.putImageData(img, x0, 0);
    }
    ctx.drawImage(mat, 0, 0);

    // Airlight last, and per side: at home this world's surfaces sit in Earth's air, over there in
    // its own. On a hazy world that is the shot — the far markers are simply gone.
    drawMarkers(ctx, W, H, world, HOME_EXTINCTION, home.skyLowHex, 0, x0);
    drawMarkers(ctx, W, H, world, world.sight.extinctionPerM, world.skyLowHex, x0, W);
    // Lava and lit windows make their OWN light, so they are not re-lit and not veiled by haze
    // between you and them at these distances. A settlement therefore reads the same on both sides
    // of the wipe while everything around it changes, which is exactly what a lamp does.
    drawEmissive(ctx, W, H, world);
    // And the quick reference that explains the rest: home's spectrum up the left edge, this
    // world's up the right.
    drawSpectrumEdges(ctx, W, H, homeDaylightSpectrum(), surfaceLight);
    // The seam is DOM, not canvas — see the handle below. Drawn here it would scale with the bitmap
    // and could not be grabbed.
  }

  // ── Dragging the wipe on the image itself ─────────────────────────────────────────────────────
  // A separate slider under the picture works, but the gesture everyone already knows is dragging
  // the seam, and it gives the row of controls back to the things that cannot be done by dragging.
  let stage: HTMLDivElement;
  let dragging = $state(false);

  function seek(clientX: number) {
    const r = stage.getBoundingClientRect();
    if (r.width <= 0) return;
    split = Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100));
  }
  function grab(e: PointerEvent) {
    dragging = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    seek(e.clientX);
  }
  function move(e: PointerEvent) { if (dragging) seek(e.clientX); }
  function drop() { dragging = false; }
  function nudge(e: KeyboardEvent) {
    const step = e.shiftKey ? 10 : 2;
    const to = { ArrowLeft: -step, ArrowRight: step, Home: -100, End: 100 }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    split = Math.max(0, Math.min(100, split + to));
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

  $effect(() => { split; adapt; trueLevel; level; activeScene; op; world; demoTempK; demoSky; draw(); });
  onMount(draw);
</script>

<div class="under-light">
  {#if !op}
    <p class="none">This world has no star to be lit by, so there is nothing to compare.</p>
  {:else}
    {#if standalone}
      <div class="controls demo">
        <label class="star">
          <span><span class="star-chip" style="background:{starHex}"></span>
            Star colour — <b>{starWord}</b>, {Math.round(demoTempK)} K</span>
          <input type="range" min="2400" max="11000" step="50" bind:value={demoTempK} />
        </label>
        <label class="sky">
          <span>Sky{#if reaching !== null}&nbsp;&mdash; <b>{reaching}%</b> of the light gets down{/if}</span>
          <select bind:value={demoSky}>
            {#each Object.entries(SKIES) as [k, v]}<option value={k}>{v.label}</option>{/each}
          </select>
        </label>
      </div>
    {/if}

    <div class="controls">
      {#if !fixedScene}
        <label class="scene">
          <select bind:value={scene}>
            <option value="chart">Colour chart &amp; wires</option>
            <option value="landscape">The surface view</option>
          </select>
        </label>
      {/if}
      <label class="adapt">
        <input type="checkbox" bind:checked={adapt} />
        <span>once your eyes adjust</span>
      </label>
      <label class="adapt">
        <input type="checkbox" bind:checked={trueLevel} />
        <span title="Shown at the real light level rather than scaled up to fill the screen">midday brightness</span>
      </label>
    </div>

    <p class="level" class:dim={level < 0.05}>
      Midday here is <b>{levelPct}</b> of an Earth noon &mdash; {brightnessWords(level)}.
    </p>

    <div class="stage" bind:this={stage} class:dragging
         onpointerdown={grab} onpointermove={move} onpointerup={drop} onpointercancel={drop}>
      <canvas bind:this={canvas} width={W} height={height}
              aria-label="A familiar colour reference, with this world's own daylight applied to the right of the seam."></canvas>
      <div class="seam" style="left:{split}%">
        <span class="knob" role="slider" tabindex="0" aria-label="Drag to wipe between home and this world"
              aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(split)}
              aria-valuetext="{Math.round(split)}% home" onkeydown={nudge}>
          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="14 7 19 12 14 17" /><polyline points="10 7 5 12 10 17" />
          </svg>
        </span>
      </div>
      <span class="edge left" aria-hidden="true">home</span>
      <span class="edge right" aria-hidden="true">there</span>
    </div>

    {#if !terse}
      <p class="note">
        Left of the line is home. Right of it is the same surfaces under this world's own daylight.
        {#if adapt}
          Your eyes have adjusted, so an overall cast has been taken out — what is left is what this
          light genuinely <em>cannot</em> carry.
        {:else}
          This is the moment you step outside, before your eyes settle, with the star's cast still in it.
        {/if}
      </p>
    {/if}

    <!-- WHAT THE HORIZON VIEW IS FOR. The chart answers "can they tell these two apart"; the
         landscape answers "how far can they see, and what does a lamp buy them" — which is the one
         that decides whether the thing in the murk gets a surprise round. Each scene carries the
         readout it is asking about; the physics page, having room, carries both. -->
    {#if sight && (activeScene === 'landscape' || !terse)}
      <div class="sight">
        <span class="pair">
          {#if sight.rangeM < sight.horizonM}
            The air gives out at <b>{distanceWords(sight.rangeM)}</b>
          {:else}
            You see to the horizon, <b>{distanceWords(sight.horizonM)}</b>
          {/if}
        </span>
        {#each LAMPS as l}
          <span class="pair">{l.label} <b>{distanceWords(sight.lampM[l.key])}</b></span>
        {/each}
        {#if sight.fogged}<span class="pair fog">fog on the ground</span>{/if}
      </div>
    {/if}

    {#if activeScene === 'chart' || !terse}
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
    {/if}
    {#if terse}
      <!-- FUNCTION, NOT LESSON. In the body panel a GM wants the numbers and the picture; the working
           belongs on the physics page, one click away, rather than three paragraphs down the panel. -->
      <p class="note small">
        <a href="/physics#surface-light" target="_blank" rel="noopener noreferrer">how this is worked out</a>
      </p>
    {:else}
      <p class="note small">
        Measured after adaptation, which is the fair test: a cast is something a person adjusts to within
        the hour, but two colours this light cannot separate stay inseparable however long they stand there.
      </p>
      <p class="note small">
        A caveat worth saying at the table: the reference is treated as a set of SURFACES, so this is
        "the same things under a different sun" rather than a simulation of a scene.
      </p>
    {/if}
  {/if}
</div>

<style>
  .under-light { margin: 12px 0; container-type: inline-size; }
  /* In a narrow panel the controls stack instead of squeezing onto one line. */
  @container (max-width: 460px) {
    .controls { gap: 8px; }
    .controls .scene { flex: 1 1 100%; }
  }
  .controls.demo { border-bottom: 1px solid var(--border, #2a2d36); padding-bottom: 8px; margin-bottom: 8px; }
  .controls .star, .controls .sky { display: flex; flex-direction: column; gap: 2px; flex: 1 1 240px; min-width: 200px; }
  .controls .star input { width: 100%; }
  .star-chip {
    display: inline-block; width: 11px; height: 11px; border-radius: 50%;
    border: 1px solid rgba(255,255,255,0.35); vertical-align: -1px; margin-right: 4px;
  }
  .controls { display: flex; flex-wrap: wrap; gap: 16px; align-items: center; font-size: 0.8em; margin-bottom: 6px; }
  .controls select {
    padding: 3px 6px; background: var(--bg-control, #1b1e26); color: var(--text, #eee);
    border: 1px solid var(--border, #2a2d36); border-radius: 4px;
  }
  .adapt { display: flex; align-items: center; gap: 6px; }
  canvas {
    width: 100%; height: auto; display: block; border-radius: 6px;
    border: 1px solid var(--border, #2a2d36); background: #000;
  }
  /* The wipe lives on the picture. Touch-action none so a drag does not scroll the panel instead. */
  .stage { position: relative; cursor: ew-resize; touch-action: none; user-select: none; }
  .stage.dragging { cursor: grabbing; }
  .seam {
    position: absolute; top: 0; bottom: 0; width: 2px; margin-left: -1px;
    background: rgba(255, 255, 255, 0.9); box-shadow: 0 0 6px rgba(0, 0, 0, 0.7); pointer-events: none;
  }
  .knob {
    position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);
    width: 26px; height: 26px; border-radius: 50%; display: flex; align-items: center;
    justify-content: center; background: rgba(0, 0, 0, 0.66); color: #fff;
    border: 1px solid rgba(255, 255, 255, 0.85); backdrop-filter: blur(2px); pointer-events: auto;
    cursor: ew-resize;
  }
  .knob:focus-visible { outline: 2px solid var(--accent, #ff5a1f); outline-offset: 2px; }
  .edge {
    position: absolute; top: 6px; font-size: 0.68rem; letter-spacing: 0.04em; text-transform: uppercase;
    color: rgba(255, 255, 255, 0.75); text-shadow: 0 1px 3px #000; pointer-events: none;
  }
  .edge.left { left: 8px; }
  .edge.right { right: 8px; }
  .note { font-size: 0.8em; color: var(--text-muted, #cfcfcf); margin: 6px 0 0; }
  .note.small a { color: var(--text-faint, #8a8f9a); }
  .note.small a:hover { color: var(--accent, #ff5a1f); }
  .level { font-size: 0.78em; color: var(--text-muted, #cfcfcf); margin: 6px 0 0; }
  .level.dim b { color: #e0a32a; }
  .note.small { font-size: 0.74em; color: var(--text-faint, #8a8f9a); }
  .none { font-size: 0.85em; color: var(--text-faint, #8a8f9a); }
  .confusions, .sight { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 8px; font-size: 0.78em; color: var(--text-muted, #cfcfcf); }
  .sight .pair b { color: var(--text, #e8e8e8); }
  .sight .fog { color: #e0a32a; }
  .pair { display: inline-flex; align-items: center; gap: 5px; }
  .pair .sw { width: 13px; height: 13px; border-radius: 3px; border: 1px solid var(--border, #2a2d36); }
  .pair b { font-variant-numeric: tabular-nums; }
  .pair.bad b { color: #e0a32a; }
  .pair.worse b { color: #e74c3c; }
</style>
