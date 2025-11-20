<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';

  export let rulePack: RulePack;
  export let mode: 'overwrite' | 'create' = 'overwrite';

  const dispatch = createEventDispatcher();

  // -- Tree Logic Types --
  type FileSystemNode = {
    name: string;
    type: 'folder' | 'file';
    children: Record<string, FileSystemNode>; // For folders
    template?: CelestialBody; // For files
    path: string; // Full path for breadcrumbs/IDs
  };

  let rootNode: FileSystemNode = { name: 'Root', type: 'folder', children: {}, path: '' };
  let currentPath: string[] = []; // Current folder path (for breadcrumbs)
  let currentNode: FileSystemNode = rootNode;
  let selectedTemplate: CelestialBody | null = null;

  onMount(() => {
    buildTree();
  });

  function buildTree() {
    const allTemplates: CelestialBody[] = [];
    
    // 1. Flatten the existing categorized structure
    if (rulePack && rulePack.constructTemplates) {
      Object.values(rulePack.constructTemplates).forEach(list => {
        if (Array.isArray(list)) {
          allTemplates.push(...list);
        }
      });
    }

    // 2. Build the tree based on 'class' property
    const root: FileSystemNode = { name: 'All Constructs', type: 'folder', children: {}, path: '' };

    allTemplates.forEach(t => {
        // Use 'class' if available, otherwise fallback to roleHint or 'Uncategorized'
        const classString = t.class || t.roleHint || 'Uncategorized';
        const parts = classString.split('/').map(p => p.trim()).filter(p => p);

        // If hierarchy is deep (Category/Subcategory/Type), put item in Subcategory folder.
        // If shallow (Category), put in Category folder.
        const folderParts = parts.length > 1 ? parts.slice(0, -1) : parts;

        let currentLevel = root;
        let pathSoFar = '';

        // Navigate/Create folders
        folderParts.forEach((part, index) => {
            pathSoFar += (pathSoFar ? '/' : '') + part;
            
            // Normalize key to lowercase for grouping, but keep display name
            const key = part.toLowerCase();
            
            if (!currentLevel.children[key]) {
                currentLevel.children[key] = {
                    name: part.charAt(0).toUpperCase() + part.slice(1), // Capitalize for display
                    type: 'folder',
                    children: {},
                    path: pathSoFar
                };
            }
            currentLevel = currentLevel.children[key];
        });

        // Add the file (template) to the final folder
        // Use ID as key to ensure uniqueness
        const fileKey = t.id || t.name;
        currentLevel.children[fileKey] = {
            name: t.name,
            type: 'file',
            children: {},
            template: t,
            path: pathSoFar + '/' + t.name
        };
    });

    rootNode = root;
    currentNode = rootNode;
  }

  
  // --- Revised Navigation State ---
  let historyStack: FileSystemNode[] = []; // Stack of folders visited

  function enterFolder(node: FileSystemNode) {
      historyStack = [...historyStack, currentNode];
      currentNode = node;
      selectedTemplate = null;
  }

  function jumpToRoot() {
      historyStack = [];
      currentNode = rootNode;
      selectedTemplate = null;
  }

  function goBack() {
      if (historyStack.length > 0) {
          const prev = historyStack.pop();
          historyStack = historyStack; // trigger reactivity
          currentNode = prev!;
          selectedTemplate = null;
      }
  }

  function jumpTo(index: number) {
      const targetNode = historyStack[index];
      historyStack = historyStack.slice(0, index); 
      currentNode = targetNode;
      selectedTemplate = null;
  }

  function selectTemplate(node: FileSystemNode) {
      if (node.template) {
          selectedTemplate = node.template;
      }
  }

  function handleLoad() {
    if (selectedTemplate) {
      dispatch('load', selectedTemplate);
      dispatch('close');
    }
  }

  function close() {
    dispatch('close');
  }
  
  // Sort helpers
  $: sortedChildren = Object.values(currentNode.children).sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === 'folder' ? -1 : 1; // Folders first
  });

</script>

<div class="modal-background" on:click={close}>
  <div class="modal" on:click|stopPropagation>
    <h2>{mode === 'create' ? 'Create New Construct' : 'Load Construct Template'}</h2>
    {#if mode === 'overwrite'}
      <p class="warning">Warning: Overwrites current configuration.</p>
    {/if}

    <!-- Breadcrumbs -->
    <div class="breadcrumbs">
        <span 
            class="crumb {currentNode === rootNode ? 'active' : ''}" 
            on:click={jumpToRoot}
        >
            {rootNode.name}
        </span>
        {#each historyStack as node, i}
            {#if node !== rootNode}
             <span class="separator">/</span>
             <span class="crumb" on:click={() => jumpTo(i)}>{node.name}</span>
            {/if}
        {/each}
        {#if currentNode !== rootNode}
            <span class="separator">/</span>
            <span class="crumb active">{currentNode.name}</span>
        {/if}
    </div>

    <!-- Browser Area -->
    <div class="browser-window">
        {#if sortedChildren.length === 0}
            <div class="empty-msg">No items found.</div>
        {/if}

        {#each sortedChildren as child}
            {#if child.type === 'folder'}
                <div class="browser-item folder" on:click={() => enterFolder(child)}>
                    <span class="icon">📁</span>
                    <span class="name">{child.name}</span>
                    <span class="arrow">›</span>
                </div>
            {:else}
                <div class="browser-item file {selectedTemplate === child.template ? 'selected' : ''}" 
                     on:click={() => selectTemplate(child)}
                     on:dblclick={handleLoad}>
                    <div class="icon-wrapper">
                        <div class="construct-icon {child.template?.icon_type || 'circle'}" 
                             style="background-color: {child.template?.icon_color || '#888'}">
                        </div>
                    </div>
                    <div class="file-info">
                        <span class="name">{child.name}</span>
                        <span class="desc">{child.template?.description || ''}</span>
                    </div>
                </div>
            {/if}
        {/each}
    </div>
    
    <!-- Preview / Actions -->
    <div class="footer">
        <div class="selected-info">
            {#if selectedTemplate}
                <strong>{selectedTemplate.name}</strong>
                <div class="stats">
                    {selectedTemplate.roleHint} • 
                    {(selectedTemplate.physical_parameters?.massKg / 1000).toLocaleString()}t • 
                    {selectedTemplate.systems?.power_plants?.[0]?.type || 'No Power'}
                </div>
            {:else}
                <span class="placeholder">Select a template...</span>
            {/if}
        </div>
        <div class="buttons">
          <button class="secondary" on:click={close}>Cancel</button>
          <button class="primary" on:click={handleLoad} disabled={!selectedTemplate}>
            {mode === 'create' ? 'Create' : 'Load'}
          </button>
        </div>
    </div>
  </div>
</div>

<style>
  .modal-background {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background-color: rgba(0, 0, 0, 0.6);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 2000;
    backdrop-filter: blur(2px);
  }

  .modal {
    background-color: #1e1e1e;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    width: 600px;
    height: 500px;
    border: 1px solid #444;
    box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    color: #eee;
    overflow: hidden;
  }

  h2 {
      margin: 0;
      padding: 15px;
      background-color: #252525;
      border-bottom: 1px solid #333;
      font-size: 1.2em;
      text-align: left;
  }

  .warning {
    background-color: #443300;
    color: #ffcc00;
    margin: 0;
    padding: 5px;
    font-size: 0.8em;
    text-align: center;
  }

  /* Breadcrumbs */
  .breadcrumbs {
      display: flex;
      padding: 10px 15px;
      background-color: #2a2a2a;
      border-bottom: 1px solid #333;
      font-size: 0.9em;
      overflow-x: auto;
  }
  .crumb {
      cursor: pointer;
      color: #88ccff;
  }
  .crumb:hover {
      text-decoration: underline;
  }
  .crumb.active {
      color: #aaa;
      cursor: default;
      text-decoration: none;
  }
  .separator {
      margin: 0 8px;
      color: #666;
  }

  /* Browser Window */
  .browser-window {
      flex: 1;
      overflow-y: auto;
      padding: 10px;
      display: flex;
      flex-direction: column;
      gap: 5px;
  }
  
  .browser-item {
      display: flex;
      align-items: center;
      padding: 8px 12px;
      border-radius: 4px;
      cursor: pointer;
      transition: background-color 0.1s;
      border: 1px solid transparent;
  }
  .browser-item:hover {
      background-color: #333;
  }
  .browser-item.selected {
      background-color: #004080;
      border-color: #0059b3;
  }
  
  .icon {
      font-size: 1.2em;
      margin-right: 12px;
      width: 24px;
      text-align: center;
  }
  
  .folder .name {
      font-weight: bold;
      flex-grow: 1;
  }
  .arrow {
      color: #666;
  }

  .file-info {
      display: flex;
      flex-direction: column;
      overflow: hidden;
  }
  .file .name {
      color: #eee;
  }
  .file .desc {
      color: #888;
      font-size: 0.8em;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      white-space: normal;
  }

  .icon-wrapper {
      width: 24px;
      margin-right: 12px;
      display: flex;
      justify-content: center;
      align-items: center;
  }
  
  .construct-icon {
      width: 14px;
      height: 14px;
  }
  
  .construct-icon.circle { border-radius: 50%; }
  .construct-icon.square { border-radius: 2px; }
  .construct-icon.triangle { 
      clip-path: polygon(50% 0%, 0% 100%, 100% 100%); 
  }
  .empty-msg {
      color: #666;
      text-align: center;
      margin-top: 50px;
      font-style: italic;
  }

  /* Footer */
  .footer {
      padding: 15px;
      background-color: #252525;
      border-top: 1px solid #333;
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  .selected-info {
      display: flex;
      flex-direction: column;
      text-align: left;
      font-size: 0.9em;
      max-width: 60%;
  }
  .selected-info .stats {
      color: #999;
      font-size: 0.85em;
  }
  .placeholder {
      color: #666;
      font-style: italic;
  }

  .buttons {
      display: flex;
      gap: 10px;
  }
  button {
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;
      border: none;
      font-size: 0.9em;
  }
  button.secondary {
      background-color: #444;
      color: #ccc;
  }
  button.secondary:hover { background-color: #555; }
  
  button.primary {
      background-color: #007bff;
      color: white;
  }
  button.primary:hover { background-color: #0056b3; }
  button:disabled { opacity: 0.5; cursor: not-allowed; }

</style>