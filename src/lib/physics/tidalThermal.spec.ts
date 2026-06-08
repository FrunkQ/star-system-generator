import { describe, it, expect } from 'vitest';
import { tidalHotspotPeakK, surfaceTempRange } from './tidalThermal';

describe('tidalHotspotPeakK', () => {
  it('no hotspots below the forcing onset → peak equals the mean', () => {
    expect(tidalHotspotPeakK(50, 250, 0)).toBe(250);
  });

  it('a rocky body under strong forcing reaches silicate-melt lava temps', () => {
    const peak = tidalHotspotPeakK(5000, 320, 0); // Io-like sulfur/rock moon
    expect(peak).toBeGreaterThan(1300);
    expect(peak).toBeLessThanOrEqual(1500);
  });

  it('an icy body buffers the same forcing as cryovolcanism (capped cold)', () => {
    const peak = tidalHotspotPeakK(5000, 247, 0.5); // Europa-like icy moon
    expect(peak).toBeLessThanOrEqual(320);
  });

  it('peak rises monotonically with forcing for a rocky body', () => {
    const a = tidalHotspotPeakK(200, 250, 0);
    const b = tidalHotspotPeakK(2000, 250, 0);
    expect(b).toBeGreaterThan(a);
  });
});

describe('surfaceTempRange', () => {
  it('a thick-atmosphere, untidal world has a flat range (= mean)', () => {
    const r = surfaceTempRange({ meanK: 288, equilibriumK: 255, atmPressureBar: 1, tidalRawIndex: 0, iceFrac: 0 });
    expect(r.min).toBe(288);
    expect(r.max).toBe(288);
    expect(r.tags).toEqual([]);
  });

  it('an airless world has a cold night side below the mean', () => {
    const r = surfaceTempRange({ meanK: 440, equilibriumK: 440, atmPressureBar: 0, tidalRawIndex: 0, iceFrac: 0 });
    expect(r.min).toBeLessThan(440); // ~0.82 * equilibrium
    expect(r.max).toBe(440);
  });

  it('an Io-like rocky moon tags lava flows and spans cold mean → hot peak', () => {
    const r = surfaceTempRange({ meanK: 323, equilibriumK: 229, atmPressureBar: 0.4, tidalRawIndex: 5304, iceFrac: 0 });
    expect(r.max).toBeGreaterThan(1300);
    expect(r.tags).toContain('tidal/lava-flows');
  });

  it('a Europa-like icy moon does NOT get lava flows (cryovolcanic cap)', () => {
    const r = surfaceTempRange({ meanK: 247, equilibriumK: 242, atmPressureBar: 0, tidalRawIndex: 2258, iceFrac: 0.5 });
    expect(r.max).toBeLessThanOrEqual(320);
    expect(r.tags).not.toContain('tidal/lava-flows');
    expect(r.tags).not.toContain('tidal/volcanism');
  });
});
