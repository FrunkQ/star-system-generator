<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let htmlContent: string;

  const dispatch = createEventDispatcher();

  function closeModal() {
    dispatch('close');
  }
</script>

<div class="modal-overlay" on:click={closeModal}>
  <div class="modal-content" on:click|stopPropagation>
    <button class="close-button" on:click={closeModal}>&times;</button>
    <div class="markdown-body">{@html htmlContent}</div>
  </div>
</div>

<style>
  .modal-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;
  }

  .modal-content {
    background: var(--bg-panel);
    padding: 20px;
    border-radius: 8px;
    max-width: 80%;
    max-height: 80%;
    overflow-y: auto;
    position: relative;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 24px;
    color: var(--text);
    cursor: pointer;
  }

  .markdown-body {
    /* Basic markdown styling */
    line-height: 1.6;
  }

  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    color: var(--accent);
    border-bottom: 1px solid var(--border);
    padding-bottom: 0.3em;
    margin-top: 1em;
  }

  .markdown-body a {
    color: var(--link);
    text-decoration: none;
  }

  .markdown-body a:hover {
    text-decoration: underline;
  }

  .markdown-body code {
    background-color: var(--bg-panel);
    padding: 0.2em 0.4em;
    border-radius: 3px;
  }

  .markdown-body pre {
    background-color: var(--bg-panel);
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
  }
</style>