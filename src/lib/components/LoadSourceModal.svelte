<script context="module" lang="ts">
  // THE FILE FILTERS, IN ONE PLACE, BESIDE THE SENTENCE THAT DESCRIBES THEM.
  //
  // They used to be two literals in two components, and the words a GM reads were somewhere else
  // again. A filter and its description are one statement made twice, and the standing rule about
  // scattered constants is exactly this case: two things you cannot see together are two things
  // nobody compares. Both parents import these for their hidden inputs.
  //
  // A CAMPAIGN takes only this app's own saves. A SYSTEM additionally takes the external simulator
  // formats, because `adapterForFile` routes those through the converter - offering them on the
  // campaign picker would filter for files that door cannot open.
  export const FILE_ACCEPT = {
    campaign: 'application/json,.json,.zip',
    system: 'application/json,.json,.zip,.ubox,.sc,.pak'
  } as const;

  export type LoadSourceKind = keyof typeof FILE_ACCEPT;
</script>

<script lang="ts">
  // WHERE A MAP COMES FROM - one screen, asked by both Load Starmap and Load System.
  //
  // Owner, 2026-09-06, on the paste field that used to sit on the welcome screen: *"This is not the
  // place for the site import - its ugly and people are not joining from here. Remove. Instead take
  // over the Load StarMap and Load System Map modals with a file or sharing site option where it
  // takes them to where the other explorers are sharing - or the load file appropriately file type
  // filtered."*
  //
  // So the three ways in live together, at the moment somebody has actually decided they want to
  // open something, rather than on the first screen a new user meets. The order is deliberate:
  // BROWSE first, because the whole point is to take them to where the other explorers are; the
  // FILE second, because that is what most people arrive knowing they want; and the paste field
  // last and small, because it is the fallback for a code somebody was sent rather than a front
  // door. It is kept rather than deleted because a link pasted into a Discord has to land
  // somewhere, and deleting it would have removed the only way to redeem one from inside the app.
  //
  // ONE COMPONENT, TWO KINDS. A campaign and a system differ in the words and the file filter and
  // in nothing else, so they are one screen parameterised rather than two screens to keep in step.
  import { createEventDispatcher } from 'svelte';
  import { parseHubReference } from '$lib/hub/hubClient';
  import { HUB } from '$lib/hub/hubConfig';
  import { foreground } from '$lib/ui/foreground';

  /** Which world this acts on. The tooltips in the rail already make this distinction; so does this. */
  export let kind: LoadSourceKind;

  const dispatch = createEventDispatcher();

  // Whatever the GM pasted, reduced to a map code by the one parser the `?hub=` URL path also uses.
  // People paste what they copied - the hub's page for the map, the one-click link out of a chat,
  // or a bare code - and all three name the same map.
  let hubRef = '';
  $: parsed = parseHubReference(hubRef);
  function openShared() {
    if (parsed) dispatch('openHub', parsed);
  }

  const COPY = {
    campaign: {
      title: 'Load a campaign',
      caution: 'This browser holds one campaign at a time, so whatever you open replaces the one you have now. You will be asked before anything is replaced.',
      fileTitle: 'Load from a file',
      fileHint: 'A campaign saved from this app — a .json file, or a .sse.zip bundle if it carries pictures or ship models.'
    },
    system: {
      title: 'Load a system',
      caution: 'This replaces the system you are looking at, not the whole campaign.',
      fileTitle: 'Load from a file',
      fileHint: 'A system saved from this app (.json or .sse.zip), or a file from another simulator — .ubox, .sc or .pak.'
    }
  } as const;
  $: copy = COPY[kind];
</script>

<div class="load-overlay" role="presentation" use:foreground on:click|self={() => dispatch('close')}>
  <div class="load-card" role="dialog" aria-modal="true" aria-label={copy.title}>
    <h2>{copy.title}</h2>
    <p class="load-caution">{copy.caution}</p>

    <!-- FIRST, because it is the one that takes them to the other explorers. A real link rather
         than a button, so it behaves like one - middle-click, copy, open in a background tab. -->
    <a class="load-option primary" href={HUB.browseUrl} target="_blank" rel="noopener noreferrer">
      <strong>Browse shared maps</strong>
      <small>Opens the Explorers library in a new tab — maps other cartographers have shared. Every one of them has an "Open in Star System Explorer" button that brings it straight back here.</small>
    </a>

    <button type="button" class="load-option" on:click={() => dispatch('file')}>
      <strong>{copy.fileTitle}</strong>
      <small>{copy.fileHint}</small>
    </button>

    <div class="load-paste">
      <label for="load-paste-input">Or paste a link somebody sent you</label>
      <div class="load-paste-row">
        <input
          id="load-paste-input"
          type="text"
          bind:value={hubRef}
          placeholder="Paste a shared-map link or code"
          on:keydown={(e) => { if (e.key === 'Enter') openShared(); }} />
        <button type="button" disabled={!parsed} on:click={openShared}>Open</button>
      </div>
      {#if hubRef.trim() && !parsed}
        <small class="load-paste-hint">That does not look like a shared-map link yet.</small>
      {/if}
    </div>

    <div class="load-actions">
      <button type="button" class="load-cancel" on:click={() => dispatch('close')}>Cancel</button>
    </div>
  </div>
</div>

<style>
  .load-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.72);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
    z-index: 1000;
  }
  .load-card {
    background: var(--bg-panel);
    border: 1px solid var(--border);
    border-radius: 8px;
    padding: 20px 22px;
    width: min(520px, 100%);
    max-height: 90vh;
    overflow-y: auto;
    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
  }
  .load-card h2 {
    margin: 0 0 6px;
    font-size: 1.15rem;
  }
  .load-caution {
    margin: 0 0 14px;
    color: var(--text-faint);
    font-size: 0.85rem;
    line-height: 1.4;
  }
  .load-option {
    display: block;
    /* BORDER-BOX, and it is not decoration: this app has no global box-sizing reset, so `width:
       100%` plus 28px of padding and 2px of border overflowed the card by exactly 30px and put a
       horizontal scrollbar under it. Seen in a browser; no unit test would have noticed. */
    box-sizing: border-box;
    width: 100%;
    text-align: left;
    background-color: var(--bg-control);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 10px 14px;
    margin-bottom: 8px;
    color: inherit;
    text-decoration: none;
    cursor: pointer;
    font: inherit;
  }
  .load-option:hover,
  .load-option:focus-visible {
    border-color: var(--accent, #7aa2f7);
  }
  .load-option.primary {
    border-color: var(--accent, #7aa2f7);
  }
  .load-option strong {
    display: block;
    margin-bottom: 3px;
  }
  .load-option small {
    display: block;
    color: var(--text-faint);
    font-weight: normal;
    line-height: 1.35;
  }
  .load-paste {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--border);
  }
  .load-paste label {
    display: block;
    font-size: 0.82rem;
    color: var(--text-faint);
    margin-bottom: 5px;
  }
  .load-paste-row {
    display: flex;
    gap: 6px;
  }
  .load-paste-row input[type='text'] {
    flex: 1 1 auto;
    min-width: 0;
  }
  .load-paste-row button {
    padding: 5px 12px;
    white-space: nowrap;
  }
  .load-paste-hint {
    display: block;
    margin-top: 4px;
    color: var(--text-faint);
  }
  .load-actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 16px;
  }
  .load-cancel {
    padding: 6px 14px;
  }
</style>
