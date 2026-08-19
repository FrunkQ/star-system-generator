<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { APP_VERSION, APP_DATE } from '$lib/constants';
  import DebugFooter from './DebugFooter.svelte';
  import type { RulePack } from '$lib/types';
  import { foreground } from '$lib/ui/foreground';
  // G16 - ATTRIBUTION FOLLOWS WHAT IS ON SCREEN, and here that is a licence condition rather than
  // tidiness. The starmap background used to be one hardcoded sentence crediting ESO's Milky Way.
  // The moment a GM puts their own sector map behind the stars that sentence is FALSE, and the
  // moment the shipped image is back it must be true again - CC BY 4.0 requires the author be named
  // while the work is in use, and requires that we not claim it when it is not.
  import { starmapStore } from '$lib/starmapStore';
  import { resolveMapBackground } from '$lib/map/mapBackground';
  import { BUILTIN_ASSETS } from '$lib/player/presets';

  const dispatch = createEventDispatcher();

  $: shownBackground = resolveMapBackground($starmapStore, [...BUILTIN_ASSETS, ...($starmapStore?.playerAssets ?? [])]);
  // Three states, three honest sentences. The middle one is the case that did not exist before and
  // is the whole reason this is dynamic: a GM's own image, credited or explicitly uncredited.
  $: backgroundCredit = !shownBackground
    ? 'Starmap Background: none shown.'
    : shownBackground.isDefault
      ? null // the ESO sentence below already covers it, unchanged
      : shownBackground.credit
        ? `Starmap Background: &ldquo;${escapeHtml(shownBackground.name ?? 'uploaded image')}&rdquo;, supplied by the GM. Credit: ${escapeHtml(shownBackground.credit)}${shownBackground.sourceUrl ? `. Source: ${escapeHtml(shownBackground.sourceUrl)}` : ''}.`
        : `Starmap Background: &ldquo;${escapeHtml(shownBackground.name ?? 'uploaded image')}&rdquo;, uploaded by the GM; no credit given.`;
  $: showEsoBackground = !!shownBackground?.isDefault;
  const escapeHtml = (t: string) =>
    t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  // When a system is open, the parent passes its rulePack so the Debug tools
  // (Show JSON / Rebuild Hierarchy / Update & Repair) appear here. null → hidden.
  export let rulePack: RulePack | null = null;

  let showDebug = false;

  $: aboutContent = `
<h2>Star System Explorer</h2>

<p><strong>Version:</strong> ${APP_VERSION}<br>
<strong>Date:</strong> ${APP_DATE}</p>

<p>A tool for creating and exploring scientifically-plausible star systems. Guides &amp; references are under <strong>Help</strong> in the menu.</p>

<hr>

<p><strong>Community Credits:</strong><br>
Thanks to @Athena, @Mafro & @malize from the creative community on our <a href="https://discord.gg/UAEq4zzjD8" target="_blank">Discord forum</a> for the example star systems!</p>

<p>A special thanks to <a href="https://www.iammitch.com/" target="_blank">Mitch Anderson</a> for permission to use his <a href="https://github.com/tmanderson/Accrete.js" target="_blank">Accrete.js</a> code in the new experimental system generation. <br> That in turn was built on the work of: Stephen H. Dole, Carl Sagan, Richard Isaacson, <a href="https://www.academia.edu/4173808/Extra-Solar_Planetary_Systems_A_Microcomputer_Simulation" target="_blank">Martyn Fogg</a>, Matt Burdick, <a href="https://www.eldacur.com/~brons/NerdCorner/StarGen/StarGen.html" target="_blank">Jim Burrows</a> & <a href="https://znark.com/create/accrete.html" target="_blank">Ian Burrell</a>.</p>

<p><strong>Community & Support:</strong><br>
<a href="https://discord.gg/UAEq4zzjD8" target="_blank">Join us on Discord!</a></p>

<p><strong>Inspiration:</strong></p>
<ul>
<li><a href="https://www.youtube.com/@whatdamath" target="_blank">Anton Petrov</a></li>
<li><a href="https://www.youtube.com/@DrBecky" target="_blank">Dr. Becky</a></li>
<li><a href="https://www.youtube.com/@SabineHossenfelder" target="_blank">Sabine Hossenfelder</a></li>
<li><a href="https://www.youtube.com/@scottmanley" target="_blank">Scott Manley</a></li>
</ul>

<p><strong>Open-Source Software:</strong><br>
Built with <a href="https://kit.svelte.dev/" target="_blank" rel="noopener noreferrer">SvelteKit</a>. Uses <a href="https://threejs.org/" target="_blank" rel="noopener noreferrer">three.js</a> (all 3D rendering and model loading), <a href="https://github.com/zeux/meshoptimizer" target="_blank" rel="noopener noreferrer">meshoptimizer</a> (simplifying high-poly ship models at import), <a href="https://github.com/101arrowz/fflate" target="_blank" rel="noopener noreferrer">fflate</a> (reading and writing zip save bundles, and unzipping Universe Sandbox &amp; SpaceEngine imports), <a href="https://peerjs.com/" target="_blank" rel="noopener noreferrer">PeerJS</a> (live sharing to players' devices) and <a href="https://github.com/soldair/node-qrcode" target="_blank" rel="noopener noreferrer">qrcode</a> (share-link QR codes) — each under the MIT license. Ship-model decompression uses Google's <a href="https://github.com/google/draco" target="_blank" rel="noopener noreferrer">Draco</a> decoder (Apache-2.0), bundled from three.js's own distribution.</p>

<hr>

<p><strong>Astronomy Data:</strong></p>
<p>Real-sky imports and the bundled starmaps make use of the <a href="https://exoplanetarchive.ipac.caltech.edu/" target="_blank" rel="noopener noreferrer">NASA Exoplanet Archive</a>, which is operated by the California Institute of Technology, under contract with the National Aeronautics and Space Administration under the Exoplanet Exploration Program, and of the <a href="https://simbad.cds.unistra.fr/simbad/" target="_blank" rel="noopener noreferrer">SIMBAD database</a>, operated at CDS, Strasbourg, France. A snapshot of the archive's confirmed-planet set ships with the app; star-name resolution queries SIMBAD live. S-star orbital elements: Gillessen et al. 2017, refined by the GRAVITY Collaboration.</p>

<p><strong>Image Attributions:</strong></p>
<p>Planet Images: Courtesy of Pablo Carlos Budassi, used under a <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> license. Source: <a href="https://pablocarlosbudassi.com/2021/02/planet-types.html" target="_blank" rel="noopener noreferrer">pablocarlosbudassi.com</a>.</p>
<p>Star Images: Sourced from the <a href="https://beyond-universe.fandom.com/wiki/" target="_blank" rel="noopener noreferrer">Beyond Universe Wiki</a> on Fandom, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a> license.</p>
<p>Magnetar Image: Courtesy of ESO/L. Calçada, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Source: <a href="https://www.eso.org/public/images/eso1415a/" target="_blank" rel="noopener noreferrer">ESO Magnetar</a>. Red supergiant: an artist&rsquo;s reconstruction of <a href="https://www.eso.org/public/images/eso2417a/" target="_blank" rel="noopener noreferrer">WOH&nbsp;G64</a>, ESO / L. Cal&ccedil;ada.</p>
${showEsoBackground ? `<p>Starmap Background: Courtesy of ESO/S. Brunier, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Source: <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO Milky Way</a>.</p>` : ''}
${backgroundCredit ? `<p>${backgroundCredit}</p>` : ''}
<p>Star-type illustrations: orange giant (Arcturus) by Pablo Carlos Budassi, Wikimedia Commons, used under <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a>. Red giant by <a href="https://science.nasa.gov/universe/stars/types/" target="_blank" rel="noopener noreferrer">NASA&rsquo;s Goddard Space Flight Center</a> / Chris Smith (KBRwyle).</p>
<p>Black Hole Accretion Disk Image: Courtesy of NASA’s Goddard Space Flight Center/Jeremy Schnittman, used under a <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">Public Domain</a> license. Source: <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">NASA SVS</a>.</p>
<p>Starter Spacecraft Models (ISS, Hubble, Cassini-Huygens, Juno, Voyager, Mars Reconnaissance Orbiter): Courtesy of NASA, public domain. Source: <a href="https://github.com/nasa/NASA-3D-Resources" target="_blank" rel="noopener noreferrer">NASA 3D Resources</a>. Textured models resampled for bundle size; the protected NASA insignia is not used.</p>
<p>Asteroid &amp; Comet Images: Courtesy of NASA (not subject to copyright). C-type: 253 Mathilde (<a href="https://nssdc.gsfc.nasa.gov/imgcat/html/object_page/nea_19970627_mos.html" target="_blank" rel="noopener noreferrer">NEAR, NSSDCA</a>); S-type: 433 Eros (<a href="https://photojournal.jpl.nasa.gov/catalog/PIA02923" target="_blank" rel="noopener noreferrer">NEAR Shoemaker, PIA02923</a>); M-type: 16 Psyche illustration (<a href="https://www.nasa.gov/feature/jpl/how-nasa-s-psyche-mission-will-explore-an-unexplored-world" target="_blank" rel="noopener noreferrer">NASA/JPL-Caltech</a>); Comet: Hartley 2 (<a href="https://science.nasa.gov/photojournal/introducing-comet-hartley-2/" target="_blank" rel="noopener noreferrer">EPOXI, NASA/JPL-Caltech/UMD</a>).</p>
<p>H-R Diagram Background: <a href="https://www.eso.org/public/images/eso0728c/" target="_blank" rel="noopener noreferrer">ESO</a>, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license.</p>
<p>Weyland-Yutani Logo: Sourced from <a href="https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> by <a href="https://commons.wikimedia.org/wiki/User:IllaZilla" target="_blank" rel="noopener noreferrer">IllaZilla</a>, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.en" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-Share Alike 3.0 Unported</a> license. Changes made: Logo Extracted.</p>
<p>Corporate Logos (Interspan, Kelido, Nexum, Terra, TSEC): Courtesy of World Zero, from <a href="https://worldzero.itch.io/corporate-portfolio" target="_blank" rel="noopener noreferrer">Corporate Portfolio</a>, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Thanks!</p>

`;
  // The licence and the project links live in the FOOTER below, not in this scrolling body —
  // one statement of each, always on screen, matching the Mappadux About box.

  function close() {
    dispatch('close');
  }
</script>

<div class="modal-overlay" role="presentation" on:click={close} use:foreground>
  <div class="modal-card about-card" role="dialog" aria-label="About" on:click|stopPropagation>
    <header class="about-head">
      <span>About</span>
      <button class="about-close" aria-label="Close" on:click={close}>×</button>
    </header>

    <div class="about-body">{@html aboutContent}</div>

    {#if rulePack}
      <hr />
      <section class="about-debug">
        <button class="debug-toggle" on:click={() => (showDebug = !showDebug)}>
          {showDebug ? '▾' : '▸'} Debug tools
        </button>
        {#if showDebug}
          <DebugFooter {rulePack} />
        {/if}
      </section>
    {/if}

    <footer class="about-foot">
      <div class="foot-title">Star System Explorer {APP_VERSION} — scientifically-plausible star systems</div>
      <nav class="foot-links">
        <a href="https://starsystemx.com/" target="_blank" rel="noopener noreferrer">starsystemx.com</a>
        <span aria-hidden="true">·</span>
        <a href="https://beta.starsystemx.com/" target="_blank" rel="noopener noreferrer">Beta</a>
        <span aria-hidden="true">·</span>
        <a href="https://discord.gg/UAEq4zzjD8" target="_blank" rel="noopener noreferrer">Discord</a>
        <span aria-hidden="true">·</span>
        <a href="https://ko-fi.com/frunkq" target="_blank" rel="noopener noreferrer">Ko-fi</a>
        <span aria-hidden="true">·</span>
        <a href="https://github.com/FrunkQ/star-system-generator" target="_blank" rel="noopener noreferrer">GitHub</a>
      </nav>
      <div class="foot-licence">
        This slop was vibe-coded by FrunkQ ·
        <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>
      </div>
    </footer>
  </div>
</div>

<style>
  .about-card {
    width: min(980px, 94vw);
    max-height: 86vh;
    display: flex;
    flex-direction: column;
    padding: 0;
  }
  .about-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    border-bottom: 1px solid var(--border);
    font-weight: 700;
    color: var(--accent);
    flex: 0 0 auto;
  }
  .about-close {
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
  .about-close:hover { background: color-mix(in srgb, var(--status-bad, #e0484d) 30%, var(--bg-control)); }
  .about-body {
    overflow-y: auto;
    padding: 4px 18px;
  }
  .about-body :global(a) { color: var(--link); }
  .about-body :global(h2) { color: var(--accent); }
  .about-body :global(hr) { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
  .about-debug {
    flex: 0 0 auto;
    padding: 0 18px 16px;
  }
  .debug-toggle {
    background: var(--bg-control);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    color: var(--text-muted, #cfcfcf);
    padding: 6px 10px;
    cursor: pointer;
    font-size: 0.85rem;
  }
  .debug-toggle:hover { background: var(--bg-control-hover); }
  hr { border: none; border-top: 1px solid var(--border); margin: 0; }
  /* Always on screen: the body scrolls, this does not — so the licence and the project links
     cannot be missed by anyone who never reaches the bottom of a long credits list. */
  .about-foot {
    flex: 0 0 auto;
    border-top: 1px solid var(--border);
    padding: 10px 18px 12px;
    text-align: center;
    font-size: 0.85rem;
    color: var(--text-muted, #cfcfcf);
  }
  .foot-title { font-weight: 600; }
  .foot-links { margin-top: 2px; display: flex; flex-wrap: wrap; gap: 6px; justify-content: center; }
  .foot-links span { opacity: 0.5; }
  .about-foot a { color: var(--link); }
  .foot-licence { margin-top: 2px; opacity: 0.75; font-size: 0.8rem; }
</style>
