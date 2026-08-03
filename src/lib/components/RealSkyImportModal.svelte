<script lang="ts">
  // Real-sky import dialogue (design: docs/dev/starmap-data-import-design.md).
  //
  // Count first, fetch second: rows are loaded ONCE per centre (live archive,
  // falling back to the bundled snapshot), then the radius slider re-runs the
  // exact-cut conversion client-side, so the readout is instant and honest.
  // Collisions (hosts the bundled maps already curate) and skips (hosts with
  // missing stellar data) are SHOWN, never silently dropped — the converter
  // refuses to invent or overwrite, and this dialogue is where that shows.
  import { createEventDispatcher } from 'svelte';
  import { REGION_PRESETS } from '$lib/import/realsky/presets.mjs';
  import { loadArchiveRows } from '$lib/import/realsky/catalogue.mjs';
  import { convertArchiveRows } from '$lib/import/realsky/convert.mjs';
  import { runTap, simbadResolveAdql } from '$lib/import/realsky/query.mjs';
  import { buildSgrAStarSystem, SGR_A_MAP_META } from '$lib/import/realsky/sgrastar.mjs';
  import { parallaxMasToLy } from '$lib/import/realsky/positions.mjs';
  import { PIXELS_PER_LY, DEFAULT_MAP_CENTRE_PX } from '$lib/import/realsky/constants.mjs';

  const dispatch = createEventDispatcher();

  // 'new' builds a fresh starmap from the entry screen; 'append' is the map's
  // right-click "Import Real Stars Here…" — the region lands centred on the
  // clicked point, co-located with whatever the map already holds, and the
  // dialogue docks to the side so the live radius ring stays visible.
  export let mode: 'new' | 'append' = 'new';
  export let anchorPx: { x: number; y: number } = DEFAULT_MAP_CENTRE_PX;
  export let anchorLabel = '';
  export let existingSystems: any[] = [];
  export let pixelsPerUnit: number = PIXELS_PER_LY;

  type Centre = { raDeg: number; decDeg: number; distLy: number; label: string };
  const SOL: Centre = { raDeg: 0, decDeg: 0, distLy: 0, label: 'Sol' };

  let presetKey: string | null = null;
  let centre: Centre = SOL;
  let radiusLy = 16.5;
  let fillOut = false;

  let rows: any[] | null = null;
  let rowsCentreKey = '';
  let source: 'live' | 'bundled' | null = null;
  let sourceWarning: string | null = null;
  let loading = false;
  let loadError: string | null = null;

  let starQuery = '';
  let resolving = false;
  let resolveError: string | null = null;

  // Conversion preview for the current rows + radius (instant, client-side).
  let preview: { systems: any[]; collisions: any[]; skipped: any[] } | null = null;

  const centreKey = (c: Centre) => `${c.raDeg}|${c.decDeg}|${c.distLy}`;
  const region = () => ({ centre, radiusLy });

  // In append mode the map draws a live ring at the anchor while the radius
  // slides, so overlap with existing content is visible before importing.
  function announceRadius() {
    if (mode === 'append') dispatch('previewRadius', radiusLy * pixelsPerUnit);
  }

  function refreshPreview() {
    if (!rows) { preview = null; return; }
    const mapCentrePx = mode === 'append' ? anchorPx : DEFAULT_MAP_CENTRE_PX;
    const raw = convertArchiveRows(rows, { region: region(), mapCentrePx, generated: new Date().toISOString().slice(0, 10) });
    // Never import a system id the map already has (re-importing a region, or
    // a map that started from a real-sky import).
    const existingIds = new Set(existingSystems.map((s) => s.id));
    const duplicates = raw.systems.filter((s) => existingIds.has(s.id));
    preview = { ...raw, systems: raw.systems.filter((s) => !existingIds.has(s.id)), duplicates };
    announceRadius();
  }

  // Existing systems that will sit inside the imported region's footprint.
  function overlapping(): any[] {
    if (mode !== 'append') return [];
    const rPx = radiusLy * pixelsPerUnit;
    return existingSystems.filter((s) => {
      const dx = (s.position?.x ?? 0) - anchorPx.x, dy = (s.position?.y ?? 0) - anchorPx.y, dz = s.position?.z ?? 0;
      return Math.sqrt(dx * dx + dy * dy + dz * dz) <= rPx;
    });
  }

  async function loadRowsFor(c: Centre, r: number) {
    loading = true; loadError = null;
    try {
      // Fetch generously (the max slider radius) so slider moves never refetch.
      const result = await loadArchiveRows({ centre: c, radiusLy: Math.max(r, 41) });
      rows = result.rows; source = result.source; sourceWarning = result.warning;
      rowsCentreKey = centreKey(c);
      refreshPreview();
    } catch (e) {
      rows = null; preview = null;
      loadError = (e as Error).message;
    } finally {
      loading = false;
    }
  }

  function pickPreset(p: (typeof REGION_PRESETS)[number]) {
    presetKey = p.key;
    resolveError = null;
    if (p.kind === 'cluster-demo') { preview = null; return; }
    centre = { ...(p.centre as any), label: p.name };
    radiusLy = p.radiusLy as number;
    void loadRowsFor(centre, radiusLy);
  }

  function onRadiusInput() {
    if (rows && rowsCentreKey === centreKey(centre)) refreshPreview();
  }

  async function resolveStar() {
    if (!starQuery.trim()) return;
    resolving = true; resolveError = null;
    try {
      const hits = await runTap('simbad', simbadResolveAdql(starQuery.trim()));
      if (!hits.length) throw new Error(`SIMBAD does not know "${starQuery.trim()}"`);
      const hit = hits[0];
      if (!(hit.plx_value > 0)) throw new Error(`${hit.main_id} has no parallax — cannot place it in 3D`);
      centre = { raDeg: hit.ra, decDeg: hit.dec, distLy: parallaxMasToLy(hit.plx_value), label: String(hit.main_id) };
      presetKey = 'custom';
      await loadRowsFor(centre, radiusLy);
    } catch (e) {
      resolveError = (e as Error).message;
    } finally {
      resolving = false;
    }
  }

  // Design §5b thresholds — counts here are usually tiny, but the guardrail
  // copy ships with the dialogue so bigger sources slot in later.
  function costBand(n: number): 'green' | 'amber' | 'red' {
    return n <= 150 ? 'green' : n <= 500 ? 'amber' : 'red';
  }

  function importRegion() {
    if (!preview || !preview.systems.length) return;
    const p = REGION_PRESETS.find((x) => x.key === presetKey);
    dispatch('previewRadius', 0);
    dispatch('import', {
      kind: 'region',
      mode,
      systems: preview.systems,
      collisions: preview.collisions,
      skipped: preview.skipped,
      fillOut,
      name: presetKey === 'custom' ? `Real sky: ${radiusLy} ly around ${centre.label}` : (p?.name ?? 'Real-sky import'),
      description: `Real-sky import: ${radiusLy} light years around ${centre.label}. Confirmed planets from the NASA Exoplanet Archive (${source === 'live' ? 'live query' : 'bundled snapshot'}); positions are true 3D positions.${fillOut ? ' Filled out with generated worlds (tagged origin/generated) around the confirmed anchors.' : ' Confirmed planets only — nothing invented.'}`
    });
  }

  function importSgrA() {
    const entry = buildSgrAStarSystem();
    if (mode === 'append') entry.position = { x: anchorPx.x, y: anchorPx.y, z: 0 };
    dispatch('previewRadius', 0);
    dispatch('import', {
      kind: 'cluster',
      mode,
      systems: [entry],
      collisions: [], skipped: [], fillOut: false,
      name: SGR_A_MAP_META.name,
      description: SGR_A_MAP_META.description,
      gate: entry.gate
    });
  }

  function close() {
    dispatch('previewRadius', 0);
    dispatch('close');
  }

  $: activePreset = REGION_PRESETS.find((p) => p.key === presetKey);
  $: systemsCount = preview?.systems.length ?? 0;
  $: planetsCount = preview ? preview.systems.reduce((s: number, x: any) => s + x.system.nodes.filter((n: any) => n.roleHint === 'planet').length, 0) : 0;
  $: band = costBand(systemsCount);
</script>

<div class="modal-background" class:docked-wrap={mode === 'append'} role="presentation" on:click|self={() => mode === 'new' && close()}>
  <div class="modal" class:docked={mode === 'append'} role="dialog" aria-label="Import from the real sky">
    <h3>{mode === 'append' ? 'Import real stars here' : 'Import from the real sky'}</h3>
    <p class="intro">
      {#if mode === 'append'}
        A real-sky region will land centred on the point you clicked{anchorLabel ? ` (${anchorLabel})` : ''},
        alongside everything already on the map. The ring on the map shows the footprint as you
        adjust the radius.
      {:else}
        Build a starmap from the astronomy catalogues: true 3D positions, and only planets the
        NASA Exoplanet Archive lists as confirmed. Pick a worked example, or centre on any star
        SIMBAD knows.
      {/if}
    </p>

    <div class="presets">
      {#each REGION_PRESETS as p}
        <button class="preset" class:active={presetKey === p.key} on:click={() => pickPreset(p)}>
          <strong>{p.name}</strong>
          <span>{p.blurb}</span>
        </button>
      {/each}
    </div>

    <div class="custom-row">
      <input
        type="text" placeholder="…or centre on a star (any SIMBAD name: Vega, GJ 581, Polaris)"
        bind:value={starQuery} on:keydown={(e) => e.key === 'Enter' && resolveStar()} />
      <button on:click={resolveStar} disabled={resolving || !starQuery.trim()}>
        {resolving ? 'Resolving…' : 'Resolve'}
      </button>
    </div>
    {#if resolveError}<p class="error">{resolveError}</p>{/if}

    {#if activePreset?.kind === 'cluster-demo'}
      <div class="cluster-demo">
        <p><strong>{SGR_A_MAP_META.name}</strong></p>
        <p>{activePreset.blurb}</p>
        <p class="gate">
          The cluster gate's verdict: these stars orbit on PLAYABLE timescales — S55 completes a
          lap in under 13 years, S2 in 16. A starmap would freeze them; a single system lets you
          watch. Orbit sizes, shapes and periods are the published measurements; orientations are
          illustrative.
        </p>
        <div class="actions">
          <button class="primary" on:click={importSgrA}>Import as a single system</button>
          <button on:click={close}>Cancel</button>
        </div>
      </div>
    {:else if presetKey}
      <label class="radius-row">
        <span>Radius: <strong>{radiusLy} ly</strong> around {centre.label}</span>
        <input type="range" min="4" max="41" step="0.5" bind:value={radiusLy} on:input={() => { onRadiusInput(); announceRadius(); }} />
      </label>

      {#if loading}
        <p class="status">Querying the archive…</p>
      {:else if loadError}
        <p class="error">{loadError}</p>
      {:else if preview}
        <p class="status band-{band}">
          {systemsCount} new {systemsCount === 1 ? 'system' : 'systems'} · {planetsCount} confirmed
          {planetsCount === 1 ? 'planet' : 'planets'}
          {#if preview.collisions.length}
            · {preview.collisions.length} already curated on the bundled map (skipped)
          {/if}
          {#if preview.skipped.length}
            · {preview.skipped.length} host{preview.skipped.length === 1 ? '' : 's'} missing data (skipped, never invented)
          {/if}
          — {source === 'live' ? 'live archive' : 'bundled snapshot'}
        </p>
        {#if sourceWarning}<p class="warning">{sourceWarning}</p>{/if}
        {#if mode === 'append'}
          {@const ov = overlapping()}
          {#if ov.length}
            <p class="warning">{ov.length} existing {ov.length === 1 ? 'system sits' : 'systems sit'} inside this footprint (inside the ring on the map): {ov.slice(0, 6).map((s) => s.name).join(', ')}{ov.length > 6 ? '…' : ''}. New systems import alongside them.</p>
          {/if}
          {#if preview.duplicates?.length}
            <details>
              <summary>Skipped: already on your map</summary>
              <ul>{#each preview.duplicates as d}<li>{d.name}</li>{/each}</ul>
            </details>
          {/if}
        {/if}
        {#if band !== 'green'}
          <p class="warning">Large import: consider a smaller radius.</p>
        {/if}
        {#if preview.collisions.length}
          <details>
            <summary>Skipped: already curated on the bundled Local Neighbourhood</summary>
            <ul>
              {#each preview.collisions as c}
                <li>{c.hostname} ({c.planets} {c.planets === 1 ? 'planet' : 'planets'}) — bundled as {c.bundledSystemId}</li>
              {/each}
            </ul>
          </details>
        {/if}
        {#if preview.skipped.length}
          <details>
            <summary>Skipped: incomplete catalogue data</summary>
            <ul>
              {#each preview.skipped as s}<li>{s.hostname}: {s.reason}</li>{/each}
            </ul>
          </details>
        {/if}

        <label class="fill-row" title="Generated worlds are seeded from the star's catalogue id, so every import of the same star produces the same worlds — and every one is tagged origin/generated so you can always tell them from real detections.">
          <input type="checkbox" bind:checked={fillOut} />
          <span>
            Fill out with plausible worlds — the generator runs around each real star (tuned to its
            mass and light), keeps every confirmed planet as a fixed anchor, and tags everything it
            adds <code>origin/generated</code>. Deterministic: one person's import is everyone's.
          </span>
        </label>

        <div class="actions">
          <button class="primary" disabled={!systemsCount} on:click={importRegion}>
            {systemsCount ? `Import ${systemsCount} ${systemsCount === 1 ? 'system' : 'systems'}` : 'Nothing new to import'}
          </button>
          <button on:click={close}>Cancel</button>
        </div>
      {/if}
    {:else}
      <div class="actions"><button on:click={close}>Cancel</button></div>
    {/if}

    <p class="sources">Sources: NASA Exoplanet Archive · SIMBAD. Star and planet parameters are real where measured; the physics engine derives the rest.</p>
  </div>
</div>

<style>
  .modal-background {
    position: fixed; inset: 0; background: rgba(0, 0, 0, 0.7);
    display: flex; align-items: center; justify-content: center; z-index: 1000;
  }
  .docked-wrap {
    background: transparent;
    pointer-events: none;
    justify-content: flex-end;
    align-items: flex-start;
  }
  .docked-wrap .modal.docked {
    pointer-events: auto;
    margin: 56px 12px 0 0;
    width: min(400px, 40vw);
    max-height: calc(100vh - 70px);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6);
  }
  .modal {
    background: #1e242c; color: #ddd; border: 1px solid #444; border-radius: 8px;
    padding: 1.2rem 1.4rem; width: min(680px, 92vw); max-height: 88vh; overflow-y: auto;
    font-size: 0.9rem;
  }
  h3 { margin: 0 0 0.4rem; color: #fff; }
  .intro { margin: 0 0 0.8rem; color: #aab; }
  .presets { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem; }
  .preset {
    text-align: left; background: #262e38; color: #ccc; border: 1px solid #3a4552;
    border-radius: 6px; padding: 0.5rem 0.6rem; cursor: pointer; display: block;
  }
  .preset strong { display: block; color: #fff; margin-bottom: 0.2rem; }
  .preset span { font-size: 0.78rem; color: #99a5b3; line-height: 1.25; display: block; }
  .preset.active { border-color: #ff5a1f; background: #2c3542; }
  .custom-row { display: flex; gap: 0.5rem; margin: 0.7rem 0 0.2rem; }
  .custom-row input[type='text'] { flex: 1; background: #12161c; color: #ddd; border: 1px solid #3a4552; border-radius: 4px; padding: 0.4rem 0.5rem; }
  .radius-row { display: block; margin: 0.8rem 0 0.4rem; }
  .radius-row input[type='range'] { width: 100%; }
  .status { margin: 0.4rem 0; color: #cdd6df; }
  .status.band-amber { color: #f0b429; }
  .status.band-red { color: #ff6b6b; }
  .warning { color: #f0b429; margin: 0.2rem 0; font-size: 0.82rem; }
  .error { color: #ff6b6b; margin: 0.3rem 0; }
  details { margin: 0.3rem 0; font-size: 0.82rem; color: #99a5b3; }
  details ul { margin: 0.3rem 0 0.3rem 1.2rem; padding: 0; }
  .fill-row { display: flex; gap: 0.5rem; align-items: flex-start; margin: 0.7rem 0; font-size: 0.82rem; color: #b9c2cc; }
  .fill-row input { margin-top: 0.15rem; }
  .fill-row code { color: #ff9a66; }
  .cluster-demo p { margin: 0.35rem 0; }
  .cluster-demo .gate { color: #9fd0ff; font-size: 0.84rem; }
  .actions { display: flex; gap: 0.6rem; margin-top: 0.8rem; }
  .actions button { background: #2c3542; color: #ddd; border: 1px solid #4a5665; border-radius: 5px; padding: 0.45rem 0.9rem; cursor: pointer; }
  .actions button.primary { background: #ff5a1f; border-color: #ff5a1f; color: #fff; }
  .actions button:disabled { opacity: 0.5; cursor: default; }
  .sources { margin: 0.8rem 0 0; font-size: 0.74rem; color: #7d8894; }
</style>
