// src/lib/physics/gravity.ts
import type { CelestialBody, Barycenter } from '../types';
import { G } from '../constants';

export function findStrongestGravitationalHost(position: { x: number, y: number }, nodes: (CelestialBody | Barycenter)[], worldPositions: Map<string, { x: number, y: number }>): CelestialBody | Barycenter | null {
    let strongestHost: CelestialBody | Barycenter | null = null;
    let maxInfluence = 0;

    for (const node of nodes) {
        if (node.kind !== 'body' && node.kind !== 'barycenter') continue;

        const nodePosition = worldPositions.get(node.id);
        if (!nodePosition) continue;

        const dx = position.x - nodePosition.x;
        const dy = position.y - nodePosition.y;
        const distanceSq = dx * dx + dy * dy;

        if (distanceSq === 0) {
            // If the click is directly on a body, it's the host
            return node;
        }

        const mass = node.kind === 'barycenter' ? node.effectiveMassKg : (node as CelestialBody).massKg;
        if (!mass) continue;

        const influence = mass / distanceSq;

        if (influence > maxInfluence) {
            maxInfluence = influence;
            strongestHost = node;
        }
    }

    return strongestHost;
}
