<script lang="ts">
  // The GM's floating undo/redo (G28). Owner: "a floating undo/redo on the top to let you wind
  // back changes". It appears only once there is something to wind back, so an untouched system
  // view keeps its top edge clear, and it hides itself under any dialog on a phone by marking
  // `use:chrome` - the ONE attribute a new floating control needs ([[UI-C6]]).
  //
  // PLACEMENT, measured against what is already up there: top-left is `.time-display-overlay`,
  // top-right is `.orrery-controls` (which drops to y=62 on a phone), and top-centre at y=56/64 is
  // the floating BodyPicker. So the pill takes top-CENTRE at y=8 on desktop, and top-RIGHT at y=8
  // on a phone, where the orrery controls have moved out of that corner.
  //
  // The keys are bound here rather than in the view so they mount and unmount with the feature.
  import { undoStatus, undo, redo } from '$lib/undo/systemUndo';
  import { chrome } from '$lib/ui/foreground';

  export let mode: 'phone' | 'tablet' | 'desktop' = 'desktop';

  // The step is NAMED where it can be: "Undo: Mass of Earth". A step the differ could not name
  // falls back to "the last edit", which is never wrong.
  $: undoTitle = $undoStatus.undoLabel ? `Undo: ${$undoStatus.undoLabel}` : 'Undo the last edit';
  $: redoTitle = $undoStatus.redoLabel ? `Redo: ${$undoStatus.redoLabel}` : 'Redo';

  // TEXT ENTRY ONLY. A range, checkbox or colour input has no text undo of its own, and a GM who
  // has just released a slider still has it focused - swallowing Ctrl+Z there would make the
  // feature look broken exactly when it is most wanted.
  const TEXT_TYPES = new Set([
    'text', 'number', 'search', 'email', 'url', 'tel', 'password',
    'date', 'time', 'datetime-local', 'month', 'week'
  ]);

  function isTextEntry(target: EventTarget | null): boolean {
    const el = target as HTMLElement | null;
    if (!el || typeof el.tagName !== 'string') return false;
    const tag = el.tagName.toUpperCase();
    if (tag === 'TEXTAREA') return true;
    if (tag === 'INPUT') return TEXT_TYPES.has((el as HTMLInputElement).type);
    return el.isContentEditable === true;
  }

  function onKeydown(e: KeyboardEvent) {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    const key = (e.key || '').toLowerCase();
    if (key !== 'z' && key !== 'y') return;
    // Inside a text field the browser's own undo stack is the right one to move.
    if (isTextEntry(e.target)) return;
    e.preventDefault();
    if (key === 'y' || e.shiftKey) redo();
    else undo();
  }
</script>

<svelte:window on:keydown={onKeydown} />

{#if $undoStatus.canUndo || $undoStatus.canRedo}
  <div class="undo-pill" class:phone={mode === 'phone'} use:chrome>
    <button
      class="up-btn"
      title="{undoTitle} (Ctrl+Z)"
      aria-label={undoTitle}
      aria-keyshortcuts="Control+Z"
      disabled={!$undoStatus.canUndo}
      on:click={undo}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M9 14 4 9l5-5" />
        <path d="M4 9h10.5A5.5 5.5 0 0 1 20 14.5 5.5 5.5 0 0 1 14.5 20H11" />
      </svg>
    </button>
    <span class="up-sep" aria-hidden="true"></span>
    <button
      class="up-btn"
      title="{redoTitle} (Ctrl+Shift+Z)"
      aria-label={redoTitle}
      aria-keyshortcuts="Control+Shift+Z"
      disabled={!$undoStatus.canRedo}
      on:click={redo}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
      </svg>
    </button>
  </div>
{/if}

<style>
  .undo-pill {
    position: absolute;
    top: 8px;
    left: 50%;
    transform: translateX(-50%);
    z-index: var(--z-chrome, 1000);
    display: flex;
    align-items: center;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 999px;
    background: color-mix(in srgb, var(--bg-panel, #14161c) 86%, transparent);
    backdrop-filter: blur(2px);
  }
  /* On a phone the orrery controls have moved down to y=62, so this corner is free - and a centred
     pill would sit alongside the clock read-out on a 375 px screen. */
  .undo-pill.phone {
    left: auto;
    right: 8px;
    transform: none;
  }
  .up-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    padding: 0;
    border: none;
    border-radius: 999px;
    background: none;
    color: var(--text, #e8e8e8);
    cursor: pointer;
  }
  .up-btn:hover:not(:disabled) {
    background: var(--bg-control-hover, rgba(255, 255, 255, 0.08));
  }
  .up-btn:disabled {
    color: var(--text-faint, #7c8190);
    cursor: default;
  }
  .up-sep {
    width: 1px;
    height: 18px;
    background: var(--border, #2a2d36);
  }
</style>
