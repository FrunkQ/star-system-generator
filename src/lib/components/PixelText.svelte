<script lang="ts">
  // A line of text drawn in a 5x7 bitmap alphabet, as crisp SVG rectangles (`$lib/ui/pixelFont`).
  //
  // THE RULE THAT CAME WITH THIS FROM THE HUB: *a touch of it, not a theme.* Body text stays a
  // system font; the pixels are the trim. It is a wordmark and a heading face, never a paragraph.
  //
  // ACCESSIBILITY IS THE TRAP THE HUB NAMED LOUDEST, and it is worse for a heading than a wordmark:
  // a line made of rectangles is invisible to a screen reader, to Ctrl-F and to a deep link. So the
  // component supports both shapes:
  //   - on its own, it names itself (`role="img"` + `aria-label` + `<title>`), which is the minimum;
  //   - `decorative` marks the whole SVG `aria-hidden` for the better shape, where the REAL text
  //     sits beside it in the DOM and this is only the picture of it. Prefer that wherever the text
  //     matters - which is anywhere somebody might search for it.
  import { textRows, runs, gridWidth, ROUND } from '$lib/ui/pixelFont';

  export let text: string;
  /**
   * INTEGERS ONLY. A fractional scale puts rect boundaries on half-pixels and some columns come out
   * a pixel wider than their neighbours. Seven rows tall means 3 is a heading, 2 a label, 1 is
   * decoration - do not go below 3 for anything anybody has to read.
   */
  export let scale = 3;
  /** ROUND is the heading face. Pass `undefined` for the base readout, NARROW for a data plate. */
  export let family: Record<string, string[]> | undefined = ROUND;
  export let colour = 'currentColor';
  /** True when the real text is in the DOM beside this and the SVG is only its picture. */
  export let decorative = false;

  $: rows = textRows(text, family);
  $: w = gridWidth(rows);
  $: rects = runs(rows);
</script>

<!-- `shape-rendering="crispEdges"` is NOT optional: without it the browser antialiases the rect
     edges and hard square pixels turn to mush at some zoom levels and not others. The viewBox plus
     an integer scale is what keeps it resolution-independent - crisp on a phone and on a 4K panel
     from the same markup. -->
<svg
  class="pixel-text"
  width={w * scale}
  height={7 * scale}
  viewBox="0 0 {w} 7"
  shape-rendering="crispEdges"
  role={decorative ? undefined : 'img'}
  aria-hidden={decorative ? 'true' : undefined}
  aria-label={decorative ? undefined : text}
>
  {#if !decorative}<title>{text}</title>{/if}
  {#each rects as r, i (i)}<rect x={r.x} y={r.y} width={r.w} height="1" fill={colour} />{/each}
</svg>

<style>
  .pixel-text {
    display: inline-block;
    vertical-align: middle;
  }
</style>
