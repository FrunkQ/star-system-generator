<script lang="ts">
  // Help hub — one place that explains and links to every help surface: the getting-started
  // walkthrough, the physics reference, the in-app guides (tags, autopilot) and the community
  // links. Reuses the global .modal-overlay / .modal-card chrome (see AboutModal).
  import { createEventDispatcher } from 'svelte';
  import HelpModal from './HelpModal.svelte';
  // The in-app guides are bundled from their single source in docs/ (same as their tab buttons).
  import tagsGuide from '../../../docs/tags-guide.md?raw';
  import autopilotGuide from '../../../docs/autopilot-guide.md?raw';
  import { foreground } from '$lib/ui/foreground';

  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');

  const GH = 'https://github.com/FrunkQ/star-system-generator/blob/beta';
  // When set, an in-app guide is shown in a nested HelpModal on top of this hub.
  let inlineDoc: string | null = null;
</script>

<div class="modal-overlay" role="presentation" on:click={close} use:foreground>
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
        <!-- The Discord invitation is a SIBLING, not nested: `.help-item` is itself an anchor, and
             an anchor inside an anchor is invalid and swallows the inner click. -->
        <a class="help-item" href="https://youtu.be/LrgNh2PVOlg" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Tutorial video ↗</span>
          <span class="hi-desc"><strong class="hi-warn">Well out of date.</strong> The ideas still hold, but almost every screen in it has changed since — useful for the shape of things, misleading on the detail.</span>
        </a>
        <p class="help-aside">
          Fancy making a newer one? We would happily point everyone at it —
          <a href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">say hello on Discord</a>.
        </p>
      </div>

      <div class="help-group">
        <span class="group-label">Reference &amp; guides</span>
        <a class="help-item" href="/physics" target="_blank" rel="noopener noreferrer">
          <span class="hi-title">Physics &amp; classification ↗</span>
          <span class="hi-desc">Every constant, derivation and honest fudge — and how a world's type &amp; tags are decided. The apple (Newton) icon links in here.</span>
        </a>
        <button class="help-item" on:click={() => (inlineDoc = tagsGuide)}>
          <span class="hi-title">Tags</span>
          <span class="hi-desc">Where tags come from, categories, overriding the physics, who sees what (shown / anon / hidden), highlighting them on the maps, and Find-by-tag.</span>
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
        <!-- Findable without being told about it: a user reporting a problem looks in Help, not in
             Settings. The button itself stays in Settings > System, where the data tools live. -->
        <div class="help-item help-note">
          <span class="hi-title">Reporting a problem</span>
          <span class="hi-desc">Settings &gt; System &gt; <em>Reporting a problem</em> saves a diagnostic file describing
            what the app was doing, with a copy of your starmap so the problem can be reproduced. Post it on the
            Discord — it also works as a backup.</span>
        </div>
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
  /* An instruction, not a destination — it must not offer a click it cannot honour. */
  .help-note { cursor: default; }
  .help-note:hover { background: var(--bg-control); border-color: var(--border); }
  .hi-title { font-weight: 600; color: var(--accent); font-size: 0.92rem; }
  .hi-desc { color: var(--text-muted, #cfcfcf); font-size: 0.82rem; line-height: 1.4; }
  .hi-warn { color: var(--status-warn, #e0a24d); }
  .help-aside {
    margin: 2px 0 0;
    padding: 0 4px;
    color: var(--text-muted, #cfcfcf);
    font-size: 0.78rem;
    line-height: 1.4;
    font-style: italic;
  }
  .help-aside a { color: var(--link); }
</style>
