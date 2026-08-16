<script lang="ts">
  // The GM's picture of a world — and the several different pictures a GM actually wants of it.
  //
  // The artist's impression says what KIND of thing it is. The 2D disc and the 3D globe say what
  // THIS one looks like, derived from its own physics. The swatches say what colours are on it. And
  // the horizon says what it looks like from the ground, under its own daylight — which is the one
  // that answers questions at the table rather than in the panel.
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
    body?.apparentColor ? { id: 'swatch', label: 'Colours', title: 'The colours on this world, and its daylight' } : null,
    hasLight ? { id: 'horizon', label: 'Horizon', title: 'What things look like standing on it, under its own daylight' } : null
  ].filter(Boolean) as { id: View; label: string; title: string }[]);

  // Never leave the panel on a view this world cannot show.
  $: if (views.length && !views.some((v) => v.id === view)) view = views[0].id;

  $: ringed = (body?.tags ?? []).some((t) => t.key === 'ring/system');
  // Just this body, for the 3D portrait — the same single-body system the player document builds.
  $: soloSystem = system && body
    ? ({ ...system, nodes: system.nodes.filter((n: any) => n.id === body!.id || n.roleHint === 'star') } as System)
    : null;

  $: swatches = (() => {
    const out: { hex: string; label: string }[] = [];
    for (const p of body?.apparentColor?.palette ?? []) out.push({ hex: p.hex, label: p.label || p.role });
    for (const l of body?.vegetation?.layers ?? []) {
      if (l.colorHex) out.push({ hex: l.colorHex, label: `${l.label}${l.pigmentLabel ? ` · ${l.pigmentLabel}` : ''}` });
    }
    if (body?.surfaceSpectrum) out.push({ hex: body.surfaceSpectrum.surfaceLightHex, label: 'daylight there' });
    return out;
  })();
</script>

{#if body && (body.image || views.length)}
  <div class="planet-image-container">
    {#if view === 'photo' && body.image}
      <img src={body.image.url} alt="Artist's impression of {body.name}" class="planet-image" />
    {:else if view === 'swatch'}
      <div class="pane swatch-pane">
        {#each swatches as s}
          <span class="sw" title="{s.label} — {s.hex}, as human eyes would see it">
            <span class="chip" style="background:{s.hex}"></span>
            <span class="lbl">{s.label}</span>
          </span>
        {/each}
        {#if !swatches.length}<p class="empty">Nothing derived yet — re-process the system.</p>{/if}
      </div>
    {:else if view === 'horizon'}
      <div class="pane horizon-pane">
        <UnderThisLight {body} pack={rulePack} height={190} />
      </div>
    {:else}
      <div class="pane gfx-pane" class:spin={view === 'sphere'}>
        <BodyGraphic {body} system={soloSystem} mode={view === 'sphere' ? 'sphere' : 'disc'}
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
  .planet-image-container {
    position: relative;
    width: 100%;
  }
  .planet-image {
    max-width: 100%;
    border-radius: 5px;
    display: block;
  }
  .pane {
    width: 100%;
    min-height: 190px;
    border-radius: 5px;
    background: #05070c;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 10px;
    box-sizing: border-box;
  }
  .gfx-pane { padding: 6px; }
  .gfx-pane.spin { cursor: grab; }
  .horizon-pane { align-items: stretch; flex-direction: column; }
  .swatch-pane { flex-wrap: wrap; gap: 10px; align-content: flex-start; justify-content: flex-start; }
  .swatch-pane .sw { display: inline-flex; align-items: center; gap: 6px; font-size: 0.72rem; color: var(--text-muted, #cfcfcf); }
  .swatch-pane .chip {
    width: 18px; height: 18px; border-radius: 4px; flex: none;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }
  .swatch-pane .empty { color: var(--text-faint, #8a8f9a); font-size: 0.75rem; }

  /* Top-left, opposite the More-information pill so the two never fight for the same corner. */
  .view-pills {
    position: absolute;
    left: 8px;
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
