<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { TravellerAPI, type Sector } from '$lib/traveller/api';

  export let showModal: boolean;
  
  const dispatch = createEventDispatcher();
  const api = new TravellerAPI();

  let sectors: Sector[] = [];
  let filteredSectors: Sector[] = [];
  let selectedSector: Sector | null = null;
  let sectorSearch = '';
  
  let subsectorCode = 'A'; // Default to A
  let subsectorData: string | null = null;
  let isLoading = false;
  let status = '';

  onMount(async () => {
      isLoading = true;
      status = 'Loading sectors...';
      sectors = await api.getSectors();
      filteredSectors = sectors;
      isLoading = false;
      status = '';
  });

  function handleSearch() {
      if (!sectorSearch || sectorSearch.length < 2) {
          filteredSectors = [];
      } else {
          const q = sectorSearch.toLowerCase();
          filteredSectors = sectors.filter(s => 
              s.name.toLowerCase().includes(q) || 
              (s.abbreviation && s.abbreviation.toLowerCase().includes(q))
          );
      }
  }

  function selectSector(sector: Sector) {
      selectedSector = sector;
      sectorSearch = sector.name;
      filteredSectors = []; // Hide list
  }

  async function handleImport() {
      if (!selectedSector) return;
      
      isLoading = true;
      status = `Fetching subsector ${subsectorCode} for ${selectedSector.name}...`;
      
      const key = selectedSector.abbreviation || selectedSector.name;
      const data = await api.getSubsectorData(key, subsectorCode);
      
      if (data) {
          dispatch('import', {
              sector: selectedSector,
              subsectorCode,
              rawData: data
          });
          showModal = false;
      } else {
          status = 'Error fetching data. Check internet or API status.';
      }
      isLoading = false;
  }

  function close() {
      dispatch('close');
  }
</script>

{#if showModal}
<div class="modal-backdrop" on:click={close}>
  <div class="modal-content" on:click|stopPropagation>
      <h2>Import Traveller Subsector</h2>
      
      <div class="form-group">
          <label>Sector</label>
          <input 
              type="text" 
              bind:value={sectorSearch} 
              on:input={handleSearch} 
              placeholder="Search Sector (e.g. Spinward Marches)"
          />
          {#if filteredSectors.length > 0 && sectorSearch && !selectedSector}
              <ul class="dropdown-list">
                  {#each filteredSectors.slice(0, 10) as sector}
                      <li on:click={() => selectSector(sector)}>
                          {sector.name} {#if sector.abbreviation}({sector.abbreviation}){:else}{/if}
                      </li>
                  {/each}
              </ul>
          {/if}
      </div>

      <div class="form-group">
          <label>Subsector Code (A-P)</label>
          <select bind:value={subsectorCode}>
              {#each ['A','B','C','D','E','F','G','H','I','J','K','L','M','N','O','P'] as code}
                  <option value={code}>{code}</option>
              {/each}
          </select>
          <p class="hint">A is top-left, P is bottom-right of the sector.</p>
      </div>

      {#if status}
          <p class="status">{status}</p>
      {/if}

      <div class="actions">
          <button on:click={close}>Cancel</button>
          <button on:click={handleImport} disabled={!selectedSector || isLoading}>
              {isLoading ? 'Loading...' : 'Import'}
          </button>
      </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
      position: fixed;
      top: 0; left: 0; width: 100%; height: 100%;
      background: rgba(0, 0, 0, 0.7);
      display: flex; justify-content: center; align-items: center;
      z-index: 2000;
  }
  .modal-content {
      background: #222;
      padding: 20px;
      border-radius: 8px;
      width: 400px;
      color: #eee;
      border: 1px solid #444;
  }
  .form-group { margin-bottom: 15px; position: relative; }
  label { display: block; margin-bottom: 5px; color: #aaa; }
  input, select { width: 100%; padding: 8px; background: #333; border: 1px solid #555; color: #fff; }
  
  .dropdown-list {
      position: absolute;
      top: 100%; left: 0; right: 0;
      background: #333;
      border: 1px solid #555;
      list-style: none;
      padding: 0; margin: 0;
      max-height: 200px;
      overflow-y: auto;
      z-index: 100;
  }
  .dropdown-list li { padding: 8px; cursor: pointer; }
  .dropdown-list li:hover { background: #444; }

  .actions { display: flex; justify-content: flex-end; gap: 10px; margin-top: 20px; }
  button { padding: 8px 16px; cursor: pointer; }
  .status { color: #aaa; font-style: italic; }
  .hint { font-size: 0.8em; color: #888; margin-top: 4px; }
</style>
