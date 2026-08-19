<script lang="ts">
  // Thin Svelte wrapper around the imperative three.js holo scene. Deliberately holds NO static
  // import of three or ./scene — the scene module is dynamically imported on mount so three.js is
  // code-split into its own chunk and the 2D app never pays for it. Mirrors the prop surface of
  // SystemVisualizer, the 2D orrery it stands in for.
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import type { System } from '$lib/types';
  import type { HoloController } from '$lib/holo/scene';
  import { gridLegend } from '$lib/map/gridLegend';
  import { DEFAULT_STYLE, type HoloStyle } from '$lib/holo/holoStyle';
  import { liveOverrides } from '$lib/player/liveOverrides';
  import { tagCategories } from '$lib/tags/tagCategories';
  // THE GM'S TAG VOCABULARY, by the same rule as `highlights` above (TAG-15): a player window has its
  // own store instances, and for this store that means the SHIPPED DEFAULTS — every colour the GM
  // customised would be wrong there. So it arrives as a prop off the broadcast, and falls back to the
  // local store only on the GM's own screen, where the store IS the answer.
  export let tagStyles: import('$lib/tags/tagCategories').TagCategory[] | null = null;
  $: activeTagCategories = tagStyles ?? $tagCategories;
  import type { MapHighlights } from '$lib/tags/mapHighlights';

  const dispatch = createEventDispatcher<{ focus: string }>();

  export let system: System | null = null;
  export let currentTime: number = 0;
  // Accepted for prop-parity with SystemVisualizer; wired to camera focus in a later increment.
  export let focusedBodyId: string | null = null;
  // The full look bundle (filter, compression, framing, skybox) — a GM preset or live-tweaked style.
  export let style: HoloStyle = DEFAULT_STYLE;
  // Momentary GM overrides (NOT part of the saved style): quick label show/hide and a filter bypass
  // to briefly drop the visual filter if it's hard to read.
  export let labelsVisible: boolean = true;
  // G5 momentary: hide every orbit line for a moment without touching the saved style (A53 pattern).
  export let orbitLinesVisible: boolean = true;
  // MAP HIGHLIGHTS. `system` is already the audience's snapshot (the player window receives it
  // redacted), so the badges cannot leak a secret tag — markersFor is deliberately audience-blind.
  // A player window has its OWN store instances (TAG-15), so this arrives as a PROP and falls back to
  // the store only for the GM's own screen.
  export let highlights: MapHighlights | null = null;
  /** The GM's chosen look for this view; an individual highlight can still override it. */
  export let markerStyle: 'label' | 'pin' | 'flag' | undefined = undefined;

  // THE GRID'S SCALE, in words. Reported by the scene rather than recomputed here: the cell is chosen
  // down there (a pinned dial, or whichever decade level is currently winning) and a second opinion up
  // here would be a second model, free to disagree the first time either moved.
  let gridCellAu: number | null = null;
  let gridCellKind: import('$lib/map/gridLegend').GridCellKind = null;
  $: legend = showGridLegend ? gridLegend(gridCellAu, gridCellKind) : null;
  // Off by default so no existing surface grows a caption it never asked for; the player views opt in.
  export let showGridLegend: boolean = false;
  /** Badge-only knobs from the preset: size multiplier, flag staff colour, pin text mode. */
  export let markerSize: number | undefined = undefined;
  export let flagStaff: 'silver' | 'gold' | 'white' | 'black' | 'tag' | undefined = undefined;
  export let pinText: 'none' | 'initial' | 'name' | undefined = undefined;
  export let filterBypass: boolean = false;
  export let orbitPaused: boolean = false; // momentarily stop the auto view-orbit turntable
  // A pre-rendered static info-card canvas composited INTO the scene so the GPU filter warps/tints it
  // like the 3D (no CSS approximation). null = no HUD.
  export let hudCanvas: HTMLCanvasElement | null = null;
  // Isolated-body thumbnail (Guide document): let the player drag to spin the body by hand (rotate only).
  export let userSpin: boolean = false;
  // Pixels of the right edge covered by the info panel — the scene gently shifts its projection centre
  // left so the framed body stays centred in the VISIBLE strip (0 = no panel / mobile).
  export let viewInsetRight: number = 0;
  // G9: the charted systems to hang in this view's sky, already reduced to direction + magnitude +
  // colour by `map/skyStars`. DATA, not look — the mode that decides whether and how they are drawn
  // lives on the style. Empty is the normal case for any host that has no starmap to hand.
  export let skyStars: import('$lib/map/skyStars').SkyStar[] = [];
  // G3: per-construct drive data, computed by the host (which holds the rule pack) - max accel
  // drives the plume as a fraction of the ship's OWN capability; exhaustHex (engine-def pack
  // data, G15(4)) colours it.
  export let shipAccel: Record<string, { accelMs2: number; exhaustHex?: string }> | null = null;
  // P3c follow-GM: move transiting constructs along their published route as the clock runs. The
  // host turns this on ONLY while following the GM's clock - route playback against an arbitrary
  // local clock would show traffic where it is not.
  export let transitMotion = false;

  function applyStyle(s: HoloStyle) {
    // Filter can be momentarily bypassed without changing the saved style.
    controller?.setFilter(filterBypass ? 'none' : s.filter, filterBypass ? undefined : s.filterParams);
    controller?.setFraming({ angleDeg: s.angleDeg, whole: s.whole, fillFrac: s.fillFrac });
    controller?.setSkybox(s.skybox);
    controller?.setBackground(s.background);
    controller?.setCompression(s.compression);
    controller?.setBeltDetail(s.beltDetail);
    controller?.setBodyStyle(s.bodyStyle);
    controller?.setRender(s.render ?? 'filled');
    controller?.setUnlit(s.unlit ?? false);
    controller?.setLensing(s.lensing !== false); // black-hole gravitational lensing (default on)
    controller?.setPortrait(s.portrait ?? null, s.portraitFixed ?? false); // isolated-body portrait key light
    controller?.setFlatOverhead(s.lockOverhead ?? false); // 2D map: tilt pinned top-down
    controller?.setLockRotation(s.lockRotation ?? false); // fixed heading: follow by panning
    controller?.setAuroras(s.auroras ?? true);
    controller?.setBeltStyle(s.beltStyle ?? 'rocks');
    controller?.setBodySize(s.bodySize);
    controller?.setSkyStars(skyStars, s.constellations ?? 'off', { boost: s.constellationBoost ?? 0.35, labelPx: s.constellationLabelSize ?? 11 });
    controller?.setGrid(s.grid);
    controller?.setGridFalloff(s.gridFalloff ?? 0);
    controller?.setGridDepth(s.gridDepth ?? 0);
    controller?.setGridScale(s.gridScaleAu ?? 0);
    // Subscribe once the controller exists; it fires immediately with whatever the grid is already
    // worth, so the caption is right on the first frame rather than after the first zoom.
    controller?.setGridCellReporter((au, kind) => { gridCellAu = au; gridCellKind = kind; });
    controller?.setOrbitSpeed(orbitPaused ? 0 : s.orbitSpeed);
    // G5: the style carries the dial; `orbitLinesVisible` is the momentary override on top of it,
    // exactly as labelsVisible sits on top of the label settings.
    controller?.setOrbitOpacity(s.orbitOpacity ?? 1);
    controller?.setOrbitLinesVisible(orbitLinesVisible);
    controller?.setLabelSize(s.labelSize ?? 11);
    controller?.setLabelFont(s.font ?? null);
    // Labels are in-scene sprites now, so the shader tints them under CRT automatically — keep them a
    // neutral light colour and let the filter do the colouring (true to "impacted by the filter").
    controller?.setLabelColor(null);
    controller?.setLabelsVisible(labelsVisible);
  }

  let container: HTMLDivElement;
  let canvas: HTMLCanvasElement;
  let controller: HoloController | null = null;
  let ro: ResizeObserver | null = null;

  export function resetView() {
    controller?.resetView();
  }
  // Two framing knobs (angle from overhead, whole-system vs body) — for GM/projector control later.
  export function setFraming(opts: { angleDeg?: number; whole?: boolean; fillFrac?: number }) {
    controller?.setFraming(opts);
  }
  export function setSkybox(on: boolean) {
    controller?.setSkybox(on);
  }
  // Browser Back: step OUT one click-ladder level. False = nothing left here, so the caller keeps
  // walking up the view hierarchy (unfocus → starmap → leave the page).
  export function stepFocusUp(): boolean {
    return controller?.stepFocusUp() ?? false;
  }
  // Follow the GM's manual viewport (rough): centre + half-extent in TRUE AU.
  export function setViewportAU(cx: number, cy: number, halfExtentAU: number) {
    controller?.setViewportAU(cx, cy, halfExtentAU);
  }
  // Follow the GM's click-ladder: focus + exact framing level.
  export function setFocusLevel(id: string, level: number) {
    controller?.setFocusLevel(id, level);
  }

  onMount(() => {
    let cancelled = false;
    (async () => {
      const { createHoloScene } = await import('$lib/holo/scene');
      if (cancelled || !canvas) return;
      controller = createHoloScene(canvas, { onSelect: (id) => dispatch('focus', id) });
      controller.setSystem(system, 'mount');
      controller.setTime(currentTime);
      controller.focusBody(focusedBodyId);
      applyStyle(style);
      const r = container.getBoundingClientRect();
      controller.resize(r.width, r.height);
      ro = new ResizeObserver((entries) => {
        const cr = entries[0]?.contentRect;
        if (cr) controller?.resize(cr.width, cr.height);
      });
      ro.observe(container);
    })();
    return () => { cancelled = true; };
  });

  onDestroy(() => {
    ro?.disconnect();
    controller?.dispose();
    controller = null;
  });

  // Reactive feeds (guarded until the scene has loaded). setCompression/setFilter short-circuit when
  // the value is unchanged, so re-applying the whole style on any tweak is cheap.
  // P2: this fires on the PROP'S IDENTITY, so any upstream re-clone rebuilds the whole 3D scene even
  // when nothing in the system changed. The reason label separates that from a remount and from a
  // style rebuild in the event ring — `__ssePerf.events(60, 'holo.setSystem')`.
  $: controller?.setSystem(system, 'prop');
  $: controller?.setShipCapability(shipAccel);
  $: controller?.setTransitMotion(transitMotion);
  $: controller?.setTime(currentTime);
  $: controller?.focusBody(focusedBodyId);
  $: if (controller) applyStyle(style);
  $: controller?.setHud(hudCanvas);
  $: controller?.setUserSpin(userSpin);
  $: controller?.setViewInset(viewInsetRight);
  // Re-apply when the momentary overrides change (style is unchanged, so these need their own trigger).
  $: if (controller) { labelsVisible; orbitLinesVisible; filterBypass; orbitPaused; skyStars; applyStyle(style); }
  // Prop first, store second (TAG-15): in a player window every store is a fresh empty instance, so the
  // value only ever arrives over the broadcast as a prop. Named in the expression, not closed over, or
  // the reactive statement would not re-run when the selection changes (TAG-17).
  $: activeHighlights = $liveOverrides.highlightsMuted ? [] : (highlights ?? $liveOverrides.mapHighlights ?? []);
  $: controller?.setHighlights(activeHighlights, activeTagCategories, markerStyle ?? 'label',
                               { size: markerSize, staff: flagStaff, pinText });
</script>

<div class="holo-root" bind:this={container}>
  <canvas bind:this={canvas}></canvas>
  {#if legend}
    <!-- A grid is only a measure if the reader is told what one cell is worth. `pointer-events: none`
         because this sits over a canvas that owns drag, pinch and click-to-select. -->
    <div class="grid-legend">{legend}</div>
  {/if}
</div>

<style>
  .holo-root {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none; /* let OrbitControls own pinch/drag */
  }
  .grid-legend {
    position: absolute;
    left: 50%;
    bottom: 10px;
    transform: translateX(-50%);
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(6, 10, 18, 0.55);
    color: rgba(190, 214, 240, 0.85);
    font-size: 0.72rem;
    letter-spacing: 0.03em;
    white-space: nowrap;
    pointer-events: none;
    user-select: none;
  }
</style>
