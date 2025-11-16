<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
</script>

<div class="tab-panel">
  <h3>Modules</h3>
  <p>Modules for {construct.name}</p>
  <!-- Modules editing UI will go here -->
</div>

<style>
  .tab-panel {
    padding: 10px;
  }
</style>
