import { tweened } from 'svelte/motion';
import type { Tweened } from 'svelte/motion';
import { linear, quadOut } from 'svelte/easing';

export interface PanState {
  x: number; // Pan position in AU
  y: number; // Pan position in AU
}

const initialPan: PanState = { x: 0, y: 0 };
const initialZoom: number = 100;

export const panStore: Tweened<PanState> = tweened(initialPan, {
    duration: 1500,
    easing: linear,
});

export const zoomStore: Tweened<number> = tweened(initialZoom, {
    duration: 1500,
    easing: quadOut,
});