<script lang="ts">
  // The move handle every floating on-canvas control wears on its LEFT. Shared so the time
  // transport and the body picker cannot drift apart. Behaviour lives in floatingControl.ts.
  import type { FloatingControl } from '$lib/ui/floatingControl';

  export let ctl: FloatingControl;
  export let label = 'Drag to move';
</script>

<!-- Nothing to drag once the control is LOCKED in place, and on a narrow phone every pixel of the
     pill is doing work — so the handle stands down. Unlock, reposition, lock again. -->
{#if !$ctl.pinned}
  <span class="float-grip" role="presentation" title={label} use:ctl.grip>
    <svg width="5" height="15" viewBox="0 0 5 15" aria-hidden="true">
      <circle cx="1.25" cy="1.75" r="1.05" /><circle cx="3.75" cy="1.75" r="1.05" />
      <circle cx="1.25" cy="7.5" r="1.05" /><circle cx="3.75" cy="7.5" r="1.05" />
      <circle cx="1.25" cy="13.25" r="1.05" /><circle cx="3.75" cy="13.25" r="1.05" />
    </svg>
  </span>
{/if}

<style>
  .float-grip {
    flex: 0 0 auto;
    cursor: grab;
    touch-action: none;
    user-select: none;
    color: var(--text-faint, #6b7280);
    /* Slim: 5px of dots in an 11px strip. The full-height target keeps it thumb-reachable
       without the handle costing the pill any real width. */
    width: 11px;
    align-self: stretch;
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .float-grip svg { fill: currentColor; }
  .float-grip:hover { color: var(--text, #e8e8e8); }
  .float-grip:active { cursor: grabbing; }
</style>
