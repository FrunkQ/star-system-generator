<script lang="ts">
  // WHICH EDGE THIS CONTROL TRAVELS WITH (G81). Owner, 2026-09-06/07: *"pin them to a screen edge
  // which it moves with... To help with different types of screens"*.
  //
  // The nearest-edge guess A98 shipped is right at the sides and wrong in the middle: a control
  // just left of centre on a wide monitor is NEAREST the left edge, so it stays put when the
  // details pane opens - and a GM who wanted it to travel with that pane has no way to say so.
  // This is the way to say so. It does NOT move the control: only the edge it is measured from
  // changes, so nothing jumps and the gap stays the gap the GM chose by dragging.
  //
  // ONE COMPONENT, ONE LIST, FOUR HOSTS. The gesture lives on the module's `grip` action - which
  // the grip AND the lock both carry - so a host adds this one line and gains the whole thing.
  import { chrome } from '$lib/ui/foreground';
  import { EDGE_CHOICES, type FloatingControl } from '$lib/ui/floatingControl';

  export let ctl: FloatingControl;
  /** Named in the heading, e.g. "the clock". */
  export let what = 'this control';

  const MENU_W = 190, MENU_H = 190; // enough to keep the menu on screen; the panel sizes itself

  // `ctl` is a store of the control's STATE, and `ctl.edgeMenu` is a store of its own - so the
  // menu position has to be subscribed to separately. `$ctl.edgeMenu` reads a field that is not
  // there and silently renders nothing.
  const where = ctl.edgeMenu;

  $: at = $where;
  $: state = $ctl;
  $: chosen = (choice: string) =>
    choice === 'nearest'
      ? !state.fx && !state.fy
      : (choice === 'left' || choice === 'right')
        ? !!state.fx && state.ex === choice
        : !!state.fy && state.ey === choice;

  /**
   * The menu is drawn at the BODY, not inside the control. Every host wraps its control in a
   * `transform`, and a transformed ancestor becomes the containing block for `position: fixed` -
   * so a menu rendered in place would be positioned against the control it is about AND clipped by
   * the stage that bounds it. Re-parenting is the same move `use:foreground` makes, for the same
   * reason.
   */
  function atBody(node: HTMLElement) {
    document.body.appendChild(node);
    return { destroy() { node.remove(); } };
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape') ctl.closeEdgeMenu();
  }
</script>

<svelte:window on:keydown={onKey} />

{#if at}
  <!-- The backdrop is what dismisses it, and it takes the click so nothing underneath acts on it. -->
  <div
    class="fem-scrim"
    role="presentation"
    use:atBody
    on:pointerdown|stopPropagation={() => ctl.closeEdgeMenu()}
    on:contextmenu|preventDefault|stopPropagation={() => ctl.closeEdgeMenu()}
  >
    <div
      class="fem-menu"
      role="menu"
      aria-label="Which edge {what} moves with"
      use:chrome
      style="left: {Math.min(at.x, (typeof window !== 'undefined' ? window.innerWidth : 1200) - MENU_W)}px; top: {Math.min(at.y, (typeof window !== 'undefined' ? window.innerHeight : 800) - MENU_H)}px;"
      on:pointerdown|stopPropagation
    >
      <div class="fem-head">Move {what} with</div>
      {#each EDGE_CHOICES as item (item.choice)}
        <button
          class="fem-item"
          class:on={chosen(item.choice)}
          type="button"
          role="menuitemradio"
          aria-checked={chosen(item.choice)}
          on:click={() => ctl.chooseEdge(item.choice)}
        >
          <span class="fem-tick" aria-hidden="true">{chosen(item.choice) ? '✓' : ''}</span>
          <span>{item.label}</span>
        </button>
      {/each}
      <!-- STILL HERE, BUT NO LONGER THE ONLY WAY OUT. Dragging an END of the row takes it out
           (owner, 2026-09-07); this is what a control in the MIDDLE has instead, since dragging one
           of those moves the whole row by design. -->
      {#if state.dock}
        <div class="fem-sep" role="separator"></div>
        <button class="fem-item" type="button" role="menuitem" on:click={() => ctl.undock()}>
          <span class="fem-tick" aria-hidden="true"></span>
          <span>Take this one out of the row</span>
        </button>
      {/if}
    </div>
  </div>
{/if}

<style>
  .fem-scrim {
    position: fixed;
    inset: 0;
    z-index: 4000; /* above the chrome it belongs to, below nothing that matters */
  }
  .fem-menu {
    position: fixed;
    min-width: 186px;
    padding: 4px;
    border: 1px solid var(--border, #2a2d36);
    border-radius: 8px;
    background: var(--bg-panel, #14161c);
    color: var(--text, #e8e8e8);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }
  .fem-head {
    padding: 4px 8px 6px;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: var(--text-faint, #8a8f9a);
  }
  .fem-item {
    display: flex;
    align-items: center;
    gap: 6px;
    width: 100%;
    padding: 5px 8px;
    border: none;
    border-radius: 5px;
    background: none;
    color: inherit;
    font: inherit;
    font-size: 0.82rem;
    text-align: left;
    cursor: pointer;
  }
  .fem-item:hover { background: var(--bg-control-hover, rgba(255, 255, 255, 0.08)); }
  .fem-item.on { color: var(--accent, #ff5a1f); }
  .fem-tick {
    flex: 0 0 auto;
    width: 12px;
    font-size: 0.8rem;
  }
  .fem-sep {
    height: 1px;
    margin: 4px 6px;
    background: var(--border, #2a2d36);
  }
</style>
