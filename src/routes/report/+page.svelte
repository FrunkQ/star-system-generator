<script lang="ts">
  import { onMount } from 'svelte';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import '$lib/reports/report-styles.css';
  import type { System, CelestialBody } from '$lib/types';
  import { AU_KM } from '$lib/constants';

  let system: System | null = null;
  let mode: 'GM' | 'Player' = 'GM';
  let theme: string = 'retro';
  let includeConstructs = true;
  let loading = true;
  let error = '';

  // Constants for Physics
  const G_CONST = 6.67430e-11;
  const EARTH_GRAVITY = 9.80665;
  const EARTH_DENSITY = 5514;
  const EARTH_MASS_KG = 5.972e24;

  onMount(() => {
    try {
      const dataStr = sessionStorage.getItem('reportData');
      if (!dataStr) {
        error = 'No report data found. Please generate a report from the System View.';
        loading = false;
        return;
      }

      const data = JSON.parse(dataStr);
      mode = data.mode;
      theme = data.theme;
      includeConstructs = data.includeConstructs ?? true;
      
      if (mode === 'Player') {
        system = computePlayerSnapshot(data.system);
      } else {
        system = data.system;
      }
      
      loading = false;
    } catch (e) {
      console.error(e);
      error = 'Failed to load report data.';
      loading = false;
    }
  });

  function formatNumber(num: number | undefined, decimals = 0) {
    if (num === undefined || num === null) return '-';
    // If number is very large (e.g. mass), use scientific or compact? 
    // For massKg, scientific is better.
    if (num > 1e15) return num.toExponential(2);
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  }

  function getBodiesOnly(parentId: string) {
      if (!system) return [];
      return system.nodes.filter(n => n.parentId === parentId && n.kind !== 'construct').sort((a,b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
  }

  function getAllConstructs() {
      if (!system) return [];
      return system.nodes.filter(n => n.kind === 'construct').sort((a, b) => {
          if (a.parentId === b.parentId) return (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0);
          return (a.parentId || '').localeCompare(b.parentId || '');
      });
  }

  function getParentName(id: string | undefined | null) {
      if (!id || !system) return 'Unknown';
      const parent = system.nodes.find(n => n.id === id);
      return parent ? parent.name : 'Unknown';
  }
  
  function getLocationDescription(construct: CelestialBody) {
      const parentName = getParentName(construct.parentId);
      const placement = construct.placement || 'Orbit';
      const dist = construct.orbit?.elements.a_AU ? `${construct.orbit.elements.a_AU.toFixed(5)} AU` : '';
      
      if (placement === 'Surface') return `Surface of ${parentName}`;
      return `${placement} around ${parentName} (${dist})`;
  }

  // --- Physics Helpers ---
  function getDerivedPhysics(body: CelestialBody) {
      let gravity = '-';
      let density = '-';
      let massRel = '-';

      if (body.massKg && body.radiusKm) {
          const radiusM = body.radiusKm * 1000;
          const g = (G_CONST * body.massKg / (radiusM * radiusM)) / EARTH_GRAVITY;
          gravity = `${g.toFixed(2)} g`;
          
          const vol = (4/3) * Math.PI * Math.pow(radiusM, 3);
          const d = (body.massKg / vol) / EARTH_DENSITY;
          density = `${d.toFixed(2)} Earths`;

          const mRel = body.massKg / EARTH_MASS_KG;
          massRel = mRel < 1000 ? `${mRel.toFixed(3)} M⊕` : `${mRel.toExponential(2)} M⊕`;
      }
      return { gravity, density, massRel };
  }

  function getTemp(body: CelestialBody) {
      if (!body.temperature_c) return '-';
      return `${Math.round(body.temperature_c)}°C`;
  }

  function getAtmosphereString(body: CelestialBody) {
      if (!body.atmosphere) return 'None';
      const p = body.atmosphere.pressure_bar ?? body.atmosphere.pressure_atm ?? 0;
      const pStr = p < 0.001 ? '<0.001' : p.toFixed(2);
      
      // Top 2 gases
      const gases = Object.entries(body.atmosphere.composition || {})
          .sort((a,b) => b[1] - a[1])
          .slice(0, 2)
          .map(([g, pct]) => `${g} ${(pct*100).toFixed(0)}%`)
          .join(', ');

      return `${body.atmosphere.name || 'Unknown'} (${pStr} bar) ${gases ? '['+gases+']' : ''}`;
  }

  $: stars = system ? system.nodes.filter(n => n.kind === 'body' && n.roleHint === 'star') : [];
</script>

<svelte:head>
  <title>System Report - {system ? system.name : 'Loading...'}</title>
</svelte:head>

{#if loading}
  <div class="loading">Initializing Report System...</div>
{:else if error}
  <div class="error">{error}</div>
{:else if system}
  <div class="report-container theme-{theme}">
    
    <div class="no-print toolbar">
      <button on:click={() => window.print()}>🖨️ Print / Save to PDF</button>
      <button on:click={() => window.close()}>Close</button>
    </div>

    <!-- HEADER -->
    <header class="report-header">
        <div class="header-content">
            <h1>SYSTEM SURVEY REPORT: {system.name.toUpperCase()}</h1>
            <div class="meta-data">
                <div><strong>DATE:</strong> {new Date().toISOString().split('T')[0]}</div>
                <div><strong>CLEARANCE:</strong> {mode === 'GM' ? 'ULTRAVIOLET (GM)' : 'PUBLIC'}</div>
                {#if theme === 'corporate' && mode === 'GM'}
                    <div class="confidential-stamp">TOP SECRET</div>
                {/if}
            </div>
        </div>
    </header>

    <!-- SYSTEM OVERVIEW -->
    <section class="system-overview">
        <h2>01. SYSTEM OVERVIEW</h2>
        <div class="data-box">
            <table>
                <tbody>
                    <tr>
                        <th>Star Count</th><td>{stars.length}</td>
                        <th>Total Objects</th><td>{system.nodes.length}</td>
                        <th>Epoch</th><td>{new Date(system.epochT0).getFullYear()}</td>
                    </tr>
                    {#if mode === 'GM'}
                    <tr>
                        <th colspan="6" style="text-align:center; border-top: 1px dashed #ccc;">-- GM NOTES --</th>
                    </tr>
                    <tr>
                        <td colspan="6" style="white-space: pre-wrap; font-family: monospace;">{(system as any).gmNotes || 'No notes.'}</td>
                    </tr>
                    {/if}
                </tbody>
            </table>
        </div>
    </section>

    <!-- HIERARCHY REPORT (BODIES ONLY) -->
    <section class="body-details">
        <h2>02. CELESTIAL SURVEY</h2>
        
        {#each stars as star}
            <div class="star-block">
                <div class="section-header">STAR: {star.name.toUpperCase()} ({star.class})</div>
                <div class="data-box">
                    <p>{star.description || 'No description available.'}</p>
                    <table>
                        <tbody>
                            <tr>
                                <th>Mass</th><td>{(star.massKg / 1.989e30).toFixed(3)} Solar Masses</td>
                                <th>Radius</th><td>{formatNumber(star.radiusKm)} km</td>
                                <th>Temp</th><td>{Math.round((star.temperatureK || 5700) - 273.15)}°C</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {#each getBodiesOnly(star.id) as child}
                    {@const phys = getDerivedPhysics(child)}
                    <div class="child-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                            <h3 style="margin: 0; font-size: 1.1em;">{child.name.toUpperCase()}</h3>
                            <span style="font-size: 0.9em; color: #666;">{child.roleHint ? child.roleHint.toUpperCase() : 'BODY'} | {child.class}</span>
                        </div>
                        
                        <div class="data-box" style="margin-top: 5px;">
                             {#if child.description}
                                <p style="margin: 5px 0 10px 0; font-style: italic;">{child.description}</p>
                             {/if}
                             
                             <!-- DENSE DATA GRID -->
                             <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                 <!-- Left Col: Physical & Orbital -->
                                 <table>
                                    <tbody>
                                        <tr><th>Orbit Dist</th><td>{child.orbit?.elements.a_AU.toFixed(3)} AU</td></tr>
                                        <tr><th>Orbit Period</th><td>{child.orbital_period_days ? child.orbital_period_days.toFixed(1) + ' d' : '-'}</td></tr>
                                        <tr><th>Eccentricity</th><td>{child.orbit?.elements.e.toFixed(3)}</td></tr>
                                        <tr><th>Day Length</th><td>{child.rotation_period_hours ? child.rotation_period_hours.toFixed(1) + ' h' : '-'}</td></tr>
                                        <tr><th>Mass</th><td>{phys.massRel}</td></tr>
                                        <tr><th>Radius</th><td>{formatNumber(child.radiusKm)} km</td></tr>
                                        <tr><th>Gravity</th><td>{phys.gravity}</td></tr>
                                        <tr><th>Density</th><td>{phys.density}</td></tr>
                                    </tbody>
                                 </table>

                                 <!-- Right Col: Environmental -->
                                 <table>
                                     <tbody>
                                         <tr><th>Temperature</th><td>{getTemp(child)}</td></tr>
                                         <tr><th>Atmosphere</th><td style="font-size: 0.9em;">{getAtmosphereString(child)}</td></tr>
                                         <tr><th>Magnetosphere</th><td>{child.magneticField ? child.magneticField.strengthGauss.toFixed(2) + ' G' : 'None'}</td></tr>
                                         <tr><th>Surface Rad</th><td>{child.surfaceRadiation ? child.surfaceRadiation.toFixed(1) + ' mSv/y' : '-'}</td></tr>
                                         {#if child.habitabilityScore}
                                            <tr><th>Habitability</th><td>{child.habitabilityScore.toFixed(1)}%</td></tr>
                                         {/if}
                                         {#if child.biosphere}
                                            <tr><th>Biosphere</th><td>Present (Cov: {(child.biosphere.coverage*100).toFixed(0)}%)</td></tr>
                                         {/if}
                                     </tbody>
                                 </table>
                             </div>

                             {#if mode === 'GM' && (child as any).gmNotes}
                                <div style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px; background: #f0f0f0;">
                                    <strong>GM NOTE:</strong> {(child as any).gmNotes}
                                </div>
                             {/if}
                        </div>
                        
                        <!-- Recursively show Moons (Bodies Only) -->
                        {#each getBodiesOnly(child.id) as grandchild}
                             {@const gPhys = getDerivedPhysics(grandchild)}
                             <div class="grandchild-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                                    <h3 style="margin: 0; font-size: 1.0em;">{grandchild.name.toUpperCase()}</h3>
                                    <span style="font-size: 0.8em; color: #666;">{grandchild.roleHint ? grandchild.roleHint.toUpperCase() : 'BODY'} | {grandchild.class}</span>
                                </div>
                                
                                <div class="data-box" style="margin-top: 5px;">
                                     {#if grandchild.description}
                                        <p style="margin: 5px 0 10px 0; font-style: italic; font-size: 0.9em;">{grandchild.description}</p>
                                     {/if}
                                     
                                     <!-- DENSE DATA GRID FOR MOONS -->
                                     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                                         <!-- Left Col: Physical & Orbital -->
                                         <table>
                                            <tbody>
                                                <tr><th>Orbit Dist</th><td>{grandchild.orbit?.elements.a_AU.toFixed(3)} AU</td></tr>
                                                <tr><th>Orbit Period</th><td>{grandchild.orbital_period_days ? grandchild.orbital_period_days.toFixed(1) + ' d' : '-'}</td></tr>
                                                <tr><th>Eccentricity</th><td>{grandchild.orbit?.elements.e.toFixed(3)}</td></tr>
                                                <tr><th>Day Length</th><td>{grandchild.rotation_period_hours ? grandchild.rotation_period_hours.toFixed(1) + ' h' : '-'}</td></tr>
                                                <tr><th>Mass</th><td>{gPhys.massRel}</td></tr>
                                                <tr><th>Radius</th><td>{formatNumber(grandchild.radiusKm)} km</td></tr>
                                                <tr><th>Gravity</th><td>{gPhys.gravity}</td></tr>
                                                <tr><th>Density</th><td>{gPhys.density}</td></tr>
                                            </tbody>
                                         </table>

                                         <!-- Right Col: Environmental -->
                                         <table>
                                             <tbody>
                                                 <tr><th>Temperature</th><td>{getTemp(grandchild)}</td></tr>
                                                 <tr><th>Atmosphere</th><td style="font-size: 0.9em;">{getAtmosphereString(grandchild)}</td></tr>
                                                 <tr><th>Magnetosphere</th><td>{grandchild.magneticField ? grandchild.magneticField.strengthGauss.toFixed(2) + ' G' : 'None'}</td></tr>
                                                 <tr><th>Surface Rad</th><td>{grandchild.surfaceRadiation ? grandchild.surfaceRadiation.toFixed(1) + ' mSv/y' : '-'}</td></tr>
                                                 {#if grandchild.habitabilityScore}
                                                    <tr><th>Habitability</th><td>{grandchild.habitabilityScore.toFixed(1)}%</td></tr>
                                                 {/if}
                                                 {#if grandchild.biosphere}
                                                    <tr><th>Biosphere</th><td>Present (Cov: {(grandchild.biosphere.coverage*100).toFixed(0)}%)</td></tr>
                                                 {/if}
                                             </tbody>
                                         </table>
                                     </div>

                                     {#if mode === 'GM' && (grandchild as any).gmNotes}
                                        <div style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px; background: #f0f0f0;">
                                            <strong>GM NOTE:</strong> {(grandchild as any).gmNotes}
                                        </div>
                                     {/if}
                                </div>
                             </div>
                        {/each}
                    </div>
                {/each}
            </div>
        {/each}
    </section>

    <!-- CONSTRUCTS REPORT -->
    {#if includeConstructs}
    <section class="constructs-details" style="page-break-before: always;">
        <h2>03. ARTIFICIAL TRAFFIC & INFRASTRUCTURE</h2>
        
        {#each getAllConstructs() as construct}
            <div class="construct-block data-box">
                <div style="display: flex; justify-content: space-between; border-bottom: 1px dashed #ccc; padding-bottom: 5px; margin-bottom: 5px;">
                    <strong>{construct.name.toUpperCase()}</strong>
                    <span>{construct.class}</span>
                </div>
                
                <div style="margin-bottom: 10px;">
                    <span style="background: #ddd; padding: 2px 5px; font-size: 0.9em;">LAST REPORTED POSITION:</span>
                    <span style="font-family: monospace; font-weight: bold;">{getLocationDescription(construct)}</span>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                    <div>
                        <p>{construct.description || 'No description.'}</p>
                        {#if mode === 'GM' && (construct as any).gmNotes}
                            <div style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px;">
                                <strong>GM NOTE:</strong> {(construct as any).gmNotes}
                            </div>
                        {/if}
                    </div>
                    <div>
                        <table>
                            <tbody>
                                <tr><th>Hull Mass</th><td>{formatNumber(construct.physical_parameters?.massKg)} kg</td></tr>
                                <tr><th>Dimensions</th><td>{construct.physical_parameters?.dimensionsM?.join('x') || '-'} m</td></tr>
                                <tr><th>Crew</th><td>{construct.crew?.current || 0} / {construct.crew?.max || 0}</td></tr>
                                <tr><th>Cargo</th><td>{construct.current_cargo_tonnes || 0} / {construct.physical_parameters?.cargoCapacity_tonnes || 0} t</td></tr>
                            </tbody>
                        </table>
                    </div>
                    <div>
                        <table>
                            <tbody>
                                <tr><th>Engines</th><td>
                                    {#if construct.engines}
                                        {#each construct.engines as engine}
                                            <div>{engine.quantity}x {engine.engine_id.replace('engine-', '').replace(/-/g, ' ')}</div>
                                        {/each}
                                    {:else}-{/if}
                                </td></tr>
                                <tr><th>Fuel</th><td>
                                    {#if construct.fuel_tanks}
                                        {#each construct.fuel_tanks as tank}
                                            <div>{tank.current_units}/{tank.capacity_units} {tank.fuel_type_id.replace('fuel-', '').replace(/-/g, ' ')}</div>
                                        {/each}
                                    {:else}-{/if}
                                </td></tr>
                                <tr><th>Power</th><td>
                                    {#if construct.systems?.power_plants}
                                        {#each construct.systems.power_plants as pp}
                                            <div>{pp.type} ({pp.output_MW} MW)</div>
                                        {/each}
                                    {:else}-{/if}
                                </td></tr>
                                <tr><th>Life Support</th><td>
                                    {#if construct.systems?.life_support}
                                        {construct.systems.life_support.consumables_current_person_days}/{construct.systems.life_support.consumables_max_person_days} person-days
                                    {:else}-{/if}
                                </td></tr>
                            </tbody>
                        </table>
                    </div>
                </div>
                
                {#if construct.systems?.modules && construct.systems.modules.length > 0}
                    <div style="margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 5px;">
                        <strong>MODULES:</strong> {construct.systems.modules.join(', ')}
                    </div>
                {/if}
            </div>
        {/each}
        
        {#if getAllConstructs().length === 0}
            <p>No artificial traffic detected in system.</p>
        {/if}
    </section>
    {/if}

    <footer class="report-footer no-print-margin">
        <hr>
        <div style="display:flex; justify-content:space-between; font-size: 0.8em;">
            <span>GENERATED BY STAR SYSTEM GENERATOR</span>
            <span>PAGE <span class="page-number"></span></span>
        </div>
    </footer>

  </div>
{/if}

<style>
    .loading, .error { padding: 2rem; text-align: center; font-family: sans-serif; }
    .error { color: red; }
    
    .toolbar {
        padding: 10px;
        background: #eee;
        border-bottom: 1px solid #ccc;
        margin-bottom: 20px;
        display: flex;
        gap: 10px;
        justify-content: center;
    }
    .toolbar button {
        padding: 8px 16px;
        cursor: pointer;
    }

    /* Fixed Table Layouts */
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 2px 5px; vertical-align: top; text-align: left; }
    
    /* Properties Table (Left Column / Right Column) */
    th { font-weight: bold; color: #555; white-space: nowrap; width: 1%; padding-right: 10px; }
    td { word-break: break-word; }
</style>
