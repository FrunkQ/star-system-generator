// The single-body PORTRAIT system behind the info block's 3D body graphic (A46): the subject
// wrapped in a synthetic invisible root barycentre, with its rings along for the ride. ONE
// builder because DocPanel and FilteredDocumentView carried two character-identical copies -
// the two could have answered "what system frames the portrait" differently the day one was
// edited alone, which is the duplication rule's whole warning.
//
// Why the synthetic root: the holo treats a root-level `kind:'body'` (parentId null) as the
// system's STAR (self-emissive + corona), so a lone planet would render as a glowing ball -
// parenting it to a barycentre keeps it classified as a planet, while a star subject still
// reads as a star via its own roleHint. No orbit -> the subject sits at the origin and the
// holo's portrait key light (coloured by the real star, passed separately) does the lighting.
import type { System } from '$lib/types';

export function buildPortraitSystem(subject: any, system: System | null): System | null {
  if (!subject) return null;
  const root = { id: '__root', name: '', kind: 'barycenter', parentId: null, orbit: undefined };
  const bodyNode = { ...subject, parentId: '__root', orbit: undefined };
  const rings = (system?.nodes ?? [])
    .filter((n: any) => (n.parentId === subject.id || n.orbit?.hostId === subject.id) && n.roleHint === 'ring')
    .map((r: any) => ({ ...r, parentId: subject.id }));
  return {
    id: 'bg', name: '', seed: 'bg', epochT0: 0, age_Gyr: (system as any)?.age_Gyr ?? 4.5,
    nodes: [root, bodyNode, ...rings], rulePackId: '', rulePackVersion: '', tags: []
  } as any;
}
