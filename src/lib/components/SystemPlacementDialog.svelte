<script lang="ts">
  // WS7b — "Add System near here": place a new system RELATIVE to one already on the map, by direction and
  // distance rather than by dropping a pin and hoping. Sliders and numeric boxes both edit the same values.
  //
  // Two deliberate design choices:
  //  - The panel docks to the side of the map AWAY from the origin system, so the live ghost marker is never
  //    hidden behind the controls. The whole point is watching the position slide around as you drag.
  //  - Every direction is stated in words as well as numbers ("NE, above the plane by 20°"), because a
  //    bearing is exactly the sort of number that reads fine and means the opposite of what you intended.
  //
  // North is UP the screen. The GM starmap only ever pans and zooms — it is never rotated — so there is no
  // "map is turned" case to warn about here. If a rotating 2D map ever lands, this dialogue needs a
  // north indicator and this comment is the reason why.
  import { createEventDispatcher } from 'svelte';
  import type { MapPos } from '$lib/map/systemDistance';
  import { offsetToMapPos, wrapBearing, clampElevation, compassName, elevationName, type SphericalOffset } from '$lib/map/spherical';

  export let originName = '';
  export let originPos: MapPos;
  export let unit = 'ly';
  export let pixelsPerUnit = 25;
  export let side: 'left' | 'right' = 'right'; // docked away from the origin — the parent picks
  export let inset = 16; // px from that edge; the parent measures it so the panel clears the rail/sidebar
  export let maxDistance = 50; // slider top end, in the campaign's distance unit

  const dispatch = createEventDispatcher<{ change: MapPos; place: MapPos; cancel: void }>();

  // Opens pointing due north at a tenth of the slider range: a visible, obviously-editable starting point
  // rather than a system dropped exactly on top of the one you right-clicked.
  let offset: SphericalOffset = { bearingDeg: 0, elevationDeg: 0, distance: Math.max(1, Math.round(maxDistance / 10)) };

  $: target = offsetToMapPos(originPos, offset, pixelsPerUnit);
  // Push every edit out so the parent can draw the ghost — this reactive IS the live preview.
  $: dispatch('change', target);

  // The compass needle, in the panel's own little SVG. Same frame as the map: north up, clockwise bearings.
  const R = 26;
  $: needleX = 34 + Math.sin(offset.bearingDeg * Math.PI / 180) * R;
  $: needleY = 34 - Math.cos(offset.bearingDeg * Math.PI / 180) * R;

  // Normalise HERE, at the edit, rather than in a reactive over `offset` itself: a `$: offset = {...offset}`
  // statement re-runs on its own output, and the value it writes back fights the input element it came from.
  function num(e: Event, key: keyof SphericalOffset) {
    const raw = Number((e.currentTarget as HTMLInputElement).value);
    if (!Number.isFinite(raw)) return;
    const v = key === 'bearingDeg' ? wrapBearing(raw) : key === 'elevationDeg' ? clampElevation(raw) : Math.max(0, raw);
    offset = { ...offset, [key]: v };
  }
  // Escape backs out. Deliberately NO Enter-to-place: Enter while a number field has focus is far too easy
  // to hit by accident, and this action commits a system to the map and opens the generator.
  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { e.preventDefault(); dispatch('cancel'); }
  }
</script>

<svelte:window on:keydown={onKeydown} />

<div class="place-dlg {side}" style="--inset: {inset}px">
  <header>
    <h3>Add system near {originName || 'here'}</h3>
    <button class="x" type="button" on:click={() => dispatch('cancel')} aria-label="Cancel">×</button>
  </header>

  <div class="dir">
    <svg viewBox="0 0 68 68" width="68" height="68" aria-hidden="true">
      <circle cx="34" cy="34" r="30" class="rose" />
      <line x1="34" y1="4" x2="34" y2="64" class="tick" />
      <line x1="4" y1="34" x2="64" y2="34" class="tick" />
      <text x="34" y="13" class="rose-n">N</text>
      <line x1="34" y1="34" x2={needleX} y2={needleY} class="needle" />
      <circle cx={needleX} cy={needleY} r="3" class="ghost-dot" />
    </svg>
    <p class="words">
      <strong>{compassName(offset.bearingDeg)}</strong>, {elevationName(offset.elevationDeg)}<br />
      <span class="dim">{offset.distance.toFixed(1)} {unit} from {originName || 'the origin'}</span>
    </p>
  </div>

  <label>
    Bearing <span class="val">{Math.round(offset.bearingDeg)}°</span>
    <input type="range" min="0" max="359" step="1" value={offset.bearingDeg} on:input={(e) => num(e, 'bearingDeg')} />
    <input class="n" type="number" min="0" max="359" step="1" value={Math.round(offset.bearingDeg)} on:input={(e) => num(e, 'bearingDeg')} />
  </label>
  <p class="hint">Clockwise from north. North is up the screen.</p>

  <label>
    Elevation <span class="val">{Math.round(offset.elevationDeg)}°</span>
    <input type="range" min="-90" max="90" step="1" value={offset.elevationDeg} on:input={(e) => num(e, 'elevationDeg')} />
    <input class="n" type="number" min="-90" max="90" step="1" value={Math.round(offset.elevationDeg)} on:input={(e) => num(e, 'elevationDeg')} />
  </label>
  <p class="hint">Above or below the map plane. Shows on the 3D starmap; leave at 0 for a flat map.</p>

  <label>
    Distance <span class="val">{offset.distance.toFixed(1)} {unit}</span>
    <input type="range" min="0" max={maxDistance} step={maxDistance > 20 ? 0.5 : 0.1} value={offset.distance} on:input={(e) => num(e, 'distance')} />
    <input class="n" type="number" min="0" step="0.1" value={Number(offset.distance.toFixed(2))} on:input={(e) => num(e, 'distance')} />
  </label>

  <footer>
    <button type="button" class="ghost" on:click={() => dispatch('cancel')}>Cancel</button>
    <button type="button" class="go" on:click={() => dispatch('place', target)}>Place system…</button>
  </footer>
  <p class="hint last">The generator opens next, and the new system lands on this spot.</p>
</div>

<style>
  .place-dlg {
    position: absolute; top: 16px; z-index: 60; width: 268px;
    background: rgba(12, 14, 20, 0.94); border: 1px solid rgba(255, 255, 255, 0.14); border-radius: 10px;
    padding: 10px 12px 12px; box-shadow: 0 10px 30px rgba(0, 0, 0, 0.55);
    color: #e8ecf4; font-size: 12px; backdrop-filter: blur(4px);
  }
  .place-dlg.left { left: var(--inset, 16px); }
  .place-dlg.right { right: var(--inset, 16px); }
  header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  h3 { margin: 0; font-size: 13px; font-weight: 600; flex: 1; }
  .x { background: none; border: 0; color: #9aa4b4; font-size: 18px; line-height: 1; cursor: pointer; padding: 0 2px; }
  .x:hover { color: #fff; }

  .dir { display: flex; align-items: center; gap: 10px; margin-bottom: 10px; }
  .rose { fill: rgba(255, 255, 255, 0.03); stroke: rgba(255, 255, 255, 0.16); }
  .tick { stroke: rgba(255, 255, 255, 0.1); }
  .rose-n { fill: #8e9aab; font-size: 8px; text-anchor: middle; }
  .needle { stroke: #ff7a45; stroke-width: 2; }
  .ghost-dot { fill: #ff7a45; }
  .words { margin: 0; line-height: 1.45; }
  .dim { color: #9aa4b4; }

  label { display: grid; grid-template-columns: 1fr auto; align-items: center; gap: 4px 8px; margin-top: 8px; }
  .val { color: #ff9a6b; font-variant-numeric: tabular-nums; }
  input[type='range'] { grid-column: 1; width: 100%; accent-color: #ff7a45; }
  .n { grid-column: 2; width: 62px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.14);
       border-radius: 4px; color: #e8ecf4; padding: 2px 4px; font-size: 11px; }
  .hint { margin: 3px 0 0; font-size: 10.5px; color: #8b95a5; line-height: 1.4; }
  .hint.last { margin-top: 8px; }

  footer { display: flex; gap: 8px; margin-top: 12px; }
  footer button { flex: 1; border-radius: 6px; padding: 6px 8px; font-size: 12px; cursor: pointer; border: 1px solid transparent; }
  .ghost { background: rgba(255, 255, 255, 0.07); border-color: rgba(255, 255, 255, 0.16); color: #cfd6e2; }
  .ghost:hover { background: rgba(255, 255, 255, 0.12); }
  .go { background: #ff7a45; color: #14100c; font-weight: 600; }
  .go:hover { background: #ff8d5f; }
</style>
