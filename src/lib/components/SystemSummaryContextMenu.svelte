<script lang="ts">
  import type { CelestialBody } from '$lib/types';
  import { createEventDispatcher } from 'svelte';

  export let items: any[]; // Can be CelestialBody[] or a grouped list
  export let x: number;
  export let y: number;
  export let type: string;
  export let openToken: number = 0;

  const dispatch = createEventDispatcher();
  let nameFilter = '';
  let lastOpenToken = -1;
  let filterQuery = '';
  let filteredItems: CelestialBody[] = [];
  let filteredGroups: any[] = [];

  function handleClick(item: CelestialBody) {
    nameFilter = '';
    dispatch('select', item.id);
  }

  function normalize(value: string): string {
    return (value || '').trim().toLowerCase();
  }

  function onFilterInput(event: Event) {
    nameFilter = (event.currentTarget as HTMLInputElement).value;
  }

  // Reset filter only when parent explicitly opens a new menu.
  $: {
    if (openToken !== lastOpenToken) {
      nameFilter = '';
      lastOpenToken = openToken;
    }
  }

  $: filterQuery = normalize(nameFilter);

  $: filteredItems = (items || []).filter((item: CelestialBody) => {
    if (!filterQuery) return true;
    return normalize(item?.name || '').includes(filterQuery);
  });

  $: filteredGroups = (items || [])
    .map((group: any) => {
      const hostName = normalize(group?.host?.name || '');
      const hostMatches = !filterQuery || hostName.includes(filterQuery);
      const filteredChildren = (group.children || []).filter((child: CelestialBody) => {
        if (!filterQuery) return true;
        return normalize(child?.name || '').includes(filterQuery);
      });
      return {
        ...group,
        children: filteredChildren,
        _include: hostMatches || filteredChildren.length > 0
      };
    })
    .filter((group: any) => group._include);
</script>

<div class="context-menu" style="left: {x}px; top: {y}px;">
  <div class="filter-wrap">
    <input
      class="name-filter"
      type="text"
      value={nameFilter}
      on:input={onFilterInput}
      placeholder="Filter by name..."
      aria-label="Filter objects by name"
    />
  </div>
  <ul>
    {#if type === 'grouped'}
      {#each filteredGroups as group}
        {#if group.host}
          <li class="planet-header" on:click={() => handleClick(group.host)}>{group.host.name}</li>
        {/if}
        {#each group.children as child}
          <li on:click={() => handleClick(child)} style="color: {child.kind === 'construct' && child.icon_color ? child.icon_color : ''}">&nbsp;&nbsp;{child.name}</li>
        {/each}
      {/each}
    {:else}
      {#each filteredItems as item}
        <li on:click={() => handleClick(item)}>{item.name}</li>
      {/each}
    {/if}
  </ul>
</div>

<style>
  .context-menu {
    position: absolute;
    background-color: #333;
    border: 1px solid #555;
    border-radius: 5px;
    z-index: 100;
    color: #eee;
    max-height: 400px;
    overflow-y: auto;
    box-shadow: 0 4px 8px rgba(0,0,0,0.3);
  }
  .filter-wrap {
    padding: 0.4em;
    border-bottom: 1px solid #555;
    background: #2b2b2b;
  }
  .name-filter {
    width: 100%;
    box-sizing: border-box;
    background: #1f1f1f;
    border: 1px solid #666;
    color: #eee;
    border-radius: 4px;
    padding: 0.35em 0.45em;
    font-size: 0.9em;
  }
  .name-filter:focus {
    outline: none;
    border-color: #888;
  }
  ul {
    list-style: none;
    padding: 0;
    margin: 0;
  }
  li {
    padding: 0.5em 1em;
    cursor: pointer;
  }
  li:hover {
    background-color: #555;
  }
  .planet-header {
    font-weight: normal;
    color: #888; /* Grey color */
    font-size: 0.8em; /* Smaller font size */
    border-bottom: 1px solid #555;
    padding-top: 1em;
    cursor: pointer;
  }
  .planet-header:hover {
    background-color: #444;
  }
</style>
