<script lang="ts">
  import type { CelestialBody } from "$lib/types";

  export let body: CelestialBody | null;
</script>

{#if body && body.image}
  <div class="planet-image-container">
    <img src={body.image.url} alt="Artist's impression of {body.name}" class="planet-image" />
  </div>
{/if}

<style>
  .planet-image-container {
    width: 100%;
  }
  .planet-image {
    max-width: 100%;
    border-radius: 5px;
  }
</style>