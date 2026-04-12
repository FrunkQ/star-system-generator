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
`;

  function close() {
    dispatch('close');
  }
</script>

<MarkdownModal htmlContent={aboutContent} on:close={close} />
