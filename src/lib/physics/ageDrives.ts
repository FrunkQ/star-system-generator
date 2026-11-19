// WHAT A BODY'S AGE ACTUALLY DRIVES, said by asking the models themselves (G94 job 3, G96).
//
// The Age control has to say underneath what it moves, the way the other derived readings on that
// panel do - and a sentence like that is a second statement of what the processor reads, which is
// exactly the kind of copy that drifts. So nothing here is a list of body kinds: each line asks the
// model it describes whether age changes its answer for THIS body. `system/ageDrives.test.ts` then
// holds the sentence to the processor - for every body in a test system, what this claims is what
// moves when the age moves, and nothing it does not claim moves at all.
//
// A body whose age drives nothing is told so. That is the honest answer for an ordinary rocky world
// today, and a control that implied otherwise would be the fault B150 was.
import type { CelestialBody, RulePack } from '$lib/types';
import { brownDwarfThermal } from './substellar';
import { estimateInternalHeatK } from './temperature';
import { flareActivity } from './stellar-evolution';

export type AgeDriven = 'cooling-track' | 'internal-heat' | 'atmospheric-escape' | 'flare-activity';

/** Two ages far enough apart that any model which reads age at all gives two answers. */
const YOUNG_GYR = 0.1;
const OLD_GYR = 10;

/** Which of this body's figures follow its age, in the order the panel reads them. */
export function ageDriven(body: CelestialBody | null | undefined, pack?: RulePack | null): AgeDriven[] {
  if (!body || body.kind !== 'body') return [];
  const out: AgeDriven[] = [];
  if (brownDwarfThermal(body.massKg || 0, 1, body.radiusKm || 0).isSubstellar) out.push('cooling-track');
  if (estimateInternalHeatK(body, pack ?? undefined, YOUNG_GYR) !== estimateInternalHeatK(body, pack ?? undefined, OLD_GYR)) {
    out.push('internal-heat');
  }
  if ((body.roleHint === 'planet' || body.roleHint === 'moon') && body.evolveAtmosphere) out.push('atmospheric-escape');
  if (body.roleHint === 'star') {
    const edd = (body as { accretionEddington?: number }).accretionEddington;
    if (flareActivity(body.classes?.[0], YOUNG_GYR, edd) !== flareActivity(body.classes?.[0], OLD_GYR, edd)) out.push('flare-activity');
  }
  return out;
}

const PHRASE: Record<AgeDriven, string> = {
  'cooling-track': 'its temperature and brightness (a brown dwarf does not fuse, so it only cools)',
  'internal-heat': 'the heat still left over from its formation',
  'atmospheric-escape': 'how much of its air it has lost',
  'flare-activity': 'how hard it flares'
};

/** The one sentence under an Age control. */
export function ageDrivesSentence(body: CelestialBody | null | undefined, pack?: RulePack | null): string {
  const parts = ageDriven(body, pack).map((d) => PHRASE[d]);
  if (parts.length === 0) {
    return 'Nothing this body shows is worked out from its age yet. It is recorded all the same, as part of its history.';
  }
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `Drives ${list}.`;
}

/** Ages are read in Gyr and said in whichever of Gyr, Myr or kyr a person would say. */
export function formatAgeGyr(v: number): string {
  if (!Number.isFinite(v)) return '-';
  if (v >= 1) return `${Number(v.toFixed(v < 10 ? 2 : 1))} Gyr`;
  if (v >= 0.001) return `${Number((v * 1000).toFixed(v < 0.01 ? 1 : 0))} Myr`;
  return `${Number((v * 1e6).toFixed(0))} kyr`;
}
