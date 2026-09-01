<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { parseHubReference } from '$lib/hub/hubClient';
  import type { RulePack } from '$lib/types';
  import { APP_VERSION, APP_DATE } from '$lib/constants';
  import { loadBaseMapManifest } from '$lib/map/baseMapManifest';

  export let rulepacks: RulePack[];
  export let hasSavedStarmap: boolean;

  const dispatch = createEventDispatcher();

  // R-05: whatever the GM pasted, reduced to a map code by the one parser the URL path also uses.
  let hubRef = '';
  function openShared() {
    const slug = parseHubReference(hubRef);
    if (slug) dispatch('openHub', slug);
  }

  // The bundled starter maps, read from the shipped manifest so a new one appears here by shipping data,
  // never by editing this component. Falls back to the original single entry if the manifest is unreadable
  // — this is the screen a first-time user lands on, and it must always offer a way in.
  const FALLBACK = [{ file: 'Local_Neighbourhood-Starmap.json', name: 'Local Neighbourhood', description: '' }];
  let exampleMaps: { file: string; name: string; description?: string }[] = FALLBACK;
  onMount(async () => {
    const manifest = await loadBaseMapManifest();
    if (manifest?.maps?.length) {
      exampleMaps = manifest.maps.map((m) => ({ file: m.file, name: m.name, description: m.description }));
    }
  });

  // The intro blurb alternates on each appearance: Option 1 (physics-forward) on the
  // first display, Option 2 (GM-facing) on the next, and so on. The chosen index is
  // persisted so it advances across sessions, not just within one.
  const SPLASH_BLURBS = [
    'A procedural generator for scientifically-plausible star systems, with a real-time orbital visualiser and a multi-system starmap. Every world is derived from real physics — composition, oceans, magnetism, geology and true colour — and you can fly your own spacecraft between them: efficient transfers, hard burns, or relativistic interstellar jumps, with fuel, time and hazard all calculated.',
    "Build scientifically-plausible star systems for your sci-fi table and bring them to life. Every world is derived from real physics; a real-time orrery and starmap let you fly efficient transfers, hard burns or relativistic interstellar journeys; NPC ships run their own routes on autopilot; and you can design a player view and serve it live, redacted, straight to your players' own devices.",
  ];
  let blurbIndex = 0;
  if (typeof localStorage !== 'undefined') {
    const stored = Number(localStorage.getItem('splash-blurb-index'));
    blurbIndex = Number.isFinite(stored) ? ((stored % SPLASH_BLURBS.length) + SPLASH_BLURBS.length) % SPLASH_BLURBS.length : 0;
    localStorage.setItem('splash-blurb-index', String((blurbIndex + 1) % SPLASH_BLURBS.length));
  }

  let starmapName = 'My Starmap';
  // Only one rule pack exists, so it is applied automatically rather than offered as a choice.
  let selectedRulepack: RulePack | undefined = rulepacks && rulepacks.length > 0 ? rulepacks[0] : undefined;
  // The unit choice doubles as the scaling mode: ly/pc are scaled maps, diagrammatic is abstract.
  let unitChoice: 'ly' | 'pc' | 'diagrammatic' = 'ly';
  let abstractUnit = 'J';
  let abstractOrder: 'prefix' | 'suffix' = 'prefix';

  function createStarmap() {
    const diagrammatic = unitChoice === 'diagrammatic';
    dispatch('create', {
      name: starmapName,
      rulepack: selectedRulepack,
      distanceUnit: diagrammatic ? (abstractUnit.trim() || 'J') : unitChoice,
      unitIsPrefix: diagrammatic ? abstractOrder === 'prefix' : false,
      mapMode: diagrammatic ? 'diagrammatic' : 'scaled',
    });
  }
</script>

<div class="modal-background">
  <div class="modal">
    <div class="left-pane">
        <img src="/images/ui/SSE-Logo.png" alt="Star System Explorer" class="main-logo" />
        
        <p>{SPLASH_BLURBS[blurbIndex]}</p>

        <p>For discussion, feedback, bugs and suggestions go to <a href="https://discord.gg/UAEq4zzjD8" target="_blank">Our Discord</a>.</p>

        <p>A <a href="https://youtu.be/LrgNh2PVOlg" target="_blank">video explainer on YouTube</a> to get you started.</p>
    </div>

    <div class="right-pane">
        <!-- Three ways in, in the order a new GM should meet them: a finished example to
             explore, real or saved data to bring in, an empty map to build on. -->
        <section class="option-group">
            <h3>Start from an example</h3>
            <!-- The starter maps come from the shipped manifest, so adding a bundled map is a data change
                 and never a code change. While it loads (or if it cannot be read) the original single
                 button stands in, so this screen always offers a way to start. -->
            {#each exampleMaps as m}
              <button class="option" title={m.description ?? ''} on:click={() => dispatch('loadExampleStarmap', m.file)}>
                <strong>{m.name}</strong>
                {#if m.description}<small>{m.description}</small>{/if}
              </button>
            {/each}
        </section>

        <section class="option-group">
            <h3>Bring in a map</h3>
            <button class="option" on:click={() => dispatch('realSkyImport')}>
              <strong>Import from the Real Sky…</strong>
              <small>Real stars at true 3D positions from the astronomy catalogues — confirmed planets only, or filled out with generated worlds around them.</small>
            </button>
            <button class="option" on:click={() => dispatch('upload')}>
              <strong>Upload a starmap file</strong>
              <small>Load a starmap saved from this app — a .json file, or a .sse.zip bundle if it carries pictures or ship models.</small>
            </button>
            <!-- R-05: the same funnel a `?hub=` link uses, for somebody who has the link but is
                 already in the app. Paste whatever they actually copied: the hub's page for the
                 map, the one-click link out of a Discord, or a bare map code. -->
            <div class="option hub-open">
              <strong>Open a shared map</strong>
              <small>Paste a link from the map library, or the map's code. Opening replaces the campaign in this browser, so you will be asked first.</small>
              <div class="hub-open-row">
                <input
                  type="text"
                  bind:value={hubRef}
                  placeholder="Paste a shared-map link"
                  aria-label="Shared map link or code"
                  on:keydown={(e) => { if (e.key === 'Enter') openShared(); }}
                />
                <button type="button" disabled={!parseHubReference(hubRef)} on:click={openShared}>Open</button>
              </div>
              {#if hubRef.trim() && !parseHubReference(hubRef)}
                <small class="hub-open-hint">That does not look like a shared-map link yet.</small>
              {/if}
            </div>
        </section>

        <section class="option-group new-starmap-form">
            <h3>Start empty</h3>
            <label class="form-row">
            <span>Starmap Name:</span>
            <input type="text" bind:value={starmapName} />
            </label>

            <div class="form-row-group">
                <label>
                Distance/Scaling units:
                <select bind:value={unitChoice}>
                  <option value="ly">Light Years (ly)</option>
                  <option value="pc">Parsecs (pc)</option>
                  <option value="diagrammatic">Diagrammatic (not scaled)</option>
                </select>
                </label>
                {#if unitChoice === 'diagrammatic'}
                  <label>
                  Abstract unit:
                  <input type="text" bind:value={abstractUnit} placeholder="e.g. J for Jump" maxlength="6" />
                  </label>
                  <label>
                  Unit order:
                  <select bind:value={abstractOrder}>
                    <option value="prefix">Before the number ({abstractUnit.trim() || 'J'}8)</option>
                    <option value="suffix">After the number (8 {abstractUnit.trim() || 'J'})</option>
                  </select>
                  </label>
                {/if}
            </div>
            <div class="buttons">
            <button on:click={createStarmap}>Create Vast Nothingness</button>
            </div>
        </section>

        <div class="version-info">
            <span>v{APP_VERSION}</span> | <span>{APP_DATE}</span>
        </div>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal {
    background-color: var(--bg-panel);
    padding: 30px;
    border-radius: 8px;
    display: flex;
    flex-direction: row; /* Horizontal layout */
    gap: 30px;
    color: var(--text);
    max-width: 900px; /* Increased width to accommodate two panes */
    width: 90%;
    max-height: 90vh;
    overflow-y: auto;
    text-align: left;
    box-shadow: 0 4px 20px rgba(0,0,0,0.5);
  }

  .left-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
    border-right: 1px solid var(--border);
    padding-right: 30px;
  }

  .right-pane {
    flex: 1;
    display: flex;
    flex-direction: column;
    justify-content: center;
  }

  .main-logo {
    max-width: 100%;
    height: auto;
    margin: 0 auto 20px auto;
    display: block;
  }

  .version-info {
    margin-top: 20px; /* Reduced gap instead of auto */
    padding-top: 10px;
    font-size: 0.75em;
    color: var(--text-faint);
    text-align: right;
  }

  .option-group {
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 10px 12px 12px;
    margin-bottom: 12px;
  }
  .option-group h3 {
    margin: 0 0 8px;
    font-size: 0.8em;
    text-transform: uppercase;
    letter-spacing: 0.06em;
    color: var(--text-faint);
  }
  .option {
    display: block;
    width: 100%;
    text-align: left;
    margin-bottom: 6px;
  }
  .option:last-child { margin-bottom: 0; }
  .option strong { display: block; }
  .option small {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    color: var(--text-faint);
    font-weight: normal;
    line-height: 1.3;
  }

  .modal input[type="text"],
  .modal select {
    background-color: var(--bg-control);
    color: var(--text);
    border: 1px solid var(--border);
    padding: 5px;
    border-radius: 3px;
  }

  .modal button {
    background-color: var(--accent);
    color: var(--text);
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
    transition: background-color 0.2s;
  }

  .modal button:hover {
    background-color: #0056b3;
  }

  .modal button:disabled {
    background-color: var(--bg-control);
    cursor: not-allowed;
  }

  /* Option cards read as choices, not actions: quiet until hovered, so the one
     true ACTION button (Create) keeps the accent to itself. */
  .modal button.option {
    background-color: var(--bg-control);
    border: 1px solid var(--border);
  }
  .modal button.option:hover {
    background-color: var(--bg-control);
    border-color: var(--accent);
  }

  /* The paste-a-link card is a DIV, not a button: it holds a field, so the whole card cannot be
     one click target. It borrows the option card's look so the group still reads evenly. */
  .option.hub-open {
    background-color: var(--bg-control);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 8px 15px;
    font-weight: bold;
  }
  .hub-open-row {
    display: flex;
    gap: 6px;
    margin-top: 8px;
  }
  .hub-open-row input[type="text"] {
    flex: 1 1 auto;
    min-width: 0;
  }
  .hub-open-row button {
    padding: 5px 12px;
    white-space: nowrap;
  }
  .hub-open-hint {
    display: block;
    margin-top: 4px;
    font-weight: normal;
    color: var(--text-faint);
  }

  .new-starmap-form {
    padding-top: 0;
  }
  
  .new-starmap-form h3 {
      margin-top: 0;
      margin-bottom: 1em;
      text-align: center;
  }

  .form-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .form-row span {
    margin-right: 1rem;
    min-width: 100px;
  }

  .form-row input,
  .form-row select {
    flex-grow: 1;
  }

  .form-row-group {
    display: flex;
    flex-direction: column; /* Stacked for better fit in column */
    gap: 0.5rem;
    margin-bottom: 1rem;
    background: var(--bg-control);
    padding: 10px;
    border-radius: 4px;
  }
  
  .form-row-group label {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .checkbox-label {
    white-space: normal; /* Allow wrapping */
    font-size: 0.9em;
    display: flex;
    align-items: center;
    justify-content: flex-start !important; /* Move content to the left */
    gap: 0.8rem; /* Increased gap to move checkbox relatively right */
    padding-left: 20px; /* Move the whole row right */
    cursor: pointer;
  }

  .buttons {
    display: flex;
    justify-content: center;
    margin-top: 1em;
  }
  
  .buttons button {
      width: 100%;
      font-size: 1.1em;
      padding: 10px;
  }

  /* Responsive adjustment for smaller screens */
  @media (max-width: 768px) {
      .modal {
          flex-direction: column;
          padding: 15px;
          gap: 15px;
          width: 96%;
          max-height: 92vh;
      }
      .left-pane {
          border-right: none;
          border-bottom: 1px solid var(--border);
          padding-right: 0;
          padding-bottom: 15px;
      }
      .right-pane {
          padding-left: 0;
      }
  }
</style>
