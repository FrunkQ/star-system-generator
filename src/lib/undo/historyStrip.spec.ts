// THE UNDO HISTORY NEVER LEAVES THIS BROWSER. Four outbound paths, one strip, and a test on each -
// because the failure mode is silent: a GM sends a campaign to another GM, or the project ships a
// bundled example starmap, and the file contains a record of everything its author deleted.
//
// These were written while the history was still memory-only, deliberately: the day it WAS
// persisted (v2.1.781, `campaignHistory.ts`) every path was already closed and pinned. They now
// guard a key that really is in the autosave - `campaignHistory.spec.ts` proves the same two
// promises again with a REAL persisted history rather than a hand-built one.
import { describe, it, expect } from 'vitest';
import { loadStarterPack } from '$lib/import/realsky/testPack';
import { systemProcessor } from '$lib/core/SystemProcessor';
import { fixUpImportedSystem, stripSystemForExport, stripStarmapForExport } from '$lib/system/importFixup';
import { computePlayerSnapshot, computePlayerStarmapSnapshot } from '$lib/system/utils';
import { UNDO_HISTORY_KEY, stripUndoHistory } from './historyKey';
import type { System } from '$lib/types';

const pack = loadStarterPack();

/** A GM's secret, of the kind an undo log is made of. */
const SECRET = 'the ambassador is a construct';

function systemWithHistory(): System {
  const sys: any = {
    id: 'sol', name: 'Sol', seed: '1', epochT0: 0, age_Gyr: 4.6,
    rulePackId: 'starter-sf', rulePackVersion: '1.0.0', tags: [],
    nodes: [
      { id: 'star', kind: 'body', roleHint: 'star', name: 'Sol', massKg: 1.989e30, radiusKm: 696340, temperatureK: 5772 },
      { id: 'earth', kind: 'body', roleHint: 'planet', name: 'Earth', parentId: 'star', massKg: 5.972e24, radiusKm: 6371,
        orbit: { hostId: 'star', elements: { a_AU: 1, e: 0, i_deg: 0, raan_deg: 0, argp_deg: 0, M0_deg: 0 } } }
    ]
  };
  sys[UNDO_HISTORY_KEY] = [{ at: 1, authored: { gmNotes: SECRET } }];
  return sys as System;
}

function starmapWithHistory(): any {
  const map: any = {
    id: 'map-1', name: 'Local Neighbourhood',
    systems: [{ id: 'node-1', name: 'Sol', position: { x: 0, y: 0 }, system: systemWithHistory() }]
  };
  map[UNDO_HISTORY_KEY] = [{ at: 2, authored: { gmNotes: SECRET } }];
  map.systems[0][UNDO_HISTORY_KEY] = [{ at: 3, authored: { name: SECRET } }];
  return map;
}

describe('stripUndoHistory', () => {
  it('removes the key from a system, a starmap, and each system node', () => {
    const map = starmapWithHistory();
    stripUndoHistory(map);
    expect(JSON.stringify(map)).not.toContain(SECRET);
    expect(JSON.stringify(map)).not.toContain(UNDO_HISTORY_KEY);
  });

  it('survives rubbish rather than throwing on it', () => {
    expect(() => stripUndoHistory(null)).not.toThrow();
    expect(() => stripUndoHistory(undefined)).not.toThrow();
    expect(() => stripUndoHistory('a string' as any)).not.toThrow();
    expect(() => stripUndoHistory({ systems: [null, 3, { system: null }] } as any)).not.toThrow();
  });
});

describe('the export paths', () => {
  it('a SINGLE-SYSTEM save carries no history (SystemView "Save system")', () => {
    const out = stripSystemForExport(systemWithHistory(), pack);
    expect((out as any)[UNDO_HISTORY_KEY]).toBeUndefined();
    expect(JSON.stringify(out)).not.toContain(SECRET);
  });

  it('a CAMPAIGN save carries none either, at the map level or on any system', () => {
    const out = stripStarmapForExport(starmapWithHistory(), pack);
    expect(JSON.stringify(out)).not.toContain(SECRET);
    expect(JSON.stringify(out)).not.toContain(UNDO_HISTORY_KEY);
  });

  it('leaves the ORIGINAL untouched - the strip works on a clone', () => {
    const map = starmapWithHistory();
    stripStarmapForExport(map, pack);
    expect(map[UNDO_HISTORY_KEY]).toBeTruthy();
  });
});

describe('the broadcast path (TAG-9: redaction happens at exactly one point)', () => {
  it('the player system snapshot carries no history', () => {
    const snap = computePlayerSnapshot(systemWithHistory());
    expect((snap as any)[UNDO_HISTORY_KEY]).toBeUndefined();
    expect(JSON.stringify(snap)).not.toContain(SECRET);
  });

  it('the whole-campaign player snapshot carries none at any level', () => {
    const snap = computePlayerStarmapSnapshot(starmapWithHistory());
    expect(JSON.stringify(snap)).not.toContain(SECRET);
    expect(JSON.stringify(snap)).not.toContain(UNDO_HISTORY_KEY);
  });
});

describe('a save that DID contain a history', () => {
  it('loads and re-derives without crashing, and sheds the history on the way out', () => {
    const loaded = systemProcessor.process(fixUpImportedSystem(systemWithHistory(), pack), pack);
    expect(loaded.nodes.length).toBe(2);
    // Whether the fix-up kept the unknown key or not, the next save must not carry it.
    const saved = stripSystemForExport(loaded, pack);
    expect(JSON.stringify(saved)).not.toContain(SECRET);
  });
});
