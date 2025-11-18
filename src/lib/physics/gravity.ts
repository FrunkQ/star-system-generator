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

/**
 * Calculates the artificial gravity in G's from a spinning section.
 * @param radiusM - The radius of the spinning section in meters.
 * @param rpm - The rotation speed in revolutions per minute.
 * @returns The artificial gravity in G's.
 */
export function calculateArtificialGravity(radiusM: number, rpm: number): number {
  if (radiusM <= 0 || rpm <= 0) {
    return 0;
  }
  const omega = rpm * (2 * Math.PI) / 60; // Convert RPM to rad/s
  const acceleration = omega * omega * radiusM; // Centripetal acceleration in m/s^2
  const gForce = acceleration / 9.80665; // Convert to G's
  return gForce;
}

/**
 * Calculates the required RPM to achieve a target G-force at a given radius.
 * @param targetG - The desired G-force.
 * @param radiusM - The radius of the spinning section in meters.
 * @returns The required rotation speed in RPM.
 */
export function calculateRPMFromG(targetG: number, radiusM: number): number {
  if (radiusM <= 0 || targetG <= 0) {
    return 0;
  }
  const acceleration = targetG * 9.80665; // Convert G's to m/s^2
  const omega = Math.sqrt(acceleration / radiusM); // Angular velocity in rad/s
  const rpm = omega * 60 / (2 * Math.PI); // Convert rad/s to RPM
  return rpm;
}
