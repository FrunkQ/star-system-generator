<script lang="ts">
  // Diagrammatic catalogue tier — the "app feel" for the lo-fi/datapad skins: a clickable
  // star/planet layout up top, and the selected body's player-safe facts in a panel below.
  // Skin-agnostic: uses currentColor + thin borders so each skin's colour drives the look.
  // The DIAGRAM shows stars + planets only (belts as non-clickable blobs); moons and
  // constructs live in the selected body's data section. A body list under the diagram is
  // the alternate picker (and the only way to select a belt, since blobs may overlap planets).
  import type { System, CelestialBody } from '$lib/types';
  import { bodyFacts, bodyGlyph } from '$lib/catalogue/bodyFacts';
  import { AU_KM, EARTH_MASS_KG } from '$lib/constants';
  import { debrisDensityFrac } from '$lib/rendering/debris';
  import type { MeasurementUnits, TemperatureUnit } from '$lib/units';
  import PlanetDisc from '$lib/catalogue/PlanetDisc.svelte';

  export let system: System;
  export let includeConstructs = true;
  export let units: MeasurementUnits = 'metric';   // in-system km/miles display
  export let tempUnit: TemperatureUnit = 'C';      // temperature display (°C / °F / K)
  // The Guide skin: hopelessly over-colourful — every line a different friendly colour.
  export let colorful = false;
  // Body imagery in the panel: 'disc' = procedural true-colour orrery disc (The Guide),
  // 'photo' = the stock artist's-impression photo (Survey Datapad), 'none' = text only (CRT).
  export let imagery: 'disc' | 'photo' | 'none' = 'none';

  let selectedId: string | null = null;

  // A body is "ringed" if it hosts a ring child — drives the disc's Saturn ring.
  function ringChild(b: CelestialBody | null): CelestialBody | null {
    if (!b) return null;
    return (system?.nodes ?? []).find((n) => n.parentId === b.id && (n as any).roleHint === 'ring') as CelestialBody ?? null;
  }
  function isRinged(b: CelestialBody | null): boolean { return !!ringChild(b); }
  // The ring's debris density → drives its drawn size in the disc. Shared rule (rendering/debris).
  function ringDensityOf(b: CelestialBody | null): number {
    return debrisDensityFrac(ringChild(b)?.massKg);
  }

  function isStar(n: any): boolean {
    return n?.roleHint === 'star' || (Array.isArray(n?.classes) && n.classes.some((c: string) => String(c).startsWith('star/')));
  }
  function isBeltish(n: any): boolean {
    return n?.roleHint === 'belt' || n?.roleHint === 'ring';
  }

  $: nodes = (system?.nodes ?? []).filter((n) => includeConstructs || n.kind !== 'construct') as CelestialBody[];
  $: stars = nodes.filter(isStar).sort((a, b) => (b.massKg || 0) - (a.massKg || 0));

  function orbiters(hostId: string): CelestialBody[] {
    return nodes
      .filter((n) => !isStar(n) && (n.parentId === hostId || n.orbit?.hostId === hostId) && n.roleHint !== 'moon')
      .sort((a, b) => (orbitAU(a) || 0) - (orbitAU(b) || 0));
  }
  // Diagram + list bodies: natural planets and belts, never constructs (those live in the panel).
  function planetsOf(hostId: string): CelestialBody[] {
    return orbiters(hostId).filter((n) => n.kind !== 'construct' && !isBeltish(n));
  }
  function beltsOf(hostId: string): CelestialBody[] {
    return orbiters(hostId).filter((n) => n.kind !== 'construct' && isBeltish(n));
  }
  function listBodiesOf(hostId: string): CelestialBody[] {
    return orbiters(hostId).filter((n) => n.kind !== 'construct');
  }
  function moonsOf(id: string): CelestialBody[] {
    return nodes
      .filter((n) => n.kind !== 'construct' && (n.parentId === id || n.orbit?.hostId === id) && n.roleHint === 'moon')
      .sort((a, b) => (a.orbit?.elements?.a_AU || 0) - (b.orbit?.elements?.a_AU || 0));
  }
  // Constructs attached to a body, split by placement: ON the surface vs ORBITING it.
  function constructsOf(id: string): { surface: CelestialBody[]; orbiting: CelestialBody[] } {
    const cs = nodes.filter((n) => n.kind === 'construct' && (n.parentId === id || n.orbit?.hostId === id));
    const surface = cs.filter((c) => String((c as any).placement || '').toLowerCase() === 'surface');
    return { surface, orbiting: cs.filter((c) => !surface.includes(c)) };
  }
  function orbitAU(b: CelestialBody): number {
    const a = b.orbit?.elements?.a_AU;
    if (typeof a === 'number' && a > 0) return a;
    // Belts/rings may carry only inner/outer radii — use the midpoint.
    const inKm = (b as any).radiusInnerKm, outKm = (b as any).radiusOuterKm;
    if (typeof inKm === 'number' && typeof outKm === 'number' && outKm > 0) return ((inKm + outKm) / 2) / AU_KM;
    return 0;
  }
  // Bodies with no stellar host shown (rogue planets / unparented constructs).
  $: rogues = nodes.filter((n) => !isStar(n) && n.roleHint !== 'moon' && n.kind !== 'construct' && !n.parentId && !n.orbit?.hostId);

  // A barycentre is shown AS its dominant member (Pluto), with the barycentre named in parens, so
  // "Pluto-Charon Barycenter" reads as "Pluto (Pluto-Charon Barycenter)" — you can see it IS Pluto.
  function isBary(n: any): boolean { return n?.kind === 'barycenter'; }
  function membersOf(bary: any): CelestialBody[] {
    const ids: string[] = bary?.memberIds || [];
    const byId = nodes.filter((n) => ids.includes(n.id));
    const byParent = nodes.filter((n) => n.parentId === bary.id);
    const all = [...new Set([...byId, ...byParent])];
    return all.sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
  }
  function dominantOf(bary: any): CelestialBody | null { return membersOf(bary)[0] ?? null; }
  // Friendly label for the diagram/list: a barycentre shows its dominant member's name.
  function displayLabel(n: any): string {
    if (isBary(n)) return dominantOf(n)?.name ?? n.name;
    return n.name;
  }

  $: selected = nodes.find((n) => n.id === selectedId) || null;
  // What the panel draws facts/image FROM (the dominant member for a barycentre).
  $: subject = selected && isBary(selected) ? (dominantOf(selected) ?? selected) : selected;
  $: panelTitle = selected && isBary(selected)
    ? `${dominantOf(selected)?.name ?? '?'} (${selected.name})`
    : (selected?.name ?? '');
  $: facts = subject ? bodyFacts(subject, units, tempUnit) : [];
  // For a barycentre, the companion members (Charon) join the moons row.
  $: selectedMoons = selected
    ? (isBary(selected)
        ? [...membersOf(selected).filter((m) => m.id !== subject?.id), ...(subject ? moonsOf(subject.id) : [])]
        : moonsOf(selected.id))
    : [];
  $: selectedConstructs = subject ? constructsOf(subject.id) : { surface: [], orbiting: [] };
  // Photo crop: show the central fraction of the artist's-impression photo (Survey Datapad).
  const PHOTO_CROP_FRAC = 0.4; // central 40% — tunable

  // "Back to parent": for a moon/construct/planet, the host to return to (a barycentre parent is
  // kept as the barycentre node, shown as its dominant member).
  $: parentNavId = (() => {
    if (!selected || isBary(selected)) return null;
    const pid = (selected as any).ui_parentId || selected.parentId || selected.orbit?.hostId;
    const p = pid ? nodes.find((n) => n.id === pid) : null;
    return p ? p.id : null;
  })();
  $: parentNavLabel = parentNavId ? displayLabel(nodes.find((n) => n.id === parentNavId)) : '';

  // Auto-select the first interesting body once data arrives.
  $: if ((!selectedId || !nodes.some((n) => n.id === selectedId)) && stars.length) {
    const o = planetsOf(stars[0].id);
    selectedId = o[0]?.id ?? stars[0].id;
  }

  // --- Orbital diagram: each star gets a horizontal "distance line" with its planets placed by
  //     log(semi-major axis). Belts render as wide blobs (not clickable — pick them from the list). ---
  const VB_W = 600;
  const ROW_H = 88;
  const INNER = 86, OUTER = VB_W - 26;
  interface DiagramRow {
    planets: { b: CelestialBody; x: number }[];
    belts: { b: CelestialBody; x1: number; x2: number }[];
  }
  function diagramRow(hostId: string): DiagramRow {
    const planets = planetsOf(hostId).map((b) => ({ b, a: orbitAU(b) })).filter((v) => v.a > 0);
    const belts = beltsOf(hostId).map((b) => {
      const inKm = (b as any).radiusInnerKm, outKm = (b as any).radiusOuterKm;
      const mid = orbitAU(b);
      const aIn = typeof inKm === 'number' && inKm > 0 ? inKm / AU_KM : mid * 0.9;
      const aOut = typeof outKm === 'number' && outKm > 0 ? outKm / AU_KM : mid * 1.1;
      return { b, aIn, aOut };
    }).filter((v) => v.aOut > 0);

    const allLogs = [
      ...planets.map((v) => Math.log10(v.a + 1e-5)),
      ...belts.flatMap((v) => [Math.log10(v.aIn + 1e-5), Math.log10(v.aOut + 1e-5)])
    ];
    if (!allLogs.length) return { planets: [], belts: [] };
    const minLog = Math.min(...allLogs), maxLog = Math.max(...allLogs);
    const spread = Math.max(1e-5, maxLog - minLog);
    const pos = (a: number) => allLogs.length === 1
      ? (INNER + OUTER) / 2
      : INNER + (Math.log10(a + 1e-5) - minLog) / spread * (OUTER - INNER);
    return {
      planets: planets.map((v) => ({ b: v.b, x: pos(v.a) })),
      belts: belts.map((v) => ({ b: v.b, x1: pos(v.aIn), x2: Math.max(pos(v.aIn) + 14, pos(v.aOut)) })),
    };
  }

  // The Guide's friendly rainbow: a stable bright hue per body (index-driven, evenly spaced).
  function hue(i: number): string {
    return `hsl(${(i * 47 + 8) % 360}, 95%, 66%)`;
  }
  let hueIndex: Map<string, number> = new Map();
  $: {
    hueIndex = new Map();
    let i = 0;
    for (const star of stars) {
      hueIndex.set(star.id, i++);
      for (const b of listBodiesOf(star.id)) hueIndex.set(b.id, i++);
    }
    for (const r of rogues) hueIndex.set(r.id, i++);
  }
  const colorOf = (id: string, map: Map<string, number>) => hue(map.get(id) ?? 0);
</script>

<div class="cat-browser" class:colorful>
  <header class="cat-head">
    <h1>{system?.name ?? 'Field Guide'}</h1>
    <p class="sub">Field guide · {nodes.length} catalogued object{nodes.length === 1 ? '' : 's'}</p>
  </header>

  {#if stars.length}
    <svg class="orrery-diagram" viewBox="0 0 {VB_W} {stars.length * ROW_H}" preserveAspectRatio="xMidYMin meet" role="group" aria-label="System diagram">
      {#each stars as star, si (star.id)}
        {@const cy = si * ROW_H + ROW_H / 2}
        {@const row = diagramRow(star.id)}
        <line class="orbit-line" x1="74" y1={cy} x2={VB_W - 14} y2={cy} style={colorful ? `stroke:${colorOf(star.id, hueIndex)}` : ''} />
        <g class="d-node" class:sel={selectedId === star.id} role="button" tabindex="0"
           on:click={() => (selectedId = star.id)} on:keydown={(e) => { if (e.key === 'Enter') selectedId = star.id; }}>
          <circle class="d-star" cx="42" cy={cy} r="13" />
          <text class="d-label star" x="42" y={cy + 27} text-anchor="middle">{star.name}</text>
        </g>
        <!-- Belts: wide non-interactive blobs under the planets; select them from the list below. -->
        {#each row.belts as e (e.b.id)}
          <g class="d-belt" class:sel={selectedId === e.b.id}>
            <rect x={e.x1} y={cy - 7} width={e.x2 - e.x1} height="14" rx="7"
              style={colorful ? `fill:${colorOf(e.b.id, hueIndex)}` : ''} />
            <text class="d-label belt" x={(e.x1 + e.x2) / 2} y={cy + 25} text-anchor="middle"
              style={colorful ? `fill:${colorOf(e.b.id, hueIndex)}` : ''}>{e.b.name}</text>
          </g>
        {/each}
        {#each row.planets as e (e.b.id)}
          <g class="d-node" class:sel={selectedId === e.b.id} role="button" tabindex="0"
             on:click={() => (selectedId = e.b.id)} on:keydown={(ev) => { if (ev.key === 'Enter') selectedId = e.b.id; }}>
            <circle class="d-body" cx={e.x} cy={cy} r="6.5" style={colorful ? `fill:${colorOf(e.b.id, hueIndex)};stroke:${colorOf(e.b.id, hueIndex)}` : ''} />
            {#if moonsOf(e.b.id).length}<circle class="d-moon" cx={e.x + 10} cy={cy - 9} r="2.4" />{/if}
            <text class="d-label" x={e.x} y={cy - 13} text-anchor="middle" style={colorful ? `fill:${colorOf(e.b.id, hueIndex)}` : ''}>{displayLabel(e.b)}</text>
          </g>
        {/each}
      {/each}
    </svg>

    <!-- Alternate picker: every star's bodies in orbit order (the only way to select a belt). -->
    <div class="body-list">
      {#each stars as star (star.id)}
        <div class="list-row">
          <button class="chip star" class:sel={selectedId === star.id} on:click={() => (selectedId = star.id)}
            style={colorful ? `color:${colorOf(star.id, hueIndex)};border-color:${colorOf(star.id, hueIndex)}` : ''}>★ {star.name}</button>
          {#each listBodiesOf(star.id) as b (b.id)}
            <button class="chip" class:sel={selectedId === b.id} on:click={() => (selectedId = b.id)}
              style={colorful ? `color:${colorOf(b.id, hueIndex)};border-color:${colorOf(b.id, hueIndex)}` : ''}>
              <span class="g">{bodyGlyph(b)}</span>{displayLabel(b)}
            </button>
          {/each}
        </div>
      {/each}
    </div>
  {/if}

  {#if rogues.length}
    <div class="rogue-row">
      <span class="rogue-label">Unbound:</span>
      {#each rogues as b (b.id)}
        <button class="chip small" class:sel={selectedId === b.id} on:click={() => (selectedId = b.id)}>{b.name}</button>
      {/each}
    </div>
  {/if}

  {#if selected}
    <section class="panel">
      <div class="panel-head">
        <h2><span class="g">{bodyGlyph(subject ?? selected)}</span> {panelTitle}</h2>
      </div>

      {#if parentNavId}
        <button class="back-to-parent" on:click={() => (selectedId = parentNavId)}>↑ {parentNavLabel}</button>
      {/if}

      {#if (subject ?? selected).kind === 'construct'}
        <!-- A construct only ever has a GM-uploaded photo; show it wherever we'd show a body photo
             (Survey Datapad). The Guide's procedural discs and the CRT's text-only skin show nothing. -->
        {#if imagery === 'photo' && (subject ?? selected).image?.url}
          <div class="body-photo-crop" style="aspect-ratio: {1 / PHOTO_CROP_FRAC};">
            <img class="body-photo" src={(subject ?? selected).image.url}
                 alt="Image of {(subject ?? selected).name}" />
          </div>
        {/if}
      {:else if imagery === 'disc'}
        <div class="body-art">
          <PlanetDisc body={subject ?? selected} ringed={isRinged(subject ?? selected)} ringDensity={ringDensityOf(subject ?? selected)} />
        </div>
      {:else if imagery === 'photo' && (subject ?? selected).image?.url}
        <!-- Survey Datapad: full image WIDTH, letterboxed to its central PHOTO_CROP_FRAC (no zoom). -->
        <div class="body-photo-crop" style="aspect-ratio: {1 / PHOTO_CROP_FRAC};">
          <img class="body-photo" src={(subject ?? selected).image.url}
               alt="Artist's impression of {(subject ?? selected).name}" />
        </div>
      {/if}

      {#if selectedMoons.length}
        <div class="moon-row">
          <span class="moon-label">Moons:</span>
          {#each selectedMoons as m (m.id)}
            <button class="chip small" class:sel={selectedId === m.id} on:click={() => (selectedId = m.id)}>{m.name}</button>
          {/each}
        </div>
      {/if}

      {#if selectedConstructs.surface.length}
        <div class="moon-row">
          <span class="moon-label">On {selected.name}:</span>
          {#each selectedConstructs.surface as c (c.id)}
            <button class="chip small" class:sel={selectedId === c.id} on:click={() => (selectedId = c.id)}>◆ {c.name}</button>
          {/each}
        </div>
      {/if}
      {#if selectedConstructs.orbiting.length}
        <div class="moon-row">
          <span class="moon-label">Orbiting:</span>
          {#each selectedConstructs.orbiting as c (c.id)}
            <button class="chip small" class:sel={selectedId === c.id} on:click={() => (selectedId = c.id)}>◆ {c.name}</button>
          {/each}
        </div>
      {/if}

      <dl class="facts">
        {#each facts as f}
          <dt>{f.label}</dt><dd>{f.value}</dd>
        {/each}
      </dl>

      {#if selected.description}
        <p class="desc">{selected.description}</p>
      {/if}
    </section>
  {/if}
</div>

<style>
  .cat-browser {
    max-width: 92%;
    margin: 0 auto;
    padding: 16px 18px 40px;
    font-family: inherit;
  }
  .cat-head h1 { margin: 0; font-size: 1.5rem; letter-spacing: 0.02em; }
  .body-art { display: flex; justify-content: center; margin: 6px 0 12px; }
  /* Survey Datapad photo: full image width, letterboxed to its central band (object-fit cover on a
     wide container crops top/bottom without magnifying). aspect-ratio is set inline from the frac. */
  .body-photo-crop {
    width: 100%;
    overflow: hidden;
    border-radius: 6px;
    margin: 6px 0 12px;
    background: #000;
  }
  .body-photo-crop .body-photo {
    width: 100%;
    height: 100%;
    object-fit: cover;
    object-position: center center;
    display: block;
  }
  .back-to-parent {
    background: none;
    border: 1px solid currentColor;
    color: inherit;
    border-radius: 4px;
    padding: 3px 10px;
    margin: 0 0 10px;
    font: inherit;
    font-size: 0.85em;
    cursor: pointer;
    opacity: 0.8;
  }
  .back-to-parent:hover { opacity: 1; }
  .cat-head .sub { margin: 2px 0 14px; opacity: 0.6; font-size: 0.8rem; }

  /* Clickable orbital diagram (skin-tinted via currentColor). */
  .orrery-diagram { width: 100%; height: auto; display: block; margin: 4px 0; }
  .orbit-line { stroke: currentColor; stroke-opacity: 0.22; stroke-width: 1; }
  .d-node { cursor: pointer; }
  .d-star { fill: currentColor; opacity: 0.85; }
  .d-body { fill: currentColor; opacity: 0.6; stroke: currentColor; stroke-width: 1; }
  .d-moon { fill: currentColor; opacity: 0.7; }
  .d-node:hover .d-body, .d-node:hover .d-star { opacity: 1; }
  .d-node.sel .d-body, .d-node.sel .d-star { opacity: 1; }
  .d-node.sel .d-body { stroke-width: 2.5; }
  .d-node.sel .d-star { stroke: currentColor; stroke-width: 3; }
  .d-label { fill: currentColor; opacity: 0.85; font-size: 11px; }
  .d-label.star { font-weight: 700; }
  /* Belts: wide soft blobs, deliberately NOT clickable (they can overlap planets). */
  .d-belt { pointer-events: none; }
  .d-belt rect { fill: currentColor; opacity: 0.18; }
  .d-belt.sel rect { opacity: 0.4; }
  .d-belt .d-label.belt { opacity: 0.55; font-size: 10px; font-style: italic; }
  .d-belt.sel .d-label.belt { opacity: 0.95; }

  /* Body list under the diagram — the alternate picker. */
  .body-list { display: flex; flex-direction: column; gap: 6px; margin: 6px 0 4px; }
  .list-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; }

  .rogue-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin: 8px 0; }
  .rogue-label { opacity: 0.55; font-size: 0.78rem; }

  .chip {
    display: inline-flex; align-items: center; gap: 6px;
    background: transparent; color: inherit; font: inherit; font-size: 0.86rem;
    border: 1px solid currentColor; border-radius: 6px;
    padding: 5px 10px; cursor: pointer; opacity: 0.8;
  }
  .chip:hover { opacity: 1; }
  .chip.sel { opacity: 1; box-shadow: 0 0 0 1px currentColor; background: color-mix(in srgb, currentColor 22%, transparent); }
  .chip.star { font-weight: 700; font-size: 0.95rem; }
  .chip.small { font-size: 0.8rem; padding: 3px 8px; }
  .chip .g { font-size: 0.9em; }

  .panel {
    margin-top: 18px;
    border: 1px solid currentColor;
    border-radius: 8px;
    padding: 14px 16px 18px;
  }
  .panel-head { display: flex; align-items: baseline; gap: 10px; border-bottom: 1px solid currentColor; padding-bottom: 8px; margin-bottom: 12px; }
  .panel-head h2 { margin: 0; font-size: 1.2rem; }
  .moon-row { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin-bottom: 12px; }
  .moon-label { opacity: 0.55; font-size: 0.78rem; }
  .facts { display: grid; grid-template-columns: max-content 1fr; gap: 5px 16px; margin: 0; font-size: 0.9rem; }
  .facts dt { opacity: 0.55; }
  .facts dd { margin: 0; }
  .desc { margin-top: 14px; line-height: 1.6; font-size: 0.95rem; white-space: pre-wrap; opacity: 0.92; }

  /* --- The Guide's colourful mode: friendlier lines everywhere --- */
  .colorful .orbit-line { stroke-opacity: 0.55; stroke-width: 1.5; }
  .colorful .d-belt rect { opacity: 0.3; }
  .colorful .panel { border-width: 2px; }
</style>
