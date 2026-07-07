<script lang="ts">
  // Help hub — one place that explains and links to every help surface: the getting-started
  // walkthrough, the physics reference, the in-app guides (tags, autopilot) and the community
  // links. Reuses the global .modal-overlay / .modal-card chrome (see AboutModal).
  import { createEventDispatcher } from 'svelte';
  import HelpModal from './HelpModal.svelte';
  // The in-app guides are bundled from their single source in docs/ (same as their tab buttons).
  import tagsGuide from '../../../docs/tags-guide.md?raw';
  import autopilotGuide from '../../../docs/autopilot-guide.md?raw';

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  const GH = 'https://github.com/FrunkQ/star-system-generator/blob/beta';
  // When set, an in-app guide is shown in a nested HelpModal on top of this hub.
  let inlineDoc: string | null = null;
</script>

<div class="modal-overlay" role="presentation" on:click={close}>
  <div class="modal-card help-card" role="dialog" aria-label="Help" on:click|stopPropagation>
    <header class="help-head">
      <span>Help &amp; guides</span>
      <button class="help-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="help-body">
      <p class="intro">How Star System Explorer works — open a guide here, or read the full docs on GitHub.</p>

      <div class="help-group">
        <span class="group-label">Learn the app</span>
        <a class="help-item" href="{GH}/GettingStarted.md" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Getting Started ↗</span>
          <span class="hi-desc">A guided walkthrough — the starmap, building worlds, tags, autopilot, playing at the table.</span>
        </a>
        <a class="help-item" href="https://youtu.be/LrgNh2PVOlg" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Tutorial video ↗</span>
          <span class="hi-desc">See it in action.</span>
        </a>
      </div>

      <div class="help-group">
        <span class="group-label">Reference &amp; guides</span>
        <a class="help-item" href="/physics" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Physics &amp; classification ↗</span>
          <span class="hi-desc">Every constant, derivation and honest fudge — and how a world's type &amp; tags are decided. The apple (Newton) icon links in here.</span>
        </a>
        <button class="help-item" on:click={() => (inlineDoc = tagsGuide)}>
          <span class="hi-title">Tags, Points &amp; Constructs of Interest</span>
          <span class="hi-desc">Physics vs hand-added tags, PoI/CoI, manual tagging, packs, and Find-by-tag.</span>
        </button>
        <button class="help-item" on:click={() => (inlineDoc = autopilotGuide)}>
          <span class="hi-title">Autopilot</span>
          <span class="hi-desc">Standing orders for NPC ships — routes, ship character, smart routing, the Ship's Log.</span>
        </button>
      </div>

      <div class="help-group">
        <span class="group-label">More</span>
        <a class="help-item" href="{GH}/changelog.md" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Changelog ↗</span>
          <span class="hi-desc">Release history and what's new.</span>
        </a>
        <a class="help-item" href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Discord — questions &amp; feedback ↗</span>
          <span class="hi-desc">Ask, report bugs, share systems.</span>
        </a>
      </div>
    </div>
  </div>
</div>

{#if inlineDoc}
  <HelpModal markdown={inlineDoc} on:close={() => (inlineDoc = null)} />
{/if}

<style>
  .help-card {
    width: min(560px, 92vw);
    max-height: 86vh;
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
  .help-body { overflow-y: auto; overflow-x: hidden; padding: 14px 18px 18px; box-sizing: border-box; }
  .help-body * { box-sizing: border-box; }
  .intro { margin: 0 0 12px; color: var(--text-muted, #cfcfcf); font-size: 0.9rem; }
  .help-group { margin-bottom: 14px; display: flex; flex-direction: column; gap: 6px; }
  .group-label { font-size: 0.72rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint, #8a8f9a); }
  .help-item {
    display: flex; flex-direction: column; gap: 2px; text-align: left; width: 100%;
    background: var(--bg-control); border: 1px solid var(--border); border-radius: var(--radius-md, 8px);
    padding: 10px 12px; cursor: pointer; text-decoration: none; color: var(--text, #e8e8e8); font: inherit;
  }
  .help-item:hover { background: var(--bg-control-hover); border-color: var(--accent); }
  .hi-title { font-weight: 600; color: var(--accent); font-size: 0.92rem; }
  .hi-desc { color: var(--text-muted, #cfcfcf); font-size: 0.82rem; line-height: 1.4; }
</style>
