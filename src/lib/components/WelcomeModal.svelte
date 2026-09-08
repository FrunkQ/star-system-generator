<script lang="ts">
  // First-run welcome — shown once (localStorage flag set by the parent on close).
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
  // V3.1 — THE OWNER'S OWN RELEASE NOTES, 2026-09-08, pasted into the panel's shape and trimmed only
  // for typos. His voice, his order, his jokes: do not rewrite these lines, and do not add one without
  // his word. `pending` still means NOT FULLY LANDED and dims the line with a tag - megastructures
  // carry his own "(Not 100% complete)".
  const features: { title: string; blurb: string; pending?: string }[] = [
    { title: 'Megastructures', pending: 'not 100% complete',
      blurb: 'Space elevators, planetary rings and toruses, ringworlds, Dyson spheres and swarms, energy collectors and a battle station: placed like any other object, drawn to scale in 2D and 3D, and obeying the physics. A swarm dims its star and every world’s temperature follows.' },
    { title: 'Docking',
      blurb: 'Ships dock at an elevator’s stations at low, middle and geostationary height, on a ring’s rim or a hull, and ride with the structure. The planner prices the approach, and turns a wrong-way arrival around and charges for it.' },
    { title: 'The Explorers site',
      blurb: 'Share a map at explorers.starsystemx.com, browse other people’s, copy any star or system from a page and paste it into your campaign with the cartographer credited automatically, and open a shared map in the app in one click. Maps you upload there show on the sharing chat here.' },
    { title: 'Cut, copy and paste anything to anywhere',
      blurb: 'You can even copy a system, ship or planet from the Explorers site.' },
    { title: 'Size comparison',
      blurb: 'Every object on your system map at true scale, side by side, ordered by size, mass, name or orbit, rings drawn to their real extent. Click anything to centre it. It is a player view option too. (Ooo-er missus!)' },
    { title: 'Binaries that behave',
      blurb: 'A pair orbits its shared centre properly, a binary imported from a file arrives as two stars, a body can be moved to a new host by hand, and the Lagrange points are real places ships can hold and leave from.' },
    { title: 'Stars named properly',
      blurb: 'Sirius reads as the A1V it is, a metallic-line star’s notation is read and kept, and a star that jets or sheds a shell now shows it inside its own system, not only on the map. A photosphere burns white at its centre and keeps its colour at the limb, as a real one does.' },
    { title: 'Break physics on purpose',
      blurb: 'An Overrides tab lets you set what physics would not, and labels it as an anomaly rather than pretending.' },
    { title: 'Time on a real footing',
      blurb: 'The calendar is grounded to a real date, and reports say honestly which moment they describe.' },
    { title: 'A sky that is right',
      blurb: 'Orion no longer appears mirrored, the GM view zooms out a thousand times further, and a hover on any star summarises it.' },
    { title: 'Magnetic field visualisation',
      blurb: 'See what makes magnetic fields and how far they extend — a GM view option and a player view setting.' },
    { title: 'Quieter machinery',
      blurb: 'A memory gauge in the rail with an automatic crash save, a transit left running no longer fills memory, undo survives the clock, render-loop throttling, mild GM display customisation, a construct you export imports back, a low-power mode if this is too much for your browser, a liquid you invent reaches the gas editor, and the phone layout got its audit.' }
  ];
</script>

<div class="modal-overlay" role="presentation" on:click={close} use:foreground>
  <div class="modal-card welcome-card" role="dialog" aria-label="Star System Explorer 3.1 is here" on:click|stopPropagation>
    <header class="w-head">
      <div>
        <h2>V3.1 is here</h2>
        <p class="ver">{APP_VERSION}</p>
      </div>
      <button class="w-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="w-body">
      <p class="lede">Welcome to
        <a href="https://explorers.starsystemx.com/" target="_blank" rel="noopener noreferrer">explorers.starsystemx.com</a>.
        Everything you already do still works and your saved starmaps still load, and this release is
        about scale: bigger structures, bigger views, and a place to share it all. The short version:</p>

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
        <p class="placeholder">Highlights land here as V3.1 takes shape.</p>
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
