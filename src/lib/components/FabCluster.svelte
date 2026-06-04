<script lang="ts">
  // Phase 03 — phone-only floating action cluster (bottom-right). A primary FAB (+)
  // expands into a column of labelled secondary FABs; picking one emits `action` with its
  // id and collapses. Tapping outside collapses. On desktop these same actions live in the
  // top toolbar, so the host only renders this in phone mode.
  import { createEventDispatcher, onDestroy } from 'svelte';

  export interface FabAction {
    id: string;
    label: string;
    icon?: string; // short glyph/emoji; falls back to the first label letter
  }

  export let actions: FabAction[] = [];
  export let open = false;
  export let label = 'Actions';

  const dispatch = createEventDispatcher();
  let root: HTMLElement;

  function toggle() {
    open = !open;
    if (open) addOutside();
    else removeOutside();
  }

  function pick(id: string) {
    dispatch('action', id);
    open = false;
    removeOutside();
  }

  function onOutside(e: Event) {
    if (root && !root.contains(e.target as Node)) {
      open = false;
      removeOutside();
    }
  }
  function addOutside() {
    if (typeof window !== 'undefined') window.addEventListener('pointerdown', onOutside, true);
  }
  function removeOutside() {
    if (typeof window !== 'undefined') window.removeEventListener('pointerdown', onOutside, true);
  }
  onDestroy(removeOutside);
</script>

<div class="fab-cluster" class:open bind:this={root}>
  {#if open}
    <div class="fab-actions">
      {#each actions as a (a.id)}
        <button class="fab-action" on:click={() => pick(a.id)}>
          <span class="fab-action-label">{a.label}</span>
          <span class="fab-action-icon" aria-hidden="true">{a.icon ?? a.label.charAt(0)}</span>
        </button>
      {/each}
    </div>
  {/if}

  <button
    class="fab-primary"
    class:open
    aria-label={open ? 'Close actions' : label}
    aria-expanded={open}
    on:click={toggle}
  >
    <span class="fab-plus">+</span>
  </button>
</div>

<style>
  .fab-cluster {
    position: fixed;
    right: 16px;
    bottom: 16px;
    z-index: 1300;
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }
  .fab-actions {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 12px;
  }
  .fab-action {
    display: flex;
    align-items: center;
    gap: 10px;
    border: none;
    background: transparent;
    padding: 0;
    cursor: pointer;
  }
  .fab-action-label {
    background: #1b1e26;
    color: #e8e8e8;
    border: 1px solid #2a2d36;
    border-radius: 8px;
    padding: 6px 10px;
    font-size: 0.85rem;
    white-space: nowrap;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  }
  .fab-action-icon {
    width: 44px;
    height: 44px;
    flex: 0 0 auto;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: #232733;
    color: #ff8a5c;
    border: 1px solid #2a2d36;
    font-size: 1.1rem;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.45);
  }
  .fab-primary {
    width: 56px;
    height: 56px;
    border-radius: 50%;
    border: none;
    background: #ff5a1f;
    color: #fff;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .fab-plus {
    font-size: 1.9rem;
    line-height: 1;
    transition: transform 0.2s ease;
  }
  .fab-primary.open .fab-plus {
    transform: rotate(45deg); /* + becomes x */
  }
</style>
