<script lang="ts">
  // First-run welcome — shown once (localStorage flag set by the parent on close).
  //
  // V3 welcome — FIRST PASS. The headlines below are the owner's list and are real, but the
  // blurbs are placeholders to be sharpened once each feature is bottomed out. Two things to
  // check before release: that every line still matches what shipped, and that anything still
  // in testing (VTT integration) is still labelled as such. An inaccurate welcome is worse
  // than a plain one, so nothing here claims more than the feature currently does.
  import { createEventDispatcher } from 'svelte';
  import { APP_VERSION } from '$lib/constants';
  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');
  const openHelp = () => dispatch('help');

  const GH = 'https://github.com/FrunkQ/star-system-generator/blob/beta';

  // Headline features — brief and scannable; full detail lives in the guides.
  const features: { title: string; blurb: string }[] = [
    { title: 'A rewritten physics engine', blurb: 'Worlds are derived end to end from what they are made of — density, temperature, atmosphere, cloud decks, oceans and ice, magnetism, geology and true colour — and the Newton panel shows the working.' },
    { title: 'Player views', blurb: "Design what your players see and serve it live to their own phones, tablets and screens — redacted, styled, and updating as you play." },
    { title: 'The system in 3D', blurb: 'A real three-dimensional view of any system, with orbits, tilts and moons where the physics puts them.' },
    { title: 'Starmaps have depth', blurb: 'Systems carry a z-axis, so distances are true in three dimensions. If you prefer a flat map, everything still works exactly as it did in 2D.' },
    { title: '3D ships', blurb: 'Bring your own models: constructs can be shown as real 3D craft.' },
    { title: 'Everything is a tag', blurb: 'One tagging system throughout: the physics emits tags, you add your own, override the ones you disagree with, and choose which reach your players.' },
    { title: 'Import the real sky', blurb: 'Build starmaps straight from the astronomy catalogues — real stars at true positions, confirmed planets only, or filled out with plausible worlds around them.' },
    { title: 'Eclipse times', blurb: 'Know when a moon crosses its sun, and how long the shadow lasts.' },
    { title: 'Virtual tabletop integration', blurb: 'Connect to your VTT — Mappadux, Owlbear Rodeo and others are in testing.' },
    { title: 'Sharper generation', blurb: 'Procedural systems have been retuned to sit better inside the new physics.' },
    { title: 'New default starmaps', blurb: 'The bundled maps are rebuilt from real astronomy, with true 3D positions, more systems, and a science-fiction companion map.' },
    { title: 'Many improvements and fixes', blurb: 'Hundreds of smaller changes throughout — the changelog has every one, build by build.' }
  ];
</script>

<div class="modal-overlay" role="presentation" on:click={close}>
  <div class="modal-card welcome-card" role="dialog" aria-label="Welcome to Star System Explorer 3" on:click|stopPropagation>
    <header class="w-head">
      <div>
        <h2>Welcome to Star System Explorer&nbsp;3</h2>
        <p class="ver">Beta · {APP_VERSION}</p>
      </div>
      <button class="w-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="w-body">
      <p class="lede">V3 is being built in the open on this beta. Everything you already do still works
        and your saved starmaps still load — but a great deal is new. The short version:</p>

      {#if features.length}
        <ul class="feat">
          {#each features as f}
            <li>
              <span class="dot" aria-hidden="true"></span>
              <span><strong>{f.title}.</strong> {f.blurb}</span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="placeholder">Highlights land here as V3 takes shape.</p>
      {/if}

      <p class="placeholder">Fuller notes for each of these follow as V3 firms up.</p>

      <p class="guides-line">
        New here, or want the detail? Read the
        <a href="{GH}/GettingStarted.md" target="_blank" rel="noopener noreferrer">Getting Started guide</a>
        and the <a href="/physics" target="_blank" rel="noopener noreferrer">physics reference</a> — or find
        every guide any time under <strong>Help</strong> in the menu.
      </p>

      <div class="heads-up">
        <p><strong>Expect the odd bug.</strong> This is a live beta with a lot changing under the hood, so
        some things will slip through. If you hit one, please report it on
        <a href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">our Discord</a> —
        it's the fastest way to get it fixed. Thank you for helping shape V3!</p>
        <p><strong>Keep a backup.</strong> Beta builds move fast; export anything precious before you
        re-save it.</p>
      </div>
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
  .placeholder { color: var(--text-faint); font-style: italic; }
  .w-body { overflow-y: auto; padding: 14px 18px; }
  .lede { margin: 0 0 12px; color: var(--text, #e8e8e8); font-size: 0.94rem; line-height: 1.55; }
  .feat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
  .feat li { display: flex; gap: 10px; align-items: baseline; font-size: 0.9rem; line-height: 1.45; color: var(--text-muted, #cfcfcf); }
  .feat strong { color: var(--text, #e8e8e8); }
  .dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #ff5a1f); transform: translateY(-1px); }
  .guides-line { margin: 14px 0 0; font-size: 0.86rem; color: var(--text-muted, #cfcfcf); line-height: 1.5; }
  .guides-line a { color: var(--link, #6ca6ff); }
  .heads-up {
    margin: 14px 0 2px;
    padding: 11px 14px;
    border: 1px solid color-mix(in srgb, var(--accent, #ff5a1f) 45%, transparent);
    border-left: 3px solid var(--accent, #ff5a1f);
    border-radius: 0 8px 8px 0;
    background: color-mix(in srgb, var(--accent, #ff5a1f) 10%, transparent);
    font-size: 0.88rem;
    line-height: 1.5;
    color: var(--text, #e8e8e8);
  }
  .heads-up p { margin: 0; }
  .heads-up p + p { margin-top: 8px; }
  .heads-up strong { color: var(--accent, #ff5a1f); }
  .heads-up a { color: var(--link, #6ca6ff); font-weight: 600; }
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
