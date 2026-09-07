<script lang="ts">
  // A "?" BESIDE A PACK-EDITOR FIELD, and a panel that answers the question the field raises.
  //
  // Owner, 2026-09-07, on a user losing an afternoon to the gas editor: *"The least that UI deserves
  // is a '?' and an explanation of each"* — with the content spec in the same breath: what the field
  // represents, other names for it, WHICH ONES ARE ARBITRARY, and example ranges.
  //
  // WHY NOT `title=`, WHICH IS WHAT WAS THERE. Three of these fields already carried a browser
  // tooltip and the user still had no idea, because a tooltip is invisible until you hover exactly
  // the right word and guess that hovering would do anything. A "?" is a thing you can SEE and
  // decide to press. The tooltips stay as the hover shorthand; this is the answer.
  //
  // IT HOLDS NO CONTENT. Everything it renders comes from `packs/fieldHelp.ts`, because four editors
  // ask the same question and a help string written into a modal is one the next modal rewrites
  // slightly differently. Sibling in spirit to `InfoLink.svelte` (the ⓘ that deep-links /physics) and
  // deliberately a different glyph, because that one LEAVES for the physics page and this one
  // ANSWERS in place.
  import { kindLabel, kindBlurb, placePopover, type FieldHelp } from '$lib/packs/fieldHelp';

  /** The record to render. Undefined renders nothing at all — a field with no entry shows no "?",
   *  which is honest: a "?" that opens an empty panel is worse than no "?". */
  export let help: FieldHelp | undefined = undefined;

  let open = false;
  let wrap: HTMLSpanElement;
  let dot: HTMLButtonElement;
  let pos = { left: 0, top: 0, maxH: 320 };

  // POSITIONED `fixed`, AND THAT IS THE WHOLE REASON IT WORKS. These editors are long lists inside a
  // modal whose body scrolls, so an absolutely-positioned panel is clipped by that scroller the
  // moment its field sits low in the list - measured at 146 px cut off the bottom, and the bottom is
  // where the note that matters lives. A fixed panel is placed from the button's own rect and no
  // ancestor can crop it. The cost is that it does not travel with a scroll, so a scroll closes it.
  function place() {
    if (!dot) return;
    const r = dot.getBoundingClientRect();
    // `clientWidth`, NOT `innerWidth`: the latter INCLUDES the vertical scrollbar, so clamping to it
    // lets the panel slide under the scrollbar by its own width - measured at 13 px on the liquids
    // editor, on the last field of a long list. `clientWidth` is the area a reader can actually see.
    const doc = document.documentElement;
    pos = placePopover(r, {
      width: doc?.clientWidth || window.innerWidth,
      height: doc?.clientHeight || window.innerHeight
    });
  }

  const close = () => (open = false);
  function toggle() {
    open = !open;
    if (open) place();
  }
  function onDocClick(e: MouseEvent) {
    if (open && wrap && !wrap.contains(e.target as Node)) close();
  }
  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && open) { close(); e.stopPropagation(); }
  }
</script>

<svelte:window on:click={onDocClick} on:keydown={onKey} on:resize={close} on:scroll|capture={close} />

{#if help}
  <span class="fh" bind:this={wrap}>
    <button
      type="button"
      class="fh-dot"
      class:on={open}
      aria-expanded={open}
      aria-label={`What is ${help.label}?`}
      title={`What is ${help.label}?`}
      bind:this={dot}
      on:click|stopPropagation={toggle}>?</button>

    {#if open}
      <div class="fh-pop" role="dialog" aria-label={help.label}
           style="left:{pos.left}px; top:{pos.top}px; max-height:{pos.maxH}px">
        <div class="fh-head">
          <strong>{help.label}</strong>
          <span class="fh-kind" class:model={help.kind === 'model'} class:unread={help.kind === 'unread'}
                title={kindBlurb(help.kind)}>{kindLabel(help.kind)}</span>
        </div>

        <p class="fh-what">{help.what}</p>

        {#if help.units}
          <p class="fh-row"><span class="fh-key">Units</span>{help.units}</p>
        {/if}
        {#if help.alsoCalled}
          <p class="fh-row"><span class="fh-key">Also called</span>{help.alsoCalled}</p>
        {/if}
        {#if help.reads}
          <p class="fh-row"><span class="fh-key">What reads it</span>{help.reads}</p>
        {/if}
        {#if help.range}
          <p class="fh-row"><span class="fh-key">Typical values</span>{help.range}</p>
        {/if}
        {#if help.note}
          <p class="fh-note">{help.note}</p>
        {/if}
      </div>
    {/if}
  </span>
{/if}

<style>
  .fh { position: relative; display: inline-flex; align-items: center; margin-left: 4px; }
  .fh-dot {
    width: 15px;
    height: 15px;
    padding: 0;
    line-height: 1;
    font-size: 0.68rem;
    font-weight: 700;
    border-radius: 50%;
    border: 1px solid var(--border);
    background: transparent;
    color: var(--text-faint, #8a8f9a);
    cursor: help;
  }
  .fh-dot:hover, .fh-dot.on {
    color: var(--accent, #ff5a1f);
    border-color: var(--accent, #ff5a1f);
  }
  .fh-pop {
    position: fixed;
    z-index: 1200;
    /* BORDER-BOX, and it is load-bearing rather than tidy: `placePopover` clamps against a width of
       380, so the rendered box has to BE 380. Without this the padding and border push it to ~406
       and the panel hangs 14 px off the right edge on the last field of a long list - measured. */
    box-sizing: border-box;
    width: min(380px, calc(100vw - 24px));
    overflow-y: auto;
    padding: 10px 12px 12px;
    background: var(--bg-panel, #1a1d24);
    border: 1px solid var(--border);
    border-radius: 8px;
    box-shadow: 0 8px 26px rgba(0, 0, 0, 0.55);
    cursor: default;
    text-align: left;
    white-space: normal;
  }
  .fh-head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 8px;
    margin-bottom: 6px;
  }
  .fh-head strong { color: var(--accent, #ff5a1f); font-size: 0.9rem; }
  /* THE CHIP IS THE POINT OF THE WHOLE PANEL: it says in two words whether there is a right answer
     to look up, a judgement to make, or nothing at stake because nothing reads the field. */
  .fh-kind {
    flex: 0 0 auto;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    padding: 1px 6px;
    border-radius: 999px;
    border: 1px solid var(--border);
    color: var(--text-faint, #8a8f9a);
    cursor: help;
  }
  .fh-kind.model { color: #e0a33d; border-color: #e0a33d66; }
  .fh-kind.unread { color: var(--status-bad, #e0484d); border-color: #e0484d66; }
  .fh-what { margin: 0 0 8px; font-size: 0.82rem; line-height: 1.45; color: var(--text, #e8e8e8); }
  .fh-row { margin: 0 0 6px; font-size: 0.78rem; line-height: 1.4; color: var(--text-muted, #cfcfcf); }
  .fh-key {
    display: block;
    font-size: 0.62rem;
    text-transform: uppercase;
    letter-spacing: 0.04em;
    color: var(--text-faint, #8a8f9a);
  }
  .fh-note {
    margin: 8px 0 0;
    padding: 7px 9px;
    font-size: 0.78rem;
    line-height: 1.45;
    border-left: 2px solid var(--accent, #ff5a1f);
    background: var(--bg-control, #232733);
    border-radius: 0 4px 4px 0;
    color: var(--text, #e8e8e8);
  }
</style>
