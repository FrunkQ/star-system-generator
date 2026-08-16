<script lang="ts">
  // The GM's picture of a world — and the several different pictures a GM actually wants of it.
  //
  // The artist's impression says what KIND of thing it is. The 2D disc and the 3D globe say what
  // THIS one looks like, derived from its own physics. And the last two say what it is like to be
  // THERE: familiar colours and a landscape under that world's own daylight, which is the pair that
  // answers questions at the table rather than in the panel.
  //
  // The 2D/3D switching is not reinvented here: `BodyGraphic` already does it for the player
  // document (see DocPanel), and this passes it the same modes.
  import type { CelestialBody, System, RulePack } from "$lib/types";
  import { planetTypeInfoUrl } from "$lib/util/planetTypeInfo";
  import BodyGraphic from "./BodyGraphic.svelte";
  import UnderThisLight from "$lib/charts/UnderThisLight.svelte";

  export let body: CelestialBody | null;
  export let system: System | null = null;
  export let rulePack: RulePack | null = null;

  type View = 'photo' | 'disc' | 'sphere' | 'swatch' | 'horizon';
  let view: View = 'photo';

  $: infoUrl = planetTypeInfoUrl(body?.classes);
  $: hasLight = !!body?.surfaceSpectrum;
  // A world with no derived colour has nothing to show in the last three views, so they are not
  // offered rather than offered empty.
  $: views = ([
    body?.image?.url ? { id: 'photo', label: 'Type', title: "The artist's impression for this world's type" } : null,
    { id: 'disc', label: '2D', title: 'This world as the orrery draws it, from its own physics' },
    system ? { id: 'sphere', label: '3D', title: 'This world as a globe — drag to spin it' } : null,
    hasLight ? { id: 'swatch', label: 'Colours', title: 'Familiar colours as they look under this world\'s own daylight' } : null,
    hasLight ? { id: 'horizon', label: 'Horizon', title: 'A landscape under this world\'s own daylight' } : null
  ].filter(Boolean) as { id: View; label: string; title: string }[]);

  // Never leave the panel on a view this world cannot show.
  $: if (views.length && !views.some((v) => v.id === view)) view = views[0].id;

  $: ringed = (body?.tags ?? []).some((t) => t.key === 'ring/system');
  // Just this body, for the 3D portrait — the same single-body system the player document builds.
  $: soloSystem = system && body
    ? ({ ...system, nodes: system.nodes.filter((n: any) => n.id === body!.id || n.roleHint === 'star') } as System)
    : null;

</script>

{#if body && (body.image || views.length)}
  <div class="planet-image-container">
    {#if view === 'photo' && body.image}
      <img src={body.image.url} alt="Artist's impression of {body.name}" class="planet-image" />
    {:else if view === 'swatch'}
      <!-- The old Colours view listed the swatches this world is MADE of, which turned out to answer a
           question nobody was asking. What a GM wants is the other direction: familiar colours, as they
           look down there. That is the chart, and the pill IS the scene picker so the viewer hides its own. -->
      <div class="pane chart-pane">
        <UnderThisLight {body} pack={rulePack} fixedScene="chart" height={150} />
      </div>
    {:else if view === 'horizon'}
      <div class="pane horizon-pane">
        <UnderThisLight {body} pack={rulePack} fixedScene="landscape" height={150} />
      </div>
    {:else}
      <div class="pane gfx-pane" class:spin={view === 'sphere'}>
        <!-- 'flat' is BodyGraphic's name for the FULL 2D-gallery render — texture, surface features,
             terminator, the thing the disc gallery shows. Its 'disc' mode is the lightweight plain
             circle coloured by TYPE, which is not what anyone means by "the 2D view". -->
        <BodyGraphic {body} system={soloSystem} mode={view === 'sphere' ? 'sphere' : 'flat'}
                     {ringed} interactive={view === 'sphere'} />
      </div>
    {/if}

    {#if views.length > 1}
      <div class="view-pills" role="group" aria-label="How to show this world">
        {#each views as v}
          <button type="button" class:on={view === v.id} title={v.title}
                  on:click={() => (view = v.id)}>{v.label}</button>
        {/each}
      </div>
    {/if}

    {#if infoUrl && view === 'photo'}
      <a class="info-pill" href={infoUrl} target="_blank" rel="noopener noreferrer" title="Open the planet-type classification entry in a new tab">
        More information
        <svg viewBox="0 0 24 24" width="11" height="11" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
      </a>
    {/if}
  </div>
{/if}

<style>
  /* A FIXED 4:3 box, so the panel does not jump as you switch between a tall artist's impression,
     a square render and a wide chart. Overzooming the picture to fill it is the right trade: a
     slightly cropped planet reads better than a panel that resizes under the cursor. */
  .planet-image-container {
    position: relative;
    width: 100%;
    aspect-ratio: 4 / 3;
    border-radius: 5px;
    overflow: hidden;
  }
  .planet-image {
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 5px;
    display: block;
  }
  .pane {
    width: 100%;
    height: 100%;
    overflow: auto;
    border-radius: 5px;
    background: #05070c;
    display: flex;
    align-items: center;
    justify-content: center;
    /* Top padding clears the pill group, which is an overlay: without it the pane's own controls
       sit underneath the buttons and the panel looks broken. */
    padding: 40px 10px 10px;
    box-sizing: border-box;
  }
  .gfx-pane { padding: 38px 6px 6px; }
  .gfx-pane.spin { cursor: grab; }
  .horizon-pane { align-items: stretch; flex-direction: column; padding: 38px 10px 10px; }
  .chart-pane { align-items: stretch; flex-direction: column; padding: 34px 10px 10px; }
  .swatch-pane .chip {
    width: 18px; height: 18px; border-radius: 4px; flex: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .swatch-pane .empty { color: var(--text-faint, #8a8f9a); font-size: 0.75rem; }

  /* Top-left, opposite the More-information pill so the two never fight for the same corner. */
  /* TOP RIGHT. At top-left these sat directly on the viewer's own scene picker and wipe slider,
     which is how the first version hid its own controls behind its buttons. */
  .view-pills {
    position: absolute;
    right: 8px;
    top: 8px;
    display: inline-flex;
    gap: 2px;
    padding: 2px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.25);
    backdrop-filter: blur(2px);
  }
  .view-pills button {
    border: none;
    background: transparent;
    color: var(--text, #e8e8e8);
    font-size: 0.68rem;
    padding: 2px 8px;
    border-radius: 999px;
    cursor: pointer;
    line-height: 1.5;
  }
  .view-pills button:hover { color: var(--accent, #ff5a1f); }
  .view-pills button.on { background: rgba(255, 255, 255, 0.16); }

  .info-pill {
    position: absolute;
    right: 8px;
    bottom: 8px;
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(0, 0, 0, 0.62);
    border: 1px solid rgba(255, 255, 255, 0.25);
    color: var(--text, #e8e8e8);
    font-size: 0.72rem;
    text-decoration: none;
    backdrop-filter: blur(2px);
  }
  .info-pill:hover {
    background: rgba(0, 0, 0, 0.8);
    border-color: var(--accent, #ff5a1f);
    color: var(--accent, #ff5a1f);
  }
  .info-pill svg { flex: 0 0 auto; }
</style>
