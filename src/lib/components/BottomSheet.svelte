<script lang="ts">
  // Phase 03 — phone bottom sheet. A draggable panel pinned to the bottom of the
  // viewport with three snap points: peek (just the grabber + title), half, and full.
  // Reuses the Phase 02 gesture layer on the grabber: drag to resize (snaps to the
  // nearest point on release), tap the header to cycle up (peek -> half -> full -> peek),
  // and the close button demotes to peek. `snap` is bindable so the host can promote it
  // (e.g. to 'half' when a body is selected) or demote it (tap on empty canvas).
  import { createEventDispatcher } from 'svelte';
  import { gestures } from '$lib/input/gestures';

  export let snap: 'peek' | 'half' | 'full' = 'peek';
  export let title = '';
  export let peekPx = 86;
  // px reserved at the bottom of the viewport (e.g. the phone time bar) — the sheet
  // sits above it and its snap heights account for the reduced area.
  export let bottomInset = 0;

  const dispatch = createEventDispatcher();

  let viewportH = 800;
  let dragDeltaPx = 0; // live drag offset; +ve = dragged down (shorter)
  let dragging = false;

  // Snap heights in px. peek is fixed; half/full scale with the viewport.
  $: avail = Math.max(0, viewportH - bottomInset);
  $: snapHeights = {
    peek: peekPx,
    half: Math.round(avail * 0.5),
    full: Math.round(avail * 0.92)
  };
  $: baseHeight = snapHeights[snap];
  // During a drag the sheet follows the finger (clamped between peek and full).
  $: liveHeight = dragging
    ? Math.max(snapHeights.peek, Math.min(snapHeights.full, baseHeight - dragDeltaPx))
    : baseHeight;

  function nearestSnap(h: number): 'peek' | 'half' | 'full' {
    const entries: Array<['peek' | 'half' | 'full', number]> = [
      ['peek', snapHeights.peek],
      ['half', snapHeights.half],
      ['full', snapHeights.full]
    ];
    return entries.reduce((best, cur) => (Math.abs(cur[1] - h) < Math.abs(best[1] - h) ? cur : best))[0];
  }

  function setSnap(next: 'peek' | 'half' | 'full') {
    if (next !== snap) {
      snap = next;
      dispatch('snapchange', next);
    }
  }

  function cycleUp() {
    setSnap(snap === 'peek' ? 'half' : snap === 'half' ? 'full' : 'peek');
  }

  const grabberGestures = {
    onPanStart: () => { dragging = true; dragDeltaPx = 0; },
    onPan: ({ dy }: { dy: number }) => { dragDeltaPx += dy; },
    onPanEnd: () => { dragging = false; setSnap(nearestSnap(liveHeightAtRelease())); dragDeltaPx = 0; },
    onTap: () => cycleUp()
  };

  // liveHeight is reactive; capture its value at the moment of release.
  function liveHeightAtRelease() {
    return Math.max(snapHeights.peek, Math.min(snapHeights.full, baseHeight - dragDeltaPx));
  }
</script>

<svelte:window bind:innerHeight={viewportH} />

<section
  class="bottom-sheet"
  class:dragging
  style="height: {liveHeight}px; bottom: {bottomInset}px;"
  aria-label={title || 'Detail panel'}
>
  <header class="sheet-header" use:gestures={grabberGestures}>
    <div class="grabber" aria-hidden="true"></div>
    <div class="sheet-title-row">
      <span class="sheet-title">{title}</span>
      <button
        class="sheet-close"
        title="Collapse"
        aria-label="Collapse panel"
        on:pointerdown|stopPropagation
        on:pointerup|stopPropagation
        on:click|stopPropagation={() => setSnap('peek')}
      >▾</button>
    </div>
  </header>

  <div class="sheet-body">
    <slot />
  </div>
</section>

<style>
  .bottom-sheet {
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 1200;
    display: flex;
    flex-direction: column;
    background: #14161c;
    border-top: 1px solid #2a2d36;
    border-radius: 14px 14px 0 0;
    box-shadow: 0 -8px 28px rgba(0, 0, 0, 0.55);
    color: #e8e8e8;
    transition: height 0.22s cubic-bezier(0.22, 0.61, 0.36, 1);
    overflow: hidden;
  }
  .bottom-sheet.dragging {
    transition: none; /* follow the finger 1:1 while dragging */
  }
  .sheet-header {
    flex: 0 0 auto;
    padding: 6px 12px 8px;
    cursor: grab;
    touch-action: none;
    user-select: none;
  }
  .grabber {
    width: 40px;
    height: 4px;
    border-radius: 2px;
    background: #4a4e59;
    margin: 4px auto 8px;
  }
  .sheet-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .sheet-title {
    font-size: 1rem;
    font-weight: 600;
    color: #ff8a5c;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .sheet-close {
    flex: 0 0 auto;
    width: 32px;
    height: 32px;
    border: 1px solid #2a2d36;
    border-radius: 8px;
    background: #1b1e26;
    color: #cfcfcf;
    font-size: 1.1rem;
    line-height: 1;
    cursor: pointer;
  }
  .sheet-close:hover {
    background: #232733;
  }
  .sheet-body {
    flex: 1 1 auto;
    overflow-y: auto;
    padding: 4px 14px 16px;
    -webkit-overflow-scrolling: touch;
  }
</style>
