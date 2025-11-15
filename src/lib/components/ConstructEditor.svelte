<script lang="ts">
  import type { CelestialBody, RulePack } from '$lib/types';

  export let construct: CelestialBody;
  export let rulePack: RulePack;

</script>

<div class="editor-container">
  <h3>Editing: {construct.name}</h3>
  <p>Construct editor coming soon.</p>
  <pre>{JSON.stringify(construct, null, 2)}</pre>
</div>

<style>
  .editor-container {
    padding: 1em;
    border: 1px solid #444;
    border-radius: 5px;
    background-color: #222;
  }
</style>
