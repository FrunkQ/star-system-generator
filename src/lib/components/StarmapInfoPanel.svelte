<script lang="ts">
  // A draggable, position-remembered info overlay for the starmap — replaces the big
  // fixed right detail panel. Shows the starmap Description + GM Notes (both editable),
  // defaults to the top-left of the canvas, and can be dragged anywhere (persisted).
  import { createEventDispatcher, onMount } from 'svelte';
  import { browser } from '$app/environment';
  import type { Starmap } from '$lib/types';

  export let starmap: Starmap;

  const dispatch = createEventDispatcher();
  // -v3: reset stale saved positions so the panel clears the new bottom-right scale bar.
  const POS_KEY = 'sse-starmap-info-pos-v3';
  const COLLAPSE_KEY = 'sse-starmap-info-collapsed';

  let pos = { x: 12, y: 12 };
  let collapsed = false;
  let el: HTMLElement;

  onMount(() => {
    if (!browser) return;
    collapsed = localStorage.getItem(COLLAPSE_KEY) === '1';
    let saved: any = null;
    try { saved = JSON.parse(localStorage.getItem(POS_KEY) || 'null'); } catch {}
    if (saved && typeof saved.x === 'number' && typeof saved.y === 'number') {
      // Clamp into view — the position is shared across devices, so a desktop drag
      // shouldn't strand the panel off a phone screen.
      pos = {
        x: Math.max(0, Math.min(saved.x, window.innerWidth - 80)),
        y: Math.max(0, Math.min(saved.y, window.innerHeight - 80))
      };
    } else {
      // Default to the BOTTOM-RIGHT of the canvas (top-left = time read-out, bottom-left =
      // time transport), raised enough to clear the scale bar that lives in the corner below.
      const SCALE_BAR_CLEARANCE = 64;
      const parent = el?.offsetParent as HTMLElement | null;
      const parentH = parent?.clientHeight ?? window.innerHeight;
      const parentW = parent?.clientWidth ?? window.innerWidth;
      const ph = el?.offsetHeight ?? 220;
      const pw = el?.offsetWidth ?? 320;
      pos = { x: Math.max(12, parentW - pw - 12), y: Math.max(12, parentH - ph - SCALE_BAR_CLEARANCE) };
    }
  });

  function persistPos() {
    if (browser) localStorage.setItem(POS_KEY, JSON.stringify(pos));
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
    persistPos();
  }
</script>

<section class="info-panel" class:dragging bind:this={el} style="left:{pos.x}px; top:{pos.y}px;">
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
      <label class="info-field">
        <span class="info-label">Description</span>
        <textarea bind:value={starmap.description} on:change={save} placeholder="Describe this starmap…" rows="3"></textarea>
      </label>
      <label class="info-field">
        <span class="info-label gm">GM Notes</span>
        <textarea class="gm" bind:value={starmap.gmNotes} on:change={save} placeholder="Secret GM-only notes…" rows="4"></textarea>
      </label>
    </div>
  {/if}
</section>

<style>
  .info-panel {
    position: absolute;
    z-index: 58;
    width: min(320px, calc(100% - 24px));
    max-height: 70%;
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
  .info-panel.dragging { user-select: none; }
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
  }
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
    resize: vertical;
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
</style>
