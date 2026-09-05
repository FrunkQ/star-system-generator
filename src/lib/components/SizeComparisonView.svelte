<script lang="ts">
  // SIZE COMPARISON — every object on the current map at TRUE relative size, side by side, in the
  // order the classic planets-and-moons poster uses.
  //
  // THE SPLIT, and it is the reason this file stays small: the LAWS are pure and live in
  // `comparison/layout.ts` (order, the median planet, the scale shares, the strip, the pixel floor,
  // the ruler's reference marks), the GLOBES are drawn by `holo/comparisonScene.ts` through the one
  // shared body-look assembly, and this component is the chrome between them — labels, the ruler,
  // the hit areas, the hide menu. The scene's camera is orthographic and measured IN PIXELS, so a
  // label placed here at `centrePx` sits over its globe by construction rather than by a projection.
  import { onMount, createEventDispatcher } from 'svelte';
  import UnitValue from './UnitValue.svelte';
  import {
    sortBySize, medianPlanet, pxPerKm, zoomBounds, layoutStrip, belowFloorNote, visibleItems,
    idsAtLeast, idsAtMost, referenceMarks, minorTicks, clampScroll, scrollForZoom,
    SELECTED_SHARE, OPENING_SHARE, TAP_SLOP_PX, STEP_FRACTION,
    type StripLayout
  } from '$lib/comparison/layout';
  import { hiddenKey, loadHidden, saveHidden, type ComparisonEntry } from '$lib/comparison/items';
  import type { UnitBodyType } from '$lib/units';

  /** Everything on the map that has a true size, from `itemsForSystem` / `itemsForStarmap`. */
  export let items: ComparisonEntry[] = [];
  /** Which map this is, and which one — together they key the hidden set. */
  export let scope: 'system' | 'starmap' = 'system';
  export let mapId: string | null = null;
  /** The same phone mode the system view and the starmap already key on. */
  export let mode: 'desktop' | 'phone' = 'desktop';
  /** The map's shared selection, so the info panel follows a click here (TAG-14). */
  export let selectedId: string | null = null;

  const dispatch = createEventDispatcher<{ select: { id: string }; close: void }>();

  let canvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let handle: { setSlots: (s: any[]) => void; setView: (a: 'x' | 'y', s: number, w: number, h: number) => void; setSelected: (id: string | null) => void; dispose: () => void } | null = null;

  let vw = 1, vh = 1;
  let scrollPx = 0;
  /** Set once from the median planet, then by a click or the hand zoom. */
  let scale = 0;
  let hidden: Set<string> = new Set();
  let menuFor: string | null = null;

  // DRAG STATE. A phone has no wheel, so before this the strip could not be moved on a touch device
  // AT ALL - the only pan path was `onWheel`, which a finger never fires (reported by a user, 2026-
  // 09-05). Pointer events cover mouse, pen and touch in one path, so the desktop gets drag too.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragFrom = 0;          // scrollPx when the gesture started
  let dragAt = 0;            // where along the axis the gesture started
  let dragTravel = 0;        // furthest the gesture has moved, for the tap-vs-drag test
  let pinchFrom = 0;         // finger separation when the pinch started
  let pinchScale = 0;        // `scale` when the pinch started
  let pinchAnchor = 0;       // the pinch's centre along the axis, from the window's near edge
  /** True once a gesture has passed the slop threshold - suppresses the click it would otherwise end on. */
  let dragged = false;

  // The strip runs down the screen on a phone and across it on a desktop — the same `mode` the
  // system view and the starmap already key on, not a second idea of what a phone is.
  $: axis = (mode === 'phone' ? 'y' : 'x') as 'x' | 'y';
  $: shorterSide = Math.max(1, Math.min(vw, vh));
  $: visible = visibleItems(items, hidden);
  $: sorted = sortBySize(visible);
  $: bounds = zoomBounds(visible, shorterSide);
  $: layout = scale > 0 ? layoutStrip(visible, scale, { axis }) : ({ slots: [], lengthPx: 0, axis } as StripLayout);
  /** The window's length along the strip's own axis - the number every scroll figure is measured in. */
  $: span = axis === 'x' ? vw : vh;
  /** Whether there is anywhere to go: no overflow, no steppers, nothing to drag. */
  $: overflows = layout.lengthPx > span + 1;
  $: atStart = scrollPx <= 1;
  $: atEnd = scrollPx >= layout.lengthPx - span - 1;
  $: rulerLen = axis === 'x' ? vw : vh;
  $: marks = referenceMarks(scale, rulerLen);
  $: minors = minorTicks(scale, rulerLen);
  $: byId = new Map(items.map((i) => [i.id, i]));

  // THE OPENING VIEW: the median planet at 30% of the shorter side. Re-armed whenever the map or the
  // hidden set changes the cast, because "the median" is a statement about the objects on screen.
  let armed = '';
  $: {
    const signature = `${mapId}|${visible.length}|${shorterSide}`;
    if (signature !== armed && visible.length && shorterSide > 1) {
      armed = signature;
      const opener = medianPlanet(visible);
      if (opener) {
        scale = pxPerKm(opener.diameterKm, shorterSide, OPENING_SHARE);
        centreOn(opener.id);
      }
    }
  }

  // The scene only ever hears about globes it can actually draw: anything under the floor is a DOT,
  // and a dot is DOM. That is the performance rule (no texture for a body you cannot see) and the
  // honesty rule (RENDER-S43: a floor is a legibility device, never a size) in one place.
  $: if (handle) handle.setSlots(layout.slots.filter((s) => !s.belowFloor).map((s) => ({
    id: s.id, node: byId.get(s.id)?.node, centrePx: s.centrePx, diameterPx: s.diameterPx, colorHex: byId.get(s.id)?.colorHex
  })).filter((s) => s.node));
  $: if (handle) handle.setView(axis, scrollPx, vw, vh);
  $: if (handle) handle.setSelected(selectedId);

  function bodyTypeOf(role: string): UnitBodyType {
    return role === 'star' ? 'star' : role === 'moon' ? 'moon' : 'planet';
  }

  function centreOn(id: string): void {
    const next = layoutStrip(visible, scale, { axis });
    const slot = next.slots.find((s) => s.id === id);
    if (!slot) return;
    const reach = axis === 'x' ? vw : vh;
    // Clamped against the layout AT THE NEW SCALE, not the one on screen: `pick` changes the scale
    // and then centres, so the strip it is centring in is not the one `layout` still describes.
    scrollPx = clampScroll(slot.centrePx - reach / 2, next.lengthPx, reach);
  }

  /** One stepper press, or one arrow key: most of a screenful, so you keep your place. */
  function step(dir: -1 | 1): void {
    scrollPx = clampScroll(scrollPx + dir * span * STEP_FRACTION, layout.lengthPx, span);
  }

  /** A click SELECTS through the map's shared selection and re-scales to the owner's 50%. */
  function pick(id: string): void {
    const item = byId.get(id);
    if (!item) return;
    scale = pxPerKm(item.diameterKm, shorterSide, SELECTED_SHARE);
    dispatch('select', { id });
    centreOn(id);
    menuFor = null;
  }

  function hide(ids: string[]): void {
    hidden = new Set([...hidden, ...ids]);
    saveHidden(hiddenKey(scope, mapId), hidden);
    menuFor = null;
  }

  function showAll(): void {
    hidden = new Set();
    saveHidden(hiddenKey(scope, mapId), hidden);
    // "Resets the view to its starting state", in the owner's words — so the opening rule re-arms.
    armed = '';
  }

  function onWheel(e: WheelEvent): void {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey || e.shiftKey) {
      zoomTo(scale * Math.exp(-e.deltaY * 0.0015), span / 2);   // about the window's middle
    } else {
      scrollPx = clampScroll(scrollPx + (e.deltaY || e.deltaX), layout.lengthPx, span);
    }
  }

  /** Zoom to `next`, held about `anchorPx` along the axis, clamped to the SET's own extent (UI-L7). */
  function zoomTo(next: number, anchorPx: number): void {
    const wanted = Math.min(bounds.max, Math.max(bounds.min, next));
    scrollPx = scrollForZoom(scrollPx, anchorPx, scale, wanted, layout.lengthPx, span);
    scale = wanted;
  }

  // --- DRAG AND PINCH ------------------------------------------------------------------------
  // One pointer drags along the strip; two pinch to zoom about the point between them. Pointer
  // events rather than touch events, so a mouse, a pen and a finger all take the same path and the
  // desktop gains drag for free.
  const alongOf = (p: { x: number; y: number }) => (axis === 'x' ? p.x : p.y);

  function onPointerDown(e: PointerEvent): void {
    // Capture so a finger that slides off the stage keeps driving the gesture. Wrapped because
    // `setPointerCapture` throws on an id the browser no longer considers active, and an exception
    // on the FIRST line of this handler would take the whole gesture with it — the strip would
    // simply stop responding, with nothing in the console to say why. Defensive: not a fault
    // anybody has seen.
    try { (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId); } catch { /* not capturable */ }
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragFrom = scrollPx;
      dragAt = alongOf({ x: e.clientX, y: e.clientY });
      dragTravel = 0;
      dragged = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchFrom = Math.hypot(a.x - b.x, a.y - b.y);
      pinchScale = scale;
      const rect = stage?.getBoundingClientRect();
      const mid = (alongOf(a) + alongOf(b)) / 2 - (rect ? (axis === 'x' ? rect.left : rect.top) : 0);
      pinchAnchor = mid;
      dragged = true;   // a two-finger gesture is never a tap
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const now = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchFrom > 0 && now > 0) zoomTo(pinchScale * (now / pinchFrom), pinchAnchor);
      return;
    }
    const moved = alongOf({ x: e.clientX, y: e.clientY }) - dragAt;
    dragTravel = Math.max(dragTravel, Math.abs(moved));
    if (dragTravel > TAP_SLOP_PX) dragged = true;
    // The strip follows the finger: dragging towards the start moves the content that way, so the
    // scroll goes the OTHER way. Anything else feels like the map is fighting you.
    scrollPx = clampScroll(dragFrom - moved, layout.lengthPx, span);
  }

  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      // Leave `dragged` standing for one tick: the click event that ends this gesture has not fired
      // yet, and it is the thing the slop test exists to suppress.
      const wasDrag = dragged;
      setTimeout(() => { if (wasDrag) dragged = false; }, 0);
    } else if (pointers.size === 1) {
      // Coming out of a pinch with one finger still down: restart the drag from where it is now,
      // or the strip jumps by however far the fingers had travelled.
      const [only] = [...pointers.values()];
      dragFrom = scrollPx;
      dragAt = alongOf(only);
    }
  }

  /** Arrow keys move along the strip too - the same journey, for anyone not using a pointer. */
  function onKeyDown(e: KeyboardEvent): void {
    const back = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
    const fwd = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
    if (e.key === back) { step(-1); e.preventDefault(); }
    else if (e.key === fwd) { step(1); e.preventDefault(); }
    else if (e.key === 'Escape') dispatch('close');
  }

  onMount(() => {
    hidden = loadHidden(hiddenKey(scope, mapId));
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      const { createComparisonScene } = await import('$lib/holo/comparisonScene');
      if (cancelled || !canvas) return;
      handle = createComparisonScene(canvas);
      const measure = () => {
        // NEVER take a 0x0 rect as a size (RENDER-S30) — an unlaid-out container reports one and a
        // renderer told 0x0 sets a 2x2 backing store that the next real frame stretches.
        const r = stage?.getBoundingClientRect();
        if (!r || r.width < 1 || r.height < 1) return;
        vw = Math.round(r.width); vh = Math.round(r.height);
      };
      measure();
      ro = new ResizeObserver(measure);
      if (stage) ro.observe(stage);
    })();
    return () => { cancelled = true; ro?.disconnect(); handle?.dispose(); handle = null; };
  });
</script>

<div class="size-comparison" class:phone={mode === 'phone'}>
  <header>
    <h2>Size comparison</h2>
    <p class="hint">Everything on this map at true relative size.
      {mode === 'phone' ? 'Tap an object to fill half the view' : 'Click an object to fill half the view'}
      · {mode === 'phone' ? 'drag to move along · pinch to zoom' : 'drag or scroll to move along · shift-scroll to zoom'}.</p>
    <!-- THE HIDE OFFER NEEDS A REACHABLE DOOR. Right-clicking an object opens the same popup, but a
         phone has no right-click and a context menu is not a thing anyone finds — so the selected
         object's hide control lives in the header, where it is visible the moment something is
         selected and works with a tap. -->
    {#if selectedId && byId.has(selectedId)}
      <button class="pill" on:click={() => (menuFor = selectedId)}>Hide {byId.get(selectedId)?.name}…</button>
    {/if}
    {#if hidden.size}
      <button class="pill" on:click={showAll}>{hidden.size} hidden — show all</button>
    {/if}
    <button class="close" title="Close" on:click={() => dispatch('close')}>×</button>
  </header>

  <div
    class="stage"
    bind:this={stage}
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:keydown={onKeyDown}
    role="application"
    aria-label="Size comparison strip"
    tabindex="0"
  >
    <!-- NO width/height ATTRIBUTES HERE. The renderer owns the backing store: `setSize(vw, vh, false)`
         multiplies by the device pixel ratio, and a Svelte-bound `width={vw}` overwrites that with the
         CSS pixel count every time the view re-renders. The two then disagree by the pixel ratio and
         the scene draws into a corner of its own buffer — invisible at ratio 1 (a desktop) and obvious
         at 2 (the phone preset), where the globes sat half off the right edge while the DOM overlay,
         which does its own arithmetic, was exactly right. CSS below sizes the element. -->
    <canvas bind:this={canvas}></canvas>

    <!-- The overlay: hit areas, labels, dots and the ruler. One world unit is one pixel, so a slot's
         `centrePx` is its position here with only the scroll subtracted. -->
    <div class="overlay">
      {#each layout.slots as slot (slot.id)}
        {@const item = byId.get(slot.id)}
        {@const along = slot.centrePx - scrollPx}
        {#if item && along > -slot.spanPx && along < (axis === 'x' ? vw : vh) + slot.spanPx}
          <button
            class="hit"
            class:selected={slot.id === selectedId}
            class:dot={slot.belowFloor}
            style={axis === 'x'
              ? `left:${along - slot.spanPx / 2}px; top:calc(50% - ${slot.spanPx / 2}px); width:${slot.spanPx}px; height:${slot.spanPx}px;`
              : `top:${along - slot.spanPx / 2}px; left:calc(50% - ${slot.spanPx / 2}px); width:${slot.spanPx}px; height:${slot.spanPx}px;`}
            title={slot.name}
            on:click={() => { if (!dragged) pick(slot.id); }}
            on:contextmenu|preventDefault={() => (menuFor = slot.id)}
          ></button>
          <div
            class="label {slot.labelSide}"
            class:vertical={axis === 'y'}
            style={axis === 'x'
              ? `left:${along}px; ${slot.labelSide === 'start' ? 'top' : 'bottom'}: calc(50% + ${slot.spanPx / 2 + 8}px);`
              : `top:${along}px; ${slot.labelSide === 'start' ? 'left' : 'right'}: calc(50% + ${slot.spanPx / 2 + 8}px);`}
          >
            <span class="name">{slot.name}</span>
            <span class="size">
              <UnitValue quantity="radius" bodyType={bodyTypeOf(item.role)} value={item.diameterKm} />
            </span>
            {#if slot.belowFloor}<span class="floor">{belowFloorNote(slot.diameterPx)}</span>{/if}
          </div>
        {/if}
      {/each}

      <!-- The ruler, in the current LENGTH unit through the click-to-cycle prefs (DATA-R20: stored
           values never leave SI; a pref RELABELS). Three highlighted reference ticks — Luna, Earth,
           the Sun — shown as an arrow at the edge when they fall off the range. -->
      <div class="ruler" class:vertical={axis === 'y'}>
        {#each minors as t (t.km)}
          <div class="minor" style={axis === 'x' ? `left:${t.posPx}px` : `top:${t.posPx}px`}></div>
        {/each}
        {#each marks as m (m.id)}
          {#if m.off === 'none'}
            <div class="tick" style={axis === 'x' ? `left:${m.posPx}px` : `top:${m.posPx}px`}>
              <span class="tick-label" style={axis === 'x' ? `top:${2 + m.row * 12}px` : `left:${2 + m.row * 12}px`}>{m.label} · <UnitValue quantity="radius" bodyType={m.id === 'sun' ? 'star' : 'planet'} value={m.diameterKm} /></span>
            </div>
          {:else}
            <!-- An arrow along the STRIP's own axis: right/left across a desktop ruler, down/up a
                 phone one. A rightward arrow on a vertical ruler points at nothing. -->
            <div class="tick off {m.off}">
              <span class="tick-label">{axis === 'x' ? (m.off === 'end' ? '→' : '←') : (m.off === 'end' ? '↓' : '↑')} {m.label}</span>
            </div>
          {/if}
        {/each}
      </div>
    </div>

    {#if menuFor}
      {@const m = byId.get(menuFor)}
      <div class="menu" role="menu">
        <div class="menu-title">{m?.name}</div>
        <button on:click={() => hide([menuFor!])}>Hide this</button>
        <button on:click={() => hide(idsAtLeast(visible, menuFor!))}>Hide this and everything bigger</button>
        <button on:click={() => hide(idsAtMost(visible, menuFor!))}>Hide this and everything smaller</button>
        <button class="cancel" on:click={() => (menuFor = null)}>Cancel</button>
      </div>
    {/if}

    <!-- THE STEPPERS, and they earn their place twice over. A finger can drag the strip now, but a
         gesture nobody is told about is a gesture nobody finds; and on a phone, where the strip runs
         DOWN the screen, "there is more below" is not something the layout says by itself. They only
         appear while the strip actually overflows, and each one dims at its own end. -->
    {#if overflows}
      <button class="step back" class:vertical={axis === 'y'} disabled={atStart}
        title={axis === 'x' ? 'Towards the largest' : 'Scroll up - towards the largest'}
        aria-label={axis === 'x' ? 'Scroll towards the largest' : 'Scroll up'}
        on:click={() => step(-1)}>{axis === 'x' ? '\u2039' : '\u2039'}</button>
      <button class="step fwd" class:vertical={axis === 'y'} disabled={atEnd}
        title={axis === 'x' ? 'Towards the smallest' : 'Scroll down - towards the smallest'}
        aria-label={axis === 'x' ? 'Scroll towards the smallest' : 'Scroll down'}
        on:click={() => step(1)}>{axis === 'x' ? '\u203a' : '\u203a'}</button>
    {/if}

    {#if !sorted.length}
      <p class="empty">Nothing on this map has a size to compare.</p>
    {/if}
  </div>
</div>

<style>
  /* ABOVE THE MAP'S OWN CHROME, not beside it. The time display, the body picker, the info panel,
     Reset View and the time controls sit at z-index 55-60 on the map surface; at 40 this view opened
     UNDERNEATH all of them, so its header was hidden behind the clock and its ruler behind the
     transport bar. This is a full-surface VIEW rather than a panel, so it covers them while it is
     open and the rail (which lives outside this stacking context) stays reachable. */
  .size-comparison { position: absolute; inset: 0; display: flex; flex-direction: column; background: #05070c; color: #dfe6f0; z-index: 70; }
  header { display: flex; align-items: baseline; gap: 12px; padding: 8px 12px; border-bottom: 1px solid #1b2434; flex: 0 0 auto; }
  h2 { font-size: 15px; margin: 0; font-weight: 600; letter-spacing: 0.02em; }
  .hint { margin: 0; font-size: 11px; color: #7f8ea6; flex: 1 1 auto; }
  .pill { background: #1d2a3d; border: 1px solid #2c3d55; color: #cfe0f5; border-radius: 999px; padding: 2px 10px; font-size: 11px; cursor: pointer; }
  .pill:hover { background: #25374f; }
  .close { background: none; border: none; color: #7f8ea6; font-size: 20px; line-height: 1; cursor: pointer; padding: 0 4px; }
  .close:hover { color: #dfe6f0; }

  /* `touch-action: none` is what makes a finger reach `pointermove` at all: without it the browser
     claims the gesture as a page scroll and the strip cannot be dragged on a phone. `cursor: grab`
     says the same thing to a mouse. */
  .stage { position: relative; flex: 1 1 auto; overflow: hidden; touch-action: none; cursor: grab; outline: none; }
  .stage:active { cursor: grabbing; }
  .stage:focus-visible { box-shadow: inset 0 0 0 2px rgba(140, 190, 255, 0.5); }

  .step {
    position: absolute; z-index: 2; pointer-events: auto;
    width: 34px; height: 52px; display: grid; place-items: center;
    background: rgba(16, 26, 40, 0.82); border: 1px solid #2c3d55; color: #cfe0f5;
    border-radius: 8px; font-size: 22px; line-height: 1; cursor: pointer;
    top: 50%; transform: translateY(-50%);
  }
  .step.back { left: 8px; }
  .step.fwd { right: 8px; }
  /* On a phone the strip runs down the screen, so the steppers do too - and they say "up"/"down",
     which is the thing the reporter could not do. */
  .step.vertical { top: auto; left: 50%; right: auto; transform: translateX(-50%) rotate(90deg); }
  .step.back.vertical { top: 8px; }
  .step.fwd.vertical { bottom: 8px; }
  .step:hover:not(:disabled) { background: rgba(29, 42, 61, 0.95); }
  .step:disabled { opacity: 0.25; cursor: default; }
  canvas { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
  .overlay { position: absolute; inset: 0; pointer-events: none; }

  .hit { position: absolute; border: none; background: none; border-radius: 50%; padding: 0; cursor: pointer; pointer-events: auto; }
  .hit:hover { box-shadow: 0 0 0 2px rgba(140, 190, 255, 0.55); }
  .hit.selected { box-shadow: 0 0 0 2px rgba(255, 214, 120, 0.85); }
  /* A sub-floor object is a MARKER, never an inflated body: a small ring where the object is. */
  .hit.dot { background: #cfe0f5; box-shadow: 0 0 6px rgba(200, 224, 255, 0.7); }

  .label { position: absolute; transform: translateX(-50%); text-align: center; font-size: 11px; white-space: nowrap; pointer-events: none; }
  .label.vertical { transform: translateY(-50%); text-align: left; }
  .name { display: block; color: #e7eefa; }
  .size { display: block; color: #8fa6c4; font-size: 10px; }
  .floor { display: block; color: #6c7d96; font-size: 10px; font-style: italic; }

  .ruler { position: absolute; left: 0; right: 0; bottom: 0; height: 44px; border-top: 1px solid #1b2434; background: rgba(5, 7, 12, 0.72); }
  .minor { position: absolute; top: 0; border-left: 1px solid #2b384c; height: 7px; }
  .ruler.vertical .minor { left: 0; border-left: none; border-top: 1px solid #2b384c; width: 7px; height: auto; }
  .ruler.vertical { top: 0; bottom: 0; left: 0; right: auto; width: 44px; height: auto; border-top: none; border-right: 1px solid #1b2434; }
  .tick { position: absolute; top: 0; border-left: 1px solid #ffd678; height: 100%; }
  .ruler.vertical .tick { left: 0; border-left: none; border-top: 1px solid #ffd678; width: 100%; height: auto; }
  .tick-label { position: absolute; left: 4px; top: 2px; font-size: 10px; color: #ffd678; white-space: nowrap; }
  .ruler.vertical .tick-label { left: 6px; top: 2px; }
  .tick.off.end { right: 2px; left: auto; border: none; }
  .tick.off.start { left: 2px; border: none; }
  .ruler.vertical .tick.off.end { bottom: 2px; top: auto; right: auto; left: 0; }
  .ruler.vertical .tick.off.start { top: 2px; left: 0; }

  .menu { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #101a28; border: 1px solid #2c3d55; border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 2px; min-width: 240px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6); }
  .menu-title { font-size: 11px; color: #8fa6c4; padding: 4px 8px 6px; }
  .menu button { background: none; border: none; color: #dfe6f0; text-align: left; font-size: 12px; padding: 6px 8px; border-radius: 5px; cursor: pointer; }
  .menu button:hover { background: #1d2a3d; }
  .menu .cancel { color: #7f8ea6; }

  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: #7f8ea6; font-size: 12px; }
</style>
