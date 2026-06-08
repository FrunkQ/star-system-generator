// Surface temperature RANGE and tidal-volcanic context (the honest picture the mean hides).
//
// Tidal heating is LOCALIZED — a body can read a cold global MEAN yet host hotspots far hotter.
// Rather than inflate the mean (which produced runaway temps when heat wasn't averaged over the
// body), we keep the mean as the averaged value and carry the extremes here:
//   - cold extreme: airless / very thin atmospheres redistribute heat poorly → cold night side.
//   - hot extreme: tidal-volcanic hotspots, climbing with forcing toward a COMPOSITION ceiling.
// An icy body buffers tidal heat as latent ice-melt (cryovolcanism — surface stays cold, a
// subsurface ocean forms, like Europa); a rocky/sulfur body has no such buffer and reaches
// silicate melt (~1500 K lava lakes, like Io).

const HOTSPOT_ONSET = 80;          // raw tidal index below which there are no distinct hotspots
const SILICATE_MELT_K = 1500;      // ceiling for rocky/sulfur worlds (Io's lava lakes)
const CRYO_CEIL_K = 320;           // ceiling for icy worlds (heat sinks into melting ice)
const FORCING_SCALE = 1500;        // how fast peak climbs with raw tidal index

export function tidalHotspotPeakK(rawIndex: number, meanK: number, iceFrac: number): number {
  if (rawIndex <= HOTSPOT_ONSET) return meanK;
  const ceilK = iceFrac > 0.3 ? CRYO_CEIL_K : SILICATE_MELT_K;
  const peak = meanK + (SILICATE_MELT_K - meanK) * (1 - Math.exp(-(rawIndex - HOTSPOT_ONSET) / FORCING_SCALE));
  return Math.min(ceilK, Math.max(meanK, peak));
}

export interface SurfaceTempRange { min: number; max: number; tags: string[]; }

export function surfaceTempRange(opts: {
  meanK: number;
  equilibriumK: number;
  atmPressureBar: number;
  tidalRawIndex: number;
  iceFrac: number;
}): SurfaceTempRange {
  const { meanK, equilibriumK, atmPressureBar, tidalRawIndex, iceFrac } = opts;
  let min = meanK, max = meanK;
  const tags: string[] = [];

  if (atmPressureBar < 0.1 && equilibriumK > 0) {
    min = Math.min(min, equilibriumK * 0.82); // cold night side / poles
  }
  if (tidalRawIndex > HOTSPOT_ONSET) {
    const peak = tidalHotspotPeakK(tidalRawIndex, meanK, iceFrac);
    max = Math.max(max, peak);
    if (peak >= 1300) tags.push('tidal/lava-flows');        // silicate melt → lava
    else if (peak >= 1000) tags.push('tidal/volcanism');    // active volcanism
  }
  return { min: Math.round(min), max: Math.round(max), tags };
}
