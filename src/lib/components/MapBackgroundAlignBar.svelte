<script lang="ts">
  // G16 ALIGN MODE - eyeball the picture into place on the LIVE map.
  //
  // WHY THIS EXISTS RATHER THAN MORE FIELDS IN SETTINGS. Georeferencing is a visual judgement: you are
  // lining a drawn coastline up with the stars it was drawn around, and no GM knows in advance that
  // the answer is "60.48 ly wide, centred on 23.4, 4.6, turned 15 degrees". They know it when they see
  // it. A dialog that covers the map cannot be the place that is decided, so Settings hands over: it
  // closes, this strip takes its place over the map, every control writes STRAIGHT TO THE CAMPAIGN so
  // the picture moves under your hand, and Done bolts it in and gives Settings back.
  //
  // CANCEL RESTORES THE ANCHOR IT WAS OPENED WITH, kept as a snapshot here. Live editing without a way
  // back is a trap on a control that can move a picture entirely off screen.
  //
  // It marks itself `use:chrome` and never `use:foreground` (UI-C6): it is a floating control, so on a
  // phone it must yield to a dialog rather than make the chrome hide itself whenever it is visible.
  import { createEventDispatcher, onMount } from 'svelte';
  import type { MapBackground, Starmap } from '$lib/types';
  import { normaliseMapBackground, suggestAnchor, backgroundPixelsPerUnit } from '$lib/map/mapBackground';
  import { campaignUnit } from '$lib/map/distanceUnits';
  import { chrome } from '$lib/ui/foreground';

  export let starmap: Starmap | null = null;

  const dispatch = createEventDispatcher<{ change: MapBackground; done: void; cancel: void }>();

  // The anchor as it was when align mode opened - what Cancel puts back.
  const opened: MapBackground = normaliseMapBackground(starmap?.mapBackground);
  $: bg = normaliseMapBackground(starmap?.mapBackground);
  $: unit = campaignUnit(starmap);

  // SLIDER RANGES SCALED TO THIS MAP, not to fixed numbers. A slider whose useful travel is the first
  // 2% of its track is a slider that cannot be eyeballed, and the spread of the charted systems is the
  // only scale the picture is ever judged against.
  $: extent = (() => {
    const ppu = backgroundPixelsPerUnit(starmap);
    const systems: any[] = (starmap as any)?.systems ?? [];
    if (!systems.length) return { span: 40, cx: 0, cy: 0 };
    const xs = systems.map((s) => s?.position?.x ?? 0);
    const ys = systems.map((s) => s?.position?.y ?? 0);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    return {
      span: Math.max(maxX - minX, maxY - minY, 1) / ppu,
      cx: (minX + maxX) / 2 / ppu,
      cy: (minY + maxY) / 2 / ppu
    };
  })();
  // Generous but not absurd: a quarter of the map's spread up to three times it, and offsets that reach
  // a full spread beyond the edge in each direction.
  $: widthMin = round2(extent.span * 0.05);
  $: widthMax = round2(extent.span * 3);
  $: offMin = round2(extent.cx - extent.span * 1.5);
  $: offMaxX = round2(extent.cx + extent.span * 1.5);
  $: offMinY = round2(extent.cy - extent.span * 1.5);
  $: offMaxY = round2(extent.cy + extent.span * 1.5);
  $: step = Math.max(0.01, round2(extent.span / 400));

  const round2 = (v: number) => Math.round(v * 100) / 100;
  const numOf = (e: Event, fallback: number) => {
    const v = parseFloat((e.currentTarget as HTMLInputElement).value);
    return Number.isFinite(v) ? v : fallback;
  };

  function patch(changes: Partial<MapBackground>) {
    dispatch('change', normaliseMapBackground({ ...bg, ...changes }));
  }
  function fit() { patch(suggestAnchor(starmap)); }
  function cancel() { dispatch('change', opened); dispatch('cancel'); }

  // Escape cancels, Enter accepts - the same contract the rest of the app's dialogs use.
  onMount(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.stopPropagation(); cancel(); }
      else if (e.key === 'Enter' && (e.target as HTMLElement)?.tagName !== 'INPUT') dispatch('done');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });
</script>

<div class="align-bar" use:chrome role="group" aria-label="Align the map background">
  <div class="ab-head">
    <span class="ab-title">Align background</span>
    <span class="ab-hint">Drag a control and watch the map. The systems stay put; the picture moves.</span>
  </div>

  <div class="ab-controls">
    <label class="ab-ctl">
      <span class="ab-lbl">Width <em>{round2(bg.widthUnits)} {unit}</em></span>
      <input type="range" min={widthMin} max={widthMax} {step}
        value={Math.min(widthMax, Math.max(widthMin, bg.widthUnits))}
        on:input={(e) => patch({ widthUnits: numOf(e, bg.widthUnits) })} />
    </label>

    <label class="ab-ctl">
      <span class="ab-lbl">Left / right <em>{round2(bg.offsetX)} {unit}</em></span>
      <input type="range" min={offMin} max={offMaxX} {step}
        value={Math.min(offMaxX, Math.max(offMin, bg.offsetX))}
        on:input={(e) => patch({ offsetX: numOf(e, bg.offsetX) })} />
    </label>

    <label class="ab-ctl">
      <span class="ab-lbl">Up / down <em>{round2(bg.offsetY)} {unit}</em></span>
      <input type="range" min={offMinY} max={offMaxY} {step}
        value={Math.min(offMaxY, Math.max(offMinY, bg.offsetY))}
        on:input={(e) => patch({ offsetY: numOf(e, bg.offsetY) })} />
    </label>

    <label class="ab-ctl">
      <span class="ab-lbl">Rotation <em>{Math.round(bg.rotationDeg)}&deg;</em></span>
      <input type="range" min="-180" max="180" step="0.5" value={bg.rotationDeg}
        on:input={(e) => patch({ rotationDeg: numOf(e, bg.rotationDeg) })} />
    </label>

    <label class="ab-ctl">
      <span class="ab-lbl">Fade <em>{Math.round((1 - bg.opacity) * 100)}%</em></span>
      <input type="range" min="0" max="0.95" step="0.05" value={1 - bg.opacity}
        on:input={(e) => patch({ opacity: 1 - numOf(e, 1 - bg.opacity) })} />
    </label>
  </div>

  <div class="ab-buttons">
    <button class="ab-fit" type="button" on:click={fit} title="Put the picture back over the charted systems">Fit to systems</button>
    <span class="ab-spacer"></span>
    <button class="ab-cancel" type="button" on:click={cancel}>Cancel</button>
    <button class="ab-ok" type="button" on:click={() => dispatch('done')}>Done</button>
  </div>
</div>

<style>
  /* A STRIP, NOT A DIALOG: it must leave the map visible, because the map is the thing being judged.
     Bottom-centred and narrow, clear of the reset button (top right), the time display (top left) and
     the description panel (bottom right). */
  .align-bar {
    /* FIXED, not absolute: the strip is mounted at page level beside the modals rather than inside the
       map component, so the viewport is the frame it should sit in. */
    position: fixed;
    left: 50%;
    bottom: 14px;
    transform: translateX(-50%);
    z-index: var(--z-chrome, 1400);
    width: min(680px, calc(100% - 32px));
    padding: 10px 12px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 92%, transparent);
    border: 1px solid var(--border, #2a2f3a);
    border-radius: 8px;
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.45);
    color: var(--text, #dfe6f0);
    font-size: 0.82rem;
  }
  .ab-head { display: flex; align-items: baseline; gap: 10px; margin-bottom: 8px; flex-wrap: wrap; }
  .ab-title { font-weight: 600; color: var(--accent, #ff5a1f); }
  .ab-hint { opacity: 0.7; font-size: 0.76rem; }
  .ab-controls { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 6px 14px; }
  .ab-ctl { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .ab-lbl { display: flex; justify-content: space-between; gap: 8px; font-size: 0.76rem; opacity: 0.85; }
  .ab-lbl em { font-style: normal; opacity: 0.75; font-variant-numeric: tabular-nums; }
  .ab-ctl input[type='range'] { width: 100%; margin: 0; accent-color: var(--accent, #ff5a1f); }
  .ab-buttons { display: flex; align-items: center; gap: 8px; margin-top: 10px; }
  .ab-spacer { flex: 1; }
  .ab-buttons button {
    padding: 5px 12px; border-radius: 4px; border: 1px solid var(--border, #2a2f3a);
    background: var(--bg-control, #232733); color: var(--text, #dfe6f0); font: inherit; cursor: pointer;
  }
  .ab-buttons button:hover { background: var(--bg-control-hover, #2c313f); }
  .ab-ok { background: var(--accent, #ff5a1f) !important; color: var(--on-accent, #fff); border-color: transparent !important; }
  .ab-ok:hover { filter: brightness(1.08); }

  /* Phone: the strip becomes a single column so five controls do not turn into five slivers. */
  @media (max-width: 560px) {
    .align-bar { width: calc(100% - 16px); bottom: 8px; padding: 8px 10px; }
    .ab-controls { grid-template-columns: 1fr; }
    .ab-hint { display: none; }
  }
</style>
