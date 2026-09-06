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
  //
  // ONE PILL, TWO HISTORIES, AND NO GLOBAL "WHICH ONE IS ACTIVE" STATE. The system view and the
  // starmap view are never on screen together, so each mounts this component with ITS history
  // passed in: inside a system Ctrl+Z winds back the body edits, on the starmap it winds back the
  // map's layout. The component knows nothing about either.
  import { chrome } from '$lib/ui/foreground';
  import type { Readable } from 'svelte/store';
  import type { UndoStatus } from '$lib/undo/systemUndo';

  export let mode: 'phone' | 'tablet' | 'desktop' = 'desktop';
  export let status: Readable<UndoStatus>;
  export let undo: () => void;
  export let redo: () => void;

  // WHAT IS IN HAND, AS A SECOND ROW. Owner, 2026-09-06, on the Paste button that used to sit in the
  // orrery controls: *"The paste at the top button should not be needed should it? what is being
  // pasted is on the long right click. That can stay as an indicator of what is in paste just now -
  // perhaps make it a lower part of the undo/redo modal. compact and contained and useful"* - and
  // *"have a little paste icon and a description eg: Planet+7, Moon"*.
  //
  // SO THIS IS AN INDICATOR AND NOT A BUTTON. Pasting is the right-click, which knows where it is
  // going; a second control that has to ask would be the thing he took out. It says what is in hand
  // and, in its tooltip, what to do with it.
  export let clip: { compact: string; label: string; from: 'app' | 'clipboard' } | null = null;
  /** One gold flash when something NEW arrives from outside the app. The caller owns the timing. */
  export let clipPulse = false;


  // The step is NAMED where it can be: "Undo: Mass of Earth". A step the differ could not name
  // falls back to "the last edit", which is never wrong.
  $: undoTitle = $status.undoLabel ? `Undo: ${$status.undoLabel}` : 'Undo the last edit';
  $: redoTitle = $status.redoLabel ? `Redo: ${$status.redoLabel}` : 'Redo';

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

<!-- The clip alone is enough to show the pill: a GM who has just copied on the map library's site
     and come back has nothing to undo yet, and that is exactly the moment the indicator is for. -->
{#if $status.canUndo || $status.canRedo || clip}
  <div class="undo-pill" class:phone={mode === 'phone'} class:has-clip={!!clip} use:chrome>
   <div class="up-row">
    <button
      class="up-btn"
      title="{undoTitle} (Ctrl+Z)"
      aria-label={undoTitle}
      aria-keyshortcuts="Control+Z"
      disabled={!$status.canUndo}
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
      disabled={!$status.canRedo}
      on:click={redo}
    >
      <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="m15 14 5-5-5-5" />
        <path d="M20 9H9.5A5.5 5.5 0 0 0 4 14.5 5.5 5.5 0 0 0 9.5 20H13" />
      </svg>
    </button>
   </div>
    {#if clip}
      <div
        class="up-clip"
        class:pulse={clipPulse}
        title="{clip.label} is ready to paste{clip.from === 'clipboard' ? ', from the map library' : ''} — right-click where it should go"
      >
        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <rect x="8" y="8" width="12" height="12" rx="2" />
          <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
        </svg>
        <span>{clip.compact}</span>
      </div>
    {/if}
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
    flex-direction: column;
    align-items: stretch;
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
  .up-row {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  /* With a clip in hand the pill grows a second row; the pill's own radius stops being a circle at
     the bottom, so the corners are squared off there rather than left as a lozenge round a block. */
  .undo-pill.has-clip {
    border-radius: 16px;
  }
  .up-clip {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    margin: 0 2px 1px;
    padding: 2px 7px;
    border-top: 1px solid var(--border, #2a2d36);
    padding-top: 4px;
    font-size: 0.72rem;
    line-height: 1.2;
    color: var(--text-faint, #7c8190);
    white-space: nowrap;
    cursor: default;
    user-select: none;
  }
  /* ONE flash, when something new arrives from OUTSIDE the app - a copy made here needs no
     announcement, because the GM just made it. `prefers-reduced-motion` keeps the colour and drops
     the movement, which is the part that carries the meaning anyway. */
  .up-clip.pulse {
    animation: up-clip-pulse 1.4s ease-out 1;
  }
  @keyframes up-clip-pulse {
    0% { color: var(--accent-warm, #e8b339); transform: scale(1.06); }
    60% { color: var(--accent-warm, #e8b339); transform: scale(1); }
    100% { color: var(--text-faint, #7c8190); transform: scale(1); }
  }
  @media (prefers-reduced-motion: reduce) {
    .up-clip.pulse {
      animation: none;
      color: var(--accent-warm, #e8b339);
    }
  }
</style>
