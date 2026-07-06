// "Show all the working" — reconstructs a body's PHYSICS TRACE from its finished derived state:
// each layer's key inputs → outputs, plus the provenance of every tag (which layer produced it,
// and why). Built post-hoc from the body (no processor instrumentation), so it's risk-free and
// always in sync with what's displayed. The Newton/Apple panel renders this; every layer deep-
// links to the matching /physics section. Educational + the primary debug surface.
import type { CelestialBody } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, G } from '$lib/constants';
import { makeupFractions, bulkDensityFromMakeup } from './makeup';
import { describeTag } from '$lib/tags/tagPresentation';

export interface TraceField { label: string; value: string; }
export interface TraceLayer {
  id: string;
  title: string;
  link: string;            // /physics#section
  inputs: TraceField[];
  outputs: TraceField[];
  notes: string[];
}
export interface TagProvenance { key: string; label: string; description: string; layer: string; color: string; }
export interface PhysicsTrace { layers: TraceLayer[]; tags: TagProvenance[] }

export interface TraceContext { ageGyr?: number; star?: CelestialBody | null }

const n = (v: number | undefined | null, d = 2, unit = ''): string =>
  v == null || !isFinite(v) ? '—' : `${(+v).toFixed(d)}${unit ? ' ' + unit : ''}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

// Which physics layer a tag namespace comes from.
const NS_LAYER: Record<string, string> = {
  structure: 'Fluid layers', geology: 'Geological activity', magnetic: 'Magnetism',
  tidal: 'Temperature range & tidal heat', habitability: 'Habitability', atmosphere: 'Atmosphere',
  climate: 'Climate', hazard: 'Radiation / hazards', orbit: 'Orbit', origin: 'Generation',
  stability: 'Orbital stability', barycenter: 'Barycentres', shape: 'Rotational shape',
  ring: 'Rings', resonance: 'Orbital resonance', fate: 'Orbital stability', biodiversity: 'Biosphere',
  // "Reasons to visit" PoI categories — derived by the PoI rules pack, not a physics layer.
  resource: 'Reasons to visit', science: 'Reasons to visit', frontier: 'Reasons to visit', intrigue: 'Reasons to visit'
};
// Flat (non-namespaced) tag keys → their producing layer. All the kept gas-role tags come from
// the Atmosphere layer.
const ATMOSPHERE_TAGS = [
  'acid-rain', 'asphyxiant', 'breathable-human', 'breathable-human-hypoxic', 'contact-hazard',
  'corrosive', 'crushing-atmosphere', 'extreme-fire-hazard', 'fire-hazard', 'flammable',
  'greenhouse', 'haze-former', 'heavy-gas', 'high-humidity', 'highly-corrosive', 'highly-toxic',
  'hypergolic', 'inert', 'irritant', 'lifting-gas', 'organic-solvent', 'oxidizer',
  'oxygen-toxicity', 'ozone-depleter', 'prebiotic-precursor', 'reducing', 'solvent-hazard',
  'super-greenhouse', 'technosignature', 'toxic-human'
];
const FLAT_LAYER: Record<string, string> = Object.fromEntries(ATMOSPHERE_TAGS.map((t) => [t, 'Atmosphere']));

export function buildPhysicsTrace(body: CelestialBody, ctx: TraceContext = {}): PhysicsTrace {
  const layers: TraceLayer[] = [];
  const mk = makeupFractions(body);
  const massMe = (body.massKg ?? 0) / EARTH_MASS_KG;
  const radiusRe = (body.radiusKm ?? 0) / EARTH_RADIUS_KM;
  const densityGcc = body.massKg && body.radiusKm
    ? (body.massKg / ((4 / 3) * Math.PI * Math.pow(body.radiusKm * 1000, 3))) / 1000 : 0;

  // 0. Classification — WHY this type (headline). The winning fingerprint, the defining bands it
  //    matched (with the body's value + fit), and the runner-up it beat.
  if (body.classification) {
    const c = body.classification;
    const inputs: TraceField[] = c.fallback
      ? [{ label: 'No fingerprint matched', value: 'mass-based fallback' }]
      : c.bands.map((b) => ({ label: b.feature, value: `${b.value} ∈ [${b.band}] · fit ${b.fit}` }));
    const outputs: TraceField[] = [
      { label: 'Type', value: c.base.replace('planet/', '').replace(/-/g, ' ') },
      { label: 'Score (Σ band fits × weight)', value: n(c.baseScore, 2) }
    ];
    if (c.modifiers.length) outputs.push({ label: 'Modifiers', value: c.modifiers.map((m) => m.class.replace('planet/', '')).join(', ') });
    const notes: string[] = [];
    if (c.runnerUp) notes.push(`Beat the runner-up ${c.runnerUp.class.replace('planet/', '')} (${c.runnerUp.score}) by matching more defining bands — a type's score is the sum of its band fits, so more-specific types win.`);
    else if (!c.fallback) notes.push('The only type whose defining bands this body fell within.');
    layers.push({ id: 'classification', title: 'Classification — why this type', link: '/physics#classification', inputs, outputs, notes });
  }

  // 1. Interior makeup → density, radius
  layers.push({
    id: 'makeup', title: 'Interior makeup', link: '/physics#makeup',
    inputs: [
      { label: 'Mass', value: n(massMe, 3, 'M⊕') },
      { label: 'Makeup source', value: body.makeup ? 'explicit' : 'inferred from density' }
    ],
    outputs: [
      { label: 'Metal / Rock / Carbon', value: `${pct(mk.metal)} / ${pct(mk.rock)} / ${pct(mk.carbon)}` },
      { label: 'Ice / Gas', value: `${pct(mk.ice)} / ${pct(mk.gas)}` },
      { label: 'Bulk density', value: n(body.makeup ? bulkDensityFromMakeup(body.makeup) : densityGcc, 2, 'g/cc') },
      { label: 'Radius', value: n(radiusRe, 3, 'R⊕') }
    ],
    notes: []
  });

  // 2. Gravity / size
  const gravityG = body.massKg && body.radiusKm
    ? (G * body.massKg / Math.pow(body.radiusKm * 1000, 2)) / 9.81 : 0;
  layers.push({
    id: 'gravity', title: 'Gravity & size', link: '/physics#gravity',
    inputs: [{ label: 'Mass', value: n(massMe, 3, 'M⊕') }, { label: 'Radius', value: n(radiusRe, 3, 'R⊕') }],
    outputs: [
      { label: 'Surface gravity', value: n(gravityG, 2, 'g') },
      { label: 'Density', value: n(densityGcc, 2, 'g/cc') }
    ],
    notes: []
  });

  // 3. Temperature (equilibrium → mean → range)
  const tempOut: TraceField[] = [
    { label: 'Equilibrium temp', value: n(body.equilibriumTempK, 0, 'K') },
    { label: 'Greenhouse Δ', value: n(body.greenhouseTempK, 0, 'K') },
    { label: 'Tidal heat Δ (capped)', value: n(body.tidalHeatK, 1, 'K') },
    { label: 'Internal heat Δ', value: n(body.internalHeatK, 1, 'K') },
    { label: 'Mean surface temp', value: n(body.temperatureK, 0, 'K') }
  ];
  if (body.temperatureProfile) {
    const p = body.temperatureProfile;
    tempOut.push({ label: 'Total range', value: `${p.totalMinK}–${p.totalMaxK} K` });
    for (const c of p.components) tempOut.push({ label: c.label, value: `${c.lowK}–${c.highK} K` });
  } else if (body.temperatureRangeK) {
    tempOut.push({ label: 'Surface range', value: `${body.temperatureRangeK.min}–${body.temperatureRangeK.max} K` });
  }
  layers.push({
    id: 'temperature', title: 'Temperature & tidal heat', link: '/physics#temp-range',
    inputs: [
      { label: 'Semi-major axis', value: n(body.orbit?.elements.a_AU, 3, 'AU') },
      { label: 'Eccentricity', value: n(body.orbit?.elements.e, 3) },
      { label: 'Star', value: ctx.star?.name ?? '—' },
      ...(body.albedoBreakdown ? [{
        label: 'Albedo (derived)',
        value: `${body.albedoBreakdown.albedo} — ${body.albedoBreakdown.note}`
      }] : [])
    ],
    outputs: tempOut,
    notes: body.temperatureRangeK && body.temperatureRangeK.max - body.temperatureRangeK.min > 5
      ? ['The mean averages heat over the whole body; the range captures cold night sides and localized (tidal-volcanic) hotspots.'] : []
  });

  // 4. Fluid layers
  const fl = body.hydrosphere?.layers ?? [];
  layers.push({
    id: 'fluids', title: 'Fluid layers', link: '/physics#fluids',
    inputs: [
      { label: 'Hydrosphere', value: body.hydrosphere?.composition ? `${body.hydrosphere.composition} (${pct(body.hydrosphere.coverage ?? 0)})` : 'none' },
      { label: 'Atmosphere', value: body.atmosphere?.main ?? 'none' }
    ],
    outputs: fl.length
      ? fl.map((l) => ({ label: l.location, value: l.liquid + (l.conductive ? ' (conductive)' : '') }))
      : [{ label: 'Layers', value: 'none' }],
    notes: []
  });

  // 5. Magnetism
  if (body.magnetism) {
    const m = body.magnetism;
    layers.push({
      id: 'magnetism', title: 'Magnetism', link: '/physics#magnetism',
      inputs: [
        { label: 'Rotation period', value: n(body.rotation_period_hours, 1, 'h') },
        { label: 'Conductive interior', value: fl.find((l) => l.location === 'interior')?.liquid ?? (fl.find((l) => l.location === 'subsurface') ? 'subsurface ocean' : 'none') }
      ],
      outputs: [
        { label: 'Dynamo source', value: m.source },
        { label: 'Geometry', value: `${m.geometry} · ${m.intrinsic ? 'intrinsic' : 'induced'}` },
        { label: 'Implied field', value: `${m.estimatedRangeGauss.min}–${m.estimatedRangeGauss.max} G` }
      ],
      notes: m.notes.slice(0, 1)
    });
  }

  // 6. Geological activity
  if (body.geoActivity) {
    const g = body.geoActivity;
    layers.push({
      id: 'geology', title: 'Geological activity', link: '/physics#geology',
      inputs: [
        { label: 'Makeup / mass', value: `${pct(mk.metal + mk.rock + mk.carbon)} rocky · ${n(massMe, 2, 'M⊕')}` },
        { label: 'System age', value: n(ctx.ageGyr, 1, 'Gyr') },
        { label: 'Surface water', value: (body.hydrosphere?.composition === 'water' && (body.hydrosphere?.coverage ?? 0) > 0.1) ? 'yes' : 'no' }
      ],
      outputs: [
        { label: 'Regime', value: g.regime },
        { label: 'Volcanism', value: g.volcanism },
        { label: 'Geothermal vigor (Earth=1)', value: n(g.vigor, 2) },
        { label: 'Driver', value: g.driver }
      ],
      notes: g.notes.slice(0, 1)
    });
  }

  // 7. Apparent colour
  if (body.apparentColor) {
    layers.push({
      id: 'colour', title: 'Apparent colour', link: '/physics#colour',
      inputs: [{ label: 'Makeup + clouds + temp', value: 'see above' }],
      outputs: [
        { label: 'Flattened hex', value: body.apparentColor.hex },
        { label: 'Palette', value: body.apparentColor.palette.map((p) => p.label || p.role).join(', ') || '—' },
        ...(body.apparentColor.banding ? [{ label: 'Banding', value: `${body.apparentColor.banding} bands` }] : [])
      ],
      notes: []
    });
  }

  // 8. Habitability
  if (body.habitabilityScore != null) {
    const tier = (body.tags || []).find((t) => t.key.startsWith('habitability/'));
    layers.push({
      id: 'habitability', title: 'Habitability', link: '/physics#habitability',
      inputs: [
        { label: 'Geology regime', value: body.geoActivity?.regime ?? '—' },
        { label: 'Magnetosphere', value: body.magnetism ? (body.magnetism.intrinsic ? 'intrinsic' : body.magnetism.source) : '—' }
      ],
      outputs: [
        { label: 'Score (Earth=100)', value: n(body.habitabilityScore, 0) },
        { label: 'Tier', value: tier ? describeTag(tier.key).label : '—' }
      ],
      notes: ['Geology + magnetism modifiers are heuristic guesswork — see /physics.']
    });
  }

  // --- Tag provenance ---
  const tags: TagProvenance[] = (body.tags ?? []).map((t) => {
    const info = describeTag(t.key);
    const ns = t.key.split('/')[0];
    const layer = t.key.includes('/') ? (NS_LAYER[ns] ?? 'Other') : (FLAT_LAYER[t.key] ?? 'Other');
    return { key: t.key, label: info.label, description: info.description, layer, color: info.color };
  });

  return { layers, tags };
}
