<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { CelestialBody, RulePack } from '$lib/types';
  import { calculateAllStellarZones, calculateRocheLimit } from '$lib/physics/zones';
  import { AU_KM } from '$lib/constants';
  import { unitPrefs } from '$lib/unitPrefsStore';
  import { formatPref, unitBodyTypeFor } from '$lib/units';
  import OrbitalSlider from './OrbitalSlider.svelte';
  import { barycentreLabel, isBarycentre } from '$lib/system/barycentres';
  import { hostCandidates, reparentBody } from '$lib/system/reparent';

  export let body: CelestialBody;
  export let parentBody: CelestialBody | null = null;
  export let system: any = null;
  export let rulePack: RulePack | null = null;
  // The display instant. A re-home keeps the body exactly where the map shows it NOW, so the new
  // orbit's epoch is this moment, not the wall clock.
  export let nowMs: number | null = null;

  const dispatch = createEventDispatcher();

  // Shared guard for every distance this panel writes — an unphysical semi-major axis silently wrecks
  // the whole system's geometry, and NaN propagates into the orrery as a frozen or invisible orbit.
  const clampAU = (v: number, lo: number, hi: number) =>
      !Number.isFinite(v) ? lo : Math.min(hi, Math.max(lo, v));

  let a_AU = 0;
  // What the distance field DISPLAYS: for a binary member this is the pair SEPARATION
  // (a_self + a_partner, matching the "Separation from X" label); otherwise it is a_AU itself.
  // Editing writes both members' a_AU via the mass split, so the SystemProcessor's binary
  // reciprocal pass reproduces the same numbers instead of transforming what was typed.
  let dist_AU = 0;
  let a_slider = 0; // 0 to 1 linear representation of log scale
  let e = 0;
  let i_deg = 0;
  let omega_deg = 0;
  let Omega_deg = 0;
  let M0_deg = 0;

  let minA = 0.01;
  let maxA = 100;
  let stepA = 0.01;

  let showAdvancedOrbit = false; 
  let zones: any = null;
  let minSafePeriapsisAU = 0;
  let safeMaxE = 0.999;

  function init() {
      if (body.roleHint === 'moon') {
          minA = 0.00001;
          maxA = 0.05;
          stepA = 0.00001;
      } else {
          minA = 0.01;
          stepA = 0.001;
          
          // Determine dynamic maxA
          if (parentBody) {
              if (parentBody.roleHint === 'star') {
                  const sz = calculateAllStellarZones(parentBody);
                  // Allow planets up to 2x system limit, belts up to 10x
                  const multiplier = (body.roleHint === 'belt') ? 10 : 2;
                  maxA = Math.max(500, Math.ceil(sz.systemLimitAu * multiplier));
              } else if (parentBody.kind === 'barycenter') {
                  maxA = 100000; // Wide binaries / systems
              } else {
                  maxA = 1000;
              }
          } else {
              maxA = 1000;
          }
      }

      if (body.orbit) {
          a_AU = body.orbit.elements.a_AU;
          const partner = binaryPartnerOf();
          dist_AU = partner?.orbit ? a_AU + (partner.orbit.elements.a_AU || 0) : a_AU;
          // Initialize slider from real value
          updateSliderFromReal();

          e = body.orbit.elements.e;
          i_deg = body.orbit.elements.i_deg;
          omega_deg = body.orbit.elements.omega_deg || 0;
          Omega_deg = body.orbit.elements.Omega_deg || 0;
          M0_deg = (body.orbit.elements.M0_rad || 0) * (180 / Math.PI);
      }

      calculateZones();
  }

  function calculateZones() {
      zones = null;
      if (parentBody && parentBody.kind === 'body' && parentBody.roleHint === 'star') {
          zones = calculateAllStellarZones(parentBody, rulePack || undefined);
          // Add Roche Limit manually as it's calculated differently
          if (zones) {
              zones.rocheLimit = calculateRocheLimit(parentBody);
          }
      }
      // Could add planetary zones here later if needed
  }

  // While any input in this panel has focus, do NOT re-init from the model: the processor's
  // normalisation pass (binary reciprocal split, clamps) fires on every keystroke's dispatch and
  // was overwriting the number the user was still typing (e.g. "23.7" became "23.737313…").
  // On blur the guard lifts and the panel re-syncs to the (now idempotent) model.
  let editing = false;
  $: if (body && !editing) init();
  $: if (parentBody) calculateZones();

  // The binary partner when this body is one half of a 2-member barycentre pair, else null.
  function binaryPartnerOf(): any {
      const bary: any = parentBody;
      if (!bary || bary.kind !== 'barycenter' || bary.memberIds?.length !== 2
          || !bary.memberIds.includes(body.id) || !system?.nodes) return null;
      return system.nodes.find((n: any) => n.id !== body.id && bary.memberIds.includes(n.id)) ?? null;
  }
  function massOf(n: any): number {
      return n?.kind === 'barycenter' ? (n.effectiveMassKg || 0) : (n?.massKg || 0);
  }

  // Convert the displayed distance into the model's a_AU. For a binary member the display is the
  // SEPARATION: split it across both members by mass ratio (r_i = sep · m_other / M_total) — the
  // exact split the SystemProcessor derives, so its pass reproduces (not transforms) the input.
  function applyDistance() {
      const partner = binaryPartnerOf();
      if (partner?.orbit) {
          const mSelf = massOf(body);
          const mOther = massOf(partner);
          const total = mSelf + mOther;
          if (total > 0) {
              a_AU = dist_AU * (mOther / total);
              partner.orbit.elements.a_AU = dist_AU * (mSelf / total);
          } else {
              a_AU = dist_AU / 2;
              partner.orbit.elements.a_AU = dist_AU / 2;
          }
      } else {
          a_AU = dist_AU;
      }
  }

  function updateSliderFromReal() {
      // dist_AU -> slider (0-1)
      const safeA = Math.max(dist_AU, minA);
      const minLog = Math.log(minA);
      const maxLog = Math.log(maxA);
      a_slider = (Math.log(safeA) - minLog) / (maxLog - minLog);
  }

  function updateRealFromSlider() {
      // slider -> dist_AU
      const minLog = Math.log(minA);
      const maxLog = Math.log(maxA);
      const val = Math.exp(minLog + (maxLog - minLog) * a_slider);
      dist_AU = parseFloat(val.toFixed(5)); // Round to reasonable precision
      updateOrbit();
  }

  function handleOrbitalSliderInput(event: CustomEvent<number>) {
      dist_AU = event.detail;
      updateSliderFromReal(); // Sync the internal 0-1 slider just in case
      updateOrbit();
  }

  function handleNumberInput() {
      updateSliderFromReal();
      updateOrbit();
  }
function updateOrbit() {
    if (!body.orbit) return;
    // A negative/zero/NaN semi-major axis is unphysical and throws in ctx.ellipse
    // (it froze the orrery in a user file). Clamp to a tiny positive floor — and to a generous
    // absolute ceiling, so a runaway or a fat-fingered exponent can't put a body 1e49 AU out and
    // wreck the whole system's geometry. Typed values stay free within those bounds.
    if (!Number.isFinite(dist_AU) || dist_AU <= 0) {
        dist_AU = Math.max(minA, 1e-6);
    } else if (dist_AU > PAIR_MAX_AU) {
        dist_AU = PAIR_MAX_AU;
    }
    applyDistance();
    const boundedE = Math.max(0, Math.min(e, safeMaxE));
    if (Math.abs(boundedE - e) > 1e-9) {
        e = parseFloat(boundedE.toFixed(6));
    }
    body.orbit.elements.a_AU = a_AU;
    body.orbit.elements.e = e;
    body.orbit.elements.i_deg = i_deg;
    body.orbit.elements.omega_deg = omega_deg;
    body.orbit.elements.Omega_deg = Omega_deg;
    body.orbit.elements.M0_rad = M0_deg * (Math.PI / 180);
    body.orbit.lastEditedT0 = Date.now();

    // Binary Coupling: If we are in a binary system (child of a barycenter with exactly 2 members)
      // we need to keep the partner's orbit reciprocal.
      if (parentBody && parentBody.kind === 'barycenter' && parentBody.memberIds?.length === 2) {
          // Note: In a fully reactive system, the SystemProcessor or a dedicated modifier 
          // should handle this. However, to provide immediate UI feedback and ensure 
          // the 'systemStore' stays consistent before the next process() pass, we 
          // can look for the sibling here if we have access to the full system nodes.
          // Since we don't have 'system.nodes' here directly (only body and parentBody),
          // we rely on the dispatch('update') for the processor to fix the reciprocal state.
          // However, the user wants to "edit" it, so we should ensure the processor's
          // binary reciprocal logic (Pass 0 in SystemProcessor.ts) isn't FIGHTING the user.
      }

      dispatch('update');
  }

  function calculateMinSafePeriapsisAU(): number {
      if (!parentBody || !parentBody.radiusKm) return 0;
      const baseSafeKm = parentBody.radiusKm + 50;
      const leoSafeKm = parentBody.orbitalBoundaries?.minLeoKm
          ? parentBody.radiusKm + parentBody.orbitalBoundaries.minLeoKm
          : 0;
      const safeKm = Math.max(baseSafeKm, leoSafeKm);
      return safeKm / AU_KM;
  }

  // This body is one half of a binary when its parent is a 2-member barycentre. Its own orbit (above)
  // only sets the SEPARATION from its partner; the PAIR's position in the system lives on the
  // barycentre's own orbit. We surface both here so the pair is fully editable from the one body
  // (barycentres are no longer selectable). For the ROOT pair the barycentre IS the system centre, so
  // its distance slider is greyed. Editing either coupled value re-derives the partner on the next pass.
  $: isBinaryMember = !!parentBody
      && (parentBody as any).kind === 'barycenter'
      && ((parentBody as any).memberIds?.length === 2)
      && ((parentBody as any).memberIds as string[])?.includes(body.id);
  $: isRootPair = isBinaryMember && !(parentBody as any).parentId;
  $: pairHost = (isBinaryMember && (parentBody as any).parentId && system?.nodes)
      ? (system.nodes.find((n: any) => n.id === (parentBody as any).parentId) ?? null)
      : null;
  // A body can legitimately orbit a barycentre (a valid orbital point) even though the barycentre itself
  // is invisible and unselectable — so name it AND the bodies it holds, e.g. "Pluto-Charon Barycentre
  // (Pluto + Charon)". Nested pairs are FLATTENED to real bodies by the shared rule: naming the heaviest
  // member alone produced "Alpha Centauri System Barycentre (Alpha Centauri Barycentre)", which told the
  // user nothing about what was being orbited.
  function hostLabel(node: any, sys: any): string {
      if (!node) return '';
      if (isBarycentre(node)) return barycentreLabel(sys, node);
      return node.name ?? '';
  }
  // The pair-distance label names the host PLAINLY — spelling out a nested barycentre's contents here
  // listed the very bodies being edited back at the user ("…(Rigil Kentaurus + Toliman + Proxima…)").
  // The line under the control already says what moves; the contents matter only when something ORBITS
  // the point (orbitHostName below), where they are the whole point.
  $: pairHostName = pairHost ? (pairHost.name ?? '') : 'the system centre';
  // Name the actual bodies in the labels — on a multi-star system "partner"/"parent" is easy to lose.
  $: partnerBody = (isBinaryMember && system?.nodes)
      ? (system.nodes.find((n: any) => n.id !== body.id && ((parentBody as any).memberIds || []).includes(n.id)) ?? null)
      : null;
  $: partnerName = partnerBody ? partnerBody.name : 'its partner';
  $: orbitHostName = hostLabel(parentBody, system);
  let pairA_AU = 0;
  // Rounded for display: the stored value carries the full mass-split float (874.2056190963333), which
  // overflowed the box and read as noise.
  $: if (isBinaryMember && (parentBody as any).orbit && !editing) {
      pairA_AU = parseFloat((((parentBody as any).orbit.elements.a_AU ?? 0)).toFixed(4));
  }
  // FIXED log range — deliberately NOT derived from the current value. A slider whose maximum is a
  // multiple of its own value is a runaway: drag to the end, the range re-scales around the new value,
  // and the next drag multiplies again. Two drags took Alpha Centauri's inner pair from 874 AU to
  // 3e49 AU and destroyed the system's geometry. 1e6 AU is ~16 light years — past any bound pair — and
  // a log slider spans the eight decades comfortably.
  const PAIR_MIN_AU = 0.01;
  const PAIR_MAX_AU = 1e6;

  function handlePairDistance() {
      const bary: any = parentBody;
      if (!isBinaryMember || isRootPair || !bary?.orbit) return;
      // Clamp on WRITE too, so a typed value can't do what the slider no longer can.
      const v = Number(pairA_AU);
      const safe = Number.isFinite(v) ? clampAU(v, PAIR_MIN_AU, PAIR_MAX_AU) : PAIR_MIN_AU;
      if (safe !== v) pairA_AU = safe;
      bary.orbit.elements.a_AU = safe;
      bary.orbit.lastEditedT0 = Date.now();
      dispatch('update');
  }
  function handlePairSlider(event: CustomEvent<number>) {
      pairA_AU = parseFloat(event.detail.toFixed(4));
      handlePairDistance();
  }

  // Each member orbits the barycentre at its OWN mass-weighted share of the separation, on opposite
  // sides — so this body's distance from the centre is NOT the separation the control above sets. The
  // read-only data panel shows that share, so spell both out here or the two panels look contradictory.
  $: partnerA_AU = partnerBody?.orbit?.elements?.a_AU ?? 0;
  $: splitText = isBinaryMember && a_AU > 0 && partnerA_AU > 0
      ? `${body.name} orbits the centre at ${a_AU.toFixed(3)} AU, ${partnerName} at ${partnerA_AU.toFixed(3)} AU on the opposite side — heavier bodies sit closer in.`
      : '';

  // G64: RE-HOME. The owner's words: "an advanced edit button next to the standard orbit - to
  // reparent - it does not deserve 1st level appearance" - so it lives behind the one Advanced
  // disclosure, never at first level. The list is the construct picker's (one rule, system/reparent),
  // minus this body and everything beneath it, so a cycle cannot be asked for. Position-preserving:
  // the body's world state at `nowMs` is re-expressed about the new host (the importer's own
  // state-to-elements conversion), and the processor's passes then settle masses, pairs and the
  // stability tags that say whether the new home can hold it. Steer, do not stop.
  let rehomeHostId: string | null = null;
  let rehomeNote = '';
  $: rehomeCandidates = (system?.nodes && body?.id && body.kind === 'body' && !body.coOrbital)
      ? hostCandidates(system, { forBodyId: body.id })
      : [];
  $: canRehome = !!rehomeHostId && rehomeHostId !== body?.parentId;
  function rehome() {
      if (!system || !rehomeHostId || rehomeHostId === body.parentId) return;
      const res = reparentBody(system, body.id, rehomeHostId, nowMs ?? Date.now());
      if (!res) { rehomeNote = 'That body cannot host this one.'; return; }
      rehomeNote = res.mode === 'kepler'
          ? `${body.name} now orbits ${res.hostName}, from exactly where it was.`
          : `${body.name} now orbits ${res.hostName} on a circle at its current distance - it was moving too fast for ${res.hostName} to hold on any ellipse. It has not moved; the stability tags say what happens next.`;
      rehomeHostId = null;
      dispatch('update');
  }

  $: peri = dist_AU * (1 - e);
  $: aph = dist_AU * (1 + e);
  $: minSafePeriapsisAU = calculateMinSafePeriapsisAU();
  $: safeMaxE = a_AU > 0 ? Math.max(0, Math.min(0.999, 1 - (minSafePeriapsisAU / a_AU))) : 0.999;
  $: rangeText = body.roleHint === 'moon'
      ? `Range: ${formatPref($unitPrefs, 'orbit', unitBodyTypeFor(body), peri * AU_KM)} - ${formatPref($unitPrefs, 'orbit', unitBodyTypeFor(body), aph * AU_KM)}`
      : `Range: ${peri.toFixed(3)} - ${aph.toFixed(3)} AU`;
</script>

<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
<div class="tab-panel" on:focusin={() => (editing = true)} on:focusout={() => (editing = false)}>
    {#if body.coOrbital}
        <!-- G43: a co-orbital body's orbit is DERIVED from its secondary every pass — hand-edits
             would be silently reverted, so the editors are replaced by the relationship itself. -->
        {@const coSecondary = system?.nodes?.find((n) => n.id === body.coOrbital?.hostId)}
        <div class="form-group">
            <div class="label-row"><label>Co-orbital companion</label></div>
            <div class="info-row" style="font-size: 0.85em;">
                Rides the <strong>{body.coOrbital.point.toUpperCase()}</strong> point of
                <strong>{coSecondary?.name ?? 'a deleted body'}</strong>
                — {body.coOrbital.point === 'l4' ? 'leading its orbit by 60°' : body.coOrbital.point === 'l5' ? 'trailing its orbit by 60°' : body.coOrbital.point === 'l3' ? 'on the far side of its orbit' : 'on the line to its host'}.
            </div>
            <div class="info-row" style="font-size: 0.78em; color: var(--text-faint); margin-top: 4px;">
                The orbit is derived from {coSecondary?.name ?? 'the secondary'} on every pass: edit the
                secondary and this body follows. To give it an independent orbit, release it below.
            </div>
            <button style="margin-top: 8px;" on:click={() => { delete body.coOrbital; dispatch('update'); }}>
                Release from {coSecondary?.name ?? 'the secondary'} (keep current orbit)
            </button>
        </div>
    {:else if !body.orbit}
        <p>This body has no orbit (it might be the central star).</p>
    {:else}
        {#if isBinaryMember}
        <div class="form-group pair-group" class:rooted={isRootPair}>
            <div class="label-row">
                <label title="Moves the whole binary pair through the system. The control below only sets how far apart the two bodies sit.">Distance from {pairHostName} (AU)</label>
                <input type="number" step="any" min={PAIR_MIN_AU} max={PAIR_MAX_AU} bind:value={pairA_AU} on:input={handlePairDistance} disabled={isRootPair} />
            </div>
            {#if !isRootPair}
            <div class="full-width-slider">
                <OrbitalSlider value={pairA_AU} min={PAIR_MIN_AU} max={PAIR_MAX_AU} on:input={handlePairSlider} />
            </div>
            {/if}
            <div class="info-row" style="font-size: 0.78em; color: var(--text-faint);">
                {#if isRootPair}This pair is the system centre, so it has no distance to set. The control below sets how far apart the two bodies sit.{:else}Moves {body.name} and {partnerName} together, as one. The control below sets how far apart they sit.{/if}
            </div>
        </div>
        {/if}
        <div class="form-group">
            <div class="label-row">
                <label>{isBinaryMember ? `Separation from ${partnerName} (AU)` : 'Semi-Major Axis (AU)'}</label>
                <input type="number" step="any" bind:value={dist_AU} on:input={handleNumberInput} />
            </div>
            <div class="info-row" style="font-size: 0.8em; color: var(--text-faint); margin-bottom: 4px;">{#if !isBinaryMember && orbitHostName}Orbits {orbitHostName} · {/if}{rangeText}</div>
            <!-- Custom Orbital Slider -->
            <div class="full-width-slider">
                <OrbitalSlider value={dist_AU} min={minA} max={maxA} {zones} on:input={handleOrbitalSliderInput} />
            </div>
            {#if splitText}
            <div class="info-row" style="font-size: 0.78em; color: var(--text-faint);">{splitText}</div>
            {/if}
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Eccentricity</label>
                <input type="number" step="any" min="0" max={safeMaxE} bind:value={e} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max={safeMaxE} step="0.001" bind:value={e} on:input={updateOrbit} class="full-width-slider" />
            <div
                class="info-row"
                title="Max eccentricity is limited so periapsis stays above the host's safe altitude (radius + minimum low-orbit floor)."
            >
                Max allowed here: {safeMaxE.toFixed(3)}
            </div>
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Argument of Periapsis (°)</label>
                <input type="number" step="any" min="0" max="360" bind:value={omega_deg} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max="360" step="0.01" bind:value={omega_deg} on:input={updateOrbit} class="full-width-slider" />
        </div>

        <div class="form-group">
            <div class="label-row">
                <label>Mean Anomaly (°)</label>
                <input type="number" step="any" min="0" max="360" bind:value={M0_deg} on:input={updateOrbit} />
            </div>
            <input type="range" min="0" max="360" step="0.01" bind:value={M0_deg} on:input={updateOrbit} class="full-width-slider" />
        </div>

        <hr />

        <div class="form-group checkbox-row">
            <input type="checkbox" id="retrograde" 
                checked={body.orbit.isRetrogradeOrbit} 
                on:change={(e) => {
                    const isRetro = e.currentTarget.checked;
                    body.orbit.isRetrogradeOrbit = isRetro;
                    
                    if (!body.tags) body.tags = [];
                    
                    if (isRetro) {
                        if (!body.tags.some(t => t.key === 'Retrograde Orbit')) body.tags.push({ key: 'Retrograde Orbit' });
                        if (!body.tags.some(t => t.key === 'Captured Body')) body.tags.push({ key: 'Captured Body' });
                    } else {
                        body.tags = body.tags.filter(t => t.key !== 'Retrograde Orbit' && t.key !== 'Captured Body');
                    }
                    dispatch('update');
                }} 
            />
            <label for="retrograde">Retrograde Orbit</label>
        </div>

        <div class="form-group checkbox-row">
            <input type="checkbox" id="showAdv" bind:checked={showAdvancedOrbit} />
            <label for="showAdv">Show Advanced Orbital Elements</label>
        </div>

        {#if showAdvancedOrbit}
            <div class="form-group">
                <div class="label-row">
                    <label>Inclination (°)</label>
                    <input type="number" step="any" min="0" max="180" bind:value={i_deg} on:input={updateOrbit} />
                </div>
                <input type="range" min="0" max="180" step="0.01" bind:value={i_deg} on:input={updateOrbit} class="full-width-slider" />
            </div>

            <div class="form-group">
                <div class="label-row">
                    <label>Long. of Asc. Node (°)</label>
                    <input type="number" step="any" min="0" max="360" bind:value={Omega_deg} on:input={updateOrbit} />
                </div>
                <input type="range" min="0" max="360" step="0.01" bind:value={Omega_deg} on:input={updateOrbit} class="full-width-slider" />
            </div>

            <hr />

            <div class="form-group rehome-group">
                <div class="label-row">
                    <label for="rehome-host" title="Move this body to orbit a different host. It stays exactly where it is on the map at this instant; its orbit is re-expressed about the new host.">Re-home to</label>
                    <select id="rehome-host" bind:value={rehomeHostId} disabled={!rehomeCandidates.length}>
                        <option value={null}>{rehomeCandidates.length ? 'Choose a host…' : 'Nothing can host this body'}</option>
                        {#each rehomeCandidates as h (h.id)}
                            <option value={h.id} disabled={h.id === body.parentId}>{hostLabel(h, system)}{h.id === body.parentId ? ' (current)' : ''}</option>
                        {/each}
                    </select>
                </div>
                <div class="info-row" style="font-size: 0.78em; color: var(--text-faint);">
                    Keeps {body.name} exactly where it is at this instant and re-expresses its orbit about the new host — a tidy ellipse if it is bound there, a circle at its current distance if not. Nothing is refused; the stability tags say what would happen.
                </div>
                <button class="rehome-btn" on:click={rehome} disabled={!canRehome}>Re-home {body.name}</button>
                {#if rehomeNote}<div class="info-row" style="font-size: 0.78em;">{rehomeNote}</div>{/if}
            </div>
        {/if}
    {/if}
</div>

<style>
  .tab-panel { padding: 10px; display: flex; flex-direction: column; gap: 15px; }
  .form-group { display: flex; flex-direction: column; gap: 5px; }
  .pair-group {
      border: 1px solid var(--border);
      border-left: 3px solid var(--accent, #5b8def);
      border-radius: 4px;
      padding: 8px;
      background: color-mix(in srgb, var(--accent, #5b8def) 7%, transparent);
  }
  .pair-group.rooted { opacity: 0.55; }
  .pair-group input:disabled { cursor: not-allowed; }
  
  .label-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
  }
  
  label { color: var(--text-muted); font-size: 0.9em; }

  input[type="number"] {
      padding: 4px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      width: 80px;
      text-align: right;
  }

  .full-width-slider {
      width: 100%;
      margin: 0;
  }
  .full-width-slider input { width: 100%; }
  .info-row {
      font-size: 0.8em;
      color: var(--text-faint);
      margin-top: 4px;
  }

  .checkbox-row {
      flex-direction: row;
      align-items: center;
      gap: 10px;
  }
  .checkbox-row label { margin: 0; }

  hr { border: 0; border-top: 1px solid var(--border); margin: 5px 0; width: 100%; }

  .rehome-group select {
      padding: 4px;
      background: var(--bg-control);
      border: 1px solid var(--border);
      color: var(--text);
      border-radius: 3px;
      max-width: 60%;
  }
  .rehome-btn { align-self: flex-start; margin-top: 4px; }
</style>
