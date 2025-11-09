import { AU_KM } from "$lib/constants";

/**
 * Implements the Box-Cox "power-log" blend for scaling values.
 * This function continuously morphs from true-scale (t=0) to aggressively "toytown" (t=1).
 * @param x The real quantity (e.g., AU for distance, km for radius).
 * @param t The toytown factor, a value between 0 (real scale) and 1 (toytown scale).
 * @param x0 A small pivot point where the curve "bends".
 * @returns The scaled value.
 */
export function scaleBoxCox(x: number, t: number, x0: number): number {
    if (x <= 0) return x; // Handle non-positive values, though distances/radii should be > 0

    // Ensure t is within [0, 1]
    t = Math.max(0, Math.min(1, t));

    if (t < 1.0) {
        // Box-Cox transformation for t < 1
        return (Math.pow(x + x0, 1.0 - t) - Math.pow(x0, 1.0 - t)) / (1.0 - t);
    } else {
        // Logarithmic transformation for t = 1
        return Math.log((x + x0) / x0);
    }
}

/**
 * Scales a list of positive real numbers (distances or radii) using the Box-Cox transform
 * and then normalizes them to a target output range.
 * @param xs An array of positive real numbers to scale.
 * @param t The toytown factor (0 to 1).
 * @param x0 The pivot point for the Box-Cox transform.
 * @param outMin The minimum value of the output range.
 * @param outMax The maximum value of the output range.
 * @returns An array of scaled and normalized values.
 */
export function scaledPositions(xs: number[], t: number, x0: number, outMin: number, outMax: number): number[] {
    if (xs.length === 0) return [];

    const svals = xs.map(x => scaleBoxCox(x, t, x0));
    const smin = Math.min(...svals);
    const smax = Math.max(...svals);

    if (smax === smin) {
        // Avoid division by zero if all scaled values are the same
        return xs.map(() => (outMin + outMax) / 2);
    }

    return svals.map(s => outMin + (outMax - outMin) * (s - smin) / (smax - smin));
}
