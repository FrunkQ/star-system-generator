<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;
</script>

<div class="tab-panel">
  <h3>Life Support</h3>
  <p>Life Support for {construct.name}</p>
  <!-- Life Support editing UI will go here -->
</div>

<style>
  .tab-panel {
    padding: 10px;
  }
</style>
