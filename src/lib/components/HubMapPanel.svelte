<script lang="ts">
  // EXPLORERS MAPS, LISTED INSIDE THE APP - R-20 / G98, Stream AA job 1.
  //
  // The owner, 2026-09-11: *"the load/new map modals are going to link to those available on the
  // Explorers site RATHER than default ones shipped"*, as *"a list INSIDE SSE to single click and
  // load"*. This is that list, and it is ONE component in both screens: Load Starmap shows everything
  // shared, New Starmap starts on the owner's starter maps (`HUB.starterTag`). The two differ in
  // where they start and in nothing else, so they are one list parameterised rather than two to keep
  // in step.
  //
  // WHAT IT DOES NOT DO, and each one is a rule rather than an omission:
  //  - IT OPENS NOTHING. A click hands the chosen map up as an `open` event; the route gives its
  //    `downloadUrl` to `runHubOpenFromUrl`, the same function `?open=` uses, so a map picked here is
  //    fetched, classified, asked about and opened by the one door (engine map DATA-R35). A second
  //    loader is exactly the fault that door exists to prevent.
  //  - IT NEVER SHOWS A BLANK LIST. Fetching, failed and empty are three different things a GM
  //    needs told apart, and an empty box says none of them.
  //  - IT IS NOT A COPY OF THE HUB'S CARD. The hub's cards are its own design; this is the app's
  //    load-screen row, with the fields R-20 names.
  import { createEventDispatcher, onMount } from 'svelte';
  import { HUB } from '$lib/hub/hubConfig';
  import { fetchHubMapList, HUB_MAP_SORTS, type HubMapSort, type HubMapSummary } from '$lib/hub/hubMapList';

  /** Start on the owner's starter maps (the New Starmap screen) rather than on everything shared. */
  export let startWithStarters = false;

  const dispatch = createEventDispatcher<{ open: HubMapSummary }>();

  let starters = startWithStarters;
  let sort: HubMapSort = HUB_MAP_SORTS[0].id;
  let page = 1;

  type View =
    | { phase: 'loading' }
    | { phase: 'problem'; problem: string }
    | { phase: 'ready'; maps: HubMapSummary[]; hasMore: boolean };
  let view: View = { phase: 'loading' };

  // Every request is numbered, and only the newest may write the view. Changing the order twice in
  // quick succession otherwise lets the SLOWER answer land last and show the list for the order the
  // GM already moved away from.
  let latest = 0;
  async function load() {
    const mine = ++latest;
    view = { phase: 'loading' };
    const result = await fetchHubMapList({ kind: 'starmap', sort, page, tag: starters ? HUB.starterTag : null });
    if (mine !== latest) return;
    if (!result.ok) {
      view = { phase: 'problem', problem: result.problem };
      return;
    }
    page = result.page;
    view = { phase: 'ready', maps: result.maps, hasMore: result.hasMore };
  }

  onMount(load);

  function chooseSort(event: Event) {
    sort = (event.currentTarget as HTMLSelectElement).value as HubMapSort;
    page = 1;
    load();
  }

  function chooseScope(wantStarters: boolean) {
    if (starters === wantStarters) return;
    starters = wantStarters;
    page = 1;
    load();
  }

  function turnPage(by: number) {
    page = Math.max(1, page + by);
    load();
  }

  function counted(n: number, one: string, many = `${one}s`): string {
    return `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
  }

  /** What is IN the map. Always shown: a campaign with no bodies is worth knowing before opening it. */
  function contents(m: HubMapSummary): string {
    const parts = [counted(m.system_count, 'system'), counted(m.body_count, 'body', 'bodies')];
    if (m.construct_count) parts.push(counted(m.construct_count, 'construct'));
    return parts.join(' · ');
  }

  /**
   * How it has been RECEIVED. "Starred" rather than "3 stars", because on a line under "42 systems"
   * in a star-system app, "3 stars" reads as a count of suns.
   */
  function reception(m: HubMapSummary): string {
    const parts: string[] = [];
    if (m.hearts_count) parts.push(`starred ${m.hearts_count.toLocaleString('en-GB')}`);
    if (m.comments_count) parts.push(counted(m.comments_count, 'comment'));
    parts.push(counted(m.download_count, 'download'));
    return parts.join(' · ');
  }
</script>

<section class="hub-maps" aria-label="Maps shared on Explorers">
  <div class="hub-maps-bar">
    <div class="hub-maps-scope" role="group" aria-label="Which maps">
      <button type="button" aria-pressed={starters} class:on={starters} on:click={() => chooseScope(true)}>Starter maps</button>
      <button type="button" aria-pressed={!starters} class:on={!starters} on:click={() => chooseScope(false)}>All shared maps</button>
    </div>
    <label class="hub-maps-sort">
      <span>Order</span>
      <select value={sort} on:change={chooseSort}>
        {#each HUB_MAP_SORTS as s}
          <option value={s.id}>{s.label}</option>
        {/each}
      </select>
    </label>
  </div>

  {#if view.phase === 'loading'}
    <p class="hub-maps-line" role="status">Asking Explorers for its maps…</p>
  {:else if view.phase === 'problem'}
    <div class="hub-maps-line problem" role="alert">
      <p>{view.problem}</p>
      <button type="button" on:click={load}>Try again</button>
    </div>
  {:else if view.maps.length === 0}
    <div class="hub-maps-line">
      {#if page > 1}
        <p>No more maps.</p>
        <button type="button" on:click={() => turnPage(-1)}>Back a page</button>
      {:else if starters}
        <p>No starter maps on Explorers yet.</p>
        <button type="button" on:click={() => chooseScope(false)}>Show all shared maps</button>
      {:else}
        <p>Nobody has shared a campaign on Explorers yet.</p>
      {/if}
    </div>
  {:else}
    <ul class="hub-maps-list">
      {#each view.maps as m (m.slug)}
        <li class="hub-map">
          <button type="button" class="hub-map-open" title={`Open "${m.title}"`} on:click={() => dispatch('open', m)}>
            {#if m.coverUrl}
              <img class="hub-map-cover" src={m.coverUrl} alt="" width="120" height="63" loading="lazy" decoding="async" referrerpolicy="no-referrer" />
            {:else}
              <span class="hub-map-cover none" aria-hidden="true"></span>
            {/if}
            <span class="hub-map-text">
              <strong>{m.title}</strong>
              {#if m.creator}<small class="hub-map-creator">by {m.creator.name}</small>{/if}
              <!-- SAID, NOT HIDDEN (hub D-89: "last, not hidden"). The hub already sorts these after
                   every map that opens; the card tells a GM before they click rather than after. -->
              {#if m.needsAFix}<small class="hub-map-fix">Explorers found a problem in this file, so it may not open.</small>{/if}
              {#if m.blurb}<small class="hub-map-blurb">{m.blurb}</small>{/if}
              <small class="hub-map-counts">{contents(m)}</small>
              <small class="hub-map-counts">{reception(m)}</small>
            </span>
          </button>
          {#if m.url}
            <a class="hub-map-page" href={m.url} target="_blank" rel="noopener noreferrer" title={`Read about "${m.title}" on Explorers`}>About</a>
          {/if}
        </li>
      {/each}
    </ul>
    {#if page > 1 || view.hasMore}
      <div class="hub-maps-pages">
        <button type="button" disabled={page <= 1} on:click={() => turnPage(-1)}>Previous</button>
        <span>Page {page}</span>
        <button type="button" disabled={!view.hasMore} on:click={() => turnPage(1)}>Next</button>
      </div>
    {/if}
  {/if}

  <!-- Still a real link to the library, for everything a list of ten cannot do - search, tags, a
       map's whole write-up. The words match the system chooser's "Browse shared maps". -->
  <a class="hub-maps-site" href={HUB.browseUrl} target="_blank" rel="noopener noreferrer">Browse shared maps on Explorers, in a new tab</a>
</section>

<style>
  .hub-maps {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .hub-maps-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }
  .hub-maps-scope {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: 4px;
    overflow: hidden;
  }
  .hub-maps-scope button {
    background: var(--bg-control);
    color: var(--text-faint);
    border: none;
    padding: 4px 10px;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .hub-maps-scope button + button {
    border-left: 1px solid var(--border);
  }
  .hub-maps-scope button.on {
    color: var(--text);
    box-shadow: inset 0 -2px 0 var(--accent, #7aa2f7);
  }
  .hub-maps-sort {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 0.8rem;
    color: var(--text-faint);
  }
  .hub-maps-sort select {
    background-color: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 4px;
    font: inherit;
    font-size: 0.8rem;
  }
  .hub-maps-line {
    margin: 0;
    padding: 10px 2px;
    color: var(--text-faint);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .hub-maps-line p {
    margin: 0 0 6px;
  }
  .hub-maps-line.problem p {
    color: var(--text);
  }
  .hub-maps-line button,
  .hub-maps-pages button {
    background: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 3px 10px;
    font: inherit;
    font-size: 0.8rem;
    cursor: pointer;
  }
  .hub-maps-pages button:disabled {
    opacity: 0.5;
    cursor: default;
  }
  .hub-maps-list {
    list-style: none;
    margin: 0;
    padding: 0;
    /* The list scrolls inside the dialog rather than pushing the file and paste options off it:
       ten rows is more than either load screen has room for below its heading. */
    max-height: min(44vh, 24rem);
    overflow-y: auto;
  }
  .hub-map {
    display: flex;
    align-items: stretch;
    gap: 4px;
    margin-bottom: 6px;
  }
  .hub-map-open {
    /* BORDER-BOX, for the reason `LoadSourceModal` records: this app has no global reset, and a
       padded full-width button overflows its card by its own padding. */
    box-sizing: border-box;
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    gap: 10px;
    align-items: flex-start;
    text-align: left;
    background-color: var(--bg-control);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 6px 8px;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  .hub-map-open:hover,
  .hub-map-open:focus-visible {
    border-color: var(--accent, #7aa2f7);
  }
  .hub-map-cover {
    flex: 0 0 auto;
    width: 96px;
    height: 50px;
    object-fit: cover;
    border-radius: 3px;
    background: var(--bg-panel);
  }
  .hub-map-cover.none {
    display: block;
    border: 1px dashed var(--border);
    box-sizing: border-box;
  }
  .hub-map-text {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }
  .hub-map-text strong {
    /* TWO LINES, NOT ONE WITH AN ELLIPSIS: on a phone the cover and the About link leave the title
       about 120px, and a single line read "Local Neigh..." - the one word that tells two maps apart
       is the one that got cut. Seen at 375px. */
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    font-size: 0.9rem;
    line-height: 1.25;
    overflow-wrap: anywhere;
  }
  .hub-map-creator {
    color: var(--text-faint);
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .hub-map-fix {
    color: var(--warning, #e8a33d);
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .hub-map-blurb {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text);
    font-size: 0.8rem;
    line-height: 1.3;
  }
  .hub-map-counts {
    color: var(--text-faint);
    font-size: 0.75rem;
    line-height: 1.3;
  }
  .hub-map-page {
    flex: 0 0 auto;
    align-self: center;
    font-size: 0.75rem;
    color: var(--text-faint);
    padding: 4px;
  }
  .hub-map-page:hover,
  .hub-map-page:focus-visible {
    color: var(--accent, #7aa2f7);
  }
  .hub-maps-pages {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
    font-size: 0.8rem;
    color: var(--text-faint);
  }
  /* On a phone the cover gives up width to the title, and the title gets a third line: measured at
     375px the text column is 134px, and "Local Neighbourhood (Default)" needs three. */
  @media (max-width: 480px) {
    .hub-map-cover {
      width: 64px;
      height: 34px;
    }
    .hub-map-open {
      gap: 8px;
    }
    .hub-map-text strong {
      -webkit-line-clamp: 3;
    }
  }
  .hub-maps-site {
    align-self: flex-end;
    font-size: 0.78rem;
    color: var(--text-faint);
  }
  .hub-maps-site:hover,
  .hub-maps-site:focus-visible {
    color: var(--accent, #7aa2f7);
  }
</style>
