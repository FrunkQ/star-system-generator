<script lang="ts">
  // First-run V2 welcome — shown once (localStorage flag set by the parent on close). Tells returning
  // V1 users what's changed and what's new, and points at the guides. Reuses the shared modal chrome.
  import { createEventDispatcher } from 'svelte';
  import { APP_VERSION } from '$lib/constants';
  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');
  const openHelp = () => dispatch('help');

  const GH = 'https://github.com/FrunkQ/star-system-generator/blob/beta';

  // Headline new features — brief, scannable. (Full detail lives in the guides.)
  const features: { title: string; blurb: string }[] = [
    { title: 'A new interface', blurb: 'Rebuilt to work on tablets and phones, with a left rail for navigation, Find-by-tag and tools.' },
    { title: 'Interstellar travel', blurb: 'Fly between systems — instant jump drives or realistic reaction drives, with relativistic time dilation.' },
    { title: 'The Field Guide', blurb: "Serve live, redacted system data to your players' own phones and tablets, in four skins." },
    { title: 'Physics-derived worlds', blurb: 'Composition, oceans, ice caps, magnetism, geology and true colour are all derived from real physics.' },
    { title: 'The Newton panel', blurb: 'Click the apple on any world to see the working behind it, linked to a full physics reference.' },
    { title: 'Tags, Points & Constructs of Interest', blurb: 'Give players reasons to visit places; find worlds by tag; author your own flavour packs.' },
    { title: 'In-system autopilot', blurb: 'Set NPC ships loose on their own routes — mine, transport, patrol, explore or escort.' },
    { title: 'Classification & visuals', blurb: '50+ planet types, brown dwarfs that glow, auroras, oblate fast-rotators, cratered dead worlds.' }
  ];
</script>

<div class="modal-overlay" role="presentation" on:click={close}>
  <div class="modal-card welcome-card" role="dialog" aria-label="Welcome to Star System Explorer 2" on:click|stopPropagation>
    <header class="w-head">
      <div>
        <h2>Welcome to Star System Explorer&nbsp;2</h2>
        <p class="ver">The biggest upgrade yet · {APP_VERSION}</p>
      </div>
      <button class="w-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="w-body">
      <p class="lede">Everything you did in V1 is still here — and your saved starmaps still load — but the
        interface has been rebuilt and a great deal is new. The short version:</p>

      <ul class="feat">
        {#each features as f}
          <li>
            <span class="dot" aria-hidden="true"></span>
            <span><strong>{f.title}.</strong> {f.blurb}</span>
          </li>
        {/each}
      </ul>

      <p class="guides-line">
        New here, or want the detail? Read the
        <a href="{GH}/GettingStarted.md" target="_blank" rel="noopener noreferrer">Getting Started guide</a>
        and the <a href="/physics" target="_blank" rel="noopener noreferrer">physics reference</a> — or find
        every guide any time under <strong>Help</strong> in the menu.
      </p>
    </div>

    <footer class="w-foot">
      <button class="ghost" on:click={openHelp}>Browse all guides</button>
      <button class="primary" on:click={close}>Start exploring</button>
    </footer>
  </div>
</div>

<style>
  .welcome-card {
    width: min(640px, 94vw);
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .w-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 18px;
    border-bottom: 1px solid var(--border);
    flex: 0 0 auto;
  }
  .w-head h2 { margin: 0; color: var(--accent); font-size: 1.2rem; }
  .ver { margin: 3px 0 0; font-size: 0.78rem; color: var(--text-faint, #8a8f9a); text-transform: uppercase; letter-spacing: 0.04em; }
  .w-close {
    width: 38px; height: 38px; flex: 0 0 auto;
    border: 1px solid var(--status-bad, #e0484d); border-radius: 8px;
    background: color-mix(in srgb, var(--status-bad, #e0484d) 16%, var(--bg-control));
    color: var(--status-bad, #e0484d); cursor: pointer; line-height: 1; font-size: 1.5rem; font-weight: 700;
  }
  .w-close:hover { background: color-mix(in srgb, var(--status-bad, #e0484d) 30%, var(--bg-control)); }
  .w-body { overflow-y: auto; padding: 14px 18px; }
  .lede { margin: 0 0 12px; color: var(--text, #e8e8e8); font-size: 0.94rem; line-height: 1.55; }
  .feat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
  .feat li { display: flex; gap: 10px; align-items: baseline; font-size: 0.9rem; line-height: 1.45; color: var(--text-muted, #cfcfcf); }
  .feat strong { color: var(--text, #e8e8e8); }
  .dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #ff5a1f); transform: translateY(-1px); }
  .guides-line { margin: 14px 0 0; font-size: 0.86rem; color: var(--text-muted, #cfcfcf); line-height: 1.5; }
  .guides-line a { color: var(--link, #6ca6ff); }
  .w-foot {
    display: flex; justify-content: flex-end; gap: 10px;
    padding: 12px 18px; border-top: 1px solid var(--border); flex: 0 0 auto;
  }
  .w-foot button { border-radius: 7px; padding: 8px 16px; cursor: pointer; font-size: 0.9rem; }
  .ghost { background: var(--bg-control); border: 1px solid var(--border); color: var(--text, #e8e8e8); }
  .ghost:hover { background: var(--bg-control-hover); border-color: var(--accent); }
  .primary { background: var(--accent, #ff5a1f); border: 1px solid var(--accent, #ff5a1f); color: #fff; font-weight: 600; }
  .primary:hover { filter: brightness(1.08); }
</style>
