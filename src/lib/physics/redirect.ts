// Δv to redirect a coasting ship onto a new heading — the honest vector cost of replotting a course
// while you still carry momentum. Decompose the current velocity relative to the new target direction:
//   - the component already pointing AT the target is a free head-start (keep it),
//   - the sideways (perpendicular) component must be cancelled,
//   - any backward component (pointing away from the target) must also be cancelled.
// So a new course along your current drift costs ~nothing; reversing costs your whole speed. Same units
// in and out (feed m/s, get m/s).
export function redirectDeltaV(vCurrent: [number, number], toTarget: [number, number]): number {
  const tmag = Math.hypot(toTarget[0], toTarget[1]);
  const vmag = Math.hypot(vCurrent[0], vCurrent[1]);
  if (vmag === 0) return 0;
  if (tmag === 0) return vmag; // no heading → must kill all of it
  const ux = toTarget[0] / tmag, uy = toTarget[1] / tmag;
  const along = vCurrent[0] * ux + vCurrent[1] * uy; // signed: + toward target
  const perpX = vCurrent[0] - along * ux, perpY = vCurrent[1] - along * uy;
  const perp = Math.hypot(perpX, perpY);
  const back = along < 0 ? -along : 0; // backward component to cancel
  return Math.hypot(perp, back);
}

// How far off the new heading the current drift points, in degrees (0 = dead on, 180 = straight back).
// Purely for the UI readout that guides the player to the cheap choice.
export function headingOffsetDeg(vCurrent: [number, number], toTarget: [number, number]): number {
  const vmag = Math.hypot(vCurrent[0], vCurrent[1]);
  const tmag = Math.hypot(toTarget[0], toTarget[1]);
  if (vmag === 0 || tmag === 0) return 0;
  const cos = (vCurrent[0] * toTarget[0] + vCurrent[1] * toTarget[1]) / (vmag * tmag);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}
