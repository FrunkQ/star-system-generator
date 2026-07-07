import { derived } from 'svelte/store';
import { starmapStore } from '$lib/starmapStore';
import { systemStore } from '$lib/stores';

// The GM's own CUSTOM tags used ANYWHERE in the loaded starmap — a shared vocabulary, so a tag added on a
// body/construct in one system is a one-click option in EVERY other system (PoI/CoI packs are already
// starmap-wide; this closes the gap for free-form manual tags). Derived live, no storage: a tag is offered
// while at least one body or construct still carries it (manual:true) and drops off when nothing does.
// Sources both the whole starmap AND the currently-open system, so a tag just added in the open system
// shows up immediately (before it's committed back to the starmap).
export interface CustomTagEntry { key: string; count: number; }

export const customTagVocabulary = derived([starmapStore, systemStore], ([$sm, $sys]): CustomTagEntry[] => {
  const counts = new Map<string, number>();
  const scan = (nodes: any[] | undefined) => {
    for (const b of (nodes ?? [])) {
      for (const t of (b?.tags ?? [])) {
        if (t?.manual === true && typeof t.key === 'string' && t.key.trim()) {
          counts.set(t.key, (counts.get(t.key) ?? 0) + 1);
        }
      }
    }
  };
  if ($sm) for (const node of (($sm as any).systems ?? [])) scan(node?.system?.nodes);
  if ($sys) scan(($sys as any).nodes);
  return [...counts.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
});
