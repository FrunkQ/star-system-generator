import type { FilterDefinition } from '../../schema';
import vertexShader from './vertex.glsl?raw';
import fragmentShader from './fragment.glsl?raw';

// One parameterised CRT filter (replaces the separate green + amber phosphor filters). The phosphor
// COLOUR is a param, so any colour — green, amber, red, blue — is one preset, not a new shader.
const definition: FilterDefinition = {
  id: 'crt',
  name: 'CRT Terminal',
  description: 'Phosphor CRT terminal with scanlines. Pick any phosphor colour.',
  animated: true, // scanlines, flicker, noise bars all use time
  vertexShader,
  fragmentShader,
  groups: [
    { id: 'display',   label: 'Display' },
    { id: 'color',     label: 'Colour' },
    { id: 'crt',       label: 'CRT Effects' },
    { id: 'distort',   label: 'Distortion',       collapsed: true },
    { id: 'signal',    label: 'Signal Artifacts', collapsed: true },
  ],
  params: [
    // Display
    { type: 'slider', id: 'brightness',         label: 'Brightness',         min: 0.1,   max: 2.0,   step: 0.05,   default: 1.0,  group: 'display' },
    { type: 'slider', id: 'contrast',           label: 'Contrast',           min: 0.5,   max: 3.0,   step: 0.05,   default: 1.2,  group: 'display' },
    { type: 'toggle', id: 'invertColors',       label: 'Invert',             default: false,                                       group: 'display' },
    // Colour — phosphor colour + strength
    { type: 'color',  id: 'phosphor',           label: 'Phosphor Colour',    default: '#4dff88',                                    group: 'color' },
    { type: 'slider', id: 'tint',               label: 'Phosphor Strength',  min: 0,     max: 1,     step: 0.05,   default: 0.8,  group: 'color' },
    // CRT Effects
    { type: 'slider', id: 'scanlineIntensity',  label: 'Scanline Intensity', min: 0,     max: 1,     step: 0.01,   default: 0.4,  group: 'crt' },
    { type: 'slider', id: 'scanlineThickness',  label: 'Scanline Width',     min: 2.0,   max: 8.0,   step: 0.5,    default: 3.0,  group: 'crt' },
    { type: 'slider', id: 'crtWarp',            label: 'Barrel Warp',        min: 0,     max: 0.15,  step: 0.005,  default: 0.03, group: 'crt' },
    { type: 'slider', id: 'vignetteAmount',     label: 'Vignette',           min: 0,     max: 1.5,   step: 0.05,   default: 0.5,  group: 'crt' },
    { type: 'slider', id: 'roundedCorners',     label: 'Rounded Corners',    min: 0.0,   max: 0.15,  step: 0.005,  default: 0.05, group: 'crt' },
    // Distortion
    { type: 'slider', id: 'skew',               label: 'Picture Skew',       min: -0.5,  max: 0.5,   step: 0.01,   default: 0.0,  group: 'distort' },
    { type: 'slider', id: 'distortion',         label: 'General Distortion', min: 0,     max: 0.03,  step: 0.001,  default: 0.0,  group: 'distort' },
    { type: 'slider', id: 'pictureRoll',        label: 'Picture Roll Speed', min: -0.1,  max: 0.1,   step: 0.002,  default: 0.0,  group: 'distort' },
    { type: 'slider', id: 'chromaticAberration',label: 'Chromatic Aberration',min: 0,    max: 0.02,  step: 0.0005, default: 0.0,  group: 'distort' },
    // Signal Artifacts
    { type: 'slider', id: 'ghostIntensity',     label: 'Ghosting Intensity', min: 0,     max: 0.5,   step: 0.01,   default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'ghostDistance',      label: 'Ghosting Distance',  min: -50.0, max: 50.0,  step: 1.0,    default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'tearFrequency',      label: 'RF Noise Frequency', min: 0.0,   max: 10.0,  step: 0.1,    default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'noiseBarWidth',      label: 'Noise Bar Width %',  min: 0.0,   max: 20.0,  step: 0.5,    default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'noiseBarSpeed',      label: 'Noise Bar Speed',    min: -1.0,  max: 1.0,   step: 0.05,   default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'interference',       label: 'White Noise',        min: 0,     max: 1.0,   step: 0.01,   default: 0.0,  group: 'signal' },
    { type: 'slider', id: 'flicker',            label: 'Brightness Flicker', min: 0,     max: 0.4,   step: 0.01,   default: 0.0,  group: 'signal' },
  ],
};

export default definition;
