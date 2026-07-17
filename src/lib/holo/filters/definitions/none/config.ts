import type { FilterDefinition } from '../../schema';
import vertexShader from './vertex.glsl?raw';
import fragmentShader from './fragment.glsl?raw';

const definition: FilterDefinition = {
  id: 'none',
  name: 'None',
  description: 'Pass-through — no visual effect applied.',
  vertexShader,
  fragmentShader,
  params: [
    {
      type: 'toggle',
      id: 'invertDisplay',
      label: 'Invert Display',
      default: false,
    },
  ],
};

export default definition;
