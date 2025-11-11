<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
</svelte:head>

{@render children?.()}

<footer>
  <p>
    <strong>Image Attributions:</strong>
  </p>
  <p>
    Planet Images: Courtesy of Pablo Carlos Budassi, used under a <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> license. Source: <a href="https://pablocarlosbudassi.com/2021/02/planet-types.html" target="_blank" rel="noopener noreferrer">pablocarlosbudassi.com</a>
  </p>
  <p>
    Star Images: Sourced from the Beyond Universe Wiki on Fandom, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a> license.
  </p>
  <p>
    Magnetar Image & Starmap Background: Courtesy of ESO/L. Calçada & S. Brunier, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Sources: <a href="https://www.eso.org/public/images/eso1415a/" target="_blank" rel="noopener noreferrer">ESO Magnetar</a>, <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO Milky Way</a>
  </p>
  <p>
    Black Hole Accretion Disk Image: Courtesy of NASA’s Goddard Space Flight Center/Jeremy Schnittman, used under a Public Domain license. Source: <a href="https://svs.gsfc.nasa.gov/13326" target="_blank" rel="noopener noreferrer">NASA SVS</a>
  </p>
  <p>
    Weyland-Yutani Logo: Courtesy of Bagera3005, used under a <a href="https://creativecommons.org/licenses/by/3.0/" target="_blank" rel="noopener noreferrer">CC BY 3.0</a> license. Source: <a href="https://www.deviantart.com/bagera3005/art/Weyland-Yutani-corp-155128785" target="_blank" rel="noopener noreferrer">DeviantArt</a>
  </p>
  <p>&nbsp;</p> 
  <p>
    <strong>Project Attribution:</strong>
  </p>
  <p class="project-attribution">
    <a href="https://github.com/FrunkQ/star-system-generator" target="_blank" rel="noopener noreferrer">Star System Generator</a> © 2025 FrunkQ. Licensed under <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>.
  </p>
</footer>

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

  footer {
    padding: 1rem;
    text-align: center;
    font-size: 0.8rem;
    color: #aaa;
  }

  footer p {
    margin: 0.2rem 0;
  }

  .project-attribution {
    color: #ccc; /* Lighter text color */
  }
</style>
