<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
</script>

<div class="tab-panel">
  <h3>Power</h3>
  <p>Power for {construct.name}</p>
  <!-- Power editing UI will go here -->
</div>

<style>
  .tab-panel {
    padding: 10px;
  }
</style>
