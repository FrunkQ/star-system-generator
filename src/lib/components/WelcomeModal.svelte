<script lang="ts">
  // First-run welcome — shown once (localStorage flag set by the parent on close).
  //
  // STATE OF THESE FOUR, 2026-09-08 (measured, not assumed - re-measure before any production
  // release that carries this panel). The importer's stars LANDED across v3.1.6-3.1.8 (real sizes
  // with provenance, Sirius, Lalande, Luhman 16, the heaviest-member rule); NETWORKING landed at
  // v3.1.12 ([[G88]] - it had been finished but sat unpushed, which is why an earlier note here
  // called it absent); 3D on a busy browser is IN FLIGHT (C20/Stream W); and Traveller main worlds
  // are BRIEFED and not started (G87/Stream V). **THE PANEL MUST NOT REACH PRODUCTION BEFORE ITS
  // LINES ARE TRUE**, which is this file's own rule and the reason the list is checked rather than
  // trusted.
  //
  // V3.1 welcome — RELEASE VOICE. The list below is the OWNER'S OWN release notes for 3.1, pasted
  // whole; earlier releases had the coordinator draft and him trim, and this is the other way round.
  // An inaccurate welcome is worse than a plain one, so nothing here claims more than the feature
  // currently does. THE SEEN-KEY IS BUMPED WITH THE PANEL (`WELCOME_KEY` in `routes/+page.svelte`):
  // everyone who dismissed the V3 one already has that flag set, so a new welcome that keeps the old
  // key is a welcome nobody sees.
  import { createEventDispatcher } from 'svelte';
  import { APP_VERSION } from '$lib/constants';
  import { foreground } from '$lib/ui/foreground';
  const dispatch = createEventDispatcher();
  const close = () => dispatch('close');
  const openHelp = () => dispatch('help');

  // The version copy that used to sit on the rail's brand mark. It moved here when the mark became
  // the way to reopen this panel: copying on every click would overwrite a GM's clipboard just for
  // reading the notes, and this app watches the clipboard for pasteable content. Beside the version
  // it already prints is where somebody writing a bug report is looking anyway. A refusal
  // (permissions, non-secure context) says so rather than claiming a copy that did not happen.
  let copied: 'ok' | 'fail' | null = null;
  let copyTimer: ReturnType<typeof setTimeout> | null = null;
  async function copyVersion() {
    try {
      await navigator.clipboard.writeText(`SSE v${APP_VERSION}`);
      copied = 'ok';
    } catch {
      copied = 'fail';
    }
    if (copyTimer) clearTimeout(copyTimer);
    copyTimer = setTimeout(() => (copied = null), 1500);
  }

  const GH = 'https://github.com/FrunkQ/star-system-generator/blob/beta';

  // Headline features — brief and scannable; full detail lives in the guides.
  //
  // `pending` marks a line as NOT FULLY LANDED and dims it, with the label shown as a small tag.
  // Beta testers should be able to tell at a glance what they can use today from what is still
  // coming, so an unfinished feature is listed honestly rather than omitted or overclaimed. Clear
  // the field the moment a feature is genuinely done — a stale "coming" is as misleading as a
  // premature claim.
  //
  // THIS LIST IS **THIS RELEASE ONLY**, shipped or in flight. It is NOT the roadmap. Anything
  // belonging to a later release stays off it however exciting it is — a first-run panel that
  // advertises what a tester cannot reach, however honestly labelled, reads as a promise. Two lines
  // were removed on this rule (owner, 2026-08-13): visible biospheres, which ride with the new
  // generation engine, and the scale-up to clusters and galaxies, which is the release after this.
  //
  // UPDATE 2026-08-16 — HALF OF THAT IS NOW STALE, AND A STALE INSTRUCTION READS AS AUTHORITY.
  // VISIBLE BIOSPHERES SHIPPED (v2.1.652-665): vegetation is drawn on the planet, coloured by the
  // surface spectrum. It did NOT ride with the V4 generation engine after all, so its line is BACK
  // and its `pending` flag is gone. The clusters-and-galaxies removal still stands — that is V3.1.
  // V3.2 — DRAFTED BY THE COORDINATOR FROM THE CHANGELOG (v3.1.49 to v3.1.80), ON THE OWNER'S WORD,
  // 2026-11-19: he chose "stamp 3.2.0 ... draft the What's New panel from the changelog ... then
  // straight to production". SO THESE LINES ARE NOT HIS VOICE YET, unlike the 3.1 notes they replace
  // (those were his own, pasted in 2026-09-08, and are kept word for word in README.md under
  // "What's new in V3.1"). He may re-voice any of them; until he does, keep them plain and true.
  // The list is still THIS RELEASE ONLY, and `pending` still means NOT FULLY LANDED.
  const features: { title: string; blurb: string; pending?: string }[] = [
    { title: 'Your custom creations stay put',
      blurb: 'Custom gases, liquids, mixes, fuels, drives, sensors and biospheres no longer vanish. Making a second custom gas used to delete the first; a saved system and an exported construct now carry the custom things they are built from; and a world using your own liquid is drawn with it as soon as the map loads.' },
    { title: 'Reloads that do not lose your work',
      blurb: 'A reload brings back your last edit and puts you back in the system you were working in. Cancel on the update prompt now cancels, the app no longer reloads itself unasked, and “The last load didn’t finish” only appears for a map that really hangs.' },
    { title: 'Every body has an age of its own',
      blurb: 'Planets, moons and brown dwarfs get an Age control. A brown dwarf’s temperature no longer snaps back, because age is what sets how far it has cooled. A system’s age can be changed after it is made, and a star’s temperature can be pinned in Overrides.' },
    { title: 'More megastructures, and they tilt',
      blurb: 'A soletta that warms the world it is stationed at, a Birch planet, and the Shkadov and Caplan stellar engines, which state the push on their star without moving it yet. Rings, swarms, shells and stations can be given an inclination, and the 3D view draws them in that plane.' },
    { title: 'Small bodies with character',
      blurb: 'Contact binaries and rubble piles are their own kinds of small body, a body can be given lobes, and a small asteroid’s cutaway is a mixed mass rather than a core and a mantle.' },
    { title: 'Worlds that read right',
      blurb: 'A Neptune on a warm orbit is still an ice giant, super-Jupiters and brown dwarfs stay giants however dense you make them, new worlds no longer arrive tipped over at 90 degrees, a magnetosphere override counts towards habitability, and a black hole between stellar and supermassive has its own name.' },
    { title: 'A player view that keeps your secrets',
      blurb: 'Tick “Observed from a distance only” on a player view and a world’s file shows what a ship could measure from far off and no more. An overlay image under a CRT preset no longer washes the whole screen, and names in the size comparison no longer sit on top of each other.' },
    { title: 'An editor with more room',
      blurb: 'A world’s spin controls live on the Orbit tab, the orbital elements are always shown and say which plane they are measured from, identical elements now give identical orbits whenever you type them, and lunar masses and radii are units.' },
    { title: 'Clock and calendars',
      blurb: 'The transport can step by an exact amount in your calendar’s own units. A custom calendar with an unusual second, a fractional year or a negative leap value no longer locks up the app.' },
    { title: 'Tags and the real sky',
      blurb: 'Importing a tag category asks before it overwrites one and can bring it in as a copy; tags left behind by a rule that is gone can be cleared. A planet whose mass is only an upper limit no longer imports at that limit, and GJ 667 C arrives with its planets.' },
    { title: 'Closer to Explorers',
      blurb: 'Maps shared at explorers.starsystemx.com are listed on the start page and under Load Starmap, and anything you copy from the site brings its custom gases and liquids along.' },
    { title: 'See this message again',
      blurb: 'Click the SSE3.2 mark in the top corner to bring this back whenever you like.' },
  ];
</script>

<div class="modal-overlay" role="presentation" on:click={close} use:foreground>
  <div class="modal-card welcome-card" role="dialog" aria-label="Star System Explorer 3.2 is here" on:click|stopPropagation>
    <header class="w-head">
      <div>
        <h2>V3.2 is here</h2>
        <button
          class="ver"
          type="button"
          on:click={copyVersion}
          title={copied === 'ok' ? 'Copied: SSE v' + APP_VERSION : copied === 'fail' ? 'Could not copy — clipboard blocked' : 'Click to copy the version, for a bug report'}
        >{APP_VERSION}{#if copied === 'ok'}<span class="tick" aria-hidden="true"> ✓</span>{/if}</button>
      </div>
      <button class="w-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="w-body">
      <p class="lede">Welcome to
        <a href="https://explorers.starsystemx.com/" target="_blank" rel="noopener noreferrer">explorers.starsystemx.com</a>.
        Everything you already do still works and your saved starmaps still load. This release is
        two months of your bug reports answered, plus the features that were half-built when 3.1 went
        out. The short version:</p>

      {#if features.length}
        <ul class="feat">
          {#each features as f}
            <li class:pending={f.pending}>
              <span class="dot" aria-hidden="true"></span>
              <span>
                <strong>{f.title}.</strong>{#if f.pending}<span class="tag">{f.pending}</span>{/if}
                {f.blurb}
              </span>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="placeholder">Highlights land here as V3.2 takes shape.</p>
      {/if}

      <p class="guides-line">
        New here, or want the detail? Read the
        <a href="{GH}/GettingStarted.md" target="_blank" rel="noopener noreferrer">Getting Started guide</a>
        and the <a href="/physics" target="_blank" rel="noopener noreferrer">physics reference</a> — or find
        every guide any time under <strong>Help</strong> in the menu.
      </p>

      <div class="heads-up">
        <p><strong>As usual this has come in pretty hot, as I use you all as my testers.</strong>
        Have fun, and let me know about any weirdness on
        <a href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">our Discord</a> —
        anything serious gets fixed quickly, and your reports decide what gets attention first.</p>
        <p><strong>Keep a backup.</strong> Export anything precious before you re-save it.</p>
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
    /* Widened from 640px: the V3 list has grown long enough that a narrow column ran off the
       bottom of a desktop window. Wider trades height for width, which is the scarcer axis here. */
    width: min(860px, 94vw);
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
  /* The version is a BUTTON now (it copies), so it must stop looking like one: the rule above
     keeps its size and colour, and this only strips the chrome a button brings with it. */
  .ver {
    background: none;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    text-align: left;
  }
  .ver:hover { color: var(--accent); }
  .w-body { overflow-y: auto; padding: 14px 18px; }
  .lede { margin: 0 0 12px; color: var(--text, #e8e8e8); font-size: 0.94rem; line-height: 1.55; }
  .feat { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 9px; }
  .feat li { display: flex; gap: 10px; align-items: baseline; font-size: 0.9rem; line-height: 1.45; color: var(--text-muted, #cfcfcf); }
  .feat strong { color: var(--text, #e8e8e8); }
  .dot { flex: 0 0 auto; width: 7px; height: 7px; border-radius: 50%; background: var(--accent, #ff5a1f); transform: translateY(-1px); }
  /* NOT LANDED YET: dimmed, with its own dot drained of accent, so the eye separates what you can
     use today from what is on the way without having to read the tag. */
  .feat li.pending { opacity: 0.55; }
  .feat li.pending .dot { background: var(--text-faint, #8a8f9a); }
  .tag {
    display: inline-block; margin-left: 6px; padding: 1px 6px;
    border: 1px solid var(--border); border-radius: 999px;
    font-size: 0.68rem; text-transform: uppercase; letter-spacing: 0.05em;
    color: var(--text-faint, #8a8f9a); vertical-align: 1px; white-space: nowrap;
  }
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
