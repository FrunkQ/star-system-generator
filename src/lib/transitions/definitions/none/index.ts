import type { TransitionDefinition } from '../../schema';

export default {
  id: 'none',
  label: 'None (instant)',
  params: [],
  play() {
    return Promise.resolve();
  },
} satisfies TransitionDefinition;
