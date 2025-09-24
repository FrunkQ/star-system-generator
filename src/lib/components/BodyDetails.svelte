<script lang="ts">
  import type { CelestialBody, Barycenter } from "$lib/types";

  export let body: CelestialBody | Barycenter | null;
</script>

<div class="details-panel">
  {#if body}
    <h2>{body.name}</h2>
    <div class="details-grid">
        <div class="detail-item">
            <span class="label">ID</span>
            <span class="value">{body.id}</span>
        </div>
        <div class="detail-item">
            <span class="label">Kind</span>
            <span class="value">{body.kind}</span>
        </div>
        {#if body.kind === 'body'}
            <div class="detail-item">
                <span class="label">Classes</span>
                <span class="value">{body.classes.join(', ')}</span>
            </div>
            {#if body.massKg}
                <div class="detail-item">
                    <span class="label">Mass</span>
                    <span class="value">{(body.massKg / 1.989e30).toPrecision(3)} Solar Masses</span>
                </div>
            {/if}
            {#if body.radiusKm}
                <div class="detail-item">
                    <span class="label">Radius</span>
                    <span class="value">{body.radiusKm.toLocaleString()} km</span>
                </div>
            {/if}
        {/if}
    </div>

  {:else}
    <p>Select a body to see its details.</p>
  {/if}
</div>

<style>
  .details-panel {
    border: 1px solid #333;
    background-color: #1a1a1a;
    padding: 1em;
    margin-top: 1em;
    border-radius: 5px;
  }
  h2 {
    margin-top: 0;
    color: #ff3e00;
  }
  .details-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
      gap: 0.5em;
  }
  .detail-item {
      display: flex;
      flex-direction: column;
      background-color: #222;
      padding: 0.5em;
      border-radius: 3px;
  }
  .label {
      font-size: 0.8em;
      color: #888;
      text-transform: uppercase;
  }
  .value {
      font-size: 1.1em;
      color: #eee;
  }
</style>
