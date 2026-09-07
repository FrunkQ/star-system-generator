// The rail strip's ladder (A77). The thresholds are the owner's own numbers, 2026-08-28: orange at
// 2 GB, red at 3 GB, because live sessions have died at ~3.5 GB — ABSOLUTE, since the collapse is
// absolute. The fraction ladder stays live underneath for profiles whose allocation limit is small
// enough that 3 GB would never be reached before the tab dies.
import { describe, it, expect } from 'vitest';
import { memoryLevel, MEMORY_ORANGE_MB, MEMORY_RED_MB, type MemoryReading } from './memoryWatch';

const reading = (usedMB: number, limitMB = 4096): MemoryReading =>
  ({ supported: true, usedMB, limitMB, frac: limitMB > 0 ? usedMB / limitMB : 0 });

describe('memoryLevel: the rail strip ladder', () => {
  it('is green well clear of both ladders', () => {
    expect(memoryLevel(reading(500))).toBe('green');
    expect(memoryLevel(reading(2047))).toBe('green');
  });

  it('goes orange at 2 GB and red at 3 GB — the owner\u2019s absolute numbers', () => {
    expect(MEMORY_ORANGE_MB).toBe(2048);
    expect(MEMORY_RED_MB).toBe(3072);
    expect(memoryLevel(reading(2048))).toBe('orange');
    expect(memoryLevel(reading(3071))).toBe('orange');
    expect(memoryLevel(reading(3072))).toBe('red');
    expect(memoryLevel(reading(3500))).toBe('red');
  });

  // A machine whose allocation limit is 2.2 GB dies long before 3 GB: the fraction ladder must
  // still warn there, or the absolute ladder alone would stay silently green until the tab died.
  it('falls back to the fraction ladder when the limit is small', () => {
    expect(memoryLevel(reading(1800, 2200))).toBe('orange'); // 82% of a small limit, under 2 GB
    expect(memoryLevel(reading(2000, 2200))).toBe('red');    // 91% of a small limit, under 3 GB
  });

  it('an unsupported reading is green, never a guess', () => {
    expect(memoryLevel({ supported: false, usedMB: 0, limitMB: 0, frac: 0 })).toBe('green');
  });
});
