import { describe, it, expect } from 'vitest';
import { tidalHotspotPeakK } from './tidalThermal';

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
