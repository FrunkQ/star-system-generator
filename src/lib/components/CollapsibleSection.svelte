<script lang="ts">
  // A labelled, collapsible group of controls — ONE collapsing idiom for the editors.
  //
  // A48: the pattern is lifted from `FilterParamControls`'s `.grp-head` (caret + uppercase label +
  // aria-expanded), which is where this codebase already had it. The COMPONENT there could not be
  // reused: it renders its controls FROM DATA (`paramsMeta` declares every param's type, range and
  // options), and the preset editor's controls are not declarable that way — they carry conditional
  // visibility, bespoke change handlers and embedded components. So the pattern is shared and the
  // controls stay hand-written; the caller owns `open` and decides where it is remembered.
  //
  // It renders a real <fieldset>/<legend> so it stays a labelled group for a screen reader whether
  // open or closed, and the body simply unmounts when closed.
  import { createEventDispatcher } from 'svelte';

  export let label: string;
  export let open = true;
  /** Visually nested one level in — for a group that sits inside another group's body. */
  export let nested = false;

  const dispatch = createEventDispatcher<{ toggle: boolean }>();
  function toggle() {
    open = !open;
    dispatch('toggle', open);
  }
</script>

<fieldset class="sect" class:nested class:closed={!open}>
  <legend>
    <button type="button" class="sect-head" aria-expanded={open} on:click={toggle}>
      <span class="caret" class:open aria-hidden="true">▸</span>{label}
    </button>
  </legend>
  {#if open}
    <div class="sect-body"><slot /></div>
  {/if}
</fieldset>

<style>
  .sect {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.2rem 0.8rem 0.7rem;
    margin: 0;
    min-width: 0;
  }
  /* Closed: the head alone, so a shut section is one line rather than an empty box. */
  .sect.closed { padding-bottom: 0.2rem; }
  .sect.nested { border-style: dashed; }
  legend { padding: 0; margin-left: -2px; }
  .sect-head {
    display: flex;
    align-items: center;
    gap: 5px;
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-muted);
    font: inherit;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    cursor: pointer;
    padding: 3px 4px;
  }
  .sect-head:hover { color: var(--text); }
  .caret { transition: transform 0.12s; display: inline-block; }
  .caret.open { transform: rotate(90deg); }
  .sect-body { display: flex; flex-direction: column; gap: 0.5rem; padding-top: 0.1rem; }
</style>
