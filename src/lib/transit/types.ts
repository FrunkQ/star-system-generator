import type { ID } from '../types';

export interface Vector2 {
  x: number;
  y: number;
}

export interface StateVector {
  r: Vector2; // Position in AU
  v: Vector2; // Velocity in AU/s (or km/s, need to standardize. Let's use AU/day for internal math, convert for display)
}

export type TransitMode = 'Fast' | 'Economy';

export interface BurnPoint {
  id: ID;
  time: number; // Unix timestamp
  position: Vector2; // In System Coordinates (AU)
  deltaV_ms: number; // Magnitude of burn in m/s
  type: 'Departure' | 'Arrival' | 'MidCourse' | 'Brake';
}

export interface TransitSegment {
  id: ID;
  type: 'Coast' | 'Accel' | 'Brake';
  startTime: number;
  endTime: number;
  startState: StateVector; // Relative to system center (Star) usually
  endState: StateVector;
  hostId: ID; // The body this segment is relative to (usually Star, but could be Planet if inside SOI)
  pathPoints: Vector2[]; // Pre-calculated points for visualization
  warnings: string[]; // "High G", "Radiation", "Fuel Low"
  fuelUsed_kg: number;
}

export interface TransitPlan {
  id: ID;
  originId: ID;
  targetId: ID;
  startTime: number;
  mode: TransitMode;
  segments: TransitSegment[];
  burns: BurnPoint[];
  totalDeltaV_ms: number;
  totalTime_days: number;
  totalFuel_kg: number;
  aerobrakingDeltaV_ms?: number; // Delta-V saved by aerobraking
  arrivalVelocity_ms: number; // Relative velocity at arrival (0 if braked)
  distance_au: number;
  isValid: boolean;
  error?: string;
  
  // User Parameters
  maxG: number;
  accelRatio: number; 
  brakeRatio: number;
  interceptSpeed_ms: number; // 0 for dock
  arrivalPlacement?: string; // 'l4', 'l5', 'lo', 'mo', 'ho', 'geo', 'surface'
  tags?: string[];
  planType?: 'Efficiency' | 'Speed' | 'Assist' | 'Complex';
  name?: string;
  hiddenReason?: string;
  isKinematic?: boolean; // True if path points are pre-scaled for kinematic, bypasses visualizer scaling
  initialDelay_days?: number; // Delay before this leg starts
}
