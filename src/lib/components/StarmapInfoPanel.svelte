<script lang="ts">
  // A draggable, position-remembered info overlay for the starmap — replaces the big
  // fixed right detail panel. Shows the starmap Description + GM Notes (both editable),
  // defaults to the top-left of the canvas, and can be dragged anywhere (persisted).
  import { createEventDispatcher, onMount, tick } from 'svelte';
  import { browser } from '$app/environment';
  import type { Starmap } from '$lib/types';

  export let starmap: Starmap;

  const dispatch = createEventDispatcher();
  // -v3: reset stale saved positions so the panel clears the new bottom-right scale bar.
  const POS_KEY = 'sse-starmap-info-pos-v3';
  const SIZE_KEY = 'sse-starmap-info-size-v1';
  const COLLAPSE_KEY = 'sse-starmap-info-collapsed';

  const MIN_W = 240;
  const MIN_H = 170;
  const EDGE = 12; // keep this much canvas visible on every side of the panel

  let pos = { x: 12, y: 12 };
  // null = "never resized", i.e. the default content-sized panel. Only a deliberate drag
  // gives the panel an explicit size, so the out-of-the-box look is unchanged.
  let size: { w: number; h: number } | null = null;
  let collapsed = false;
  let el: HTMLElement;

  function bounds() {
    const parent = el?.offsetParent as HTMLElement | null;
    return {
      w: parent?.clientWidth ?? window.innerWidth,
      h: parent?.clientHeight ?? window.innerHeight
    };
  }

  /**
   * ONE clamp for both size and position. The starmap canvas is `overflow: hidden`, so anything
   * past its edge is not merely off-frame, it is gone — which is exactly how the old panel could
   * "resize" without ever showing more text. Both the stored size and the stored position are
   * shared across devices, so a panel grown on a desktop must still fit a phone.
   */
  function clampAll() {
    const b = bounds();
    if (size) {
      size = {
        w: Math.max(MIN_W, Math.min(size.w, Math.max(MIN_W, b.w - EDGE * 2))),
        h: Math.max(MIN_H, Math.min(size.h, Math.max(MIN_H, b.h - EDGE * 2)))
      };
    }
    const pw = size?.w ?? el?.offsetWidth ?? 320;
    const ph = (size && !collapsed) ? size.h : (el?.offsetHeight ?? 220);
    pos = {
      x: Math.max(0, Math.min(pos.x, Math.max(0, b.w - pw - EDGE))),
      y: Math.max(0, Math.min(pos.y, Math.max(0, b.h - ph - EDGE)))
    };
  }

  onMount(() => {
    if (!browser) return;
    collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
    let savedSize: any = null;
    try { savedSize = JSON.parse(localStorage.getItem(SIZE_KEY) || 'null'); } catch {}
    if (savedSize && typeof savedSize.w === 'number' && typeof savedSize.h === 'number') {
      size = { w: savedSize.w, h: savedSize.h };
    }
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch {}
    // The size has to be applied before the panel is measured, or the default position and the
    // clamp both work off the wrong height.
    tick().then(() => {
      if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
        pos = { x: saved.x, y: saved.y };
      } else {
        // Default to the BOTTOM-RIGHT of the canvas (top-left = time read-out, bottom-left =
        // time transport), raised enough to clear the scale bar that lives in the corner below.
        const SCALE_BAR_CLEARANCE = 64;
        const b = bounds();
        const ph = el?.offsetHeight ?? 220;
        const pw = el?.offsetWidth ?? 320;
        pos = { x: Math.max(EDGE, b.w - pw - EDGE), y: Math.max(EDGE, b.h - ph - SCALE_BAR_CLEARANCE) };
      }
      clampAll();
    });
  });

  function persistPos() {
    if (browser) localStorage.setItem(POS_KEY, JSON.stringify(pos));
  }
  function persistSize() {
    if (browser && size) localStorage.setItem(SIZE_KEY, JSON.stringify(size));
  }
  function toggleCollapse() {
    collapsed = !collapsed;
    if (browser) localStorage.setItem(COLLAPSE_KEY, collapsed ? '1' : '0');
  }
  function save() {
    dispatch('update', starmap);
  }

  // --- drag (pointer-based, like the AppShell detail resizer) ---
  let dragging = false;
  let startX = 0, startY = 0, startPos = { x: 0, y: 0 };
  function onHeaderDown(e: PointerEvent) {
    dragging = true;
    startX = e.clientX; startY = e.clientY; startPos = { ...pos };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    e.preventDefault();
  }
  function onMove(e: PointerEvent) {
    if (!dragging) return;
    pos = {
      x: Math.max(0, startPos.x + (e.clientX - startX)),
      y: Math.max(0, startPos.y + (e.clientY - startY))
    };
  }
  function onUp() {
    dragging = false;
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerup', onUp);
    clampAll();
    persistPos();
  }

  // --- resize (the panel owns its own grip; the per-field grabbers used to lie about it) ---
  let resizing = false;
  let rStart = { x: 0, y: 0, w: 0, h: 0 };
  function onGripDown(e: PointerEvent) {
    const r = el.getBoundingClientRect();
    resizing = true;
    rStart = { x: e.clientX, y: e.clientY, w: r.width, h: r.height };
    window.addEventListener('pointermove', onGripMove);
    window.addEventListener('pointerup', onGripUp);
    e.preventDefault();
    e.stopPropagation();
  }
  function onGripMove(e: PointerEvent) {
    if (!resizing) return;
    const b = bounds();
    size = {
      w: Math.max(MIN_W, Math.min(rStart.w + (e.clientX - rStart.x), Math.max(MIN_W, b.w - EDGE * 2))),
      h: Math.max(MIN_H, Math.min(rStart.h + (e.clientY - rStart.y), Math.max(MIN_H, b.h - EDGE * 2)))
    };
    // Growing must never push the panel into the clipped region: it slides up / left instead,
    // so every pixel the grip adds is a pixel of text you can actually read.
    pos = {
      x: Math.max(0, Math.min(pos.x, Math.max(0, b.w - size.w - EDGE))),
      y: Math.max(0, Math.min(pos.y, Math.max(0, b.h - size.h - EDGE)))
    };
  }
  function onGripUp() {
    resizing = false;
    window.removeEventListener('pointermove', onGripMove);
    window.removeEventListener('pointerup', onGripUp);
    persistSize();
    persistPos();
  }
</script>

<section
  class="info-panel"
  class:dragging
  class:resizing
  bind:this={el}
  style="left:{pos.x}px; top:{pos.y}px;{size ? ` width:${size.w}px;` : ''}{size && !collapsed ? ` height:${size.h}px;` : ''}"
>
  <header class="info-header" on:pointerdown={onHeaderDown}>
    <span class="info-title">{starmap.name}</span>
    <button
      class="info-collapse"
      aria-label={collapsed ? 'Expand' : 'Collapse'}
      on:pointerdown|stopPropagation
      on:click|stopPropagation={toggleCollapse}
    >{collapsed ? '▸' : '▾'}</button>
  </header>

  {#if !collapsed}
    <div class="info-body">
      <label class="info-field desc">
        <span class="info-label">Description</span>
        <textarea bind:value={starmap.description} on:change={save} placeholder="Describe this starmap…" rows="3"></textarea>
      </label>
      <label class="info-field notes">
        <span class="info-label gm">GM Notes</span>
        <textarea class="gm" bind:value={starmap.gmNotes} on:change={save} placeholder="Secret GM-only notes…" rows="4"></textarea>
      </label>
    </div>
    <!-- One grip for the whole panel. The fields grow with it, so dragging here really does
         show more text — a per-textarea grabber could only ever scroll a fixed-size panel. -->
    <button
      class="info-grip"
      type="button"
      aria-label="Resize panel"
      title="Drag to resize"
      on:pointerdown={onGripDown}
      on:click|stopPropagation|preventDefault
    ></button>
  {/if}
</section>

<style>
  .info-panel {
    position: absolute;
    z-index: 58;
    width: min(320px, calc(100% - 24px));
    max-width: calc(100% - 24px);
    /* Only a backstop for the un-resized panel — the grip clamps the real size against the
       canvas, which is overflow:hidden, so a taller panel would otherwise grow into nothing. */
    max-height: calc(100% - 24px);
    display: flex;
    flex-direction: column;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 90%, transparent);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 10px;
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(6px);
    color: var(--text, #e8e8e8);
    overflow: hidden;
  }
  .info-panel.dragging,
  .info-panel.resizing { user-select: none; }
  .info-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    cursor: grab;
    touch-action: none;
    border-bottom: 1px solid var(--border, #2a2d36);
  }
  .info-header:active { cursor: grabbing; }
  .info-title {
    font-weight: 700;
    color: var(--accent, #ff5a1f);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .info-collapse {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    background: var(--bg-control, #1b1e26);
    color: var(--text, #e8e8e8);
    cursor: pointer;
    line-height: 1;
  }
  .info-body {
    /* flex:1 is what makes the panel's height reach the fields: without it the body stayed at
       its content height and any extra panel height was dead space. */
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 10px;
    overflow-y: auto;
  }
  .info-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    min-height: 0;
  }
  /* Extra height goes mostly to the Description, which is the field that was too small. */
  .info-field.desc { flex: 3 1 auto; }
  .info-field.notes { flex: 2 1 auto; }
  .info-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--text-faint, #8a8f9a);
  }
  .info-label.gm { color: var(--accent, #ff5a1f); }
  textarea {
    width: 100%;
    box-sizing: border-box;
    /* The panel grip is the one resize control — a native per-field grabber only ever made the
       textarea taller inside a fixed-height panel, which is the bug this replaced. */
    resize: none;
    flex: 1 1 auto;
    min-height: 56px;
    background: var(--bg-panel, #14161c);
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    color: var(--text, #e8e8e8);
    padding: 6px 8px;
    font: inherit;
    font-size: 0.85rem;
  }
  textarea.gm { border-color: color-mix(in srgb, var(--accent, #ff5a1f) 30%, var(--border, #2a2d36)); }
  .info-grip {
    position: absolute;
    right: 1px;
    bottom: 1px;
    width: 15px;
    height: 15px;
    padding: 0;
    border: none;
    background: transparent;
    cursor: nwse-resize;
    touch-action: none;
    opacity: 0.6;
  }
  .info-grip:hover { opacity: 1; }
  .info-grip::before,
  .info-grip::after {
    content: '';
    position: absolute;
    right: 2px;
    height: 1.5px;
    background: var(--text-faint, #8a8f9a);
    transform: rotate(-45deg);
    transform-origin: 100% 50%;
  }
  .info-grip::before { bottom: 3px; width: 12px; }
  .info-grip::after { bottom: 7px; width: 7px; }
</style>
