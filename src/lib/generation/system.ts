import type { System, RulePack, CelestialBody, Barycenter } from '../types';
import { SeededRNG } from '../rng';
import { randomFromRange } from '../utils';
import { systemProcessor } from '../core/SystemProcessor';
import { setupStars } from './setupStars';
import { generatePlanets } from './planet-generation';
import type { GenOptions } from '../api';

export function generateSystem(seed: string, pack: RulePack, __opts: Partial<GenOptions> = {}, generationChoice?: string, empty: boolean = false, initialToytownFactor: number = 0): System {
  const rng = new SeededRNG(seed);
  
  // 1. Setup Stars
  const { nodes, systemRoot, systemName, isBinary, starA } = setupStars(seed, pack, rng, generationChoice);
  const starB = isBinary ? (nodes.find(n => n.id.endsWith('-star-b')) as CelestialBody) : undefined;

  const system_age_Gyr = randomFromRange(rng, 0.1, 10.0);

  // 2. Generate Planets
  generatePlanets(systemRoot, nodes, pack, rng, systemName, isBinary, starA, starB, empty);
  
  const system: System = {
      id: seed,
      name: systemName,
      seed: seed,
      epochT0: Date.now(),
      age_Gyr: system_age_Gyr,
      nodes: nodes,
      rulePackId: pack.id,
      rulePackVersion: pack.version,
      tags: [],
      toytownFactor: initialToytownFactor,
      visualScalingMultiplier: 0.5,
      isManuallyEdited: false,
  };
  
  // 3. Process Physics (The "Breath of Life" phase)
  return systemProcessor.process(system, pack);
}
