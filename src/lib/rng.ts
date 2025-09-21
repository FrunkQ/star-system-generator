// A simple Mulberry32 pseudo-random number generator.
// It's fast, simple, and good enough for procedural generation.

export class SeededRNG {
  private seed: number;

  constructor(seed: string) {
    this.seed = this.hash(seed);
  }

  // A simple string hashing function to create a numeric seed.
  private hash(str: string): number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    return h;
  }

  // Returns a random float between 0 (inclusive) and 1 (exclusive).
  public nextFloat(): number {
    let t = (this.seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Returns a random integer between min (inclusive) and max (inclusive).
  public nextInt(min: number, max: number): number {
    return Math.floor(this.nextFloat() * (max - min + 1)) + min;
  }
}
