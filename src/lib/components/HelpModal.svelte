<script lang="ts">
  // A lightweight help viewer: renders a bundled Markdown doc (single source of truth) inside the app's
  // standard modal shell. Reuses the global .modal-overlay / .modal-card chrome (see AboutModal). Trusted
  // content only — mdToHtml escapes HTML but this is for our own docs, not user input.
  import { createEventDispatcher } from 'svelte';
  import { mdToHtml } from '$lib/markdownLite';

  export let markdown: string;
  export let title: string | null = null;

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  // A leading "# Title" line becomes the modal header (unless an explicit title is passed) and is stripped
  // from the body so the heading isn't shown twice.
  $: firstH1 = markdown.match(/^#\s+(.+)$/m)?.[1] ?? null;
  $: heading = title ?? firstH1 ?? 'Help';
  $: body = markdown.replace(/^#\s+.+\n?/, '');
  $: html = mdToHtml(body);

  function onKey(e: KeyboardEvent) { if (e.key === 'Escape') close(); }
</script>

<svelte:window on:keydown={onKey} />

<div class="modal-overlay" role="presentation" on:click={close}>
  <div class="modal-card help-card" role="dialog" aria-label={heading} on:click|stopPropagation>
    <header class="help-head">
      <span>{heading}</span>
      <button class="help-close" aria-label="Close" on:click={close}>×</button>
    </header>
    <div class="help-body">{@html html}</div>
  </div>
</div>

<style>
  .help-card {
    width: min(760px, 94vw);
    max-height: 88vh;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .help-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    color: var(--accent);
    flex: 0 0 auto;
  }
  .help-close {
    width: 40px;
    height: 40px;
    border: 1px solid var(--status-bad, #e0484d);
    border-radius: 8px;
    background: color-mix(in srgb, var(--status-bad, #e0484d) 16%, var(--bg-control));
    color: var(--status-bad, #e0484d);
    cursor: pointer;
    line-height: 1;
    font-size: 1.6rem;
    font-weight: 700;
  }
  .help-close:hover { background: color-mix(in srgb, var(--status-bad, #e0484d) 30%, var(--bg-control)); }
  .help-body {
    overflow-y: auto;
    padding: 4px 20px 20px;
    line-height: 1.5;
    color: var(--text, #e8e8e8);
  }
  .help-body :global(h1) { font-size: 1.25rem; color: var(--accent); margin: 14px 0 6px; }
  .help-body :global(h2) { font-size: 1.08rem; color: var(--accent); margin: 18px 0 6px; border-bottom: 1px solid var(--border); padding-bottom: 4px; }
  .help-body :global(h3) { font-size: 0.98rem; color: var(--text, #e8e8e8); margin: 14px 0 4px; }
  .help-body :global(p) { margin: 6px 0; }
  .help-body :global(ul) { margin: 6px 0; padding-left: 20px; }
  .help-body :global(li) { margin: 4px 0; }
  .help-body :global(code) {
    background: var(--bg-control);
    border: 1px solid var(--border);
    border-radius: 4px;
    padding: 0 4px;
    font-size: 0.88em;
  }
  .help-body :global(strong) { color: var(--text-strong, #fff); }
  .help-body :global(table) { width: 100%; border-collapse: collapse; margin: 10px 0; font-size: 0.9em; }
  .help-body :global(th), .help-body :global(td) {
    border: 1px solid var(--border);
    padding: 6px 8px;
    text-align: left;
    vertical-align: top;
  }
  .help-body :global(th) { background: var(--bg-control); color: var(--accent); }
</style>
