<script lang="ts">
  // ONE WAY OF TELLING SOMEONE THE PICTURE HAD TO CHANGE, used by every surface that has to say it.
  //
  // The frame-rate guard's notice ([[G69]]) already had this shape, written into `HoloView`. C20's
  // software-rasteriser notice needs the same thing on the size comparison as well - the owner names
  // BOTH views in his report - and a second copy of a styled box with a dismiss button is exactly
  // the duplication this codebase keeps paying for. So the box moved here before there were two.
  //
  // It says nothing on its own: a null message renders nothing at all, so a host can bind it
  // straight to a value that is usually empty.
  export let message: string | null = null;
  /** Called when the reader dismisses it. The host owns whether it can come back. */
  export let onDismiss: () => void = () => {};
</script>

{#if message}
  <!-- role="status" rather than "alert": this is worth reading, not worth interrupting for. -->
  <div class="render-notice" role="status">
    <span>{message}</span>
    <button type="button" title="Dismiss" aria-label="Dismiss" on:click={onDismiss}>x</button>
  </div>
{/if}

<style>
  /* Over the canvas, out of the way of the middle of the map, and readable on any backdrop. */
  .render-notice {
    position: absolute; left: 50%; bottom: 14px; transform: translateX(-50%);
    display: flex; align-items: center; gap: 10px; max-width: min(560px, 92%);
    padding: 8px 10px 8px 14px; border-radius: 8px;
    background: rgba(16, 26, 40, 0.94); border: 1px solid #3a4d68; color: #e7eefa;
    font-size: 12px; line-height: 1.35; box-shadow: 0 6px 22px rgba(0, 0, 0, 0.5);
    z-index: 30;
  }
  .render-notice button {
    background: none; border: none; color: #8fa6c4; font-size: 14px; cursor: pointer; padding: 2px 6px;
  }
  .render-notice button:hover { color: #e7eefa; }
</style>
