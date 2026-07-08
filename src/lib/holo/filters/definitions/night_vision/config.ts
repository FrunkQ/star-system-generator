import type { FilterDefinition } from '../../schema';
import vertexShader   from './vertex.glsl?raw';
import fragmentShader from './fragment.glsl?raw';

const definition: FilterDefinition = {
  id:          'night_vision',
  name:        'Night Vision',
  description: 'Green-channel image-intensifier look with scanlines, grain, edge vignette, and an optional sniper-scope overlay with crosshair reticle.',
  animated:    true,
  vertexShader,
  fragmentShader,
  params: [
    { type: 'slider', id: 'greenStrength', label: 'Green Strength', min: 0, max: 1, step: 0.01, default: 0.95 },
    { type: 'slider', id: 'scanlines',     label: 'Scanlines',      min: 0, max: 1, step: 0.01, default: 0.45 },
    { type: 'slider', id: 'grain',         label: 'Grain',          min: 0, max: 1, step: 0.01, default: 0.4  },
    { type: 'slider', id: 'vignetteAmt',   label: 'Edge Vignette',  min: 0, max: 1, step: 0.01, default: 0.9  },
    { type: 'toggle', id: 'scopeOverlay',  label: 'Sniper Scope Overlay', default: false },
  ],
};

export default definition;
