<script lang="ts">
  // The lock-open toggle every floating on-canvas control wears on its RIGHT, where the minimise
  // button used to be. Unlocked = the control puts itself away as soon as you touch anything else.
  // Locked = it stays. Clicking it while locked unlocks AND puts it away, so the button still means
  // "I'm done with this" the way minimise did.
  // It is ALSO a drag handle (A97, owner's ask): the grip stands down once the control is locked,
  // and a locked control still has to be movable, so the lock stands in for it. The control itself
  // tells a drag from a tap (`didDrag`), the same way the collapsed puck does - a drag moves, a tap
  // toggles the lock, and a drag never toggles it.
  import type { FloatingControl } from '$lib/ui/floatingControl';

  export let ctl: FloatingControl;
  export let what = 'this panel'; // named in the tooltip, e.g. "the time controls"

  $: pinned = $ctl.pinned;
  // While locked this button IS the drag handle, so it carries the drag's vocabulary too (G81).
  $: moving = $ctl.dock
    ? '; docked - dragging an END of the row takes it out, a MIDDLE one moves the row. Right-click to choose an edge'
    : '; drag to move, right-click to choose an edge';
</script>

<button
  class="float-pin"
  class:pinned
  type="button"
  use:ctl.grip
  on:click|stopPropagation={() => { if (!ctl.didDrag()) ctl.togglePin(); }}
  title={pinned ? `Unlock and put ${what} away${moving}` : `Lock ${what} open (otherwise it closes when you select something else)${moving}`}
  aria-label={pinned ? 'Unlock and close' : 'Lock open'}
  aria-pressed={pinned}
>
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="4.5" y="10.5" width="15" height="10.5" rx="2" />
    {#if pinned}
      <path d="M8.5 10.5V6.75a3.5 3.5 0 0 1 7 0v3.75" />
    {:else}
      <path d="M8.5 10.5V6.75a3.5 3.5 0 0 1 7 0" />
    {/if}
  </svg>
</button>

<style>
  .float-pin {
    flex: 0 0 auto;
    width: 22px;
    align-self: stretch;
    min-height: 26px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 6px;
    background: var(--bg-control, #1b1e26);
    color: var(--text-faint, #8a8f9a);
    cursor: pointer;
    touch-action: none; /* it drags as well as taps */
    user-select: none;
  }
  .float-pin:hover { color: var(--accent, #ff5a1f); border-color: var(--accent, #ff5a1f); }
  .float-pin.pinned {
    color: var(--accent, #ff5a1f);
    border-color: color-mix(in srgb, var(--accent, #ff5a1f) 60%, var(--border, #2a2d36));
    background: color-mix(in srgb, var(--accent, #ff5a1f) 16%, var(--bg-control, #1b1e26));
  }
</style>
