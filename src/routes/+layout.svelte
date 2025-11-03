<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<style>
  :global(body) {
    background-color: #333;
    color: #eee;
    font-family: 'Arial', sans-serif;
  }

  :global(button) {
    background-color: #555;
    color: #eee;
    padding: 8px 15px;
    border: none;
    border-radius: 4px;
    cursor: pointer;
    font-size: 1em;
    transition: background-color 0.2s ease;
  }

  :global(button:hover) {
    background-color: #777;
  }

  :global(button:disabled) {
    background-color: #444;
    cursor: not-allowed;
    color: #888;
  }

  :global(input[type="text"]),
  :global(input[type="number"]),
  :global(input[type="password"]),
  :global(select),
  :global(textarea) {
    padding: 8px;
    border: 1px solid #555;
    border-radius: 4px;
    font-size: 1em;
    background-color: #444;
    color: #eee;
  }

  :global(a) {
    color: #88ccff;
    text-decoration: none;
  }

  :global(a:hover) {
    text-decoration: underline;
  }

  :global(.error) {
    color: #ff8888;
    font-weight: bold;
  }
</style>
