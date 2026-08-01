// Player-safe "facts" for a body, shared by the catalogue's diagrammatic browser and the
// interactive console inspector. The snapshot is already redacted, so we just format for reading.
import type { CelestialBody, RulePack } from '$lib/types';
import { G, AU_KM } from '$lib/constants';
import { calculateFullConstructSpecs } from '$lib/construct-logic';
import { formatDistanceKm, formatDistanceAu, formatSpeedKmS, formatTempK, type MeasurementUnits, type TemperatureUnit } from '$lib/units';
import { tagContextLabel } from '$lib/tags/tagPresentation';

const EARTH_G = 9.80665;
const EARTH_MASS_KG = 5.972e24;

export function fmtNum(n: number | undefined | null, d = 0): string {
  if (n === undefined || n === null || !Number.isFinite(n)) return '';
  if (Math.abs(n) > 1e15) return n.toExponential(2);
  return n.toLocaleString(undefined, { maximumFractionDigits: d });
}

export function orbitDist(b: CelestialBody, units: MeasurementUnits = 'metric'): string {
  const a = b.orbit?.elements?.a_AU;
  if (typeof a !== 'number' || a <= 0) return '';
  // Close-in / local orbits render in km (or miles); wider star orbits keep AU.
  return a < 0.05 ? formatDistanceAu(a, units) : `${a.toFixed(3)} AU`;
}
export function gravityG(b: CelestialBody): string {
  if (!b.massKg || !b.radiusKm) return '';
  const rm = b.radiusKm * 1000;
  return `${(G * b.massKg / (rm * rm) / EARTH_G).toFixed(2)} g`;
}
export function massRel(b: CelestialBody): string {
  if (!b.massKg) return '';
  const m = b.massKg / EARTH_MASS_KG;
  return `${m < 1000 ? m.toFixed(2) : m.toExponential(2)} M⊕`;
}
export function tempC(b: CelestialBody, tempUnit: TemperatureUnit = 'C'): string {
  return b.temperatureK === undefined ? '' : formatTempK(b.temperatureK, tempUnit);
}
export function atmosphere(b: CelestialBody): string {
  if (!b.atmosphere) return 'None';
  const p = b.atmosphere.pressure_bar ?? b.atmosphere.pressure_atm ?? 0;
  return `${b.atmosphere.name || 'Unknown'} (${p < 0.001 ? '<0.001' : p.toFixed(2)} bar)`;
}

// Same question the physics asks (inbox B18/B22): is there anywhere to stand? Reads the stored
// makeup rather than re-deriving it, so the LABEL can never disagree with the model that produced
// the number it labels.
export function hasSolidSurface(n: any): boolean {
  return !((n?.makeup?.gas ?? 0) > 0.5 || /gas-giant|jupiter|neptune|puff|brown-dwarf/.test((n?.classes ?? []).join(' ')));
}

export interface Fact { label: string; value: string; }

const EARTH_DENSITY = 5514;
const titleCase = (s: string) => s.replace(/[-_/]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();

// A readable CLASSIFICATION (not the kind). Bodies carry `classes` like ["planet/ringed",
// "planet/ammonia-clouds-gas-giant"] or ["star/G", "star/G2V"]; drop the category prefix, drop entries
// that are a prefix of a more specific one (so "G"+"G2V" → "G2V"), and title-case the rest.
export function classLabel(b: CelestialBody): string {
  const subs = ((b as any).classes as string[] | undefined ?? [])
    .map((c) => (c.includes('/') ? c.split('/').slice(1).join('/') : c))
    .filter(Boolean);
  const kept = subs.filter((s) => !subs.some((o) => o !== s && o.startsWith(s)));
  const pretty = Array.from(new Set(kept.map(titleCase)));
  if (pretty.length) return pretty.join(' · ');
  return b.class ? titleCase(b.class) : ''; // legacy singular fallback
}

// What a construct's facts need beyond the node itself: the rule pack that names its engines and
// fuels (and gives them an Isp and a density, without which no mass, Δv or acceleration exists), and
// its host, which is what turns an orbit into "Adrian: Low Orbit". Both OPTIONAL — a caller that has
// neither still gets every fact the construct carries on its own.
export interface FactContext {
  rulePack?: RulePack | null;
  host?: CelestialBody | null;
  // A29: print a construct's CURRENT levels as well as its capacity. Off (the default) is the reference
  // -work reading — what a ship can carry, not what is in it. Presentation only; the figures reach the
  // player either way, which is a known and accepted trade-off recorded in A29.
  liveReadings?: boolean;
}

// A CONSTRUCT is not a small planet, and the body block was describing it as one: Blip-A read Type /
// Orbit distance / Atmosphere while the node carried crew, engines, fuel tanks, cargo and a reactor.
// Everything here is READ from `calculateFullConstructSpecs`, the same derivation the GM's own
// Construct Derived Specs panel, the transit planner and the autopilot all use — so the player block
// and the GM panel cannot print different numbers for one ship. Nothing is recomputed here.
// Rows that cannot be determined return '' and are dropped by `add`, so a construct with no rule pack
// shows a shorter honest list rather than a full one padded with zeroes.
function constructFacts(b: CelestialBody, units: MeasurementUnits, ctx: FactContext): Fact[] {
  const out: Fact[] = [];
  const any = b as any;
  const add = (label: string, value: string) => { if (value) out.push({ label, value }); };
  const pp = b.physical_parameters ?? {};
  const engines = ctx.rulePack?.engineDefinitions?.entries ?? [];
  const fuels = ctx.rulePack?.fuelDefinitions?.entries ?? [];
  const specs = calculateFullConstructSpecs(b, engines, fuels, ctx.host ?? null);
  const tonnes = (t: number | undefined) => (typeof t === 'number' && t > 0 ? `${Math.round(t).toLocaleString()} t` : '');
  // Which of the derived figures we are entitled to PRINT. A tank whose fuel is not in the pack has no
  // density, so its mass is silently zero — and a "Total mass" that quietly leaves out the fuel is a
  // wrong number, not a partial one. Same for an unresolved engine: its power draw is missing, so what
  // is left is the plant's OUTPUT and calling it a surplus would be a claim we cannot make.
  // A29: whether this surface is an INSTRUMENT (current levels) or a REFERENCE WORK (capacity alone).
  // Where it applies, the LABEL says which figure it is rather than leaving the reader to guess — the
  // same approach already used for Power surplus vs Power output just below.
  const live = !!ctx.liveReadings;
  const fuelKnown = !(b.fuel_tanks?.length) || (b.fuel_tanks ?? []).every((t) => fuels.some((f) => f.id === t.fuel_type_id));
  const enginesKnown = !(b.engines?.length) || (b.engines ?? []).every((e) => engines.some((d) => d.id === e.engine_id));

  // The authored class ("Ship/Interstellar/Eridian") says far more than the role hint alone; split on
  // the same separator `classLabel` uses for a body's class list so the two read alike.
  add('Type', any.class
    ? String(any.class).split('/').map((s: string) => titleCase(s)).filter(Boolean).join(' · ')
    : titleCase(b.roleHint || 'construct'));
  if (any.flight_state) add('Status', String(any.flight_state));
  // orbit_string is 'N/A' when there is no host to describe the orbit against — don't print that.
  if (specs.orbit_string && specs.orbit_string !== 'N/A') add('Location', specs.orbit_string);
  else add('Location', b.placement ? String(b.placement) : '');
  add('Orbital period', any.orbital_period_days
    ? `${any.orbital_period_days < 2 ? any.orbital_period_days.toFixed(2) : Math.round(any.orbital_period_days).toLocaleString()} days` : '');

  // --- Complement ---
  const crew = b.crew ?? {};
  if (typeof crew.current === 'number' || typeof crew.max === 'number') {
    const n = (x: number) => x.toLocaleString(); // a colony station's crew runs to seven figures
    if (!live) add('Crew capacity', typeof crew.max === 'number' ? n(crew.max) : '');
    else add('Crew', typeof crew.max === 'number' ? `${n(crew.current ?? 0)} of ${n(crew.max)}` : n(crew.current ?? 0));
  }
  if (live) {
    add('Supplies remaining', typeof specs.endurance_days === 'number'
      ? `${specs.endurance_days.toLocaleString()} days` : (specs.endurance_days === 'Indefinite' ? 'Indefinite' : ''));
  }
  if (specs.simulatedG > 0.005) add('Spin gravity', `${specs.simulatedG.toFixed(2)} g`);

  // --- Hull ---
  const d = pp.dimensionsM;
  // Ring gates and colony drums run to hundreds of kilometres, so this needs separators (and reads in
  // km once metres stop being meaningful) — the same courtesy every other figure in the block gets.
  if (Array.isArray(d) && d.length === 3 && d.some((x) => x > 0)) {
    const big = Math.max(...d) >= 10000;
    add('Dimensions', `${d.map((x) => (big ? (x / 1000) : x)).map((x) => fmtNum(x, big ? 1 : 0)).join(' × ')} ${big ? 'km' : 'm'}`);
  }
  add('Dry mass', tonnes(specs.dryMass_tonnes));
  const cargoCap = typeof pp.cargoCapacity_tonnes === 'number' && pp.cargoCapacity_tonnes > 0 ? pp.cargoCapacity_tonnes : 0;
  if (!live) add('Cargo capacity', tonnes(cargoCap));
  else add('Cargo', cargoCap
    ? `${Math.round(b.current_cargo_tonnes ?? 0).toLocaleString()} of ${Math.round(cargoCap).toLocaleString()} t`
    : tonnes(b.current_cargo_tonnes));
  // Total mass is dry + CURRENT cargo + CURRENT fuel, so it restates the reading the other rows just
  // withheld. It follows the toggle rather than quietly leaking it back.
  if (fuelKnown && live) add('Total mass', tonnes(specs.totalMass_tonnes));

  // --- Power, fuel and performance. All of this is zero without the rule pack's engine/fuel data,
  //     which is why each row is gated on a positive figure rather than printed as 0. ---
  // Keyed on HAVING a plant rather than on a non-zero figure: a surplus of exactly 0 MW is a real
  // statement about a ship that is drawing everything it makes, not an absence of information.
  if ((b.systems?.power_plants?.length ?? 0) > 0 && Number.isFinite(specs.powerSurplus_MW)) {
    add(enginesKnown ? 'Power surplus' : 'Power output',
      `${specs.powerSurplus_MW.toLocaleString(undefined, { maximumFractionDigits: 1 })} MW`);
  }
  if (specs.fuelCapacity_units > 0) {
    const named = Array.from(new Set((b.fuel_tanks ?? [])
      .map((t) => fuels.find((f) => f.id === t.fuel_type_id)?.name).filter(Boolean)));
    const suffix = named.length ? ` ${named.join(', ')}` : '';
    if (!live) add('Fuel capacity', `${Math.round(specs.fuelCapacity_units).toLocaleString()} m³${suffix}`);
    else add('Fuel', `${Math.round(specs.fuelVolume_units).toLocaleString()} of ${Math.round(specs.fuelCapacity_units).toLocaleString()} m³${suffix}`);
  }
  // Both are computed from the CURRENT wet mass — acceleration divides by it, and Δv is the log of the
  // wet/dry ratio, i.e. how much fuel is left. So they are readings, not specifications, and they follow
  // the toggle for the same reason Total mass does. The RATED figures a catalogue would want (full tanks)
  // are a derivation that does not exist yet — see A31 rather than inventing one here.
  if (live && specs.maxVacuumG > 0) add('Max acceleration', `${specs.maxVacuumG.toFixed(2)} g`);
  if (live && specs.totalVacuumDeltaV_ms > 0) add('Δv (vacuum)', formatSpeedKmS(specs.totalVacuumDeltaV_ms / 1000, units, 1));
  if (specs.canAerobrake) add('Aerobraking', `up to ${specs.aerobrakeLimit_kms.toFixed(1)} km/s`);

  // Same contract as a body's tags: the row is named 'Tags' so the document can lift it out and
  // render it as the styled tags block instead of a key/value line.
  if (Array.isArray(b.tags) && b.tags.length) {
    const tagLabels = b.tags.map((t: any) => tagContextLabel(String(t.key), t.value)).filter(Boolean);
    if (tagLabels.length) add('Tags', Array.from(new Set(tagLabels)).join(', '));
  }
  return out;
}

// Full report-parity facts for a body, enriched with the Phase-04 derived data (temperature range,
// radiation, geology, magnetism, fluids, ascent Δv). Both guide tiers (diagrammatic browser +
// hi-tech console inspector) render this, so they match the printed report's depth.
export function bodyFacts(b: CelestialBody, units: MeasurementUnits = 'metric', tempUnit: TemperatureUnit = 'C', ctx: FactContext = {}): Fact[] {
  // A construct is a different KIND of thing and gets its own facts, not a body block with the
  // temperature rows missing. It used to fall through here and borrow a world's fields.
  if (b.kind === 'construct') return constructFacts(b, units, ctx);

  const out: Fact[] = [];
  const any = b as any;
  const add = (label: string, value: string) => { if (value) out.push({ label, value }); };

  // Show the scientific CLASSIFICATION (spectral type / planet class), not the kind.
  add('Type', classLabel(b) || titleCase(b.roleHint || 'body'));

  // --- Orbit & rotation ---
  add('Orbit distance', orbitDist(b, units));
  const e = b.orbit?.elements?.e;
  if (typeof e === 'number' && e >= 0.05) add('Eccentricity', e.toFixed(3));
  add('Orbital period', b.orbital_period_days ? `${b.orbital_period_days < 2 ? b.orbital_period_days.toFixed(2) : Math.round(b.orbital_period_days).toLocaleString()} days` : '');
  add('Day length', b.rotation_period_hours ? `${b.rotation_period_hours.toFixed(1)} h` : '');
  if (typeof any.axial_tilt_deg === 'number') add('Axial tilt', `${any.axial_tilt_deg.toFixed(1)}°`);
  // A despun body is either synchronous or caught in a spin-orbit resonance, and the two want
  // different words: "tidally locked" beside Mercury's 1,407 h day reads as a contradiction, because
  // Mercury turns 3 times per 2 orbits rather than keeping one face sunward (inbox B7). The day
  // length above is now the orbital period for a synchronous body, so the two rows agree either way.
  const resonance = b.tags?.find((t) => t.key === 'orbit/spin-orbit-resonance')?.value;
  if (resonance) add('Rotation', `${resonance} spin–orbit resonance`);
  else if (b.tidallyLocked) add('Rotation', 'tidally locked');

  // --- Bulk ---
  add('Mass', massRel(b));
  add('Radius', b.radiusKm ? formatDistanceKm(b.radiusKm, units) : '');
  add('Gravity', gravityG(b));
  if (b.massKg && b.radiusKm) {
    const vol = (4 / 3) * Math.PI * Math.pow(b.radiusKm * 1000, 3);
    add('Density', `${((b.massKg / vol) / EARTH_DENSITY).toFixed(2)} ×Earth`);
  }

  // --- Climate ---
  // Stars are always Kelvin (a ~5,778 K star reads oddly as °C); the switch governs planet/moon temps.
  add('Surface temp', tempC(b, b.roleHint === 'star' ? 'K' : tempUnit));
  // The range must be the SURFACE range, to match the row above it. `temperatureRangeK` is the
  // SurfaceTempProfile's total (`totalMinK`/`totalMaxK`), built as mean ± the swings combined in
  // quadrature — so it brackets `temperatureK` by construction. The EQUILIBRIUM min/max does not:
  // it omits the greenhouse and every other heat term, so a world with any air showed a mean sitting
  // outside its own quoted range (Pandora: 45 °C against −28 to −23 °C, the 71 K gap being its
  // greenhouse). Stars and constructs have neither field — `processEnvironment` returns early for a
  // star — and both are stripped and re-derived together on import, so there is no state where one
  // exists without the other and nothing to fall back to: the row simply drops.
  const range = any.temperatureRangeK;
  if (typeof range?.min === 'number' && typeof range?.max === 'number') {
    add('Temp range', `${formatTempK(range.min, tempUnit)} to ${formatTempK(range.max, tempUnit)}`);
  }
  add('Atmosphere', atmosphere(b));
  if (b.atmosphere?.composition) {
    const gases = Object.entries(b.atmosphere.composition).sort((a, c) => c[1] - a[1]).slice(0, 3)
      .map(([g, p]) => `${g} ${Math.round((p as number) * 100)}%`).join(', ');
    if (gases) add('Air mix', gases);
  }
  // The recorded coverage is an INVENTORY; whether it is liquid is a separate question the physics
  // has already answered and published as a `hydrosphere/*` phase tag. Calling it "Surface liquid"
  // regardless contradicts this block's own Tags row — Europa reads "Surface liquid 100% water"
  // beside "Frozen surface: water", and its liquid is famously UNDER the ice. Five of Sol's seven
  // hydrosphere bodies are frozen. The label follows the tag; no phase tag (coverage under 1%, or a
  // body that never ran the pass) takes the neutral wording rather than re-asserting the claim.
  if (b.hydrosphere?.coverage) {
    const phase = (b.tags ?? []).map((t: any) => String(t.key)).find((k) =>
      k.startsWith('hydrosphere/') || k === 'structure/supercritical-envelope');
    const label = phase === 'hydrosphere/ocean' || phase === 'hydrosphere/brine' ? 'Surface liquid'
      : phase === 'hydrosphere/frozen' ? 'Surface ice' : 'Surface volatile';
    const state = phase === 'hydrosphere/boiled-off' ? ' (boiled off)'
      : phase === 'structure/supercritical-envelope' ? ' (supercritical)' : '';
    add(label, `${Math.round(b.hydrosphere.coverage * 100)}%${b.hydrosphere.composition ? ` ${b.hydrosphere.composition}` : ''}${state}`);
  }

  // --- Hazards / interior ---
  // Radiation is TWO named figures, because one number cannot answer both "what does the ground
  // take" and "what does a ship take" (inbox B22). A surfaceless body has no ground at all, so its
  // first figure is labelled for the 1-bar reference level it actually describes — the same
  // reasoning B18 applied to habitability. The second is only worth a row when it genuinely differs.
  const radDose = (v: number) => v >= 3.65e6 ? `${(v / 365000).toPrecision(3)} Sv/day`
    : v >= 10000 ? `${(v / 1000).toPrecision(3)} Sv/y` : `${v.toFixed(1)} mSv/y`;
  if (typeof any.surfaceRadiation === 'number') {
    const band = any.surfaceRadiation < 5 ? 'low' : any.surfaceRadiation < 100 ? 'moderate' : 'high';
    const range = (typeof any.surfaceRadiationMin === 'number' && typeof any.surfaceRadiationMax === 'number')
      ? ` (${any.surfaceRadiationMin.toFixed(1)}–${any.surfaceRadiationMax.toFixed(1)} mSv/y)` : ` (${radDose(any.surfaceRadiation)})`;
    add(hasSolidSurface(b) ? 'Radiation (surface)' : 'Radiation (at 1 bar)', `${band}${range}`);
  }
  if (typeof any.orbitalRadiation === 'number' && typeof any.surfaceRadiation === 'number'
      && any.orbitalRadiation > any.surfaceRadiation * 1.5) {
    const band = any.orbitalRadiation < 5 ? 'low' : any.orbitalRadiation < 100 ? 'moderate' : 'high';
    add('Radiation (in orbit)', `${band} (${radDose(any.orbitalRadiation)})`);
  }
  if (any.magneticField?.strengthGauss) add('Magnetosphere', `${any.magneticField.strengthGauss.toFixed(2)} G`);
  if (any.geoActivity?.regime) add('Geology', titleCase(String(any.geoActivity.regime)));
  if (any.loDeltaVBudget_ms) add('Ascent Δv', formatSpeedKmS(any.loDeltaVBudget_ms / 1000, units, 1));

  // --- Life ---
  if (typeof b.habitabilityScore === 'number') add('Habitability', `${Math.round(b.habitabilityScore)}%`);
  if (b.biosphere) add('Native life', `present (cover ${Math.round((b.biosphere.coverage || 0) * 100)}%)`);

  // --- GM-surfaced narrative/feature tags --- (contextual labels so "Oblate"/"Dynamo" keep their
  // category: "Shape · Oblate", "Magnetism · Intrinsic dynamo", "Brilliant aurora: 0.62".)
  if (Array.isArray(b.tags) && b.tags.length) {
    const tagLabels = b.tags.map((t: any) => tagContextLabel(String(t.key), t.value)).filter(Boolean);
    if (tagLabels.length) add('Tags', Array.from(new Set(tagLabels)).join(', '));
  }
  return out;
}

export function bodyGlyph(b: CelestialBody): string {
  if (b.kind === 'construct') return '◆';
  if (b.roleHint === 'star') return '★';
  if (b.roleHint === 'ring') return '◌';
  if (b.roleHint === 'belt') return '⋯';
  if (b.roleHint === 'moon') return '○';
  return '●';
}
