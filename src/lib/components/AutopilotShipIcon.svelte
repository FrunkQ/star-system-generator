<script lang="ts">
  // The one true autopilot symbol — a little "Asteroids" ship that gently pulses. Used everywhere
  // autopilot is represented (Engage toggle, locked button, ship's-log badge, Routes), so it's unified.
  export let size = 14;
  export let pulse = true;
</script>

<span class="ap-ship" class:pulse aria-hidden="true">
  <svg viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11l19-9-9 19-2-8-8-2z" /></svg>
</span>

<style>
  .ap-ship { display: inline-flex; }
  .ap-ship.pulse { animation: ap-ship-pulse 1.9s ease-in-out infinite; }
  @keyframes ap-ship-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
  @media (prefers-reduced-motion: reduce) { .ap-ship.pulse { animation: none; } }
</style>
