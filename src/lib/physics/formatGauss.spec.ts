import { describe, it, expect } from 'vitest';
import { formatGauss } from './magnetism';

/** B145: a neutron star's 2.2e14 G printed as "220550694099783.16 G". The format is data a GM reads. */
describe('formatGauss', () => {
  it('prints a remnant-class field in scientific notation', () => {
    expect(formatGauss(220550694099783.16)).toBe('2.21e14');
    expect(formatGauss(1e8)).toBe('1.00e8');
    expect(formatGauss(12345)).toBe('1.23e4');
  });
  it('keeps the small-field precision that shows a tenuous field', () => {
    expect(formatGauss(4.32)).toBe('4.32');
    expect(formatGauss(0.5)).toBe('0.500');
    expect(formatGauss(0.003)).toBe('0.0030');
    expect(formatGauss(0)).toBe('0');
  });
});
