import { tweened } from 'svelte/motion';
import type { Tweened } from 'svelte/motion';
import { linear } from 'svelte/easing';

export interface CameraState {
  pan: {
    x: number; // Pan position in AU
    y: number; // Pan position in AU
  };
  zoom: number; // Zoom level in pixels per AU
}

const initialState: CameraState = {
  pan: { x: 0, y: 0 },
  zoom: 100,
};

export const cameraStore: Tweened<CameraState> = tweened(initialState, {
    duration: 1500, // Default duration
    easing: linear,
});