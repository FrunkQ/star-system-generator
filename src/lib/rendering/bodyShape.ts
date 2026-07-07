// Oblate rendering. A rotating body is flattened along its spin axis by f = body.oblateness (E4). For
// the schematic top-down views (orrery, report, guide) we draw it as an ellipse: the equatorial radius
// stays = r and the polar radius = r · (1 − f), squashed along screen-Y so the flattening reads. This
// helper returns that polar factor (1 = sphere, → 0.05 as a body approaches break-up).
export function oblatePolarFactor(oblateness: number | undefined): number {
  return 1 - Math.max(0, Math.min(0.95, oblateness || 0));
}
