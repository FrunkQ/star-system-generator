<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { marked } from 'marked';

  export let markdownContent: string;

  const dispatch = createEventDispatcher();

  function closeModal() {
    dispatch('close');
  }

  $: htmlContent = marked(markdownContent);
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
    background: #1a1a1a;
    padding: 20px;
    border-radius: 8px;
    max-width: 80%;
    max-height: 80%;
    overflow-y: auto;
    position: relative;
    color: #eee;
    border: 1px solid #444;
  }

  .close-button {
    position: absolute;
    top: 10px;
    right: 10px;
    background: none;
    border: none;
    font-size: 24px;
    color: #eee;
    cursor: pointer;
  }

  .markdown-body {
    /* Basic markdown styling */
    line-height: 1.6;
  }

  .markdown-body h1, .markdown-body h2, .markdown-body h3 {
    color: #ff3e00;
    border-bottom: 1px solid #444;
    padding-bottom: 0.3em;
    margin-top: 1em;
  }

  .markdown-body a {
    color: #007bff;
    text-decoration: none;
  }

  .markdown-body a:hover {
    text-decoration: underline;
  }

  .markdown-body code {
    background-color: #333;
    padding: 0.2em 0.4em;
    border-radius: 3px;
  }

  .markdown-body pre {
    background-color: #333;
    padding: 1em;
    border-radius: 5px;
    overflow-x: auto;
  }
</style>