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
