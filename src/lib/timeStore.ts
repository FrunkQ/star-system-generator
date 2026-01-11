import { writable, get } from 'svelte/store';
import { browser } from '$app/environment';

// The "Global Mission Time" in milliseconds
export const currentTime = writable<number>(Date.now());
export const isPaused = writable<boolean>(true);
export const timeScale = writable<number>(3600 * 24 * 30); // Default to 30 days/sec

let lastTimestamp: number | null = null;
let animationFrameId: number | null = null;

function tick(timestamp: number) {
    if (!get(isPaused)) {
        if (lastTimestamp !== null) {
            const delta = (timestamp - lastTimestamp) / 1000; // seconds
            const scale = get(timeScale);
            currentTime.update(t => t + delta * scale * 1000);
        }
        lastTimestamp = timestamp;
        animationFrameId = requestAnimationFrame(tick);
    } else {
        lastTimestamp = null;
    }
}

// Start/Stop the global clock loop
isPaused.subscribe(paused => {
    if (browser) {
        if (!paused) {
            if (animationFrameId === null) {
                animationFrameId = requestAnimationFrame(tick);
            }
        } else {
            if (animationFrameId !== null) {
                cancelAnimationFrame(animationFrameId);
                animationFrameId = null;
                lastTimestamp = null;
            }
        }
    }
});

/**
 * Advances the clock by a fixed amount of time
 * @param days Number of days to advance
 */
export function advanceTime(days: number) {
    currentTime.update(t => t + days * 86400 * 1000);
}

/**
 * Resets the clock to a specific timestamp
 */
export function setTime(timestamp: number) {
    currentTime.set(timestamp);
}
