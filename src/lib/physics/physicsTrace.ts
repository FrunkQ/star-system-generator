// "Show all the working" — reconstructs a body's PHYSICS TRACE from its finished derived state:
// each layer's key inputs → outputs, plus the provenance of every tag (which layer produced it,
// and why). Built post-hoc from the body (no processor instrumentation), so it's risk-free and
// always in sync with what's displayed. The Newton/Apple panel renders this; every layer deep-
// links to the matching /physics section. Educational + the primary debug surface.
import type { CelestialBody, Barycenter } from '$lib/types';
import { EARTH_MASS_KG, EARTH_RADIUS_KM, G } from '$lib/constants';
import { makeupFractions, bulkDensityFromMakeup } from './makeup';
import { describeTag } from '$lib/tags/tagPresentation';
import { auroraEmitter } from './aurora';
import { deriveAppearance } from '$lib/rendering/planetAppearance';

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

export interface TraceContext { ageGyr?: number; star?: CelestialBody | null; host?: CelestialBody | Barycenter | null; partner?: CelestialBody | null }

const AU_KM = 1.495978707e8;

const n = (v: number | undefined | null, d = 2, unit = ''): string =>
  v == null || !isFinite(v) ? '—' : `${(+v).toFixed(d)}${unit ? ' ' + unit : ''}`;
const pct = (v: number): string => `${Math.round(v * 100)}%`;

// Which physics layer a tag namespace comes from.
const NS_LAYER: Record<string, string> = {
  structure: 'Fluid layers', geology: 'Geological activity', magnetic: 'Magnetism',
  thermal: 'Temperature & tidal heat',
  tidal: 'Temperature range & tidal heat', habitability: 'Habitability', atmosphere: 'Atmosphere',
  climate: 'Climate', hazard: 'Radiation / hazards', orbit: 'Orbit', origin: 'Generation',
  stability: 'Orbital stability', barycenter: 'Barycentres', shape: 'Rotational shape',
  ring: 'Rings', resonance: 'Orbital resonance', fate: 'Orbital stability', biodiversity: 'Biosphere',
  aurora: 'Magnetism',
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

  // A member of a binary orbits the BARYCENTRE at a tiny separation; the orbit that governs its
  // temperature AND stability (and reads sensibly) is the barycentre's HELIOCENTRIC orbit, not the
  // ~0.0001 AU pair orbit. Compute it once here so both layers agree. (ctx.host is the parent node.)
  const bary = ctx.host && ctx.host.kind === 'barycenter' ? (ctx.host as Barycenter) : null;
  const heliocentricEl = bary?.orbit?.elements ?? body.orbit?.elements;
  // Co-orbit partner separation (semi-major of the relative orbit = sum of each member's orbit
  // about the barycentre). Used to explain the small self-orbit distance in the panels.
  const partnerSepKm = bary && ctx.partner
    ? ((body.orbit?.elements.a_AU ?? 0) + (ctx.partner.orbit?.elements.a_AU ?? 0)) * AU_KM
    : null;

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
    { label: 'Radiogenic Δ', value: n(body.radiogenicHeatK, 1, 'K') },
    { label: 'Internal heat Δ', value: n(body.internalHeatK, 1, 'K') },
    { label: 'Mean surface temp', value: n(body.temperatureK, 0, 'K') }
  ];
  const selfLumTeff = (body as any).selfLuminousTeffK as number | undefined;
  if ((body as any).isSelfLuminous && selfLumTeff) {
    tempOut.splice(0, 0,
      { label: 'Self-luminous Teff (own heat)', value: n(selfLumTeff, 0, 'K') },
      { label: 'Own luminosity', value: `${(((body as any).internalLuminositySolar ?? 0) as number).toExponential(1)} L☉` }
    );
  }
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
      {
        label: bary ? `Semi-major axis (to ${ctx.star?.name ?? 'star'}, as the ${bary.name || 'pair'})` : 'Semi-major axis',
        value: n(heliocentricEl?.a_AU, 3, 'AU')
      },
      { label: 'Eccentricity', value: n(heliocentricEl?.e, 3) },
      ...(partnerSepKm != null && ctx.partner ? [{
        label: `Co-orbit partner (${ctx.partner.name})`,
        value: `${n(partnerSepKm, 0, 'km')} apart`
      }] : []),
      { label: 'Star', value: ctx.star?.name ?? '—' },
      ...(ctx.host && (ctx.host as any).isSelfLuminous ? [{
        label: `+ self-luminous host (${ctx.host.name})`,
        value: `${n((ctx.host as any).selfLuminousTeffK, 0, 'K')} · ${(((ctx.host as any).internalLuminositySolar ?? 0) as number).toExponential(1)} L☉`
      }] : []),
      ...(body.albedoBreakdown ? [{
        label: 'Albedo (derived)',
        value: `${body.albedoBreakdown.albedo} — ${body.albedoBreakdown.note}`
      }] : [])
    ],
    outputs: tempOut,
    notes: [
      ...(ctx.host && (ctx.host as any).isSelfLuminous ? [`Warmed and irradiated by BOTH ${ctx.star?.name ?? 'the star'} AND its self-luminous host ${ctx.host.name} (a brown dwarf, ${n((ctx.host as any).selfLuminousTeffK, 0, 'K')}). Flux and radiation SUM over every luminous source (Σ Lᵢ / 4πdᵢ²), so a close-in moon of a brown dwarf is far warmer and more irradiated than its distance from the system star alone would imply.`] : []),
      ...((body as any).isSelfLuminous && selfLumTeff ? [`Self-luminous: a brown dwarf (~${n((body.massKg ?? 0) / 1.898e27, 0)} M♃) that radiates its OWN heat from gravitational contraction and early deuterium burning. Its surface sits at ~${n(selfLumTeff, 0, 'K')} regardless of the distant star, it cools with age (L→T→Y, floor ~250 K), and it warms & irradiates its moons like a mini-star.`] : []),
      ...(bary ? [`Equilibrium temperature is set by the distance to ${ctx.star?.name ?? 'the star'} — the ${bary.name || 'barycentre'}'s ${n(heliocentricEl?.a_AU, 1, 'AU')} orbit — not the small orbit ${ctx.partner ? `around its partner ${ctx.partner.name}` : 'within the pair'}.`] : []),
      ...((body.radiogenicHeatK ?? 0) > 0 ? [`Radiogenic heat (+${n(body.radiogenicHeatK, 1, 'K')}, a GM override) is summed into the mean surface temperature in flux space alongside greenhouse, tidal and internal heat — so it feeds the habitability temperature score. The same override also drives the world's geological vigour (tectonics/volcanism), independently of sunlight.`] : []),
      ...(body.temperatureRangeK && body.temperatureRangeK.max - body.temperatureRangeK.min > 5
        ? ['The mean averages heat over the whole body; the range captures cold night sides and localized (tidal-volcanic) hotspots.'] : [])
    ]
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

  // 5b. Aurora — why this colour, how strong. Needs all three: atmosphere gas to glow, a field to
  //     funnel particles to the poles, and an incident ionising flux to drive them.
  const auroraTag = (body.tags ?? []).find((t) => t.key.startsWith('aurora/'));
  if (auroraTag) {
    const em = auroraEmitter(body);
    layers.push({
      id: 'aurora', title: 'Aurora', link: '/physics#aurora',
      inputs: [
        { label: 'Atmosphere', value: `${n(body.atmosphere?.pressure_bar, 3, 'bar')} · ${em.gas}` },
        { label: 'Magnetosphere', value: body.magnetism ? (body.magnetism.intrinsic ? 'intrinsic' : body.magnetism.source) : 'none' },
        { label: 'Incident flux (Earth=1)', value: n(body.stellarRadiation, 2) }
      ],
      outputs: [
        { label: 'Strength → tier', value: `${auroraTag.value ?? '—'} → ${describeTag(auroraTag.key).label}` },
        { label: 'Colour', value: `${em.colour} — ${em.gas} glows` }
      ],
      notes: ['Ionising particles funnelled down the field lines to the magnetic poles excite the upper atmosphere; it glows the colour of whichever gas is struck, like a neon sign. Remove the air, the field, or the incident flux and the aurora goes with it.']
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
        { label: 'Surface age', value: n(g.surfaceAgeGyr, g.surfaceAgeGyr < 0.1 ? 3 : 2, 'Gyr') },
        { label: 'Driver', value: g.driver }
      ],
      notes: g.notes.slice(0, 1)
    });
  }

  // 6b. Volatile-ice retention
  if (body.volatiles && body.volatiles.retained.length) {
    const v = body.volatiles;
    layers.push({
      id: 'volatiles', title: 'Volatile-ice retention', link: '/physics#geology',
      inputs: [
        { label: 'Surface temp', value: n(body.temperatureK ?? 0, 0, 'K') },
        { label: 'Escape (Jeans λ)', value: Object.entries(v.lambda).map(([s, l]) => `${s} ${l}`).join(' · ') }
      ],
      outputs: [{ label: 'Retained as surface ice', value: v.retained.join(', ') }],
      notes: ['An ice survives on the surface only if it is cold enough to stay solid AND the body\'s gravity holds the vapour it sublimates (Jeans parameter λ above the retention floor). Cold, heavy species on small distant worlds are kept in a closed sublimate–recondense cycle; light species on warm or low-gravity worlds are lost to space.']
    });
  }

  // 6c. Surface features & weathering — how the physics turns into what the world WEARS (the shared
  // appearance model both renderers draw from).
  {
    const ap = deriveAppearance(body);
    const feats: string[] = [];
    if (ap.craters) feats.push(`craters — density ${pct(ap.craters.density)}${ap.craters.farSideBias > 0 ? `, far-side biased (${pct(ap.craters.farSideBias)}) — parent shields the near face` : ''}${ap.craters.rayed > 0 ? `, ${ap.craters.rayed} fresh rayed` : ''}`);
    if (ap.iceCracks) feats.push(`ice-fracture network — severity ${pct(ap.iceCracks.severity)}`);
    if (ap.rifts) feats.push('crustal rift (a frozen former ocean split the crust)');
    if (ap.regolith > 0) feats.push(`space-weathered regolith greying ${pct(ap.regolith)}`);
    if (ap.tholin) feats.push(`tholins — ${ap.tholin.atmospheric ? 'atmospheric haze' : 'surface'}, strength ${pct(ap.tholin.strength)}`);
    if (ap.frost) feats.push(`bright volatile frost — ${pct(ap.frost.coverage)} cover`);
    if (feats.length) {
      layers.push({
        id: 'surface', title: 'Surface features & weathering', link: '/physics#surface',
        inputs: [
          { label: 'Surface age', value: n(body.geoActivity?.surfaceAgeGyr ?? 0, 2, 'Gyr') },
          { label: 'Irradiation dose', value: n(body.irradiationDose ?? 0, 2) }
        ],
        outputs: feats.map((f, i) => ({ label: i === 0 ? 'Shows' : '·', value: f })),
        notes: ['What a world wears follows from its physics: an old surface accumulates impact CRATERS (an icy crust FRACTURES instead of holding them); a tidally-locked world is cratered harder on its leading (apex) face; airless silicate regolith GREYS as space-weathering dose matures it (Moon/Mercury); irradiated organic ices redden into THOLINS; and retained volatiles FROST the surface bright.']
      });
    }
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

  // 9. Orbital stability — WHY the orbit is stable or not, and how a mean-motion resonance can shepherd
  //    a crossing orbit (Pluto/Neptune) into metastability rather than doom.
  if (body.orbit) {
    const stabLabel = (body as any).orbitalStability as string | undefined;
    const stabDetails = (body as any).orbitalStabilityDetails as string | undefined;
    const fateTag = (body.tags ?? []).find((t) => t.key.startsWith('fate/'));
    // Binary members are judged on the barycentre's HELIOCENTRIC orbit (computed once, above),
    // not the ~0.0001 AU pair orbit.
    const orbEl = heliocentricEl ?? body.orbit.elements;
    const eN = orbEl?.e ?? 0;
    const aN = orbEl?.a_AU ?? 0;
    layers.push({
      id: 'stability', title: 'Orbital stability', link: '/physics#resonance',
      inputs: [
        { label: bary ? `Orbit (as the ${bary.name || 'pair'})` : 'Orbit', value: `${n(aN, 3, 'AU')} · e ${n(eN, 3)}` },
        { label: 'Perihelion → aphelion', value: `${n(aN * (1 - eN), 3)}–${n(aN * (1 + eN), 3)} AU` }
      ],
      outputs: [
        { label: 'Assessment', value: stabLabel ?? 'Stable' },
        ...(fateTag ? [{ label: 'Predicted fate', value: describeTag(fateTag.key).label }] : [])
      ],
      notes: [
        ...(bary ? [`Orbits the ${bary.name || 'barycentre'} — a member of a binary/multiple, so stability is judged on the pair's shared orbit around the star, not the small orbit within the pair.`] : []),
        stabDetails ?? 'No orbit-crossing neighbour or loose binding found — a well-spaced, stable orbit.'
      ]
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
