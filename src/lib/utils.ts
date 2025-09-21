import type { TableSpec } from './types';
import type { SeededRNG } from './rng';

export function weightedChoice<T>(rng: SeededRNG, table: TableSpec): T {
  const totalWeight = table.entries.reduce((sum, entry) => sum + entry.weight, 0);
  let random = rng.nextFloat() * totalWeight;

  for (const entry of table.entries) {
    if (random < entry.weight) {
      return entry.value as T;
    }
    random -= entry.weight;
  }

  // Fallback to the last entry, should not be reached if weights are correct.
  return table.entries[table.entries.length - 1].value as T;
}

export function randomFromRange(rng: SeededRNG, min: number, max: number): number {
  return rng.nextFloat() * (max - min) + min;
}

export function toRoman(num: number): string {
    const roman = {
        M: 1000, CM: 900, D: 500, CD: 400, C: 100, XC: 90, L: 50, XL: 40, X: 10, IX: 9, V: 5, IV: 4, I: 1
    };
    let str = '';

    for (const i of Object.keys(roman)) {
        const q = Math.floor(num / roman[i]);
        num -= q * roman[i];
        str += i.repeat(q);
    }

    return str;
}
