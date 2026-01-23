// Consistent seeded RNG for Traveller generation

/**
 * Creates a simple hash from a string to use as a seed.
 */
function cyrb128(str: string): [number, number, number, number] {
    let h1 = 1779033703, h2 = 3144134277,
        h3 = 1013904242, h4 = 2773480762;
    for (let i = 0, k; i < str.length; i++) {
        k = str.charCodeAt(i);
        h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
        h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
        h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
        h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
    }
    h1 = Math.imul(h3 ^ (h1 >>> 18), 597399067);
    h2 = Math.imul(h4 ^ (h2 >>> 22), 2869860233);
    h3 = Math.imul(h1 ^ (h3 >>> 17), 951274213);
    h4 = Math.imul(h2 ^ (h4 >>> 19), 2716044179);
    return [(h1 ^ h2 ^ h3 ^ h4) >>> 0, (h2 ^ h1) >>> 0, (h3 ^ h1) >>> 0, (h4 ^ h1) >>> 0];
}

/**
 * A seeded random number generator (SFC32).
 */
function sfc32(a: number, b: number, c: number, d: number) {
    return function() {
        a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0; 
        let t = (a + b) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        d = (d + 1) | 0;
        t = (t + d) | 0;
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    }
}

export class SeededRNG {
    private rand: () => number;

    constructor(seedString: string) {
        const seed = cyrb128(seedString);
        this.rand = sfc32(seed[0], seed[1], seed[2], seed[3]);
    }

    /**
     * Returns a float between 0 (inclusive) and 1 (exclusive).
     */
    next(): number {
        return this.rand();
    }

    nextFloat(): number {
        return this.next();
    }

    /**
     * Returns an integer between min and max (inclusive).
     */
    int(min: number, max: number): number {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }

    nextInt(min: number, max: number): number {
        return this.int(min, max);
    }

    /**
     * Returns a float between min and max.
     */
    range(min: number, max: number): number {
        return this.next() * (max - min) + min;
    }
    
    /**
     * Simulates rolling Nd6
     */
    d6(n: number = 1): number {
        let sum = 0;
        for (let i = 0; i < n; i++) {
            sum += this.int(1, 6);
        }
        return sum;
    }

    /**
     * Pick a random item from an array
     */
    pick<T>(array: T[]): T {
        return array[this.int(0, array.length - 1)];
    }
    
    /**
     * Weighted pick from an array of objects with a 'weight' property.
     */
    weightedPick<T extends { weight: number, value: any }>(items: T[]): T['value'] {
        const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
        let random = this.next() * totalWeight;
        for (const item of items) {
            if (random < item.weight) {
                return item.value;
            }
            random -= item.weight;
        }
        return items[items.length - 1].value;
    }

    // Shuffles an array in place using the Fisher-Yates algorithm.
    shuffle<T>(array: T[]): T[] {
        let currentIndex = array.length;
        let randomIndex;
    
        // While there remain elements to shuffle.
        while (currentIndex !== 0) {
            // Pick a remaining element.
            randomIndex = Math.floor(this.nextFloat() * currentIndex);
            currentIndex--;
        
            // And swap it with the current element.
            [array[currentIndex], array[randomIndex]] = [
            array[randomIndex], array[currentIndex]];
        }
    
        return array;
    }
}
