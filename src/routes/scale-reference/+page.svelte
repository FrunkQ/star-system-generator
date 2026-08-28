<script lang="ts">
  // SCALE REFERENCE - the measurable answer to "how big does each kind of thing draw?"
  //
  // Built for phase P1 of docs/dev/camera-framing-redesign.md, at the owner's request: "setup some
  // custom screens and displays to properly test these - framing for each type of object - makes it
  // easier for you to tell. These can be tied to stuff in the engine doc - so you can reference the
  // test - the visual expectations or measured results."
  //
  // It renders the REAL law (src/lib/rendering/scaleLaw.ts), not a copy, so it cannot drift from
  // what the 3D scene does. Its job is to make two things visible at a glance:
  //   1. what every class of object renders at, at every position of the body-size dial;
  //   2. WHERE THE ORDERING BREAKS - the R9 violations that phase P4 exists to fix. Those cells are
  //      flagged, so "the law is fixed" becomes something you can see rather than take on trust.
  // Rule: RENDER-S11 in docs/dev/engine-map.md. Tests: src/lib/rendering/scaleLaw.spec.ts.
  import {
    bodyRadiusScene, starRadiusScene, shipLengthScene, readableBodyRadius, readableShipLength,
    markerScale, GRID_RADIUS
  } from '$lib/rendering/scaleLaw';
  import { MIN_SPAN_PX } from '$lib/rendering/pixelFloor';

  // The canonical set. Sizes are real, so the table doubles as a sanity check against the sky.
  // `metres` is the object's rendered EXTENT in physical metres (diameter for a body, long axis for
  // a construct) - the one axis on which a moon and a frigate are comparable, which is what R9's
  // "a larger thing never renders smaller" needs.
  type Kind = 'star' | 'body' | 'construct';
  interface Subject { name: string; kind: Kind; note: string; arg: number; metres: number; }

  const SUBJECTS: Subject[] = [
    { name: 'Sol',              kind: 'star',      note: 'G2V star, 696,000 km radius', arg: 696000, metres: 2 * 696000e3 },
    { name: 'Jupiter',          kind: 'body',      note: 'gas giant, 69,911 km radius', arg: 69911,  metres: 2 * 69911e3 },
    { name: 'Earth',            kind: 'body',      note: 'terrestrial, 6,371 km radius', arg: 6371,  metres: 2 * 6371e3 },
    { name: 'Luna',             kind: 'body',      note: 'large moon, 1,737 km radius', arg: 1737,   metres: 2 * 1737e3 },
    { name: 'Ceres Station',    kind: 'construct', note: 'moon-sized construct, 940 km', arg: 940000, metres: 940000 },
    { name: 'Vesta-class rock', kind: 'body',      note: 'asteroid, 263 km radius',      arg: 263,    metres: 2 * 263e3 },
    { name: 'Eros Station',     kind: 'construct', note: 'hollowed asteroid, 22 km',     arg: 22000,  metres: 22000 },
    { name: 'Small moonlet',    kind: 'body',      note: 'rubble pile, 5 km radius',     arg: 5,      metres: 2 * 5e3 },
    { name: 'Nauvoo',           kind: 'construct', note: 'generation ship, 2 km',        arg: 2000,   metres: 2000 },
    { name: 'Canterbury',       kind: 'construct', note: 'ice hauler, 1 km',             arg: 1000,   metres: 1000 },
    { name: 'ISS',              kind: 'construct', note: 'station, 109 m',               arg: 109,    metres: 109 },
    { name: 'Rocinante',        kind: 'construct', note: 'corvette, 46 m',               arg: 46,     metres: 46 },
    { name: 'Racing pinnace',   kind: 'construct', note: 'small craft, 20 m',            arg: 20,     metres: 20 }
  ];

  const DIALS = [1, 0.75, 0.5, 0.25, 0];
  const SYSTEMS = [
    { label: 'Tight (rMax 0.5 AU)', rMax: 0.5 },
    { label: 'Inner (rMax 5 AU)',   rMax: 5 },
    { label: 'Sol-like (rMax 30 AU)', rMax: 30 },
    { label: 'Wide (rMax 100 AU)',  rMax: 100 }
  ];
  let rMax = $state(30);
  // S2c: the CONSTRUCT dial, as a relative offset on the body dial. 0 is the law; anything else is
  // a deliberate, visible departure from it, so the ordering verdict below is always judged at 0.
  let constructOffset = $state(0);

  /** Rendered EXTENT in scene units, comparable across kinds (diameter for a body, length for a hull). */
  function rendered(s: Subject, bodySize: number, offset = constructOffset): number {
    const ctx = { bodySize, rMax, constructOffset: offset };
    if (s.kind === 'star') return starRadiusScene(s.arg, ctx) * 2;
    if (s.kind === 'body') return bodyRadiusScene(s.arg, true, ctx) * 2;
    return shipLengthScene(s.arg, ctx);
  }

  // Sorted physically largest first, so R9 says every column must be non-increasing DOWN the table.
  const ordered = $derived([...SUBJECTS].sort((a, b) => b.metres - a.metres));

  /** A cell violates R9 when it renders LARGER than the physically bigger thing above it. */
  //
  // ALWAYS JUDGED AT OFFSET 0, and that is the point of S2c rather than an oversight: the construct
  // dial is a departure a user CHOOSES and can see, so it is allowed to break the ordering. R9 is a
  // property of the law underneath it, which is what offset 0 is.
  function violates(rows: Subject[], i: number, dial: number): boolean {
    if (i === 0) return false;
    return rendered(rows[i], dial, 0) > rendered(rows[i - 1], dial, 0) * (1 + 1e-9);
  }

  const violationCount = $derived(
    DIALS.reduce((n, d) => n + ordered.filter((_, i) => violates(ordered, i, d)).length, 0)
  );

  function fmt(v: number): string {
    if (v === 0) return '0';
    if (v >= 0.001) return v.toFixed(4);
    return v.toExponential(2);
  }
  /** Rough on-screen size, to make the numbers mean something: a 1400 px viewport at 45 deg fov. */
  function px(sceneUnits: number, camDist: number): number {
    const f = (2 * Math.tan((45 * Math.PI) / 360)) / 1400;
    return sceneUnits / (f * camDist);
  }
</script>

<svelte:head><title>Scale reference — SSE</title></svelte:head>

<main>
  <h1>Scale reference</h1>
  <p class="lede">
    What every class of object renders at, across the body-size dial, straight from the real law in
    <code>src/lib/rendering/scaleLaw.ts</code>. Nothing here is a copy of the maths, so this page cannot
    drift from what the 3D scene draws.
  </p>
  <p class="lede">
    Rule <strong>RENDER-S11</strong> in <code>docs/dev/engine-map.md</code>; design
    <code>docs/dev/camera-framing-redesign.md</code>; tests <code>src/lib/rendering/scaleLaw.spec.ts</code>.
  </p>

  <div class="controls">
    <label for="sys">System extent</label>
    <select id="sys" bind:value={rMax}>
      {#each SYSTEMS as s}<option value={s.rMax}>{s.label}</option>{/each}
    </select>
    <span class="hint">The true-scale factor is {GRID_RADIUS} scene units ÷ {rMax} AU, so a wider system shrinks everything real.</span>
  </div>

  <div class="controls">
    <label for="coff">Construct dial</label>
    <input id="coff" type="range" min="-0.5" max="0.5" step="0.05" bind:value={constructOffset} />
    <strong class="off" class:off-zero={constructOffset === 0}>
      {constructOffset === 0 ? 'law (0)' : (constructOffset > 0 ? '+' : '') + constructOffset.toFixed(2)}
    </strong>
    <span class="hint">
      S2c. Constructs read the body dial PLUS this offset; bodies never see it. <strong>Zero is the
      law</strong> — the single-dial look, unchanged. Slide it and the construct rows move while the
      body rows stand still, which is the whole point: a departure you can see is a choice, not the
      engine lying. The ordering verdict below is always judged at zero.
    </span>
  </div>

  <div class="controls floors">
    <label for="floors">Pixel floors</label>
    <span id="floors" class="hint">
      <strong>Screen-space, and NOT part of the law above.</strong> The law decides size in scene
      units; these clamp the result in screen pixels underneath it, so <em>no dial position can
      correct a floor</em> — which is why the construct dial could not fix constructs reading
      over-large. All five are SPANS (a body's diameter, a hull's long axis) so they can be read
      against each other: star <strong>{MIN_SPAN_PX.star}</strong> · planet
      <strong>{MIN_SPAN_PX.planet}</strong> · moon <strong>{MIN_SPAN_PX.moon}</strong> · ship focused
      <strong>{MIN_SPAN_PX.constructFocused}</strong> · ship idle
      <strong>{MIN_SPAN_PX.constructIdle}</strong> px. A ship joins the body hierarchy rather than
      sitting above it; it used to floor at 14 px of length against a planet's 4.4 px of diameter.
      A ship the camera has FRAMED has no floor at all, on purpose.
    </span>
  </div>

  <div class="verdict" class:bad={violationCount > 0}>
    {#if violationCount > 0}
      <strong>{violationCount} ordering violations.</strong> R9 requires that a physically larger object
      NEVER renders smaller than a smaller one, and flagged cells are where the law breaks it.
      <em>This should read zero since P4/S2</em> — one kind-blind span map replaced the overlapping
      bands, so if you are seeing this the law has regressed and
      <code>describe('R9 ordering')</code> in the spec should be red too.
    {:else}
      <strong>No ordering violations.</strong> Every column is non-increasing down the table, at every
      dial position and system extent — R9 holds, by construction rather than by tuning (P4/S2: one
      monotone span map of physical size, blended geometrically against a true term that is
      proportional to it). The R9 block in the spec is live, not skipped.
    {/if}
  </div>

  <table>
    <thead>
      <tr>
        <th class="obj">Object <span class="sub">largest first, by physical size</span></th>
        <th class="num">Physical</th>
        {#each DIALS as d}
          <th class="num">Dial {d === 1 ? '1.0 (readable)' : d === 0 ? '0.0 (true)' : d.toFixed(2)}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each ordered as s, i}
        <tr class:construct={s.kind === 'construct'}>
          <td class="obj">
            <span class="name">{s.name}</span>
            <span class="kind {s.kind}">{s.kind}</span>
            <span class="sub">{s.note}</span>
          </td>
          <td class="num mono">{s.metres >= 1000 ? (s.metres / 1000).toLocaleString() + ' km' : s.metres + ' m'}</td>
          {#each DIALS as d}
            <td class="num mono" class:violation={violates(ordered, i, d)} title={violates(ordered, i, d) ? `Renders larger than ${ordered[i - 1].name}, which is physically bigger — R9 violation` : ''}>
              {fmt(rendered(s, d))}
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <h2>What the numbers mean</h2>
  <p class="lede">
    Values are the object's rendered EXTENT in scene units — diameter for a body or star, long axis for
    a construct. That is the one axis on which a moon and a frigate are comparable, which is what the
    ordering rule needs. For a sense of scale: at the readable end the whole system spans
    {GRID_RADIUS} units, and at a close-up the camera sits a few object-lengths away, so an object of
    extent <em>E</em> framed at 0.8 of the frame is about {Math.round(px(1, 1 / 0.8))} px per unit of
    its own size.
  </p>
  <p class="lede">
    Sprite markers (belt rubble, wireframe vertex dots, ring particles) shrink with the dial too, down
    to a floor: currently {DIALS.map((d) => `${d} → ${markerScale(d).toFixed(2)}×`).join(', ')}.
  </p>
  <p class="lede">
    Readable bands today: bodies map log radius onto {readableBodyRadius(1).toFixed(2)}–{readableBodyRadius(696000).toFixed(2)}
    (radius), constructs onto {readableShipLength(1).toFixed(2)}–{readableShipLength(940000).toFixed(2)}
    (length). Those two ranges overlapping is precisely the inversion P4 removes by banding on physical
    size alone, kind-blind, with no construct cap.
  </p>
</main>

<style>
  main { max-width: 1100px; margin: 0 auto; padding: 2rem 1.25rem 4rem; color: #d8dee9; font-family: system-ui, sans-serif; }
  h1 { font-size: 1.6rem; margin: 0 0 .5rem; color: #fff; }
  h2 { font-size: 1.1rem; margin: 2rem 0 .5rem; color: #fff; }
  .lede { color: #9aa4b2; line-height: 1.55; margin: .35rem 0; font-size: .9rem; }
  code { background: #1b2028; padding: .1rem .3rem; border-radius: 3px; font-size: .85em; }
  .controls { display: flex; align-items: center; gap: .6rem; margin: 1.25rem 0; flex-wrap: wrap; }
  select { background: #1b2028; color: #d8dee9; border: 1px solid #333b47; border-radius: 4px; padding: .35rem .5rem; }
  .hint { color: #6f7887; font-size: .8rem; }
  .verdict { border: 1px solid #2c5c3a; background: #16241b; border-radius: 6px; padding: .75rem 1rem; margin: 1rem 0; font-size: .87rem; line-height: 1.5; }
  .verdict.bad { border-color: #6d4523; background: #241c14; }
  table { width: 100%; border-collapse: collapse; margin-top: 1rem; font-size: .85rem; }
  th, td { border-bottom: 1px solid #262c36; padding: .45rem .5rem; text-align: right; vertical-align: top; }
  th { color: #8b95a4; font-weight: 600; font-size: .78rem; white-space: nowrap; }
  th.obj, td.obj { text-align: left; }
  .name { display: block; color: #fff; }
  .sub { display: block; color: #6f7887; font-size: .75rem; font-weight: 400; }
  .kind { display: inline-block; font-size: .68rem; text-transform: uppercase; letter-spacing: .04em; padding: .05rem .3rem; border-radius: 3px; margin-top: .15rem; }
  .kind.star { background: #3a3016; color: #e8c96a; }
  .kind.body { background: #16303a; color: #6ac4e8; }
  .kind.construct { background: #33203a; color: #d18ae8; }
  .mono { font-variant-numeric: tabular-nums; font-family: ui-monospace, monospace; }
  td.violation { background: #3a1d16; color: #ff9f7a; font-weight: 700; }
  tr.construct td.obj .name { color: #eccff8; }
  .off { font-variant-numeric: tabular-nums; min-width: 5.5em; }
  .off-zero { opacity: 0.65; font-weight: 500; }
  .floors { align-items: flex-start; }
  .floors .hint { max-width: 70ch; }
</style>
