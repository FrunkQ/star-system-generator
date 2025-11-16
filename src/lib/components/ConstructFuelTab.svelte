<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
</script>

<div class="tab-panel">
  <h3>Fuel Tanks and Consumption</h3>
  <p>Fuel for {construct.name}</p>
  <!-- Fuel editing UI will go here -->
</div>

<style>
  .tab-panel {
    padding: 10px;
  }
</style>
