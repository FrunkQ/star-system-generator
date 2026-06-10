<script lang="ts">
  import type { CelestialBody } from "$lib/types";
  import { planetTypeInfoUrl } from "$lib/util/planetTypeInfo";

  export let body: CelestialBody | null;

  $: infoUrl = planetTypeInfoUrl(body?.classes);
</script>

{#if body && body.image}
  <div class="planet-image-container">
    <img src={body.image.url} alt="Artist's impression of {body.name}" class="planet-image" />
    {#if infoUrl}
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
