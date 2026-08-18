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
  const features: { title: string; blurb: string; pending?: string }[] = [
    // PLAYER VIEWS LEADS — owner, 2026-08-16: "this is the feature's BIGGEST drop and replaces 2
    // older tools. The 3D was done to SUPPORT this — so this is the reason it exists." It had been
    // fifth, and briefly retitled "Player views in 3D", which UNDERSOLD it: 3D is one of three
    // presentations, not the point. The point is that you choose how your table sees the universe.
    // It supersedes the Field Guide and the Projector (see inbox A42/A47).
    { title: 'Player views', blurb: "The headline. Design exactly what your table sees and serve it live to their own phones, tablets and screens — as text, as a 2D map, or as the real three-dimensional system, whichever suits the moment. Redacted to what they should know, updating as you play, and dressed with filters and transitions so it reads as YOUR universe rather than as a tool. It replaces the old Field Guide and Projector outright, and everything else here exists to feed it." },
    { title: 'A rewritten physics engine', blurb: 'What a world is made of decides everything else: density, temperature, atmosphere and cloud decks, oceans and ice, magnetism, geology, the radiation it throws out and the colour you actually see. The Newton panel shows the working.' },
    { title: 'The light that reaches the ground', blurb: 'A star’s spectrum is filtered by the air and the cloud decks above it, so what lands on the surface is not what left the star. That light sets the colour of the land, the sea and the sky, and decides what colour the plants would be to grow under it — and the physics pages draw the curve rather than describing it.' },
    { title: 'Life is a tag too', blurb: 'What lives on a world — microbes, fungi, plants, animals, or something that builds cities — is described the same way everything else is, and it shows on the planet: vegetation spreads inland from the coast, in a colour worked out from the light that actually reaches it. Searchable, editable, and yours to invent from.' },
    // Reworded to sit UNDER Player views rather than beside it: the 3D view was built to serve the
    // player view (owner, 2026-08-16), and TAG-20 records that a player's system view is the same
    // renderer at both tiers. Saying so makes both lines honest instead of two rival headlines.
    { title: 'The system in 3D', blurb: 'The view behind all of that: a real three-dimensional system — orbits, tilts and moons where the physics puts them, each world lit by its own star. It is the same renderer whether you are running the table or sitting at it.' },
    // The sight-line clause is verified, not assumed: v2.1.667 derives visibility from the SAME
    // optical depth as the surface spectrum, and lands Earth on 343 km (the clean-air Rayleigh
    // limit) and Venus on 4 km. The owner called it "how far the players' torches reach".
    { title: 'Stand on the surface', blurb: 'Every world has a Surface view: its own ground, sky and light as you would find them standing on it, coloured by what actually reaches the surface rather than by what left the star. A red dwarf&rsquo;s noon does not look like ours — and it answers how far your players can see, and how far a lamp carries, in metres rather than in adjectives.' },
    { title: 'Stars properly classified', blurb: 'Stars carry their real classification — spectral type and luminosity class — read from size and temperature rather than from how bright they look, so a supergiant is a supergiant rather than a dwarf that shares its colour. Antares arrives as the giant it is, every type is named in plain words with a famous example, and a star whose numbers break physics is kept and labelled rather than refused.' },
    { title: 'Weather, auroras and flares', blurb: 'Storms and lightning, aurorae where the magnetosphere allows them, stellar flares and the dose they deliver — consequences of the physics rather than decoration. The gases and liquids behind them are yours to edit.' },
    { title: 'Your own stars in the sky', blurb: 'Your starmap becomes the night sky behind the 3D view — every system at its true direction, brightness and colour — so the constellations your players see are made of places they can fly to.' },
    { title: 'Import the real sky', blurb: 'Build starmaps straight from the astronomy catalogues — the real stars near you at their true positions, with their confirmed planets, and plausible worlds filled in around the rest if you want them.' },
    { title: 'Starmaps have depth', blurb: 'Systems carry a z-axis, so distances are true in three dimensions. If you prefer a flat map, everything still works exactly as it did in 2D.' },
    { title: 'Everything is a tag', blurb: 'One tagging system throughout: the physics emits tags, you add your own, override the ones you disagree with, and choose which reach your players.' },
    { title: '3D ships', blurb: 'Bring your own models: constructs can be shown as real 3D craft.' },
    { title: 'Eclipse times', blurb: 'Know when a moon crosses its sun, and how long the shadow lasts.' },
    // FLAG REVERTED 2026-08-16, owner correcting the coordinator: "every physics improvement we have
    // tweaked the generation system to include the new stuff, so it is being background evolved."
    // He is right and I read the claim too strictly. The line says generation has been RETUNED TO SIT
    // BETTER INSIDE THE NEW PHYSICS, which is exactly what has been happening continuously — it does
    // not claim the spacing is finished. B58/B59/G24 are named remaining faults, not evidence the
    // sentence is false, and a pending tag would have understated real work. Left unflagged.
    // UPDATE v2.1.751: B58 has LANDED — planet spacing is now mutual-Hill-radius packing scaled by
    // the star instead of Sol's Titius-Bode sequence in absolute AU, so a red dwarf's planets sit
    // where a red dwarf's planets belong. B59's mass half is already done. Of the three named
    // faults only G24 remains, and only in part: the disk-mass dial was freed by B58 and measures
    // strongly now, while METALLICITY measures inert (it reaches about one body in seventy-four)
    // and rarity saturates above the midpoint. The wording of the line itself is the owner's call
    // once he has eyeballed a few generated systems.
    { title: 'Sharper generation', blurb: 'Procedural systems are retuned alongside the physics as it grows, so a generated system reflects what the engine currently knows rather than what it knew when the generator was written.' },
    { title: 'New default starmaps', blurb: 'The bundled maps are rebuilt from real astronomy, with true 3D positions, more systems, and a science-fiction companion map.' },
    { title: 'Your own map behind the stars', pending: 'coming', blurb: 'Drop in a sector map, or your empire’s borders, and pin it to the starmap so it holds its place against the stars as you pan and zoom.' },
    // FLAG CLEARED 2026-08-18: shipped v2.1.774-783 (G28) and the owner has seen it work — every step
    // is named ("Undo: Mass of Earth"), the campaign has its own history, the last twenty survive a
    // reload, and nothing rides an export or a share.
    { title: 'Undo and redo', blurb: 'Hallelujah. Every step is named, the last twenty survive a reload, and none of it leaves the room in a shared map.' },
    // 2026-08-18, owner: "VTT integration is Mappadux working. Looking for testers for OR and Foundry."
    // The line no longer carries a pending flag: the Mappadux half is a claim the build can make.
    { title: 'Virtual tabletop integration', blurb: 'Mappadux — free, and built alongside this — works today: your starmap and systems on the table, live. Owlbear Rodeo and Foundry are next, and we are looking for testers: if you run either, come and tell us what breaks and what you need.' },
    { title: 'Many improvements and fixes', blurb: 'Hundreds of smaller changes throughout — the changelog has every one, build by build.' }
  ];
</script>

<div class="modal-overlay" role="presentation" on:click={close} use:foreground>
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
