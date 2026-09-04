<script lang="ts">
  // R-14: WHERE A HUB CLIP LANDS. One screen for both ways in, because they are the same decision.
  //
  // The owner chose the shape (2026-09-03): paste onto the selection in the SYSTEM view, and from
  // the STARMAP with nothing selected, ask which system then which body. And a TEXT BOX beside the
  // paste event, because Firefox will not hand a page the clipboard - a feature that works in three
  // browsers out of four is a feature that looks broken.
  //
  // This screen decides nothing about physics and inserts nothing: it reads the clip, says what is
  // in it, takes the host, and hands both back. The insert lives in one place (the root route), so
  // there is no second copy of "put this branch into that campaign".
  import { createEventDispatcher } from 'svelte';
  // A84 / UI-C6: a full-screen dialog joins the chrome-yield contract, so a phone GM gets the
  // screen. The gate that caught this looks at the SHAPE of the layer, not its class name.
  import { foreground } from '$lib/ui/foreground';
  import { parseHubClip, type HubClip } from '$lib/io/hubClip';
  import { hostCandidates } from '$lib/system/reparent';
  import type { Starmap, System } from '$lib/types';

  /** Text already in hand (a paste event). Empty opens the box for somebody to fill in. */
  export let initialText = '';
  export let starmap: Starmap;
  /** The system the GM is looking at, if any. Absent means the starmap view: ask which. */
  export let openSystemId: string | null = null;
  /** The body the GM has selected, if any — the default host, and usually the right one. */
  export let focusedBodyId: string | null = null;

  const dispatch = createEventDispatcher();

  let text = initialText;
  let systemId: string = openSystemId ?? '';
  let hostId = '';

  $: parsed = text.trim() ? parseHubClip(text) : null;
  $: clip = parsed?.ok ? (parsed.clip as HubClip) : null;
  $: rootNode = clip ? clip.nodes.find((n: any) => n.id === clip.root) : null;

  $: systems = (starmap?.systems ?? []).map((s: any) => ({ id: s.system?.id ?? s.id, name: s.name ?? s.system?.name ?? 'System' }));
  $: chosenSystem = (starmap?.systems ?? []).find((s: any) => (s.system?.id ?? s.id) === systemId)?.system as System | undefined;
  // The same answer the re-home screen gives to "what can host a body" - asked, never re-derived.
  $: hosts = chosenSystem ? hostCandidates(chosenSystem) : [];
  // Default to what the GM was looking at, and only while it is actually in the chosen system.
  $: if (hosts.length && !hosts.some((h: any) => h.id === hostId)) {
    hostId = hosts.some((h: any) => h.id === focusedBodyId) ? focusedBodyId! : hosts[0].id;
  }

  $: ready = !!clip && !!chosenSystem && !!hostId;

  function confirm() {
    if (!ready || !clip) return;
    dispatch('paste', { clip, systemId, hostId });
  }
</script>

<div class="modal-background" role="presentation" on:click|self={() => dispatch('close')} use:foreground>
  <div class="modal" role="dialog" aria-modal="true" aria-label="Paste from the map library">
    <h2>Paste from the map library</h2>

    {#if !text.trim()}
      <p class="note">Copy an object from a map on the Explorers site — a star, a planet, a station —
        and paste it here. Everything beneath it comes too.</p>
    {/if}

    <label class="field">
      <span>What you copied</span>
      <textarea bind:value={text} rows="4" placeholder="Paste here" aria-label="Copied object"></textarea>
    </label>

    {#if parsed && !parsed.ok}
      <p class="problem">{parsed.problem}</p>
    {:else if clip}
      <p class="summary">
        <strong>{rootNode?.name ?? 'An object'}</strong>
        {#if clip.nodes.length > 1}and {clip.nodes.length - 1} thing{clip.nodes.length === 2 ? '' : 's'} beneath it{/if}.
        {#if clip.source?.title}
          <!-- The space before "by" is written explicitly: Svelte trims whitespace between an
               element and a following block, which ran the title into the word ("Gammaby carol"). -->
          From <em>{clip.source.title}</em>{#if clip.source.creator}{' '}by {clip.source.creator}{/if}.
        {/if}
      </p>
      {#if clip.source?.title || clip.source?.creator || clip.source?.url}
        <p class="note">The credit is recorded on your campaign and travels with your saves.</p>
      {/if}

      {#if !openSystemId}
        <label class="field">
          <span>Into which system</span>
          <select bind:value={systemId}>
            <option value="" disabled>Choose a system…</option>
            {#each systems as s}<option value={s.id}>{s.name}</option>{/each}
          </select>
        </label>
      {/if}

      {#if chosenSystem}
        <label class="field">
          <span>Going round</span>
          <select bind:value={hostId}>
            {#each hosts as h}<option value={h.id}>{h.name ?? h.id}</option>{/each}
          </select>
        </label>
      {/if}
    {/if}

    <div class="buttons">
      <button on:click={() => dispatch('close')}>Cancel</button>
      <button class="primary" disabled={!ready} on:click={confirm}>Paste it in</button>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed; inset: 0; background: rgba(0,0,0,0.7);
    display: flex; justify-content: center; align-items: center; z-index: 2000;
  }
  .modal {
    background: var(--bg-panel); color: var(--text);
    padding: 1.5rem; border-radius: 8px; width: min(520px, 92vw);
    border: 1px solid var(--border); max-height: 90vh; overflow: auto;
  }
  h2 { margin: 0 0 0.75rem; font-size: 1.1rem; }
  .field { display: block; margin-bottom: 0.75rem; }
  .field span { display: block; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 4px; }
  textarea, select {
    width: 100%; box-sizing: border-box;
    background: var(--bg-control); color: var(--text);
    border: 1px solid var(--border); border-radius: 3px; padding: 6px;
    font-family: inherit; font-size: 0.85rem;
  }
  textarea { resize: vertical; }
  .note { font-size: 0.82rem; color: var(--text-faint); margin: 0 0 0.75rem; line-height: 1.4; }
  .summary { font-size: 0.9rem; margin: 0 0 0.5rem; line-height: 1.4; }
  .problem {
    font-size: 0.85rem; margin: 0 0 0.75rem; line-height: 1.4;
    color: #e8a0a0; border-left: 2px solid #e8a0a0; padding-left: 8px;
  }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 0.5rem; }
  button {
    background: var(--bg-control); color: var(--text); border: 1px solid var(--border);
    padding: 7px 14px; border-radius: 4px; cursor: pointer;
  }
  button.primary { background: var(--accent); border-color: var(--accent); }
  button:disabled { opacity: 0.5; cursor: not-allowed; }
</style>
