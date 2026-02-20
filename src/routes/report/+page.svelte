<script lang="ts">
  import { onMount } from 'svelte';
  import { computePlayerSnapshot } from '$lib/system/utils';
  import '$lib/reports/report-styles.css';
  import type { System, CelestialBody, Barycenter } from '$lib/types';
  import { AU_KM } from '$lib/constants';
  import { composeSurfaceTemperatureFromDeltaComponents } from '$lib/physics/temperature';

  let system: System | null = null;
  let mode: 'GM' | 'Player' = 'GM';
  let theme: string = 'retro';
  let includeConstructs = true;
  let loading = true;
  let error = '';
  let overviewMainHostId: string | null = null;
  let overviewBodies: CelestialBody[] = [];
  let rootStars: CelestialBody[] = [];
  let overviewHostLabel = 'Host';
  let overviewDiagramEntries: Array<{ body: CelestialBody; idx: number; orbitRadius: number; aAU: number }> = [];
  let overviewMoonLines: string[] = [];
  let additionalStarSets: Array<{
      star: CelestialBody;
      entries: Array<{ body: CelestialBody; idx: number; orbitRadius: number; aAU: number }>;
      moonLines: string[];
      maxMoonDepth: number;
      rowHeight: number;
  }> = [];

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

  $: if (system) {
      rootStars = getRootStars();
      const anchor = getOverviewAnchor();
      overviewMainHostId = anchor.hostId;
      overviewHostLabel = anchor.label;
      overviewBodies = anchor.bodies;
  } else {
      rootStars = [];
      overviewMainHostId = null;
      overviewHostLabel = 'Host';
      overviewBodies = [];
  }
  $: overviewDiagramEntries = buildOverviewDiagramEntries(overviewBodies);
  $: overviewMoonLines = getOverviewMoonLines(overviewDiagramEntries);
  $: additionalStarSets = (!system || rootStars.length <= 1) ? [] : getAdditionalStarSets();

  function formatNumber(num: number | undefined, decimals = 0) {
    if (num === undefined || num === null) return '-';
    if (num > 1e15) return num.toExponential(2);
    return num.toLocaleString(undefined, { maximumFractionDigits: decimals });
  }

  function getBodiesOnly(parentId: string) {
      if (!system) return [];
      const direct = system.nodes
          .filter((n) => (n.kind !== 'construct') && (n.parentId === parentId || n.orbit?.hostId === parentId))
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
      if (direct.length > 0) return direct;

      // Fallback: if parent is a star or star-barycenter, include top-level stellar orbiters.
      const parent = system.nodes.find((n) => n.id === parentId);
      const starHostIds = getStarHostIds();
      const parentBarycenterId = (parent && parent.kind !== 'barycenter' && parent.parentId) ? parent.parentId : null;
      const isStarLikeParent =
          !!parent &&
          ((isStarNode(parent)) ||
           (parent.kind === 'barycenter' && starHostIds.has(parent.id)));
      if (!isStarLikeParent) return direct;

      return system.nodes
          .filter((n) =>
              n.kind !== 'construct' &&
              !isStarNode(n) &&
              !!n.orbit &&
              (starHostIds.has(n.orbit?.hostId || '') ||
               starHostIds.has(n.parentId || '') ||
               (!!parentBarycenterId && (n.parentId === parentBarycenterId || n.orbit?.hostId === parentBarycenterId)))
          )
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
  }

  function getDirectBodiesOnly(parentId: string) {
      if (!system) return [];
      return system.nodes
          .filter((n): n is CelestialBody =>
              n.kind !== 'construct' &&
              n.kind === 'body' &&
              (n.parentId === parentId || n.orbit?.hostId === parentId)
          )
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
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
      if (body.temperatureK === undefined) return '-';
      const c = Math.round(body.temperatureK - 273.15);
      return `${c}°C`;
  }

  function getTempDetails(body: CelestialBody) {
      const b = body as any;
      if (body.temperatureK === undefined) return '';
      
      const parts = [];
      if (b.equilibriumTempK) parts.push(`Eq: ${Math.round(b.equilibriumTempK)}K`);
      if (b.greenhouseTempK) parts.push(`G.House: +${Math.round(b.greenhouseTempK)}K`);
      if (b.internalHeatK) parts.push(`Internal: +${Math.round(b.internalHeatK)}K`);
      if (b.tidalHeatK) parts.push(`Tidal: +${Math.round(b.tidalHeatK)}K`);
      if (b.radiogenicHeatK) parts.push(`Core: +${Math.round(b.radiogenicHeatK)}K`);
      
      if (parts.length === 0) return '';
      return `(${parts.join(', ')})`;
  }

  function getOrbitStability(body: CelestialBody) {
      const explicit = (body as any).orbitalStability;
      if (typeof explicit === 'string' && explicit.trim().length > 0) return explicit;
      const tag = body.tags?.find((t) => t.key.startsWith('stability/'))?.key;
      if (!tag) return '-';
      const slug = tag.split('/')[1] || '';
      return slug
          .split('-')
          .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
          .join(' ');
  }

  function getRadiationRange(body: CelestialBody) {
      const min = (body as any).surfaceRadiationMin;
      const max = (body as any).surfaceRadiationMax;
      if (typeof min !== 'number' || typeof max !== 'number') return '-';
      return `${min.toFixed(2)} - ${max.toFixed(2)} mSv/y`;
  }

  function getEquilibriumRange(body: CelestialBody) {
      const min = (body as any).equilibriumTempMinK;
      const max = (body as any).equilibriumTempMaxK;
      if (typeof min !== 'number' || typeof max !== 'number') return '-';
      return `${Math.round(min - 273.15)}°C to ${Math.round(max - 273.15)}°C`;
  }

  function getTempProfile(body: CelestialBody) {
      if (body.temperatureK === undefined) return '-';
      const surfaceC = body.temperatureK - 273.15;

      const eqMinK = typeof (body as any).equilibriumTempMinK === 'number' ? (body as any).equilibriumTempMinK : null;
      const eqMaxK = typeof (body as any).equilibriumTempMaxK === 'number' ? (body as any).equilibriumTempMaxK : null;
      const greenhouseK = body.greenhouseTempK || 0;
      const tidalK = body.tidalHeatK || 0;
      const radiogenicK = body.radiogenicHeatK || 0;
      const internalK = body.internalHeatK || 0;
      const pressureBar = body.atmosphere?.pressure_bar || 0;

      let minTempC = surfaceC;
      let maxTempC = surfaceC;
      if (pressureBar < 0.01 && body.roleHint !== 'star') {
          const tEq = body.equilibriumTempK || 0;
          minTempC = composeSurfaceTemperatureFromDeltaComponents(Math.max(3, tEq * 0.5), greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
          maxTempC = composeSurfaceTemperatureFromDeltaComponents(tEq * 1.45, greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
      } else if (eqMinK !== null && eqMaxK !== null) {
          minTempC = composeSurfaceTemperatureFromDeltaComponents(eqMinK, greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
          maxTempC = composeSurfaceTemperatureFromDeltaComponents(eqMaxK, greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
      }

      let dayMinTempC: number;
      let dayMaxTempC: number;
      let nightMinTempC: number;
      let nightMaxTempC: number;

      if (pressureBar < 0.01 && body.roleHint !== 'star') {
          const tEq = body.equilibriumTempK || 0;
          dayMinTempC = composeSurfaceTemperatureFromDeltaComponents(Math.max(3, tEq * (body.tidallyLocked ? 0.78 : 0.70)), greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
          dayMaxTempC = composeSurfaceTemperatureFromDeltaComponents(tEq * (body.tidallyLocked ? 1.45 : 1.35), greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
          nightMinTempC = composeSurfaceTemperatureFromDeltaComponents(Math.max(3, tEq * (body.tidallyLocked ? 0.33 : 0.40)), greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
          nightMaxTempC = composeSurfaceTemperatureFromDeltaComponents(tEq * (body.tidallyLocked ? 0.72 : 0.85), greenhouseK, tidalK, radiogenicK, internalK) - 273.15;
      } else {
          const cMin = minTempC;
          const cMax = maxTempC;
          const orbitalHalfRange = Math.max(0, (cMax - cMin) * 0.5);
          const pressureMix = Math.max(0, Math.min(1, pressureBar / (pressureBar + 0.5)));
          let dayNightSpanC = (1 - pressureMix) * 70 + 8;
          if (body.tidallyLocked) dayNightSpanC *= 1.15;
          const latitudinalSpanC = (1 - pressureMix) * 35 + 20;

          const dayCenter = surfaceC + dayNightSpanC * 0.35;
          const nightCenter = surfaceC - dayNightSpanC * 0.65;

          dayMinTempC = dayCenter - (orbitalHalfRange + latitudinalSpanC * 0.7);
          dayMaxTempC = dayCenter + (orbitalHalfRange + latitudinalSpanC * 0.5);
          nightMinTempC = nightCenter - (orbitalHalfRange + latitudinalSpanC * 0.8);
          nightMaxTempC = nightCenter + (orbitalHalfRange + latitudinalSpanC * 0.3);
      }

      const range = `${Math.round(minTempC)}°C to ${Math.round(maxTempC)}°C`;
      const day = `${Math.round(dayMinTempC)}°C to ${Math.round(dayMaxTempC)}°C`;
      const night = `${Math.round(nightMinTempC)}°C to ${Math.round(nightMaxTempC)}°C`;
      const hotspotNote = body.tags?.some((t) => t.key === 'tidal/hotspots') ? ' | Tidal hotspots' : '';
      return `Range: ${range} | Day: ${day} | Night: ${night}${hotspotNote}`;
  }

  function getAtmosphereString(body: CelestialBody) {
      if (!body.atmosphere) return 'None';
      const p = body.atmosphere.pressure_bar ?? body.atmosphere.pressure_atm ?? 0;
      const pStr = p < 0.001 ? '<0.001' : p.toFixed(2);
      
      const gases = Object.entries(body.atmosphere.composition || {})
          .sort((a,b) => b[1] - a[1])
          .map(([g, pct]) => `${g} ${(pct*100).toFixed(0)}%`)
          .join(', ');

      return `${body.atmosphere.name || 'Unknown'} (${pStr} bar) ${gases ? '['+gases+']' : ''}`;
  }

  function getLuminosity(body: CelestialBody) {
      if (body.roleHint !== 'star' || !body.radiusKm || !body.temperatureK) return '-';
      const r = body.radiusKm / 696340; // Solar Radius
      const t = body.temperatureK / 5778; // Solar Temp
      const lum = Math.pow(r, 2) * Math.pow(t, 4);
      return lum < 0.01 ? lum.toExponential(2) + ' L☉' : lum.toFixed(2) + ' L☉';
  }

  function getHydroString(body: CelestialBody) {
      if (!body.hydrosphere || body.hydrosphere.coverage === undefined || body.hydrosphere.coverage === 0) return 'No surface liquid';
      const cov = Math.round(body.hydrosphere.coverage * 100);
      const comp = body.hydrosphere.composition ? ` (${body.hydrosphere.composition})` : '';
      return `${cov}%${comp}`;
  }

  function getOrbitDistanceAuLabel(body: CelestialBody) {
      const a = body.orbit?.elements?.a_AU;
      if (typeof a !== 'number' || !Number.isFinite(a) || a <= 0) return '';
      return `${a.toFixed(1)} AU`;
  }

  function isPlanetaryBarycenterBody(body: CelestialBody) {
      const anyBody = body as any;
      const isBary = anyBody.kind === 'barycenter' || body.roleHint === 'barycenter' || /barycenter/i.test(body.name || '');
      if (!isBary) return false;
      if (!system || !Array.isArray(anyBody.memberIds)) return isBary;
      const members = anyBody.memberIds
          .map((id: string) => system?.nodes.find((n) => n.id === id))
          .filter((m: any) => !!m && m.kind === 'body');
      return members.some((m: any) => !isStarNode(m));
  }

  function getBarycenterPrimaryMemberName(body: CelestialBody) {
      const anyBody = body as any;
      if (!system || !Array.isArray(anyBody.memberIds)) return '';
      const members = anyBody.memberIds
          .map((id: string) => system?.nodes.find((n) => n.id === id))
          .filter((m: any) => !!m && m.kind === 'body' && !isStarNode(m))
          .sort((a: any, b: any) => (b.massKg || 0) - (a.massKg || 0));
      return members[0]?.name || '';
  }

  function getDiagramBodyLabel(body: CelestialBody) {
      if (!isPlanetaryBarycenterBody(body)) return body.name;
      const primary = getBarycenterPrimaryMemberName(body);
      if (primary) return `${primary} (Bary center)`;
      const base = (body.name || '').replace(/\s*Barycenter\s*/i, '').trim();
      return `${base || body.name} (Bary center)`;
  }

  function shouldSuppressDiagramBodyLabel(
      entry: { body: CelestialBody; aAU: number },
      entries: Array<{ body: CelestialBody; aAU: number }>
  ) {
      if (isPlanetaryBarycenterBody(entry.body)) return false;
      const clashBary = entries.find((other) =>
          isPlanetaryBarycenterBody(other.body) &&
          Math.abs((other.aAU || 0) - (entry.aAU || 0)) < 1e-9
      );
      if (!clashBary) return false;
      const primary = getBarycenterPrimaryMemberName(clashBary.body);
      if (!primary) return false;
      return primary.toLowerCase() === (entry.body.name || '').toLowerCase();
  }

  function shouldShowOrbitAuLabel(body: CelestialBody) {
      if (body.roleHint === 'planet' || body.roleHint === 'dwarf-planet') return true;
      if (body.roleHint === 'barycenter') return true;
      if (/barycenter/i.test(body.name || '')) return true;
      return false;
  }

  function getOrbitalMechanics(body: CelestialBody) {
      const anyBody = body as any;
      if (anyBody.loDeltaVBudget_ms) {
          const ascent = (anyBody.loDeltaVBudget_ms / 1000).toFixed(1) + ' km/s';
          const land = anyBody.aerobrakeLandBudget_ms > 0 
              ? (anyBody.aerobrakeLandBudget_ms / 1000).toFixed(1) + ' km/s (Aero)' 
              : (anyBody.propulsiveLandBudget_ms / 1000).toFixed(1) + ' km/s';
          return `Ascent: ${ascent} | Land: ${land}`;
      }
      return '-';
  }

  function getTagsString(body: CelestialBody) {
      if (!body.tags || body.tags.length === 0) return '-';
      return body.tags.map(t => t.key.split('/').pop()?.replace(/_/g, ' ')).join(', ');
  }

  function isStarNode(node: any): boolean {
      if (!node) return false;
      if (node.roleHint === 'star') return true;
      return Array.isArray(node.classes) && node.classes.some((c: string) => String(c).startsWith('star/'));
  }

  function getPrimaryBodies() {
      if (!system) return [];
      const nodesById = new Map(system.nodes.map(n => [n.id, n]));
      
      return system.nodes.filter(n => {
          if (n.kind !== 'body') return false;
          
          // Case 1: It is a Star
          if (n.roleHint === 'star') return true;

          // Case 2: It orbits a Barycenter (and is not a star, covered above)
          if (n.parentId) {
              const parent = nodesById.get(n.parentId);
              if (parent && parent.kind === 'barycenter') return true;
          }

          // Case 3: It has no parent (Rogue Planet)
          if (!n.parentId) return true;

          return false;
      }).sort((a, b) => {
          // Sort: Stars first, then by semi-major axis
          const isStarA = a.roleHint === 'star';
          const isStarB = b.roleHint === 'star';
          if (isStarA && !isStarB) return -1;
          if (!isStarA && isStarB) return 1;
          
          const distA = a.orbit?.elements.a_AU || 0;
          const distB = b.orbit?.elements.a_AU || 0;
          return distA - distB;
      });
  }

  function getRootStars() {
      if (!system) return [];
      return system.nodes
          .filter((n): n is CelestialBody => isStarNode(n))
          .sort((a, b) => (b.massKg || 0) - (a.massKg || 0));
  }

  function getSurveyStars() {
      return getRootStars();
  }

  function getSurveyBarycenterSets() {
      if (!system) return [];
      const byId = new Map(system.nodes.map((n) => [n.id, n]));
      return getBarycenters()
          .map((bary) => {
              const starMembers = (bary.memberIds || [])
                  .map((id) => byId.get(id))
                  .filter((n): n is CelestialBody => !!n && n.kind === 'body' && isStarNode(n));
              const orbiters = getDirectBodiesOnly(bary.id).filter((b) => !isStarNode(b));
              return { bary, starMembers, orbiters };
          })
          .filter((set) => set.starMembers.length > 0 || set.orbiters.length > 0);
  }

  function getBarycenters() {
      if (!system) return [];
      return system.nodes.filter((n): n is Barycenter => n.kind === 'barycenter');
  }

  function getOverviewMainHostId() {
      const stars = getRootStars();
      if (stars.length === 0) {
          const firstPrimary = getPrimaryBodies().find((b) => b.kind === 'body');
          return firstPrimary?.id || null;
      }
      const topStar = stars[0];
      if (!topStar.parentId) return topStar.id;
      const parent = system?.nodes.find((n) => n.id === topStar.parentId);
      if (parent?.kind === 'barycenter') return parent.id;
      return topStar.id;
  }

  function getOverviewAnchor(): { hostId: string | null; label: string; bodies: CelestialBody[] } {
      if (!system) return { hostId: null, label: 'Host', bodies: [] };

      const stars = getRootStars();
      const primaryStar = stars[0] || null;
      const fallbackPrimary = getPrimaryBodies()[0];

      let hostId: string | null = null;
      let label = 'Host';

      if (primaryStar) {
          // In multi-star systems, the primary row must stay star-scoped.
          // Circumbinary objects are rendered in their own dedicated section.
          hostId = primaryStar.id;
          label = primaryStar.name || 'Host';
      } else if (fallbackPrimary) {
          hostId = fallbackPrimary.id;
          label = fallbackPrimary.name || 'Host';
      }

      const bodies = hostId
          ? getDirectBodiesOnly(hostId).filter((n) => !isStarNode(n))
          : [];

      return { hostId, label, bodies };
  }

  function getCompactOrbitBodies(hostId: string | null) {
      if (!system || !hostId) return [];
      return system.nodes
          .filter((n): n is CelestialBody =>
              n.kind !== 'construct' &&
              (n.parentId === hostId || n.orbit?.hostId === hostId) &&
              !isStarNode(n)
          )
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
  }

  function getStarHostIds() {
      if (!system) return new Set<string>();
      const ids = new Set<string>();
      for (const node of system.nodes) {
          if (isStarNode(node)) {
              ids.add(node.id);
          }
      }
      for (const node of system.nodes) {
          if (node.kind !== 'barycenter') continue;
          const hasStarMember = (node.memberIds || []).some((id) => {
              const m = system?.nodes.find((n) => n.id === id);
              return !!m && isStarNode(m);
          });
          if (hasStarMember) ids.add(node.id);
      }
      return ids;
  }

  function getOverviewBodies(hostId: string | null) {
      const primary = getCompactOrbitBodies(hostId);
      if (primary.length > 0 || !system) return primary;

      // Fallback for legacy/mixed linkage snapshots: gather all non-star stellar orbiters.
      const starHosts = getStarHostIds();
      return system.nodes
          .filter((n): n is CelestialBody =>
              n.kind !== 'construct' &&
              !isStarNode(n) &&
              !!n.orbit &&
              starHosts.has(n.parentId || n.orbit?.hostId || '')
          )
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
  }

  function getCompactBodyGlyph(body: CelestialBody) {
      if (body.roleHint === 'ring') return '◌';
      if (body.roleHint === 'belt') return '•';
      if (body.roleHint === 'moon') return '○';
      return '●';
  }

  function isPlanetLike(body: CelestialBody) {
      return body.roleHint === 'planet' || body.roleHint === 'dwarf-planet' || body.roleHint === 'moon';
  }

  function hasRingSystem(body: CelestialBody) {
      const children = getBodiesOnly(body.id);
      return children.some((c) => c.roleHint === 'ring');
  }

  function getMoonNames(body: CelestialBody, max = 6) {
      const moons = getBodiesOnly(body.id).filter((c) => c.roleHint === 'moon').map((m) => m.name);
      if (moons.length === 0) return '';
      if (moons.length <= max) return moons.join(', ');
      return `${moons.slice(0, max).join(', ')} +${moons.length - max} more`;
  }

  function getMoonBodies(body: CelestialBody) {
      return getBodiesOnly(body.id)
          .filter((c) => c.roleHint === 'moon')
          .sort((a, b) => (a.orbit?.elements.a_AU || 0) - (b.orbit?.elements.a_AU || 0));
  }

  function getOverviewHostLabel(hostId: string | null) {
      if (!system || !hostId) return getRootStars()[0]?.name || 'Host';
      const host = system.nodes.find((n) => n.id === hostId);
      if (!host) return getRootStars()[0]?.name || 'Host';
      if (host.kind === 'barycenter') {
          const starNames = (host.memberIds || [])
              .map((id) => system?.nodes.find((n) => n.id === id))
              .filter((n): n is CelestialBody => !!n && n.kind === 'body' && n.roleHint === 'star')
              .map((s) => s.name);
          if (starNames.length > 0) return starNames.join(' + ');
      }
      return host.name || 'Host';
  }

  function getCircumbinarySets() {
      if (!system) return [];
      const byId = new Map(system.nodes.map((n) => [n.id, n]));
      return getBarycenters()
          .map((bary) => {
              const starMembers = (bary.memberIds || [])
                  .map((id) => byId.get(id))
                  .filter((n): n is CelestialBody => !!n && n.kind === 'body' && n.roleHint === 'star');
              const orbiters = getCompactOrbitBodies(bary.id).filter((b) => b.roleHint !== 'star');
              const orbitEntries = buildOverviewDiagramEntries(orbiters);
              const maxMoonDepth = orbitEntries.reduce((max, entry) => Math.max(max, getMoonBodies(entry.body).length), 0);
              const rowHeight = Math.max(126, 78 + maxMoonDepth * 14);
              return { bary, starMembers, orbiters, orbitEntries, rowHeight };
          })
          .filter((set) => set.starMembers.length >= 2 && set.orbiters.length > 0);
  }

  function getAdditionalStarSets() {
      const stars = rootStars.slice(1);
      return stars
          .map((star) => {
              const bodies = getCompactOrbitBodies(star.id).filter((b) => b.roleHint !== 'star');
              const entries = buildOverviewDiagramEntries(bodies);
              const moonLines = entries
                  .map((entry) => {
                      const moons = getMoonNames(entry.body);
                      return moons ? `${entry.body.name}: ${moons}` : '';
                  })
                  .filter((line) => line.length > 0);
              const maxMoonDepth = entries.reduce((max, entry) => Math.max(max, getMoonBodies(entry.body).length), 0);
              const rowHeight = Math.max(126, 84 + moonLines.length * 12 + maxMoonDepth * 14);
              return {
                  star,
                  entries,
                  moonLines,
                  maxMoonDepth,
                  rowHeight
              };
          });
  }

  function getAdditionalStarDiagramHeight(
      sets: Array<{ rowHeight: number }>
  ) {
      return Math.max(124, sets.reduce((sum, set) => sum + set.rowHeight, 26));
  }

  function getAdditionalStarRowY(
      sets: Array<{ rowHeight: number }>,
      row: number
  ) {
      let y = 48;
      for (let i = 0; i < row; i += 1) y += sets[i].rowHeight;
      return y;
  }

  function getOverviewRowHeight(entries: Array<{ body: CelestialBody }>) {
      return Math.max(124, 82 + getOverviewMaxMoonDepth(entries) * 14);
  }

  function getUnifiedSystemDiagramHeight(
      entries: Array<{ body: CelestialBody }>,
      sets: Array<{ rowHeight: number }>
  ) {
      return Math.max(150, getOverviewRowHeight(entries) + sets.reduce((sum, set) => sum + set.rowHeight, 0) + 32);
  }

  function getAdditionalRowYAfterOverview(
      entries: Array<{ body: CelestialBody }>,
      sets: Array<{ rowHeight: number }>,
      row: number
  ) {
      let y = 68 + getOverviewRowHeight(entries) + 10;
      for (let i = 0; i < row; i += 1) y += sets[i].rowHeight;
      return y;
  }

  function getOverviewMoonLines(entries: Array<{ body: CelestialBody }>) {
      return entries
          .map((entry) => {
              const moons = getMoonNames(entry.body);
              return moons ? `${entry.body.name}: ${moons}` : '';
          })
          .filter((line) => line.length > 0);
  }

  function getOverviewMaxMoonDepth(entries: Array<{ body: CelestialBody }>) {
      return entries.reduce((max, entry) => Math.max(max, getMoonBodies(entry.body).length), 0);
  }

  function getScaledMarkerRadius(body: CelestialBody) {
      if (body.roleHint === 'belt' || body.roleHint === 'ring') return 2.2;
      const km = Math.max(180, body.radiusKm || 1000);
      const scaled = 3 + (Math.log10(km) - 2.2) * 3.1;
      return Math.max(3, Math.min(12, scaled));
  }

  function getBeltDisplaySize(body: CelestialBody, fallbackRadius: number) {
      const anyBody = body as any;
      const innerKm = typeof anyBody.radiusInnerKm === 'number' ? anyBody.radiusInnerKm : null;
      const outerKm = typeof anyBody.radiusOuterKm === 'number' ? anyBody.radiusOuterKm : null;
      if (innerKm !== null && outerKm !== null && outerKm > innerKm) {
          const widthAu = (outerKm - innerKm) / AU_KM;
          const meanAu = (outerKm + innerKm) * 0.5 / AU_KM;
          const relativeWidth = meanAu > 0 ? widthAu / meanAu : 0;
          // Keep belts diffuse but avoid over-wide blobs in compact row diagrams.
          const rx = Math.max(5, Math.min(28, 5 + widthAu * 9 + relativeWidth * 26));
          const ry = Math.max(3, Math.min(10, 2.1 + widthAu * 2.1));
          return { rx, ry };
      }
      return {
          rx: Math.max(5, fallbackRadius * 1.6),
          ry: Math.max(3, fallbackRadius * 1.35)
      };
  }

  function buildOverviewDiagramEntries(bodies: CelestialBody[]) {
      const withDistance = bodies
          .map((body) => ({ body, aAU: body.orbit?.elements.a_AU || 0 }))
          .filter((v) => v.aAU > 0)
          .sort((a, b) => a.aAU - b.aAU);

      if (withDistance.length === 0) return [];

      const minA = withDistance[0].aAU;
      const maxA = withDistance[withDistance.length - 1].aAU;
      const minLog = Math.log10(minA + 0.00001);
      const maxLog = Math.log10(maxA + 0.00001);
      const spread = Math.max(0.00001, maxLog - minLog);
      const inner = 28;
      const outer = 185;

      return withDistance.map((item, i) => {
          const pos = (Math.log10(item.aAU + 0.00001) - minLog) / spread;
          return {
              body: item.body,
              idx: i + 1,
              aAU: item.aAU,
              orbitRadius: inner + pos * (outer - inner)
          };
      });
  }

  function getOrbitMarkerX(entry: { idx: number; orbitRadius: number }) {
      const angleDeg = -75 + ((entry.idx * 31) % 140);
      const angle = angleDeg * Math.PI / 180;
      return 210 + Math.cos(angle) * entry.orbitRadius;
  }

  function getOrbitMarkerY(entry: { idx: number; orbitRadius: number }) {
      const angleDeg = -75 + ((entry.idx * 31) % 140);
      const angle = angleDeg * Math.PI / 180;
      return 200 + Math.sin(angle) * entry.orbitRadius;
  }
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
                        <th>Star Count</th><td>{system.nodes.filter(n => n.roleHint === 'star').length}</td>
                        <th>Total Objects</th><td>{system.nodes.length}</td>
                        <th>Epoch</th><td>{new Date(system.epochT0).getFullYear()}</td>
                    </tr>
                    {#if mode === 'GM'}
                    <tr>
                        <th colspan="6" style="text-align:center; border-top: 1px dashed #ccc;">-- GM NOTES --</th>
                    </tr>
                    <tr>
                        <td colspan="6" class="pre-wrap-text">{(system as any).gmNotes || 'No notes.'}</td>
                    </tr>
                    {/if}
                </tbody>
            </table>
        </div>
        <div class="data-box overview-diagram-box">
            <div class="data-header">System Diagram</div>
            <svg
                class="overview-svg"
                viewBox={`0 0 760 ${getUnifiedSystemDiagramHeight(overviewDiagramEntries, additionalStarSets)}`}
                role="img"
                aria-label="System diagram"
            >
                <circle cx="-26" cy="76" r="38" fill="none" stroke="#111" stroke-width="2" />
                <text x="28" y="80" class="label">{overviewHostLabel}</text>
                {#each overviewDiagramEntries as entry}
                    {@const markerX = 118 + ((entry.orbitRadius - 28) / (185 - 28)) * 550}
                    {@const bodyRadius = getScaledMarkerRadius(entry.body)}
                    {#if entry.body.roleHint === 'belt'}
                        {@const beltSize = getBeltDisplaySize(entry.body, bodyRadius)}
                        <ellipse cx={markerX} cy="76" rx={beltSize.rx} ry={beltSize.ry} fill="#9a9a9a" fill-opacity="0.30" stroke="#787878" stroke-opacity="0.55" stroke-width="0.9" />
                    {:else}
                        <circle cx={markerX} cy="76" r={bodyRadius} fill="#111" />
                    {/if}
                    {#if isPlanetLike(entry.body) && hasRingSystem(entry.body)}
                        <ellipse cx={markerX} cy="74" rx={bodyRadius * 1.55} ry={Math.max(1.5, bodyRadius * 0.55)} fill="none" stroke="#666" stroke-width="1" />
                    {/if}
                    {#if !shouldSuppressDiagramBodyLabel(entry, overviewDiagramEntries)}
                        <text
                            x={markerX + bodyRadius + 2}
                            y={74 - bodyRadius}
                            class="orbit-label"
                            transform={`rotate(-45 ${markerX + bodyRadius + 2} ${74 - bodyRadius})`}
                        >
                            {getDiagramBodyLabel(entry.body)}
                        </text>
                    {/if}
                    {#if shouldShowOrbitAuLabel(entry.body)}
                        {@const auLabel = getOrbitDistanceAuLabel(entry.body)}
                        {#if auLabel}
                            <text x={markerX} y={74 - bodyRadius - 2} text-anchor="end" class="au-label">{auLabel}</text>
                        {/if}
                    {/if}
                    {@const moons = getMoonBodies(entry.body)}
                    {#each moons as moon, moonIdx}
                        {@const moonY = 96 + moonIdx * 14}
                        {@const moonRadius = Math.max(2.2, getScaledMarkerRadius(moon) * 0.55)}
                        <circle cx={markerX} cy={moonY} r={moonRadius} fill="#333" />
                        <text
                            x={markerX + moonRadius + 2}
                            y={moonY - moonRadius}
                            class="orbit-label"
                            transform={`rotate(-45 ${markerX + moonRadius + 2} ${moonY - moonRadius})`}
                        >
                            {moon.name}
                        </text>
                    {/each}
                {/each}
                {#each additionalStarSets as set, row}
                    {@const rowY = getAdditionalRowYAfterOverview(overviewDiagramEntries, additionalStarSets, row)}
                    <circle cx="-26" cy={rowY} r="38" fill="none" stroke="#111" stroke-width="2" />
                    <text x="28" y={rowY + 4} class="label">{set.star.name}</text>
                    {#each set.entries as entry}
                        {@const markerX = 118 + ((entry.orbitRadius - 28) / (185 - 28)) * 550}
                        {@const bodyRadius = getScaledMarkerRadius(entry.body)}
                        {#if entry.body.roleHint === 'belt'}
                            {@const beltSize = getBeltDisplaySize(entry.body, bodyRadius)}
                            <ellipse cx={markerX} cy={rowY} rx={beltSize.rx} ry={beltSize.ry} fill="#9a9a9a" fill-opacity="0.30" stroke="#787878" stroke-opacity="0.55" stroke-width="0.9" />
                        {:else}
                            <circle cx={markerX} cy={rowY} r={bodyRadius} fill="#111" />
                        {/if}
                        {#if isPlanetLike(entry.body) && hasRingSystem(entry.body)}
                            <ellipse cx={markerX} cy={rowY - 2} rx={bodyRadius * 1.55} ry={Math.max(1.5, bodyRadius * 0.55)} fill="none" stroke="#666" stroke-width="1" />
                        {/if}
                        {#if !shouldSuppressDiagramBodyLabel(entry, set.entries)}
                            <text
                                x={markerX + bodyRadius + 2}
                                y={rowY - bodyRadius - 2}
                                class="orbit-label"
                                transform={`rotate(-45 ${markerX + bodyRadius + 2} ${rowY - bodyRadius - 2})`}
                            >
                                {getDiagramBodyLabel(entry.body)}
                            </text>
                        {/if}
                        {#if shouldShowOrbitAuLabel(entry.body)}
                            {@const auLabel = getOrbitDistanceAuLabel(entry.body)}
                            {#if auLabel}
                                <text x={markerX} y={rowY - bodyRadius - 4} text-anchor="end" class="au-label">{auLabel}</text>
                            {/if}
                        {/if}
                        {@const moons = getMoonBodies(entry.body)}
                        {#each moons as moon, moonIdx}
                            {@const moonY = rowY + 20 + moonIdx * 14}
                            {@const moonRadius = Math.max(2.2, getScaledMarkerRadius(moon) * 0.55)}
                            <circle cx={markerX} cy={moonY} r={moonRadius} fill="#333" />
                            <text
                                x={markerX + moonRadius + 2}
                                y={moonY - moonRadius}
                                class="orbit-label"
                                transform={`rotate(-45 ${markerX + moonRadius + 2} ${moonY - moonRadius})`}
                            >
                                {moon.name}
                            </text>
                        {/each}
                    {/each}
                {/each}
                {#if additionalStarSets.length === 0 && rootStars.length > 1}
                    {#each rootStars.slice(1) as star, i}
                        {@const rowY = 68 + getOverviewRowHeight(overviewDiagramEntries) + 10 + i * 126}
                        <circle cx="-26" cy={rowY} r="38" fill="none" stroke="#111" stroke-width="2" />
                        <text x="28" y={rowY + 4} class="label">{star.name}</text>
                    {/each}
                {/if}
            </svg>
        </div>

        {#each getCircumbinarySets() as set}
            <div class="data-box overview-diagram-box">
                <div class="data-header">Circumbinary Bodies: {set.starMembers.map((s) => s.name).join(' + ')}</div>
                <svg class="overview-svg" viewBox={`0 0 760 ${set.rowHeight}`} role="img" aria-label="Circumbinary diagram">
                    <circle cx="54" cy="68" r="10" class="binary-star" />
                    <circle cx="94" cy="68" r="10" class="binary-star" />
                    <text x="66" y="56" class="orbit-label" transform="rotate(-45 66 56)">{set.starMembers[0]?.name || 'Star A'}</text>
                    <text x="106" y="56" class="orbit-label" transform="rotate(-45 106 56)">{set.starMembers[1]?.name || 'Star B'}</text>
                    <circle cx="74" cy="68" r="2.4" fill="#111" />
                    <text x="74" y="92" text-anchor="middle" class="label">Barycenter</text>
                    {#each set.orbitEntries as entry}
                        {@const markerX = 152 + ((entry.orbitRadius - 28) / (185 - 28)) * 500}
                        {@const bodyRadius = getScaledMarkerRadius(entry.body)}
                        {#if entry.body.roleHint === 'belt'}
                            {@const beltSize = getBeltDisplaySize(entry.body, bodyRadius)}
                            <ellipse cx={markerX} cy="68" rx={beltSize.rx} ry={beltSize.ry} fill="#9a9a9a" fill-opacity="0.30" stroke="#787878" stroke-opacity="0.55" stroke-width="0.9" />
                        {:else}
                            <circle cx={markerX} cy="68" r={bodyRadius} fill="#111" />
                        {/if}
                        {#if isPlanetLike(entry.body) && hasRingSystem(entry.body)}
                            <ellipse cx={markerX} cy="66" rx={bodyRadius * 1.55} ry={Math.max(1.5, bodyRadius * 0.55)} fill="none" stroke="#666" stroke-width="1" />
                        {/if}
                        {#if !shouldSuppressDiagramBodyLabel(entry, set.orbitEntries)}
                            <text
                                x={markerX + bodyRadius + 2}
                                y={66 - bodyRadius}
                                class="orbit-label"
                                transform={`rotate(-45 ${markerX + bodyRadius + 2} ${66 - bodyRadius})`}
                            >
                                {getDiagramBodyLabel(entry.body)}
                            </text>
                        {/if}
                        {#if shouldShowOrbitAuLabel(entry.body)}
                            {@const auLabel = getOrbitDistanceAuLabel(entry.body)}
                            {#if auLabel}
                                <text x={markerX} y={66 - bodyRadius - 2} text-anchor="end" class="au-label">{auLabel}</text>
                            {/if}
                        {/if}
                        {@const moons = getMoonBodies(entry.body)}
                        {#each moons as moon, moonIdx}
                            {@const moonY = 88 + moonIdx * 14}
                            {@const moonRadius = Math.max(2.2, getScaledMarkerRadius(moon) * 0.55)}
                            <circle cx={markerX} cy={moonY} r={moonRadius} fill="#333" />
                            <text
                                x={markerX + moonRadius + 2}
                                y={moonY - moonRadius}
                                class="orbit-label"
                                transform={`rotate(-45 ${markerX + moonRadius + 2} ${moonY - moonRadius})`}
                            >
                                {moon.name}
                            </text>
                        {/each}
                    {/each}
                </svg>
            </div>
        {/each}
    </section>

    <!-- HIERARCHY REPORT (BODIES ONLY) -->
    <section class="body-details">
        <h2>02. CELESTIAL SURVEY</h2>
        
        {#each getSurveyStars() as primary (primary.id)}
            <div class="star-block">
                <div class="section-header">
                    {primary.roleHint === 'star' ? 'STAR' : 'PRIMARY BODY'}: {primary.name.toUpperCase()} ({primary.class})
                </div>
                <div class="data-box">
                    <p class="pre-wrap-text">{primary.description || 'No description available.'}</p>
                    <table>
                        <tbody>
                            <tr>
                                <th>Mass</th><td>{(primary.massKg / 1.989e30).toFixed(3)} Solar Masses</td>
                                <th>Radius</th><td>{formatNumber(primary.radiusKm)} km</td>
                                {#if primary.temperatureK}
                                <th>Temp</th><td>{Math.round((primary.temperatureK) - 273.15)}°C</td>
                                {/if}
                                <th>Lum</th><td>{getLuminosity(primary)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {#each getDirectBodiesOnly(primary.id) as child (child.id)}
                    {@const phys = getDerivedPhysics(child)}
                    <div class="child-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                            <h3 style="margin: 0; font-size: 1.1em;">{child.name.toUpperCase()}</h3>
                            <span style="font-size: 0.9em; color: #666;">{child.roleHint ? child.roleHint.toUpperCase() : 'BODY'} | {child.class}</span>
                        </div>
                        
                        <div class="data-box" style="margin-top: 5px;">
                             <!-- DENSE DATA GRID -->
                             <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                 <!-- Left Col: Physical & Orbital -->
                                 <table>
                                    <tbody>
                                        <tr><th>Orbit Dist</th><td>{child.orbit?.elements.a_AU.toFixed(3)} AU</td></tr>
                                        <tr><th>Orbit Period</th><td>{child.orbital_period_days ? child.orbital_period_days.toFixed(1) + ' d' : '-'}</td></tr>
                                        <tr><th>Eccentricity</th><td>{child.orbit?.elements.e.toFixed(3)}</td></tr>
                                        <tr><th>Day Length</th><td>{child.rotation_period_hours ? child.rotation_period_hours.toFixed(1) + ' h' : '-'}</td></tr>
                                        <tr><th>Axial Tilt</th><td>{(child as any).axial_tilt_deg ? (child as any).axial_tilt_deg.toFixed(1) + '°' : '-'}</td></tr>
                                        <tr><th>Mass</th><td>{phys.massRel}</td></tr>
                                        <tr><th>Radius</th><td>{formatNumber(child.radiusKm)} km</td></tr>
                                        <tr><th>Gravity</th><td>{phys.gravity}</td></tr>
                                        <tr><th>Density</th><td>{phys.density}</td></tr>
                                        <tr><th>Delta-V</th><td>{getOrbitalMechanics(child)}</td></tr>
                                    </tbody>
                                 </table>

                                 <!-- Right Col: Environmental -->
                                 <table>
                                     <tbody>
                                         <tr><th>Temperature</th><td>{getTemp(child)} <span style="font-size: 0.8em; color: #666;">{getTempDetails(child)}</span></td></tr>
                                         <tr><th>Temp Profile</th><td>{getTempProfile(child)}</td></tr>
                                         <tr><th>Eq. Temp Range</th><td>{getEquilibriumRange(child)}</td></tr>
                                         <tr><th>Atmosphere</th><td style="font-size: 0.9em;">{getAtmosphereString(child)}</td></tr>
                                         <tr><th>Hydrography</th><td>{getHydroString(child)}</td></tr>
                                         <tr><th>Magnetosphere</th><td>{child.magneticField ? child.magneticField.strengthGauss.toFixed(2) + ' G' : 'None'}</td></tr>
                                         <tr><th>Surface Rad</th><td>{child.surfaceRadiation !== undefined ? child.surfaceRadiation.toFixed(1) + ' mSv/y' : '-'}</td></tr>
                                         <tr><th>Rad Range</th><td>{getRadiationRange(child)}</td></tr>
                                         <tr><th>Stability</th><td>{getOrbitStability(child)}</td></tr>
                                         {#if child.habitabilityScore}
                                            <tr><th>Habitability</th><td>{child.habitabilityScore.toFixed(1)}%</td></tr>
                                         {/if}
                                         {#if child.biosphere}
                                            <tr><th>Biosphere</th><td>Present (Cov: {(child.biosphere.coverage*100).toFixed(0)}%)</td></tr>
                                         {/if}
                                     </tbody>
                                 </table>
                             </div>

                             {#if child.tags && child.tags.length > 0}
                                <div style="margin-top: 5px; font-size: 0.9em; color: #555;">
                                    <strong>Tags:</strong> {getTagsString(child)}
                                </div>
                             {/if}

                             {#if child.description}
                                <div style="margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                    <p class="pre-wrap-text" style="margin: 0; font-style: italic;">{child.description}</p>
                                </div>
                             {/if}

                             {#if mode === 'GM' && (child as any).gmNotes}
                                <div class="pre-wrap-text" style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px; background: #f0f0f0;">
                                    <strong>GM NOTE:</strong> {(child as any).gmNotes}
                                </div>
                             {/if}
                        </div>
                        
                        <!-- Recursively show Moons (Bodies Only) -->
                        {#each getDirectBodiesOnly(child.id) as grandchild (grandchild.id)}
                             {@const gPhys = getDerivedPhysics(grandchild)}
                             <div class="grandchild-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                                    <h3 style="margin: 0; font-size: 1.0em;">{grandchild.name.toUpperCase()}</h3>
                                    <span style="font-size: 0.8em; color: #666;">{grandchild.roleHint ? grandchild.roleHint.toUpperCase() : 'BODY'} | {grandchild.class}</span>
                                </div>
                                
                                <div class="data-box" style="margin-top: 5px;">
                                     <!-- DENSE DATA GRID FOR MOONS -->
                                     <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9em;">
                                         <!-- Left Col: Physical & Orbital -->
                                         <table>
                                            <tbody>
                                                <tr><th>Orbit Dist</th><td>{grandchild.orbit?.elements.a_AU.toFixed(3)} AU</td></tr>
                                                <tr><th>Orbit Period</th><td>{grandchild.orbital_period_days ? grandchild.orbital_period_days.toFixed(1) + ' d' : '-'}</td></tr>
                                                <tr><th>Eccentricity</th><td>{grandchild.orbit?.elements.e.toFixed(3)}</td></tr>
                                                <tr><th>Day Length</th><td>{grandchild.rotation_period_hours ? grandchild.rotation_period_hours.toFixed(1) + ' h' : '-'}</td></tr>
                                                <tr><th>Axial Tilt</th><td>{(grandchild as any).axial_tilt_deg ? (grandchild as any).axial_tilt_deg.toFixed(1) + '°' : '-'}</td></tr>
                                                <tr><th>Mass</th><td>{gPhys.massRel}</td></tr>
                                                <tr><th>Radius</th><td>{formatNumber(grandchild.radiusKm)} km</td></tr>
                                                <tr><th>Gravity</th><td>{gPhys.gravity}</td></tr>
                                                <tr><th>Density</th><td>{gPhys.density}</td></tr>
                                                <tr><th>Delta-V</th><td>{getOrbitalMechanics(grandchild)}</td></tr>
                                            </tbody>
                                         </table>

                                         <!-- Right Col: Environmental -->
                                         <table>
                                             <tbody>
                                                 <tr><th>Temperature</th><td>{getTemp(grandchild)} <span style="font-size: 0.8em; color: #666;">{getTempDetails(grandchild)}</span></td></tr>
                                                 <tr><th>Temp Profile</th><td>{getTempProfile(grandchild)}</td></tr>
                                                 <tr><th>Eq. Temp Range</th><td>{getEquilibriumRange(grandchild)}</td></tr>
                                                 <tr><th>Atmosphere</th><td style="font-size: 0.9em;">{getAtmosphereString(grandchild)}</td></tr>
                                                 <tr><th>Hydrography</th><td>{getHydroString(grandchild)}</td></tr>
                                                 <tr><th>Magnetosphere</th><td>{grandchild.magneticField ? grandchild.magneticField.strengthGauss.toFixed(2) + ' G' : 'None'}</td></tr>
                                                 <tr><th>Surface Rad</th><td>{grandchild.surfaceRadiation !== undefined ? grandchild.surfaceRadiation.toFixed(1) + ' mSv/y' : '-'}</td></tr>
                                                 <tr><th>Rad Range</th><td>{getRadiationRange(grandchild)}</td></tr>
                                                 <tr><th>Stability</th><td>{getOrbitStability(grandchild)}</td></tr>
                                                 {#if grandchild.habitabilityScore}
                                                    <tr><th>Habitability</th><td>{grandchild.habitabilityScore.toFixed(1)}%</td></tr>
                                                 {/if}
                                                 {#if grandchild.biosphere}
                                                    <tr><th>Biosphere</th><td>Present (Cov: {(grandchild.biosphere.coverage*100).toFixed(0)}%)</td></tr>
                                                 {/if}
                                             </tbody>
                                         </table>
                                     </div>

                                     {#if grandchild.tags && grandchild.tags.length > 0}
                                        <div style="margin-top: 5px; font-size: 0.9em; color: #555;">
                                            <strong>Tags:</strong> {getTagsString(grandchild)}
                                        </div>
                                     {/if}

                                     {#if grandchild.description}
                                        <div style="margin-top: 10px; border-top: 1px dotted #ccc; padding-top: 5px;">
                                            <p class="pre-wrap-text" style="margin: 0; font-style: italic;">{grandchild.description}</p>
                                        </div>
                                     {/if}

                                     {#if mode === 'GM' && (grandchild as any).gmNotes}
                                        <div class="pre-wrap-text" style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px; background: #f0f0f0;">
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

        {#each getSurveyBarycenterSets() as set (set.bary.id)}
            <div class="star-block">
                <div class="section-header">
                    Circumbinary Bodies: {set.starMembers.map((s) => s.name).join(' + ') || ((set.bary as any).name || set.bary.id)}
                </div>
                <div class="data-box">
                    <table>
                        <tbody>
                            <tr>
                                <th>Member Stars</th><td>{set.starMembers.map((s) => s.name).join(', ') || '-'}</td>
                                <th>Orbiting Bodies</th><td>{set.orbiters.length}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                {#each set.orbiters as body (body.id)}
                    <div class="child-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                        <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                            <h3 style="margin: 0; font-size: 1.1em;">{body.name.toUpperCase()}</h3>
                            <span style="font-size: 0.9em; color: #666;">{body.roleHint ? body.roleHint.toUpperCase() : 'BODY'} | {body.class}</span>
                        </div>
                        <div class="data-box" style="margin-top: 5px;">
                            <table>
                                <tbody>
                                    <tr><th>Orbit Dist</th><td>{body.orbit?.elements.a_AU?.toFixed(3) || '-'} AU</td></tr>
                                    <tr><th>Temperature</th><td>{getTemp(body)}</td></tr>
                                    <tr><th>Atmosphere</th><td>{getAtmosphereString(body)}</td></tr>
                                </tbody>
                            </table>
                        </div>
                        {#each getDirectBodiesOnly(body.id) as moon (moon.id)}
                            <div class="grandchild-block" style="margin-left: 15px; border-left: 2px solid #ccc; padding-left: 10px; margin-bottom: 15px;">
                                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 10px; border-bottom: 1px solid #eee;">
                                    <h3 style="margin: 0; font-size: 1.0em;">{moon.name.toUpperCase()}</h3>
                                    <span style="font-size: 0.8em; color: #666;">{moon.roleHint ? moon.roleHint.toUpperCase() : 'BODY'} | {moon.class}</span>
                                </div>
                                <div class="data-box" style="margin-top: 5px;">
                                    <table>
                                        <tbody>
                                            <tr><th>Orbit Dist</th><td>{moon.orbit?.elements.a_AU?.toFixed(3) || '-'} AU</td></tr>
                                            <tr><th>Temperature</th><td>{getTemp(moon)}</td></tr>
                                        </tbody>
                                    </table>
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

                <!-- Description (full width) -->
                {#if construct.description}
                    <p class="pre-wrap-text" style="margin-top: 5px; margin-bottom: 10px; font-style: italic;">{construct.description}</p>
                {/if}

                <!-- GM Notes (full width) -->
                {#if mode === 'GM' && (construct as any).gmNotes}
                    <div class="pre-wrap-text" style="margin-top: 5px; border-top: 1px dashed #000; padding-top: 5px; background: #f0f0f0;">
                        <strong>GM NOTE:</strong> {(construct as any).gmNotes}
                    </div>
                {/if}

                <!-- Stats (2-column grid, separate) -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px;">
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
            <span>GENERATED BY STAR SYSTEM EXPLORER</span>
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

    .pre-wrap-text { white-space: pre-wrap; }

    .overview-diagram-box {
        padding-top: 6px;
    }

    .overview-diagram-box .data-header {
        font-weight: bold;
        margin-bottom: 4px;
        font-size: 0.9em;
    }

    .overview-svg {
        width: 100%;
        height: auto;
        border: 1px solid #ddd;
        background: #fff;
    }

    .overview-svg text {
        fill: #111;
        font-size: 9px;
    }

    .overview-svg .glyph {
        font-size: 11px;
    }

    .overview-svg .idx {
        font-size: 7px;
        fill: #444;
    }

    .overview-svg .legend-line {
        font-size: 8px;
    }

    .overview-svg .legend-moons {
        font-size: 7px;
        fill: #555;
    }

    .overview-svg .orbit-label {
        font-size: 8px;
        fill: #222;
    }

    .overview-svg .au-label {
        font-size: 7px;
        fill: #555;
    }

    .overview-svg .star-moons-line {
        font-size: 8px;
        fill: #444;
    }

    .overview-svg .binary-star {
        fill: #fff;
        stroke: #111;
        stroke-width: 1.6;
    }

    .star-block {
        break-inside: avoid;
        page-break-inside: avoid;
        margin-bottom: 12px;
    }

    .star-block > .section-header {
        break-after: avoid;
        page-break-after: avoid;
    }
</style>
