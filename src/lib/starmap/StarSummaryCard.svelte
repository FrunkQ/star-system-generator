<script lang="ts">
  // THE GM STARMAP'S HOVER SUMMARY (A82) — what is in this system, without opening it.
  //
  // Presentation only. Every figure and every phrase comes from `systemSummary.ts`, which is the
  // ONE place that counts a system, and the designation comes from `starClassExplain` through it.
  // Nothing here derives anything: if this file ever needs a number the summary does not have, the
  // summary gains it, or there are two answers to one question.
  //
  // GM SIDE ONLY. The player's starmap is `Starmap3DView` and it must not mount this — their view
  // is redacted and these counts are not. `systemSummary.spec.ts` greps for that rather than
  // trusting this comment.
  import type { SystemSummary } from './systemSummary';
  import { contentsLine } from './systemSummary';

  export let summary: SystemSummary | null = null;
  /** Where the pointer is, in the map container's own coordinates. */
  export let x = 0;
  export let y = 0;
  /** The container, so the card can turn back on itself rather than run off the edge. */
  export let bounds: { w: number; h: number } = { w: 0, h: 0 };

  const GAP = 14;   // clear of the cursor, so the card never sits under it
  const W = 224;    // matches max-width below; the flip has to know it before layout

  // Flip rather than clamp: a card clamped against the right edge covers the star it describes,
  // which is the one thing it must not do.
  $: flipX = bounds.w > 0 && x + GAP + W > bounds.w;
  $: left = flipX ? Math.max(4, x - GAP - W) : x + GAP;
  // Vertically it CAN clamp — the card is short and the cursor is never inside it horizontally.
  $: top = Math.max(4, Math.min(y + GAP, Math.max(4, bounds.h - 130)));
</script>

{#if summary}
  <!-- pointer-events: none. A tooltip that can be hovered steals the pointer from the star it is
       describing, and the hover then flickers as the two fight over it. -->
  <div class="star-summary" style="left:{left}px; top:{top}px" role="tooltip" aria-hidden="true">
    <div class="ss-name">{summary.name}</div>
    {#if summary.designation}
      <div class="ss-desig">{summary.designation}</div>
    {:else if summary.stars === 0}
      <div class="ss-desig ss-quiet">No star charted</div>
    {/if}
    {#if summary.stars > 1}
      <div class="ss-line">{summary.stars} stars</div>
    {/if}
    {#if contentsLine(summary)}
      <div class="ss-line">{contentsLine(summary)}</div>
    {:else}
      <div class="ss-line ss-quiet">Nothing charted in orbit</div>
    {/if}
    {#if summary.life}
      <div class="ss-life">{summary.life}</div>
    {/if}
    {#each summary.specials as special (special)}
      <div class="ss-special">{special}</div>
    {/each}
  </div>
{/if}

<style>
  .star-summary {
    position: absolute;
    /* A72’s rule: a box with padding AND a width bound has to be border-box, or its outer size is
       not the number anything else was told. `W` above is that number, and the edge flip uses it. */
    box-sizing: border-box;
    z-index: var(--z-panel, 1500);
    pointer-events: none;
    max-width: 224px;
    padding: 7px 9px;
    background: var(--bg-panel, #14171d);
    border: 1px solid var(--border, #2a2d36);
    border-radius: var(--radius-md, 8px);
    box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
    color: var(--text, #e8e8e8);
    font-size: 0.78rem;
    line-height: 1.35;
  }
  .ss-name {
    font-weight: 600;
    color: var(--accent, #ff5a1f);
    margin-bottom: 2px;
  }
  .ss-desig {
    color: var(--text-muted, #aab);
    font-size: 0.95em;
    margin-bottom: 3px;
  }
  .ss-line { color: var(--text, #e8e8e8); }
  .ss-quiet { color: var(--text-faint, #8a8f9a); font-style: italic; }
  /* Life and the megastructures are the two lines a GM is scanning for, so they are the two that
     get a colour. Both are DECORATION rather than colour-as-information (UI-C10): the words carry
     the meaning and the card reads correctly in greyscale. */
  .ss-life {
    margin-top: 3px;
    color: var(--status-ok, #4caf50);
  }
  .ss-special {
    margin-top: 3px;
    color: var(--link, #88ccff);
  }
</style>
