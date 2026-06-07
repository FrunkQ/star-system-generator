<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { APP_VERSION, APP_DATE } from '$lib/constants';
  import MarkdownModal from './MarkdownModal.svelte';

  const dispatch = createEventDispatcher();

  const aboutContent = `
<h1>Star System Explorer</h1>

<p><strong>Version:</strong> ${APP_VERSION}<br>
<strong>Date:</strong> ${APP_DATE}</p>

<p>A tool for creating and exploring scientifically-plausible star systems.</p>

<hr>

<p><strong>Community Credits:</strong><br>
Thanks to @Athena, @Mafro & @malize from the creative community on our <a href="https://discord.gg/UAEq4zzjD8" target="_blank">Discord forum</a> for the example star systems!</p>

<p>A special thanks to <a href="https://www.iammitch.com/" target="_blank">Mitch Anderson</a> for permission to use his <a href="https://github.com/tmanderson/Accrete.js" target="_blank">Accrete.js</a> code in the new experimental system generation. <br> That in turn was built on the work of: Stephen H. Dole, Carl Sagan, Richard Isaacson, <a href="https://www.academia.edu/4173808/Extra-Solar_Planetary_Systems_A_Microcomputer_Simulation" target="_blank">Martyn Fogg</a>, Matt Burdick, <a href="https://www.eldacur.com/~brons/NerdCorner/StarGen/StarGen.html" target="_blank">Jim Burrows</a> & <a href="https://znark.com/create/accrete.html" target="_blank">Ian Burrell</a>.</p>

<p><strong>Community & Support:</strong><br>
<a href="https://discord.gg/UAEq4zzjD8" target="_blank">Join us on Discord!</a><br>
<a href="https://youtu.be/LrgNh2PVOlg" target="_blank">Watch the Tutorial Video</a></p>

<p><strong>Inspiration:</strong></p>
<ul>
<li><a href="https://www.youtube.com/@whatdamath" target="_blank">Anton Petrov</a></li>
<li><a href="https://www.youtube.com/@DrBecky" target="_blank">Dr. Becky</a></li>
<li><a href="https://www.youtube.com/@SabineHossenfelder" target="_blank">Sabine Hossenfelder</a></li>
<li><a href="https://www.youtube.com/@scottmanley" target="_blank">Scott Manley</a></li>
</ul>

<hr>

<p><strong>Image Attributions:</strong></p>
<p>Planet Images: Courtesy of Pablo Carlos Budassi, used under a <a href="https://creativecommons.org/licenses/by-sa/4.0/" target="_blank" rel="noopener noreferrer">CC BY-SA 4.0</a> license. Source: <a href="https://pablocarlosbudassi.com/2021/02/planet-types.html" target="_blank" rel="noopener noreferrer">pablocarlosbudassi.com</a>.</p>
<p>Star Images: Sourced from the <a href="https://beyond-universe.fandom.com/wiki/" target="_blank" rel="noopener noreferrer">Beyond Universe Wiki</a> on Fandom, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/us/" target="_blank" rel="noopener noreferrer">CC-BY-SA</a> license.</p>
<p>Magnetar Image &amp; Starmap Background: Courtesy of ESO/L. Calçada &amp; S. Brunier, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license. Sources: <a href="https://www.eso.org/public/images/eso1415a/" target="_blank" rel="noopener noreferrer">ESO Magnetar</a>, <a href="https://www.eso.org/public/images/eso0932a/" target="_blank" rel="noopener noreferrer">ESO Milky Way</a>.</p>
<p>Black Hole Accretion Disk Image: Courtesy of NASA’s Goddard Space Flight Center/Jeremy Schnittman, used under a <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">Public Domain</a> license. Source: <a href="https://svs.gsfc.nasa.gov/13232" target="_blank" rel="noopener noreferrer">NASA SVS</a>.</p>
<p>H-R Diagram Background: <a href="https://www.eso.org/public/images/eso0728c/" target="_blank" rel="noopener noreferrer">ESO</a>, used under a <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">CC BY 4.0</a> license.</p>
<p>Weyland-Yutani Logo: Sourced from <a href="https://commons.wikimedia.org/wiki/File:Weyland-Yutani_cryo-tube.jpg" target="_blank" rel="noopener noreferrer">Wikimedia Commons</a> by <a href="https://commons.wikimedia.org/wiki/User:IllaZilla" target="_blank" rel="noopener noreferrer">IllaZilla</a>, used under a <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.en" target="_blank" rel="noopener noreferrer">Creative Commons Attribution-Share Alike 3.0 Unported</a> license. Changes made: Logo Extracted.</p>

<hr>

<p><a href="https://github.com/FrunkQ/star-system-generator" target="_blank" rel="noopener noreferrer">Star System Explorer</a> © 2026 FrunkQ. Licensed under <a href="https://www.gnu.org/licenses/gpl-3.0.en.html" target="_blank" rel="noopener noreferrer">GPL-3.0</a>.</p>
`;

  function close() {
    dispatch('close');
  }
</script>

<MarkdownModal htmlContent={aboutContent} on:close={close} />
