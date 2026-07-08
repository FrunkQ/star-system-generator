import type { FilterDefinition } from '../../schema';
import vertexShader   from './vertex.glsl?raw';
import fragmentShader from './fragment.glsl?raw';

const definition: FilterDefinition = {
  id:          'thermal',
  name:        'Thermal',
  description: 'Predator-style heat vision — luma maps to a five-stop blue → green → yellow → red → white palette.',
  animated:    true,
  vertexShader,
  fragmentShader,
  params: [
    { type: 'slider', id: 'palette',   label: 'Palette Strength', min: 0,   max: 1,    step: 0.01, default: 0.9  },
    { type: 'slider', id: 'contrast',  label: 'Contrast',         min: 0.5, max: 3.0,  step: 0.05, default: 1.4  },
    { type: 'slider', id: 'pulse',     label: 'Live-Feed Pulse',  min: 0,   max: 1,    step: 0.01, default: 0.35 },
    { type: 'slider', id: 'scanlines', label: 'Scanlines',        min: 0,   max: 1,    step: 0.01, default: 0.25 },
  ],
};

export default definition;
