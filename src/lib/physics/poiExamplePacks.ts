// Example PoI packs users can load and learn from — they STACK on top of the default pack.
// Each shows the declarative form: a few categories + rules whose `when` reads the feature vector
// (see POI_FIELDS in reasonsToVisit.ts).
import type { PoIPack } from './reasonsToVisit';

export const EXAMPLE_POI_PACKS: PoIPack[] = [
  {
    id: 'space-opera',
    name: 'Space Opera',
    description: 'Pulpy hooks for a galaxy-far-away game — relics, contested worlds, smuggler havens.',
    enabled: true,
    categories: [{ id: 'opera', label: 'Space Opera', desc: 'Pulp adventure hooks', color: '#c9603f', textColor: '#1c0904' }],
    rules: [
      { id: 'so1', tag: 'opera/spice-world', category: 'opera', chance: 0.3, when: { any: [{ eq: ['hydro', 'methane'] }, { gte: ['makeup.ice', 0.4] }] } },
      { id: 'so2', tag: 'opera/crystal-caverns', category: 'opera', chance: 0.3, when: { gte: ['massMe', 2] } },
      { id: 'so3', tag: 'opera/contested-prize', category: 'opera', chance: 0.5, when: { eq: ['hasBio', true] } },
      { id: 'so4', tag: 'opera/smuggler-haven', category: 'opera', chance: 0.2, when: { eq: ['roleHint', 'moon'] } },
      { id: 'so5', tag: 'opera/rebel-base', category: 'opera', chance: 0.15, when: { all: [{ eq: ['roleHint', 'moon'] }, { eq: ['hasAtmo', false] }] } },
      { id: 'so6', tag: 'opera/ancient-relics', category: 'opera', chance: 0.1, when: true }
    ]
  },
  {
    id: 'hard-science',
    name: 'Hard Science (survey)',
    description: 'Sober research targets only — no mysteries. A model for a grounded campaign (disable Intrigue to match).',
    enabled: true,
    categories: [{ id: 'survey', label: 'Survey value', desc: 'Hard-science field targets', color: '#4aa3a3', textColor: '#04140f' }],
    rules: [
      { id: 'hs1', tag: 'survey/geochem-sample', category: 'survey', chance: 0.4, when: { gte: ['makeup.metal', 0.3] } },
      { id: 'hs2', tag: 'survey/subsurface-ocean', category: 'survey', chance: 0.7, when: { any: [{ eq: ['regime', 'cryovolcanic'] }, { hasTag: 'structure/subsurface-ocean' }] } },
      { id: 'hs3', tag: 'survey/atmosphere-study', category: 'survey', chance: 0.4, when: { gte: ['pressure', 0.1] } },
      { id: 'hs4', tag: 'survey/formation-record', category: 'survey', chance: 0.6, when: { lt: ['ageGyr', 1] } }
    ]
  }
];
