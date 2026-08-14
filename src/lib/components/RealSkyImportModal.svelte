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
  import { loadArchiveRows, loadStarRows } from '$lib/import/realsky/catalogue.mjs';
  import { convertRegion } from '$lib/import/realsky/convert.mjs';
  import { runTap, simbadResolveAdql, simbadSearchAdql, simbadComponentsAdql, SUGGEST_LIMIT } from '$lib/import/realsky/query.mjs';
  import { toAsciiQuery, displayStarName, designationFor, toCatalogueTerm } from '$lib/import/realsky/starNames.mjs';
  import { buildSgrAStarSystem, SGR_A_MAP_META } from '$lib/import/realsky/sgrastar.mjs';
  import { parallaxMasToLy } from '$lib/import/realsky/positions.mjs';
  import { PIXELS_PER_LY, DEFAULT_MAP_CENTRE_PX } from '$lib/import/realsky/constants.mjs';
  import { CEILING, costBand, estimateCost, suggestRadius } from '$lib/import/realsky/costModel.mjs';

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

  // D18 — the STAR catalogue is the source and the archive is joined onto it, so a star with no
  // confirmed planet arrives like any other. `rows` is still the archive; `starRows` is the census.
  export let rulePack: any = null;
  let starRows: any[] | null = null;
  let solPreset: any = null;

  let rows: any[] | null = null;
  let rowsCentreKey = '';
  let source: 'live' | 'live-proxy' | 'bundled' | null = null;
  let sourceWarning: string | null = null;
  let loading = false;
  let loadError: string | null = null;

  let starQuery = '';
  let resolving = false;
  let resolveError: string | null = null;
  // What the box did on the GM's behalf: the ASCII rewrite it had to make, or the name it actually
  // found. Teaching the designation rather than demanding it (D24).
  let resolveNote: string | null = null;
  // Candidates from the BROWSE fallback, when no star is called exactly what was typed.
  let candidates: any[] = [];
  // Past SUGGEST_LIMIT matches the dialogue asks for a better search instead of listing them. A list
  // of a hundred stars is impractical and not much use; twenty is about the point where scanning it
  // stops being quicker than typing the constellation.
  const SUGGEST_TIMEOUT_MS = 3000;

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
    // The converter decides what is already present, from the ids of the map
    // being imported INTO — none for a new starmap, which is the whole point:
    // a star curated on some other map is not a reason to withhold it here.
    preview = convertRegion(
      { starRows: starRows ?? [], planetRows: rows, solPreset, statTemplates: rulePack?.statTemplates ?? null },
      {
        region: region(),
        mapCentrePx: mode === 'append' ? anchorPx : DEFAULT_MAP_CENTRE_PX,
        existingSystemIds: existingSystems.map((s) => s.id),
        generated: new Date().toISOString().slice(0, 10)
      }
    );
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
      const wide = { centre: c, radiusLy: Math.max(r, 41) };
      // The STAR census is the primary query now; the archive is the enrichment join. Both are
      // fetched at the max slider radius so a slider move never refetches.
      const [starResult, result] = await Promise.all([loadStarRows(wide), loadArchiveRows(wide)]);
      starRows = starResult.rows;
      rows = result.rows;
      // Sol is not in an exoplanet archive - our planets are not exoplanets - and must never be
      // handed an invented system, so it comes from the shipped preset when the region reaches it.
      if (!solPreset) {
        try { solPreset = await (await fetch('/examples/Sol_2030-System.json')).json(); } catch { solPreset = null; }
      }
      source = result.source;
      sourceWarning = starResult.warning ?? result.warning;
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
    resolveError = null; resolveNote = null; candidates = [];
    if (p.kind === 'cluster-demo') { preview = null; return; }
    centre = { ...(p.centre as any), label: (p as any).centreLabel ?? p.name };
    radiusLy = p.radiusLy as number;
    void loadRowsFor(centre, radiusLy);
  }

  function onRadiusInput() {
    if (rows && rowsCentreKey === centreKey(centre)) refreshPreview();
  }

  async function resolveStar() {
    if (!starQuery.trim()) return;
    resolving = true; resolveError = null; resolveNote = null; candidates = [];
    const typed = starQuery.trim();
    // SIMBAD's TAP service REJECTS NON-ASCII outright — "α Scorpii" comes back as an HTTP 400,
    // "Impossible to normalise the identifier … unsupported character encoding". So a Greek letter
    // is turned into its name before the query goes anywhere near the service, and we SAY SO rather
    // than silently searching for something the GM did not type (D24).
    const sent = toAsciiQuery(typed);
    // The rewrite note SURVIVES the result rather than being replaced by it: the point is to teach
    // the designation, and a GM who never sees why "α Scorpii" became "Alpha Scorpii" has not been
    // taught anything.
    const rewrote = sent !== typed ? `Searching for ${typed} as “${sent}” — the catalogue only accepts plain letters.` : '';
    if (rewrote) resolveNote = rewrote;
    try {
      if (!sent) throw new Error(`“${typed}” has no letters or numbers the catalogue can search for.`);
      let hit = (await runTap('simbad', simbadResolveAdql(sent)))[0];
      let via = '';

      // SECOND CHANCE, AND IT IS THE ONE THAT DOES MOST OF THE WORK. The catalogue files stars under
      // its own spelling, so "Epsilon Eridani" is "eps Eri" and "61 Cygni" is "61 Cyg". Folding and
      // asking again costs one fast lookup (~300 ms) and answers with ONE star — far better than
      // offering a list of everything beginning with "Epsilon".
      const folded = toCatalogueTerm(sent);
      if (!hit && folded && folded !== sent) {
        hit = (await runTap('simbad', simbadResolveAdql(folded)))[0];
        if (hit) via = `Found it under the catalogue's own name for it, “${folded}”.`;
      }

      if (!hit) return await suggestFor(sent, rewrote);

      // A HIT WITH NO PARALLAX IS A SYSTEM RECORD, NOT A STAR. "61 Cygni" resolves to the PAIR,
      // which has no distance of its own; its two components do. Offering those is a two-row answer
      // to a question that used to dead-end on an apology.
      if (!(hit.plx_value > 0)) {
        const name = displayStarName(hit.main_id);
        const parts = await runTap('simbad', simbadComponentsAdql(hit.main_id));
        if (!parts.length) throw new Error(`${name} has no measured distance in the catalogue, so it cannot be placed in 3D.`);
        candidates = parts;
        resolveNote = [rewrote, `${name} is a ${parts.length === 2 ? 'pair' : 'system'} with no distance of its own. Pick the star to centre on:`]
          .filter(Boolean).join(' ');
        return;
      }
      await useCandidate(hit, [rewrote, via].filter(Boolean).join(' '));
    } catch (e) {
      resolveError = readableTapError(e, sent);
      resolveNote = null;
      candidates = [];
    } finally {
      resolving = false;
    }
  }

  // Nothing resolved. Offer a SHORT list if there is one, and otherwise ask for more rather than
  // dumping the catalogue.
  //
  // A multi-word term is never sent as a prefix search: a LIKE containing a space defeats SIMBAD's
  // index and takes eighteen seconds (see query.mjs). It has already had its exact and folded
  // lookups, so there is nothing cheap left to try.
  async function suggestFor(sent: string, rewrote: string) {
    const term = toCatalogueTerm(sent);
    if (/\s/.test(term)) throw new Error(notFoundMessage(sent));
    // THE SUGGESTION IS OPTIONAL, SO IT GETS A BUDGET. A prefix that matches nothing can still cost
    // a full scan — "zzznotastar" measured at 20 SECONDS — and a typo is exactly the case where a
    // GM is most likely to be waiting on this. Past three seconds the plain "no such star" answer is
    // better than a slow clever one, and the abort costs nothing when the query is quick (70-300 ms
    // for every term that actually matches something).
    let rows: any[] = [];
    try {
      rows = await runTap('simbad', simbadSearchAdql(term), { signal: AbortSignal.timeout(SUGGEST_TIMEOUT_MS) });
    } catch {
      throw new Error(notFoundMessage(sent));
    }
    if (!rows.length) throw new Error(notFoundMessage(sent));
    if (rows.length > SUGGEST_LIMIT) {
      // The query asked for one more than it will show, so this is "at least 21", not "exactly 21".
      // The example must be the DESIGNATION, not the proper name: the advice is "add the
      // constellation", and answering "for example, Ran" demonstrates the opposite of that.
      const example = designationFor(rows[0].main_id) ?? displayStarName(rows[0].main_id);
      throw new Error(
        `“${sent}” matches more than ${SUGGEST_LIMIT} stars — it names one in each constellation. ` +
        `Add the constellation and search again, for example “${example}”.`
      );
    }
    candidates = rows;
    resolveNote = [rewrote, `No star is called exactly “${sent}”. ${rows.length === 1 ? 'The nearest match is' : `These ${rows.length} match`}, nearest first:`]
      .filter(Boolean).join(' ');
  }

  async function useCandidate(hit: any, lead = '') {
    candidates = [];
    centre = { raDeg: hit.ra, decDeg: hit.dec, distLy: parallaxMasToLy(hit.plx_value), label: displayStarName(hit.main_id) };
    // Name the object we actually found, since it may not be spelled the way the GM typed it.
    const found = displayStarName(hit.main_id);
    const foundNote = found.toLowerCase() === toAsciiQuery(starQuery).toLowerCase() ? '' : `Found ${found}.`;
    resolveNote = [lead, lead.includes(found) ? '' : foundNote].filter(Boolean).join(' ') || null;
    presetKey = 'custom';
    await loadRowsFor(centre, radiusLy);
  }

  async function pickCandidate(hit: any) {
    resolving = true; resolveError = null;
    try {
      await useCandidate(hit);
    } catch (e) {
      resolveError = readableTapError(e, String(hit.main_id));
    } finally {
      resolving = false;
    }
  }

  const distanceLy = (plxMas: number) => parallaxMasToLy(plxMas);

  function notFoundMessage(sent: string) {
    // "Barnards Star" fails where "Barnard's Star" works, and a bare surname finds nothing — so the
    // dead end names what usually causes it rather than just reporting the absence.
    const hint = /^[A-Za-z]+$/.test(sent)
      ? ' Try the full name, or a designation like “alf Cen” or “HD 95735”.'
      : ' Check the spelling, including any apostrophe — the catalogue matches names exactly.';
    return `The catalogue has no star called “${sent}”.${hint}`;
  }

  // TWO ERROR PATHS, NEITHER OF THEM PRESENTABLE (D24). A failed lookup used to print either the
  // browser's bare "Failed to fetch" or several hundred characters of VOTABLE XML — the service's
  // own error document, namespace declarations and all — straight at the GM. Both become a sentence.
  function readableTapError(e: unknown, sent: string): string {
    const raw = e instanceof Error ? e.message : String(e);
    if (!/TAP: HTTP/.test(raw)) {
      // Not the service answering — the request never completed. Anything else (including our own
      // thrown messages above) is already a sentence and passes through.
      return /fetch|network|load failed/i.test(raw)
        ? 'Could not reach the star catalogue. Check the connection and try again — the service is occasionally down for maintenance.'
        : raw;
    }
    const status = /HTTP (\d+)/.exec(raw)?.[1] ?? '';
    // The service does explain itself, inside the XML. Lift the sentence and drop the envelope.
    const cause = /CAUSE:\s*([^<"\n]+)/.exec(raw)?.[1]?.trim()
      ?? /Incorrect ADQL query:\s*([^<"\n]+)/.exec(raw)?.[1]?.trim();
    if (status === '400') return `The catalogue could not read “${sent}” as a name${cause ? ` (${cause})` : ''}.`;
    if (status.startsWith('5')) return 'The star catalogue is having trouble at its end. Try again in a moment.';
    return `The star catalogue refused the request${status ? ` (error ${status})` : ''}. Try a different name.`;
  }

  // Size guardrails (§5b) live in costModel.mjs so they can be tested against
  // counts the confirmed-planet catalogue never reaches — see the note there.
  // This supplies the one thing the model cannot: how many systems a given
  // radius would actually yield, converted client-side from rows in hand.
  function countAt(r: number): number {
    if (!rows) return 0;
    const mapCentrePx = mode === 'append' ? anchorPx : DEFAULT_MAP_CENTRE_PX;
    const out = convertRegion(
      { starRows: starRows ?? [], planetRows: rows, solPreset, statTemplates: rulePack?.statTemplates ?? null },
      {
        region: { centre, radiusLy: r }, mapCentrePx,
        existingSystemIds: existingSystems.map((s) => s.id), generated: 'count'
      }
    );
    return out.systems.length;
  }

  function applySuggestion(r: number) {
    radiusLy = r;
    onRadiusInput();
    announceRadius();
  }

  // The red band is gated, never silently truncated: a truncated "census" is a
  // lie, so the GM either shrinks the region deliberately or owns the big map
  // deliberately, having been told what it costs.
  function importBig() {
    const c = estimateCost(preview?.systems ?? []);
    const ok = confirm(
      `${systemsCount} systems, ${c.size}, ${c.time} — every time this map loads, plus slower autosave and player broadcast.\n\n` +
      `Import anyway?`
    );
    if (ok) importRegion();
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
      description: `Real-sky import: ${radiusLy} light years around ${centre.label}. Confirmed planets from the NASA Exoplanet Archive (${source?.startsWith('live') ? 'live query' : 'bundled snapshot'}); positions are true 3D positions.${fillOut ? ' Filled out with generated worlds (tagged origin/generated) around the confirmed anchors.' : ' Confirmed planets only — nothing invented.'}`
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
  // Both recompute off `preview`, which changes on every radius/centre move.
  $: cost = preview ? estimateCost(preview.systems) : null;
  $: suggestion = preview && band !== 'green' ? suggestRadius(radiusLy, countAt) : null;
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
        Build a starmap from the astronomy catalogues: every known star in the region at its true
        3D position, with the planets the NASA Exoplanet Archive lists as confirmed attached where
        it has them. Pick a worked example, or centre on any star SIMBAD knows.
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
      {#if resolveNote}<p class="resolve-note">{resolveNote}</p>{/if}
      {#if candidates.length}
        <ul class="candidates">
          {#each candidates as c (c.main_id)}
            <li>
              <button type="button" on:click={() => pickCandidate(c)} disabled={resolving}>
                <span class="cand-name">{displayStarName(c.main_id)}</span>
                {#if designationFor(c.main_id)}<span class="cand-desig">{designationFor(c.main_id)}</span>{/if}
                <span class="cand-facts">{c.sp_type ? c.sp_type + ' · ' : ''}{distanceLy(c.plx_value).toFixed(1)} ly</span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}

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
            · {preview.collisions.length} already on this map (skipped)
          {/if}
          {#if preview.skipped.length}
            · {preview.skipped.length} host{preview.skipped.length === 1 ? '' : 's'} missing data (skipped, never invented)
          {/if}
          — {source?.startsWith('live') ? 'live archive' : 'bundled snapshot'}
          {#if cost && systemsCount}
            · {cost.size} · {cost.time} — {cost.reading}
          {/if}
        </p>
        {#if sourceWarning}<p class="warning">{sourceWarning}</p>{/if}
        {#if mode === 'append'}
          {@const ov = overlapping()}
          {#if ov.length}
            <p class="warning">{ov.length} existing {ov.length === 1 ? 'system sits' : 'systems sit'} inside this footprint (inside the ring on the map): {ov.slice(0, 6).map((s) => s.name).join(', ')}{ov.length > 6 ? '…' : ''}. New systems import alongside them.</p>
          {/if}
        {/if}
        {#if band !== 'green'}
          <div class="tone-down">
            <span class="warning">
              {band === 'red' ? 'Very large import.' : 'Large import.'}
              {#if suggestion}Tap to shrink it:{:else}Every radius on this slider is this busy — the region itself is dense.{/if}
            </span>
            {#if suggestion}
              <button class="chip" on:click={() => applySuggestion(suggestion.radiusLy)}>
                Radius {suggestion.radiusLy} ly → {suggestion.count} systems
              </button>
            {/if}
          </div>
        {/if}
        {#if preview.collisions.length}
          <details>
            <summary>Skipped: already on this map</summary>
            <ul>
              {#each preview.collisions as c}
                <li>{c.hostname} ({c.planets} {c.planets === 1 ? 'planet' : 'planets'}) — already here as {c.systemId}</li>
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
          {#if systemsCount > CEILING}
            <button class="primary" disabled title="Shrink the region — this many systems would make the map unusable.">
              Too large to import ({systemsCount} systems)
            </button>
          {:else if band === 'red'}
            <button class="primary caution" on:click={importBig}>Import anyway (not recommended)</button>
          {:else}
            <button class="primary" disabled={!systemsCount} on:click={importRegion}>
              {systemsCount ? `Import ${systemsCount} ${systemsCount === 1 ? 'system' : 'systems'}` : 'Nothing new to import'}
            </button>
          {/if}
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
  .tone-down { display: flex; flex-wrap: wrap; align-items: center; gap: 0.4rem; margin: 0.3rem 0; }
  .chip {
    background: #2c3542; color: #cdd6df; border: 1px solid #4a5665;
    border-radius: 999px; padding: 0.2rem 0.6rem; font-size: 0.78rem; cursor: pointer;
  }
  .chip:hover { border-color: #ff5a1f; color: #fff; }
  .actions button.primary.caution { background: #a8431a; border-color: #a8431a; }
  .error { color: #ff6b6b; margin: 0.3rem 0; }
  /* Not an error — what the box did on the GM's behalf, so the designation is taught rather than
     demanded ("Searching for α Scorpii as Alpha Scorpii", "Found Antares"). */
  .resolve-note { color: #99a5b3; margin: 0.3rem 0; font-size: 0.82rem; }
  /* The browse fallback's candidate list. Nearest first, so the top of the list is the answer most
     of the time; the designation sits beside the name so a GM who typed "Epsilon Eri" and is offered
     "Ran" can see they are the same star. */
  .candidates { list-style: none; margin: 0.35rem 0 0; padding: 0; max-height: 15rem; overflow-y: auto; border: 1px solid #2b3542; border-radius: 4px; }
  .candidates li + li { border-top: 1px solid #232c37; }
  .candidates button { display: flex; align-items: baseline; gap: 0.5rem; width: 100%; text-align: left; background: none; border: 0; padding: 0.4rem 0.6rem; color: inherit; cursor: pointer; font-size: 0.85rem; }
  .candidates button:hover:not(:disabled) { background: #1d2530; }
  .candidates button:disabled { opacity: 0.5; cursor: default; }
  .cand-name { font-weight: 600; }
  .cand-desig { color: #99a5b3; }
  .cand-facts { margin-left: auto; color: #7f8b99; white-space: nowrap; }
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
