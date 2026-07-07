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
const FORCING_SCALE = 90;          // how fast peak climbs with raw tidal index (tuned so a strongly
                                   // flexed rocky moon like Io reaches silicate-melt hotspots)

export function tidalHotspotPeakK(rawIndex: number, meanK: number, iceFrac: number): number {
  if (rawIndex <= HOTSPOT_ONSET) return meanK;
  const ceilK = iceFrac > 0.3 ? CRYO_CEIL_K : SILICATE_MELT_K;
  const peak = meanK + (SILICATE_MELT_K - meanK) * (1 - Math.exp(-(rawIndex - HOTSPOT_ONSET) / FORCING_SCALE));
  return Math.min(ceilK, Math.max(meanK, peak));
}
// NOTE: the surface temperature RANGE is now produced by surfaceTemperature.ts (decomposed by
// cause); this module only owns the tidal hotspot PEAK it consumes.
