<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, Barycenter } from '../../types';

  export let x: number;
  export let y: number;
  export let selectedNode: CelestialBody | Barycenter | null;
  // Retained for compatibility with the caller; linking is a starmap-only action so these are unused here.
  export let isLinking = false;
  export let linkStartNode: CelestialBody | Barycenter | null = null;
  void isLinking; void linkStartNode;

  // ONE ANSWER TO "WHAT IS IN HAND". This read `clipBuffer` - the app's own copies only - while the
  // pill read `detectedClip`, which also sees a branch copied on the map library's site. So a clip
  // from the website never appeared in a right-click menu even where it would have pasted perfectly,
  // and the two controls disagreed about whether there was anything to paste. Since the right-click
  // IS the paste (owner, 2026-09-06), it must see everything the indicator sees.
  import { detectedClip, clipboardHint } from '$lib/io/clipDetect';

  const dispatch = createEventDispatcher();

  // Evaluated once per opening, which is right: this component is created fresh each time the menu
  // is shown, and the answer cannot change while it is up.
  const hint = clipboardHint();

  // A branch, not an object: copying a planet takes its moons, exactly as the map library's own
  // Copy does. The count says so out loud rather than surprising anyone after the fact.
  export let subtreeCount = 1;
  $: branch = subtreeCount > 1 ? ` (${subtreeCount} objects)` : '';
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <ul>
    {#if selectedNode}
      {#if selectedNode.kind === 'body'}
        <!-- Inside a system: the only sensible right-click action on a star/planet/moon is to add a
             construct orbiting it. (Zoom / Link / Delete System are starmap actions and don't belong here.) -->
        <li on:click={() => dispatch('addConstruct', selectedNode)}>Add Construct</li>
      {/if}
      <!-- COPY / CUT / PASTE, for a body and a construct alike - the same gesture a GM already
           knows, working across their own systems. Cut removes the branch; the paste that follows
           is a separate step, so undo takes them apart in the order they happened. -->
      <li on:click={() => dispatch('copyNode', selectedNode)}>Copy{branch}</li>
      <li on:click={() => dispatch('cutNode', selectedNode)}>Cut{branch}</li>
      {#if $detectedClip}
        <li on:click={() => dispatch('pasteHere', selectedNode)}>
          Paste {$detectedClip.label} here{$detectedClip.count > 1 ? ` (${$detectedClip.count} objects)` : ''}
        </li>
      {:else if hint}
        <!-- SAY SO RATHER THAN SHOW NOTHING. In Firefox the app can never look at the clipboard, so
             without this a GM who has copied a system on the map library's site sees no paste option
             anywhere and no way to find out why. Greyed, like every other inapplicable item. -->
        <li class="disabled" title="This browser will not let a page read the clipboard, so the app cannot see what you copied until you paste it.">{hint}</li>
      {/if}
    {/if}
  </ul>
</div>

<style>
  li.disabled {
    opacity: 0.45;
    cursor: default;
  }
  li.disabled:hover {
    background: none;
  }
  .context-menu {
    position: absolute;
    background-color: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 5px;
    z-index: 100;
    color: var(--text);
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  li:hover {
    background-color: var(--bg-control-hover);
  }
</style>