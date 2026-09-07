<script lang="ts">
  // THE CLOCK READ-OUT, FLOATING (G81, on top of A98). Owner, 2026-09-06/07: "Maybe even give the
  // time display the same treatment - to give gm total flex. To help with different types of
  // screens - pin them to a screen edge which it moves with... and allow them to be pinned
  // together. This allow user display customisation - saved locally with PC."
  //
  // ONE COMPONENT FOR BOTH MOUNTS. The overlay used to be a div plus its own copy of the same four
  // CSS lines in SystemView AND Starmap; two copies of a placement are two placements that drift,
  // and a shared float needs ONE storage key, which is what a shared component gives for free (the
  // body picker works the same way).
  //
  // IT IS A READ-OUT, SO IT HAS NO PUCK AND NO LOCK. `pinned` in the shared module means only
  // "suppress auto-close", and there is nothing here to close TO: unpinning a control with no puck
  // would take the clock off the canvas with no way back. So this host mirrors the undo pill -
  // open and pinned from birth, with the grip shown ALWAYS - and the only thing the GM changes is
  // where it sits. `use:chrome` is the one attribute a floating control needs (UI-C6).
  import { chrome } from '$lib/ui/foreground';
  import { createFloatingControl } from '$lib/ui/floatingControl';
  import FloatGrip from './FloatGrip.svelte';
  import FloatEdgeMenu from './FloatEdgeMenu.svelte';
  import TimeDisplay from './TimeDisplay.svelte';
  import type { Starmap } from '$lib/types';

  type Temporal = NonNullable<Starmap['temporal']>;
  export let temporal: Temporal;
  /** Passed straight through while a parent animates the clocks (SystemView's align). */
  export let displayOverrideSec: bigint | null = null;
  export let masterOverrideSec: bigint | null = null;

  const float = createFloatingControl('sse-time-display-float', { open: true, pinned: true });
</script>

<div
  class="time-display-overlay"
  use:chrome
  use:float.root
  style="transform: translate({$float.dx}px, {$float.dy}px);"
>
  <FloatGrip ctl={float} always label="Drag to move the clock" />
  <TimeDisplay {temporal} {displayOverrideSec} {masterOverrideSec} />
</div>

<FloatEdgeMenu ctl={float} what="the clock" />

<style>
  .time-display-overlay {
    position: absolute;
    top: 8px;
    left: 8px;
    z-index: 57;
    display: flex;
    align-items: stretch;
    gap: 2px;
    /* The read-out itself is click-through (TimeDisplay sets pointer-events: none), so a canvas
       drag that starts over the clock still reaches the canvas. Only the grip takes the pointer. */
    pointer-events: none;
  }
  .time-display-overlay :global(.float-grip) {
    pointer-events: auto;
    align-self: center;
    min-height: 34px;
  }
</style>
