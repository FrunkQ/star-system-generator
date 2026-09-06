<script lang="ts">
  // SIZE COMPARISON — every object on the current map at TRUE relative size, side by side, in the
  // order the classic planets-and-moons poster uses.
  //
  // THE SPLIT, and it is the reason this file stays small: the LAWS are pure and live in
  // `comparison/layout.ts` (order, the median planet, the centre share, the strip, the pixel floor,
  // the ruler's arcs, the hit test), the GLOBES are drawn by `holo/comparisonScene.ts` through the
  // one shared body-look assembly, the CHROME is drawn by `comparison/stripChrome.ts` into a canvas
  // that the scene composites and filters, and this component is what is left: the controls, the
  // gestures, and the wiring between the three.
  //
  // WHAT IS DOM HERE AND WHY. Only CONTROLS — the header, the order pills, the steppers, the hide
  // menu, and one invisible focusable button per object as the keyboard path. Everything the picture
  // SAYS is in the rendered surface, because DOM sits in screen space and does not follow a warped,
  // inset projection: under a barrel-warped CRT preset the picture bends and the text over it does
  // not. Owner's decision, 2026-07-18; engine map RENDER-S54; inbox B126.
  import { onMount, createEventDispatcher } from 'svelte';
  import {
    sortItems, medianPlanet, layoutStrip, visibleItems,
    idsAtLeast, idsAtMost, referenceArcs, clampCentreShare, slotAt,
    focusIndexOf, clampFocus, scaleForFocus, focusCentrePx, focusCrossPx, focusStepPx,
    ringOpacityAt, ringProminence, ringTiltRad,
    OPENING_SHARE, TAP_SLOP_PX, stepFocus, wheelPx, WHEEL_NOTCH_PX, SORT_ORDERS,
    type StripLayout, type SortOrder
  } from '$lib/comparison/layout';
  import { drawStripChrome } from '$lib/comparison/stripChrome';
  import { hiddenKey, loadHidden, saveHidden, loadOrder, saveOrder, type ComparisonEntry } from '$lib/comparison/items';
  import { unitPrefs } from '$lib/unitPrefsStore';
  import type { FilterParamValues } from '$lib/holo/filters/schema';

  /** Everything on the map that has a true size, from `itemsForSystem` / `itemsForStarmap`. */
  export let items: ComparisonEntry[] = [];
  /** Which map this is, and which one — together they key the hidden set. */
  export let scope: 'system' | 'starmap' = 'system';
  export let mapId: string | null = null;
  /** The same phone mode the system view and the starmap already key on. */
  export let mode: 'desktop' | 'phone' = 'desktop';
  /** The map's shared selection, so the info panel follows a click here (TAG-14). */
  export let selectedId: string | null = null;
  /**
   * PLAYER TIER (G68). The GM chose this view and set it up; a player gets to look and to tap, and
   * nothing else. No close button (there is nothing to go back to — the view IS the system stage),
   * no order pills and no hiding, because both are the GM's decision and both live in the preset.
   * The strip, the scale, the ruler, the drag and the selection are all unchanged: the difference
   * between the two tiers is chrome, not capability.
   */
  export let playerChrome = false;
  /**
   * An order imposed from outside — the preset's choice at the player tier. When null the view uses
   * its own remembered one, which is the GM's case.
   */
  export let forcedOrder: SortOrder | null = null;
  /**
   * The preset's REAL filter, run as a GPU pass over the composed picture — globes and chrome alike.
   * `'none'` at the GM tier, which is the same code path with nothing in it. This replaces the
   * `FilterFrame` CSS approximation both mounts used to wrap this view in (B126).
   */
  export let filterId: string = 'none';
  export let filterParams: FilterParamValues = {};
  /**
   * The ruler's reference arcs. A player-view option, because a GM setting up a screen for a table
   * may want the picture and not the measuring marks. Owner, 2026-09-06.
   */
  export let showRuler = true;

  const dispatch = createEventDispatcher<{ select: { id: string }; close: void }>();

  let canvas: HTMLCanvasElement;
  /** The 2D canvas the chrome is drawn to. Owned here, uploaded by the scene. See `redrawChrome`. */
  let chromeCanvas: HTMLCanvasElement;
  let stage: HTMLDivElement;
  let handle: {
    setSlots: (s: any[]) => void;
    setView: (a: 'x' | 'y', s: number, w: number, h: number, cross?: number) => void;
    setSelected: (id: string | null) => void;
    setChrome: (c: HTMLCanvasElement | null) => void;
    setFilter: (id: string, params?: FilterParamValues) => void;
    warpPoint: (su: number, sv: number) => [number, number];
    dispose: () => void;
  } | null = null;

  let vw = 1, vh = 1;
  /**
   * WHERE YOU ARE, as a fractional index into the strip's own sequence — the ONE piece of state the
   * along-axis has. The scale and the pixel scroll are both derived from it, in that order, so there
   * is no way for them to disagree about what is in the middle of the window.
   */
  let focus = 0;
  /** How much of the shorter side the object at the focus fills. The hand zoom moves this and only this. */
  let centreShare = OPENING_SHARE;
  let hidden: Set<string> = new Set();
  let menuFor: string | null = null;
  /** Which order the strip is in. Remembered per map, beside the hidden set and for the same reason. */
  let storedOrder: SortOrder = 'size';
  /** The preset's word where there is one, otherwise the GM's remembered choice. */
  $: order = forcedOrder ?? storedOrder;

  // DRAG STATE. A phone has no wheel, so before this the strip could not be moved on a touch device
  // AT ALL - the only pan path was `onWheel`, which a finger never fires (reported by a user, 2026-
  // 09-05). Pointer events cover mouse, pen and touch in one path, so the desktop gets drag too.
  const pointers = new Map<number, { x: number; y: number }>();
  let dragFrom = 0;          // `focus` when the gesture started
  let dragStepPx = 1;        // px of picture per whole step of focus, TAKEN ONCE (see focusStepPx)
  let dragAt = 0;            // where along the axis the gesture started
  let dragAcrossAt = 0;      // where across the axis the gesture started, for the tap-vs-drag test
  let dragTravel = 0;        // furthest the gesture has moved, for the tap-vs-drag test
  let pinchFrom = 0;         // finger separation when the pinch started
  let pinchShare = 0;        // `centreShare` when the pinch started
  /** True once a gesture has passed the slop threshold - suppresses the pick it would otherwise end on. */
  let dragged = false;
  /** Set the moment a gesture becomes a drag. See `capture` for why NOT on pointerdown. */
  let captured = false;
  /**
   * The gesture began on a CONTROL (a stepper, a menu row), so its end is that control's business
   * and not a pick. The stage sees the event either way, because a button inside it bubbles.
   */
  let downOnControl = false;
  /** What the pointer is over, for the hover ring. Driven by the same hit test the pick uses. */
  let hoveredId: string | null = null;

  // The strip runs down the screen on a phone and across it on a desktop — the same `mode` the
  // system view and the starmap already key on, not a second idea of what a phone is.
  $: axis = (mode === 'phone' ? 'y' : 'x') as 'x' | 'y';
  $: shorterSide = Math.max(1, Math.min(vw, vh));
  $: visible = visibleItems(items, hidden);
  $: sorted = sortItems(visible, order);
  // THE DERIVATION, and its order is the law: the sequence says what you can be looking at, the
  // focus says which of them you ARE, the scale comes from that one's size, the strip is laid out at
  // that scale, and the scroll is wherever the focus landed once it was. Nothing here reads a value
  // a later line writes.
  $: seq = sorted;
  $: scale = scaleForFocus(seq, focus, shorterSide, centreShare);
  $: layout = scale > 0
    ? layoutStrip(visible, scale, { axis, order })
    : ({ slots: [], lengthPx: 0, axis, crossReachPx: 0 } as StripLayout);
  /** The window's length along the strip's own axis - the number every scroll figure is measured in. */
  $: span = axis === 'x' ? vw : vh;
  /**
   * DERIVED, never set: the focused object sits in the MIDDLE of the window, so the scroll is just
   * wherever that put it. It is free to go negative (the first object is entitled to the middle as
   * much as any other, and there is empty strip before it) — clamping it here is what would pin the
   * ends to an edge and break the law the whole view runs on.
   */
  $: scrollPx = focusCentrePx(layout, seq, focus) - span / 2;
  /**
   * ACROSS the strip, and DERIVED from the same focus. Only the orbit layout stacks anything off the
   * centreline, so this is zero for every other order; where it is not, scrolling onto a moon brings
   * its ROW to the middle as well as its column. A free cross-drag beside a derived along-scroll
   * would be two owners of where the picture is.
   */
  $: crossScrollPx = focusCrossPx(layout, seq, focus);
  /** Whether there is anywhere to go: one object is the whole journey, and it needs no steppers. */
  $: overflows = seq.length > 1;
  $: atStart = focus <= 0.001;
  $: atEnd = focus >= seq.length - 1.001;
  /**
   * THE RULER, as circles of the reference diameters concentric with the middle of the window — which
   * is where the focused object is, by the focus law. The ladder picks itself: only the rungs that
   * are legible at this zoom come back (see `referenceArcs`).
   */
  $: arcs = showRuler ? referenceArcs(scale, vw, vh) : [];
  $: byId = new Map(items.map((i) => [i.id, i]));
  /** What the chrome needs per object: its role (for the unit bucket) and its true size. */
  $: chromeInfo = new Map(items.map((i) => [i.id, { role: i.role, diameterKm: i.diameterKm }]));
  /** Where each object sits in the travelling sequence — the ring fade is measured in these steps. */
  $: seqIndex = new Map(seq.map((i, n) => [i.id, n]));

  // THE OPENING VIEW: the median planet in the middle of the window at 30% of the shorter side.
  // Re-armed whenever the map or the hidden set changes the cast, because "the median" is a
  // statement about the objects on screen.
  let armed = '';
  $: {
    // THE SIGNATURE IS THE CAST, NOT THE WINDOW. It used to carry `shorterSide` and `axis` — a
    // leftover from when the opening view SET an absolute scale and therefore needed the size. The
    // scale is derived now, and the focus is an INDEX, so both survive a resize by construction;
    // carrying them here meant every resize re-armed the opening view and threw away where you
    // were. Seen live: selecting a body whose name is longer reflows the header by a pixel, which
    // changes the stage height, which re-opened the whole view on its median.
    const signature = `${mapId}|${visible.length}|${order}`;
    if (signature !== armed && visible.length && shorterSide > 1) {
      armed = signature;
      const opener = medianPlanet(visible);
      // A set with no planets at all falls back to the middle of the strip, which is the same answer
      // `medianPlanet` gives for that case, expressed as a position.
      const i = focusIndexOf(seq, opener?.id ?? null);
      focus = clampFocus(i >= 0 ? i : Math.floor((seq.length - 1) / 2), seq.length);
      centreShare = OPENING_SHARE;
    }
  }

  // The scene only ever hears about globes it can actually draw: anything under the floor is a DOT,
  // and a dot is drawn by the CHROME. That is the performance rule (no texture for a body you cannot
  // see) and the honesty rule (RENDER-S43: a floor is a legibility device, never a size) in one place.
  $: if (handle) handle.setSlots(layout.slots.filter((s) => !s.belowFloor).map((s) => ({
    id: s.id, node: byId.get(s.id)?.node, centrePx: s.centrePx, crossPx: s.crossPx,
    diameterPx: s.diameterPx, colorHex: byId.get(s.id)?.colorHex,
    ringInnerPx: s.ringInnerPx, ringOuterPx: s.ringOuterPx, ringColorHex: byId.get(s.id)?.ringColorHex,
    // HOW OPEN THE RING LOOKS is the host's own obliquity — Uranus lies on its side and its rings
    // draw as a circle, Jupiter's are all but edge-on. One shared tilt made every giant look like
    // Saturn, which is the thing the owner spotted.
    ringTiltRad: ringTiltRad(byId.get(s.id)?.axialTiltDeg),
    // TWO THINGS MULTIPLY INTO THE ALPHA and they answer different questions. `ringOpacityAt` is
    // about ATTENTION — only the ring you are looking at is at full strength, or a strip of ringed
    // worlds is a grey wash. `ringProminence` is about the RING — Saturn's are 10,000 times denser
    // than Jupiter's, and drawn at one brightness the faintest rings in the system read as the
    // grandest, because they happen to be the widest.
    // NB the prominence is computed from the TRUE radii in km, never the drawn ones: it is a surface
    // DENSITY, so a pixel area would make it depend on how far you happen to be zoomed in.
    ringOpacity: ringOpacityAt((seqIndex.get(s.id) ?? focus) - focus)
      * ringProminence(byId.get(s.id)?.ringInnerKm ?? 0, byId.get(s.id)?.ringOuterKm ?? 0, byId.get(s.id)?.ringMassKg)
  })).filter((s) => s.node));
  $: if (handle) handle.setView(axis, scrollPx, vw, vh, crossScrollPx);
  $: if (handle) handle.setSelected(selectedId);
  $: if (handle) handle.setFilter(filterId, filterParams);

  /**
   * REDRAW THE CHROME. Listed dependencies rather than a blanket reaction, because this runs on every
   * pointer move of a drag and the list is what says so out loud.
   *
   * `$unitPrefs` is in it because a unit cycled anywhere else in the app has to reach these labels —
   * that is the whole reason the strip's own labels could stop being buttons (DATA-R20: a pref
   * RELABELS). AND `handle` IS IN IT because the scene arrives LATE: it is a dynamic import, so the
   * first chrome is drawn before there is anything to hand it to, and without the dependency the
   * canvas is never uploaded at all — a perfectly correct bitmap that nothing ever composites. Seen
   * exactly that way: content in the canvas, nothing on the screen.
   */
  $: redrawChrome(layout, arcs, chromeInfo, scrollPx, crossScrollPx, vw, vh, axis, selectedId, hoveredId, $unitPrefs, handle);

  function redrawChrome(..._deps: unknown[]): void {
    if (!chromeCanvas || !(vw > 1) || !(vh > 1)) return;
    // The backing store is at the device ratio so the text is crisp, and the context is scaled so
    // everything in this module can be written in CSS pixels — the same coordinates the layout is in.
    const dpr = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);
    const w = Math.round(vw * dpr), h = Math.round(vh * dpr);
    if (chromeCanvas.width !== w || chromeCanvas.height !== h) { chromeCanvas.width = w; chromeCanvas.height = h; }
    const ctx = chromeCanvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    drawStripChrome(ctx as any, {
      layout, info: chromeInfo, arcs, scrollPx, crossScrollPx, vw, vh, axis,
      selectedId, hoveredId, prefs: $unitPrefs
    });
    handle?.setChrome(chromeCanvas);
  }

  /**
   * One stepper press, or one arrow key: ONE OBJECT, landed on. See `stepFocus` for why this counts
   * objects rather than pixels - in short, it used to count pixels and flew over a planet's moons.
   */
  function step(dir: -1 | 1): void {
    focus = stepFocus(focus, dir, seq.length);
  }

  /**
   * Wheel travel not yet spent, in px. A mouse notch arrives as one event worth about
   * `WHEEL_NOTCH_PX`; a trackpad sends a stream of small ones, and they have to add up to the same
   * thing or the two devices move the strip at wildly different rates.
   */
  let wheelAcc = 0;

  /**
   * A CLICK IS HOW YOU MOVE, and it is the main way. It selects through the map's shared selection
   * and makes what you clicked the FOCUS: the view re-centres on it and everything around it
   * re-scales and re-packs, because the scale is derived from whatever is in the middle. Owner,
   * 2026-09-06: *"rather than be forced to scroll - or mousewheel this means clicking centres and
   * everything else around scales and packs accordingly"*, and on clicking down to a moon: *"their
   * frame of reference is themselves so you will see the vast size of your host"*.
   *
   * IT DOES NOT TOUCH THE ZOOM. The share applies to the focus, so clicking a speck at the edge
   * already brings you all the way in to it; changing the share as well would undo whatever the
   * reader had set for themselves every time they moved.
   */
  function pick(id: string): void {
    if (!byId.has(id)) return;
    const i = focusIndexOf(seq, id);
    if (i >= 0) focus = i;
    dispatch('select', { id });
    menuFor = null;
  }

  function hide(ids: string[]): void {
    hidden = new Set([...hidden, ...ids]);
    saveHidden(hiddenKey(scope, mapId), hidden);
    menuFor = null;
  }

  /** Changing the order re-arms the opening view: a new arrangement wants its own starting place. */
  function setOrder(next: SortOrder): void {
    storedOrder = next;
    saveOrder(hiddenKey(scope, mapId), next);
    armed = '';
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
      centreShare = clampCentreShare(centreShare * Math.exp(-e.deltaY * 0.0015));
    } else {
      wheelAcc += wheelPx(e.deltaY, e.deltaX, e.deltaMode);
      const notches = Math.trunc(wheelAcc / WHEEL_NOTCH_PX);
      if (notches) {
        wheelAcc -= notches * WHEEL_NOTCH_PX;
        focus = stepFocus(focus, notches, seq.length);
      }
    }
  }

  // --- DRAG AND PINCH ------------------------------------------------------------------------
  // One pointer drags along the strip; two pinch to zoom about the point between them. Pointer
  // events rather than touch events, so a mouse, a pen and a finger all take the same path and the
  // desktop gains drag for free.
  const alongOf = (p: { x: number; y: number }) => (axis === 'x' ? p.x : p.y);
  const acrossOf = (p: { x: number; y: number }) => (axis === 'x' ? p.y : p.x);

  /**
   * CAPTURE ONLY ONCE THE GESTURE IS A DRAG — never on pointerdown, and this is a fix rather than a
   * preference. `setPointerCapture` RETARGETS the click: with the stage holding the capture, every
   * `click` inside it is delivered to the stage instead of to the button under the finger, so from
   * v3.0.304 the body hit areas, BOTH STEPPERS and the hide menu were silently dead to a pointer -
   * including the steppers a user had asked for by name in the same commit. Capturing at the slop
   * threshold keeps what the capture was for (a finger that slides off the stage keeps driving the
   * drag) and costs nothing, because until then the pointer is still over the stage anyway.
   */
  function capture(e: PointerEvent): void {
    if (captured) return;
    // Wrapped because `setPointerCapture` throws on an id the browser no longer considers active,
    // and an exception here would take the whole gesture with it — the strip would simply stop
    // responding, with nothing in the console to say why. Defensive: not a fault anybody has seen.
    try { (e.currentTarget as HTMLElement)?.setPointerCapture?.(e.pointerId); captured = true; } catch { /* not capturable */ }
  }

  function onPointerDown(e: PointerEvent): void {
    downOnControl = !!(e.target as HTMLElement | null)?.closest?.('button:not(.hit), .menu');
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size === 1) {
      dragFrom = focus;
      // ONCE, and held for the gesture: the exchange rate itself changes as you travel (that is the
      // zoom), so re-reading it mid-drag would mean dragging back the same distance did not put you
      // back where you started.
      dragStepPx = focusStepPx(layout, seq, focus);
      dragAt = alongOf({ x: e.clientX, y: e.clientY });
      dragAcrossAt = acrossOf({ x: e.clientX, y: e.clientY });
      dragTravel = 0;
      dragged = false;
    } else if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      pinchFrom = Math.hypot(a.x - b.x, a.y - b.y);
      pinchShare = centreShare;
      dragged = true;   // a two-finger gesture is never a tap, so it may capture at once
      capture(e);
    }
  }

  function onPointerMove(e: PointerEvent): void {
    if (!pointers.size) { hoveredId = slotAtPointer(e)?.id ?? null; return; }
    if (!pointers.has(e.pointerId)) return;
    pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.size >= 2) {
      const [a, b] = [...pointers.values()];
      const now = Math.hypot(a.x - b.x, a.y - b.y);
      // Fingers apart = the thing in the middle gets bigger. The pinch holds the CENTRE rather than
      // the point between the fingers, because the centre is what the scale is derived from.
      if (pinchFrom > 0 && now > 0) centreShare = clampCentreShare(pinchShare * (now / pinchFrom));
      return;
    }
    const moved = alongOf({ x: e.clientX, y: e.clientY }) - dragAt;
    const movedAcross = acrossOf({ x: e.clientX, y: e.clientY }) - dragAcrossAt;
    dragTravel = Math.max(dragTravel, Math.hypot(moved, movedAcross));
    if (dragTravel > TAP_SLOP_PX) { dragged = true; capture(e); }
    // The strip follows the finger: dragging towards the start moves the content that way, so the
    // focus goes the OTHER way. Anything else feels like the map is fighting you.
    focus = clampFocus(dragFrom - moved / dragStepPx, seq.length);
  }

  function onPointerUp(e: PointerEvent): void {
    pointers.delete(e.pointerId);
    if (pointers.size === 0) {
      // A GESTURE THAT DID NOT TRAVEL IS A TAP, and the tap is what selects. It is handled HERE
      // rather than by a click on an invisible button, for two reasons: the buttons are about to
      // stop existing ([[B126]] moves the chrome into the rendered surface), and their boxes overlap
      // — at true scale a giant's disc covers the window, so a DOM stack decides a tap on a moon in
      // front of it by document order. `slotAt` decides it by size, which is what the hand meant.
      if (!dragged && !downOnControl) {
        const hit = slotAtPointer(e);
        if (hit) pick(hit.id);
      }
      captured = false;
      // Leave `dragged` standing for one tick: any click event that ends this gesture has not fired
      // yet, and it is the thing the slop test exists to suppress.
      const wasDrag = dragged;
      setTimeout(() => { if (wasDrag) dragged = false; }, 0);
    } else if (pointers.size === 1) {
      // Coming out of a pinch with one finger still down: restart the drag from where it is now,
      // or the strip jumps by however far the fingers had travelled. The rate is re-taken with it —
      // the pinch has just changed the scale, so the rate the gesture began with is stale.
      const [only] = [...pointers.values()];
      dragFrom = focus;
      dragStepPx = focusStepPx(layout, seq, focus);
      dragAt = alongOf(only);
      dragAcrossAt = acrossOf(only);
    }
  }

  /**
   * WHAT IS UNDER THE POINTER, in the strip's own coordinates. Screen offset -> strip coordinate ->
   * `slotAt`, which tests the LAYOUT. Nothing here consults the DOM, which is the point: the globes
   * are drawn by a renderer the DOM knows nothing about, and (once the chrome moves into that
   * surface, [[B126]]) a filter's warp will sit between the finger and the picture. One hit test
   * against the data both of them were drawn from is the only thing that cannot drift.
   */
  function slotAtPointer(e: { clientX: number; clientY: number }) {
    const rect = stage?.getBoundingClientRect();
    if (!rect || !(rect.width > 0) || !(rect.height > 0)) return null;
    // THROUGH THE WARP FIRST. A distorting preset is a POST pass: the thing under the finger is not
    // at the finger's own uv, it is at the uv the shader SAMPLED to paint that pixel. Screen uv is
    // y-UP by the shader's convention, so it flips going in and back coming out. Identity when
    // nothing distorts, which is every GM view — a tap there must not move by an epsilon.
    const su = (e.clientX - rect.left) / rect.width;
    const sv = 1 - (e.clientY - rect.top) / rect.height;
    const [u, v] = handle?.warpPoint(su, sv) ?? [su, sv];
    const sx = u * vw, sy = (1 - v) * vh;
    const alongPx = (axis === 'x' ? sx : sy) + scrollPx;
    const crossPx = (axis === 'x' ? sy - vh / 2 : sx - vw / 2) + crossScrollPx;
    return slotAt(layout, alongPx, crossPx);
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
    // A player's view has no hidden set of its own: what a GM chose not to show is the preset's
    // business, and a player hiding worlds on their own screen is a different feature nobody asked
    // for. The GM's stored set is theirs alone and is not read here.
    hidden = playerChrome ? new Set() : loadHidden(hiddenKey(scope, mapId));
    storedOrder = loadOrder(hiddenKey(scope, mapId));
    let cancelled = false;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      // NEVER take a 0x0 rect as a size (RENDER-S30) — an unlaid-out container reports one and a
      // renderer told 0x0 sets a 2x2 backing store that the next real frame stretches.
      const r = stage?.getBoundingClientRect();
      if (!r || r.width < 1 || r.height < 1) return;
      vw = Math.round(r.width); vh = Math.round(r.height);
    };
    // MEASURED AND OBSERVED BEFORE THE SCENE, and the scene's failure is survivable. The labels, the
    // ruler, the dots and the hit areas are DOM and owe the 3D nothing; wiring them behind the
    // renderer's import meant a machine without WebGL got a black box with a header and no strip at
    // all, when it could have had every reading except the globes.
    measure();
    ro = new ResizeObserver(measure);
    if (stage) ro.observe(stage);
    (async () => {
      try {
        const { createComparisonScene } = await import('$lib/holo/comparisonScene');
        if (cancelled || !canvas) return;
        handle = createComparisonScene(canvas);
      } catch (err) {
        // No WebGL, or a context the browser refused. Say so once — silence here is the RENDER-S7
        // fault, where the path that decides whether a thing renders swallows its own reason.
        console.warn('[size-comparison] no 3D context; the strip is drawn without globes', err);
      }
      measure();
    })();
    return () => { cancelled = true; ro?.disconnect(); handle?.dispose(); handle = null; };
  });
</script>

<div class="size-comparison" class:phone={mode === 'phone'}>
  <header>
    <h2>Size comparison</h2>
    <p class="hint">Everything on this map at true relative size.
      {mode === 'phone' ? 'Tap an object to bring it to the middle' : 'Click an object to bring it to the middle'}
      · {mode === 'phone' ? 'drag to move along · pinch to zoom' : 'drag or scroll to move along · shift-scroll to zoom'}.</p>
    <!-- THE HIDE OFFER NEEDS A REACHABLE DOOR. Right-clicking an object opens the same popup, but a
         phone has no right-click and a context menu is not a thing anyone finds — so the selected
         object's hide control lives in the header, where it is visible the moment something is
         selected and works with a tap. -->
    {#if !playerChrome && selectedId && byId.has(selectedId)}
      <button class="pill" on:click={() => (menuFor = selectedId)}>Hide {byId.get(selectedId)?.name}…</button>
    {/if}
    {#if !playerChrome && hidden.size}
      <button class="pill" on:click={showAll}>{hidden.size} hidden — show all</button>
    {/if}
    {#if !playerChrome}
      <button class="close" title="Close" on:click={() => dispatch('close')}>×</button>
    {/if}
  </header>

  <!-- THE ORDER, as the pale pill group the GM's planet views use (`BodyImage.view-pills`): faint
       until the view is hovered or focused, and ALWAYS solid on a touch screen, because a phone has
       no hover and a control that only appears on one is a control a phone user does not have. -->
  {#if !playerChrome}
  <div class="order-pills" role="group" aria-label="Order the strip by">
    {#each SORT_ORDERS as o (o.id)}
      <button type="button" class:on={order === o.id} title={o.title}
        aria-pressed={order === o.id} on:click={() => setOrder(o.id)}>{o.label}</button>
    {/each}
  </div>
  {/if}

  <!-- svelte-ignore a11y_no_noninteractive_tabindex a11y_no_noninteractive_element_interactions -->
  <!-- The stage is a pan/zoom SURFACE, not a control: the things you can act on are the buttons
       inside it. It takes focus so the arrow keys can move along the strip for anyone not using
       a pointer, which is the whole reason for the tabindex the rule objects to. -->
  <div
    class="stage"
    bind:this={stage}
    on:wheel={onWheel}
    on:pointerdown={onPointerDown}
    on:pointermove={onPointerMove}
    on:pointerup={onPointerUp}
    on:pointercancel={onPointerUp}
    on:pointerleave={() => (hoveredId = null)}
    on:contextmenu|preventDefault={(e) => { if (!playerChrome && !downOnControl) { const h = slotAtPointer(e); if (h) menuFor = h.id; } }}
    on:keydown={onKeyDown}
    role="group"
    aria-label="Size comparison strip — drag to move along, arrow keys to step"
    tabindex="0"
  >
    <!-- NO width/height ATTRIBUTES HERE. The renderer owns the backing store: `setSize(vw, vh, false)`
         multiplies by the device pixel ratio, and a Svelte-bound `width={vw}` overwrites that with the
         CSS pixel count every time the view re-renders. The two then disagree by the pixel ratio and
         the scene draws into a corner of its own buffer — invisible at ratio 1 (a desktop) and obvious
         at 2 (the phone preset), where the globes sat half off the right edge while the DOM overlay,
         which does its own arithmetic, was exactly right. CSS below sizes the element. -->
    <canvas bind:this={canvas}></canvas>

    <!-- THE CHROME. Drawn by `comparison/stripChrome.ts` and handed to the scene, which composites
         it in FRONT of the globes and runs the preset's real filter over both — so a label bends
         with a warped CRT instead of floating straight over a bent picture (B126, RENDER-S54).
         IT STAYS IN THE DOM, invisible, for one reason: a machine with no WebGL still gets every
         reading. `.chrome.fallback` makes it visible when the scene failed to start, which is the
         same fault G68's gate found the first time round — a black box with a header and no strip,
         when it could have had everything except the globes. -->
    <canvas class="chrome" class:fallback={!handle} bind:this={chromeCanvas}></canvas>

    <!-- THE KEYBOARD PATH, and nothing else: one focusable, pointer-transparent, invisible button
         per object, so every world is reachable and nameable without a mouse. The pointer never
         comes through here (the stage picks against the layout, through the filter's warp), and
         nothing is drawn here either — the ring and the label are in the picture now. -->
    <div class="overlay">
      {#each layout.slots as slot (slot.id)}
        {@const along = slot.centrePx - scrollPx}
        {#if along > -slot.spanPx && along < (axis === 'x' ? vw : vh) + slot.spanPx}
          <button
            class="hit"
            style={axis === 'x'
              ? `left:${along - slot.spanPx / 2}px; top:calc(50% + ${slot.crossPx - crossScrollPx - slot.spanPx / 2}px); width:${slot.spanPx}px; height:${slot.spanPx}px;`
              : `top:${along - slot.spanPx / 2}px; left:calc(50% + ${slot.crossPx - crossScrollPx - slot.spanPx / 2}px); width:${slot.spanPx}px; height:${slot.spanPx}px;`}
            title={slot.name}
            on:click={() => { if (!dragged) pick(slot.id); }}
            on:focus={() => (hoveredId = slot.id)}
            on:blur={() => { if (hoveredId === slot.id) hoveredId = null; }}
          ></button>
        {/if}
      {/each}
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

  /* The GM's planet-view pills, verbatim in behaviour: faint until you go near them, solid on a
     coarse pointer. The one thing NOT copied is hiding them from touch — see the markup note. */
  .order-pills {
    position: absolute; z-index: 3; left: 50%; transform: translateX(-50%); top: 44px;
    display: inline-flex; gap: 2px; padding: 2px; border-radius: 999px;
    background: rgba(0, 0, 0, 0.62); border: 1px solid rgba(255, 255, 255, 0.25);
    opacity: 0.28; transition: opacity 120ms ease;
  }
  .size-comparison:hover .order-pills, .size-comparison:focus-within .order-pills { opacity: 1; }
  @media (pointer: coarse) { .order-pills { opacity: 1; } }
  .order-pills button {
    background: none; border: none; color: #cfe0f5; font-size: 11px; letter-spacing: 0.02em;
    padding: 3px 10px; border-radius: 999px; cursor: pointer;
  }
  .order-pills button:hover { background: rgba(255, 255, 255, 0.12); }
  .order-pills button.on { background: #2c3d55; color: #fff; }
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

  /* `pointer-events: none` is the OTHER half of the capture fix: with the stage picking against the
     layout, a second pointer path through these boxes would be two answers to one tap — and their
     boxes overlap, because at true scale a giant's disc covers the window. They remain focusable
     (a disabled pointer does not disable the keyboard), which is what keeps every object reachable
     without a mouse. */
  /* THE KEYBOARD PATH'S BOXES. Pointer-transparent (the stage picks against the layout, through the
     filter's warp) and INVISIBLE: the selection ring, the hover ring, the dot and the label are all
     drawn into the picture now, so a box that also painted them would be a second answer to what a
     body looks like - and the wrong one, because it would not bend with the filter. What survives
     is a focusable target with a name, which is what keeps every world reachable without a mouse. */
  .hit { position: absolute; border: none; background: none; padding: 0; cursor: pointer; pointer-events: none; }

  /* The chrome canvas is uploaded to the scene and drawn INSIDE the picture, so the element itself
     is hidden - it is a source bitmap, not a layer. `visibility` rather than `display`, because a
     canvas that is not laid out cannot be measured. It becomes visible only when the scene failed
     to start: no globes then, but every label, dot and arc still reads. */
  .chrome { position: absolute; inset: 0; width: 100%; height: 100%; display: block; pointer-events: none; visibility: hidden; }
  .chrome.fallback { visibility: visible; }

  .menu { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); background: #101a28; border: 1px solid #2c3d55; border-radius: 8px; padding: 6px; display: flex; flex-direction: column; gap: 2px; min-width: 240px; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.6); }
  .menu-title { font-size: 11px; color: #8fa6c4; padding: 4px 8px 6px; }
  .menu button { background: none; border: none; color: #dfe6f0; text-align: left; font-size: 12px; padding: 6px 8px; border-radius: 5px; cursor: pointer; }
  .menu button:hover { background: #1d2a3d; }
  .menu .cancel { color: #7f8ea6; }

  .empty { position: absolute; inset: 0; display: grid; place-items: center; color: #7f8ea6; font-size: 12px; }
</style>
