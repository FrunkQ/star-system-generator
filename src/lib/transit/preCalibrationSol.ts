/**
 * THE SOL THOSE RECORDED JOURNEYS WERE FLOWN IN.
 *
 * Several transit specs carry a journey captured verbatim from a real save - start states, end
 * states, path points and all - and then read the DESTINATION out of the bundled
 * `Sol_Expanse-System.json`. That works only while the bundled map's planets stay where they were
 * when the journey was recorded.
 *
 * G62 part 2 calibrated those planets to real ephemeris at the 2026-09-01T12:00:00Z datum, and the
 * pairing broke immediately: a recorded transfer to Earth missed by 300,000,000 km, because the
 * journey was flown to where Earth used to be. The journey was not wrong and the map was not wrong;
 * the test was reading one fact from each.
 *
 * So a spec that pins a RECORDED journey restores the orbits it was recorded against. It is testing
 * the scheduler and the planner, not the contents of a bundled map - and a bundled map is content,
 * which is free to change. The same discipline the board already states for real user files: derive
 * a fixture, pin the fixture.
 *
 * Do NOT use this to make a new test pass. A new test should use the calibrated map, or a synthetic
 * system of its own.
 */
import fixture from '../../../tests/fixtures/sol-pre-calibration-orbits.json';

type Elements = {
  a_AU: number; e: number; i_deg: number; omega_deg: number; Omega_deg: number; M0_rad: number;
};

/** The epoch every orbit in the fixture is expressed against. */
export const PRE_CALIBRATION_T0: number = (fixture as any)._datum;

/**
 * Put the pre-calibration orbits back on a system loaded from a bundled file, in place, and return
 * it. Bodies the fixture does not name are untouched; a calibrated body's stored `n_rad_per_s` is
 * removed, because that arrived WITH the calibration and would otherwise drive the old elements at
 * the new rate.
 */
export function restorePreCalibrationOrbits<T extends { nodes?: any[] }>(system: T): T {
  const orbits = (fixture as any).orbits as Record<string, Elements>;
  for (const node of system.nodes ?? []) {
    const el = orbits[String(node?.name ?? '')];
    if (!el || !node.orbit) continue;
    node.orbit.elements = { ...el };
    node.orbit.t0 = PRE_CALIBRATION_T0;
    delete node.orbit.n_rad_per_s;
  }
  return system;
}
