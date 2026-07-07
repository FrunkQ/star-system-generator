<script lang="ts">
  // 04.7 — a small ⓘ that deep-links the /physics "honesty appendix" at the relevant anchor, so a GM
  // can jump from any derived value to exactly how it's computed. Opens in a new tab.
  export let topic: string;       // the /physics anchor id (e.g. 'temperature', 'radiation')
  export let label = '';          // optional tooltip text
</script>

<a class="info-link" href={`/physics#${topic}`} target="_blank" rel="noopener"
   title={label || 'How this is derived (physics appendix)'} aria-label="How this is derived">ⓘ</a>

<style>
  .info-link {
    font-size: 0.82em;
    color: var(--text-faint, #8a8f9a);
    text-decoration: none;
    margin-left: 4px;
    cursor: help;
  }
  .info-link:hover { color: var(--accent, #ff5a1f); }
</style>
