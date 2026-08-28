import { describe, it, expect } from 'vitest';
import { planRebase, applyRebase, lossesOf, type BaseMapManifestEntry } from './rebase';
import type { Starmap, StarSystemNode } from '$lib/types';

const MANIFEST: BaseMapManifestEntry = {
  id: 'starmap-local-neighbourhood',
  name: 'Local Neighbourhood',
  systemIds: ['sys-sol', 'sys-sirius', 'sys-tauceti']
};

function sys(id: string, name: string, x: number, y: number, z?: number, extra: Partial<StarSystemNode> = {}): StarSystemNode {
  return { id, name, position: z === undefined ? { x, y } : { x, y, z }, system: { id, name, nodes: [] } as any, ...extra };
}

function map(over: Partial<Starmap> = {}): Starmap {
  return {
    id: 'campaign', name: 'My Campaign', systems: [], routes: [],
    distanceUnit: 'ly', unitIsPrefix: false,
    scale: { unit: 'ly', pixelsPerUnit: 10, showScaleBar: true },
    ...over
  } as Starmap;
}

// The real edition-1 -> edition-2 shape: Sol is the fixed origin, the others move a long way and gain depth.
const OLD = () => map({
  systems: [sys('sys-sol', 'Sol', 400, 300), sys('sys-sirius', 'Sirius', 240, 200), sys('sys-tauceti', 'Tau Ceti', 100, 100)]
});
const NEW = () => map({
  id: 'starmap-local-neighbourhood', name: 'Local Neighbourhood', baseMapVersion: 2,
  systems: [sys('sys-sol', 'Sol', 400, 300, 0), sys('sys-sirius', 'Sirius', 330, 650, -107), sys('sys-tauceti', 'Tau Ceti', 846, 518, -142)]
});

describe('rebase — planning', () => {
  it('marks every base system for replacement', () => {
    const plan = planRebase(OLD(), NEW(), MANIFEST, 1);
    expect(plan.applicable).toBe(true);
    expect(plan.systems.filter((s) => s.kind === 'base-replaced')).toHaveLength(3);
  });

  it('anchors a custom system to its NEAREST base neighbour, not to the first or the origin', () => {
    const campaign = OLD();
    campaign.systems.push(sys('mine', 'Colony', 250, 210)); // right next to Sirius
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    const mine = plan.systems.find((s) => s.id === 'mine')!;
    expect(mine.kind).toBe('custom-moved');
    expect(mine.anchorId).toBe('sys-sirius');
    expect(mine.anchorName).toBe('Sirius');
  });

  it('reports how far a custom system travels, in the campaign unit', () => {
    const campaign = OLD();
    campaign.systems.push(sys('mine', 'Colony', 240, 200)); // on top of Sirius: travels exactly its delta
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    // Sirius moves (90, 450, -107) map units; /10 per ly.
    expect(plan.systems.find((s) => s.id === 'mine')!.movedBy).toBeCloseTo(Math.hypot(90, 450, -107) / 10, 6);
  });

  it('says NOT applicable when the campaign holds no base systems at all', () => {
    const plan = planRebase(map({ systems: [sys('mine', 'Colony', 0, 0)] }), NEW(), MANIFEST, null);
    expect(plan.applicable).toBe(false);
  });

  it('lists base systems the new edition adds as pure gain', () => {
    const campaign = map({ systems: [sys('sys-sol', 'Sol', 400, 300)] });
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    expect(plan.addedSystemNames).toEqual(['Sirius', 'Tau Ceti']);
  });

  it('keeps a base system the new edition dropped, rather than deleting the GM’s content', () => {
    const campaign = OLD();
    const base = { ...MANIFEST, systemIds: [...MANIFEST.systemIds, 'sys-gone'] };
    campaign.systems.push(sys('sys-gone', 'Retired Star', 500, 500));
    const plan = planRebase(campaign, NEW(), base, 1);
    expect(plan.orphanedSystemNames).toEqual(['Retired Star']);
    const out = applyRebase(campaign, NEW(), base, plan, 'new', 'New');
    expect(out.systems.find((s) => s.id === 'sys-gone')).toBeTruthy();
  });

  it('flags routes whose stored distance no longer matches, and leaves matching ones alone', () => {
    const campaign = OLD();
    campaign.routes = [
      { id: 'r1', sourceSystemId: 'sys-sol', targetSystemId: 'sys-sirius', distance: 1, unit: 'ly', lineStyle: 'solid' },
      { id: 'r2', sourceSystemId: 'sys-sol', targetSystemId: 'sys-tauceti', distance: 55.6, unit: 'ly', lineStyle: 'solid' }
    ];
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    expect(plan.routes.map((r) => r.id)).toContain('r1');
    const r1 = plan.routes.find((r) => r.id === 'r1')!;
    expect(r1.newDistance).toBeGreaterThan(r1.oldDistance);
  });

  it('warns about every consequence, and always closes by saying there is a way back', () => {
    const campaign = OLD();
    campaign.systems.push(sys('mine', 'Colony', 250, 210));
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    expect(plan.warnings.some((w) => w.includes('will move'))).toBe(true);
    expect(plan.warnings[plan.warnings.length - 1]).toContain('go back to it');
  });
});

describe('rebase — what a replacement loses', () => {
  it('names constructs the new edition does not have', () => {
    const node = sys('sys-sol', 'Sol', 400, 300);
    (node.system as any).nodes = [{ kind: 'construct', name: 'Rocinante' }];
    expect(lossesOf(node, sys('sys-sol', 'Sol', 0, 0)).join(' | ')).toContain('Rocinante');
  });

  // B88: THE SILENCE THAT MATTERED. A user's campaign held a Procyon he had populated with nineteen
  // generated bodies; the bundled replacement holds three, and NONE of his was a construct - so the
  // itemised loss list came back empty under a warning that said work would be dropped. Shape
  // synthesised from his file, which is never committed (see the user-test-files standing rule).
  it('names BODIES the new edition has no counterpart for', () => {
    const node = sys('sys-procyon', 'Procyon', 400, 300);
    (node.system as any).nodes = [
      { kind: 'body', name: 'Procyon' }, { kind: 'body', name: 'Procyon b' },
      { kind: 'body', name: 'Procyon c' }, { kind: 'body', name: 'Procyon c I' },
      { kind: 'body', name: 'Procyon d' }, { kind: 'body', name: 'Procyon e' }
    ];
    const rep = sys('sys-procyon', 'Procyon', 0, 0);
    (rep.system as any).nodes = [{ kind: 'body', name: 'Procyon' }];
    const said = lossesOf(node, rep).join(' | ');
    expect(said).toContain('5 bodies');          // every one the replacement lacks, counted
    expect(said).toContain('Procyon b');          // and named, up to the cap
    expect(said).not.toContain('Procyon |');      // the one it DOES keep is not claimed as a loss
  });

  it('says nothing when the new edition carries every body by name', () => {
    const node = sys('sys-sol', 'Sol', 400, 300);
    (node.system as any).nodes = [{ kind: 'body', name: 'Earth' }, { kind: 'body', name: 'Mars' }];
    const rep = sys('sys-sol', 'Sol', 0, 0);
    (rep.system as any).nodes = [{ kind: 'body', name: 'Earth' }, { kind: 'body', name: 'Mars' }];
    expect(lossesOf(node, rep)).toEqual([]);
  });

  it('does NOT claim a construct the new edition also ships', () => {
    // The bug this pins: the ISS and Tiangong Station are bundled with the map, and the first version of
    // this reported them as the GM's own work.
    const node = sys('sys-sol', 'Sol', 400, 300);
    (node.system as any).nodes = [{ kind: 'construct', name: 'International Space Station' }];
    const rep = sys('sys-sol', 'Sol', 0, 0);
    (rep.system as any).nodes = [{ kind: 'construct', name: 'International Space Station' }];
    expect(lossesOf(node, rep)).toEqual([]);
  });

  it('reports a name change only when the GM pinned the name', () => {
    // The rebuild renamed "Alpha Centauri System" to "Alpha Centauri". That is not the GM's doing.
    const drifted = sys('sys-alphacen', 'Alpha Centauri System', 0, 0);
    expect(lossesOf(drifted, sys('sys-alphacen', 'Alpha Centauri', 0, 0))).toEqual([]);
    const pinned = sys('sys-alphacen', 'Rigel Colony', 0, 0, undefined, { isNameUserDefined: true });
    expect(lossesOf(pinned, sys('sys-alphacen', 'Alpha Centauri', 0, 0)).join(' ')).toContain('Rigel Colony');
  });

  it('reports GM notes', () => {
    const node = sys('sys-sol', 'Sol', 400, 300);
    (node.system as any).gmNotes = 'secret';
    expect(lossesOf(node, sys('sys-sol', 'Sol', 0, 0)).join(' ')).toContain('GM notes');
  });

  it('says nothing for a base system that loses nothing', () => {
    expect(lossesOf(sys('sys-sol', 'Sol', 400, 300), sys('sys-sol', 'Sol', 0, 0))).toEqual([]);
  });

  it('surfaces losses in the plan warnings so they can be put back', () => {
    const campaign = OLD();
    (campaign.systems[0].system as any).nodes = [{ kind: 'construct', name: 'Rocinante' }];
    const plan = planRebase(campaign, NEW(), MANIFEST, 1);
    expect(plan.warnings.some((w) => w.includes('Rocinante'))).toBe(true);
  });
});

describe('rebase — applying', () => {
  it('never mutates the campaign it is given', () => {
    const campaign = OLD();
    campaign.systems.push(sys('mine', 'Colony', 250, 210));
    const before = JSON.stringify(campaign);
    applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'new-id', 'Upgraded');
    expect(JSON.stringify(campaign)).toBe(before);
  });

  it('produces a NEW campaign id and name, so the original stays available', () => {
    const campaign = OLD();
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'new-id', 'Upgraded');
    expect(out.id).toBe('new-id');
    expect(out.name).toBe('Upgraded');
    expect(campaign.id).toBe('campaign');
  });

  it('moves base systems to their new positions, depth included', () => {
    const out = applyRebase(OLD(), NEW(), MANIFEST, planRebase(OLD(), NEW(), MANIFEST, 1), 'n', 'N');
    const sirius = out.systems.find((s) => s.id === 'sys-sirius')!;
    expect(sirius.position).toEqual({ x: 330, y: 650, z: -107 });
  });

  it('translates a custom system by its anchor’s displacement, preserving the offset exactly', () => {
    const campaign = OLD();
    campaign.systems.push(sys('mine', 'Colony', 250, 210)); // (+10, +10) from Sirius
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'n', 'N');
    const mine = out.systems.find((s) => s.id === 'mine')!;
    expect(mine.position).toEqual({ x: 340, y: 660, z: -107 });
    // The whole point: still 10,10 from Sirius, so "just off Sirius" survives.
    const sirius = out.systems.find((s) => s.id === 'sys-sirius')!;
    expect(mine.position.x - sirius.position.x).toBe(10);
    expect(mine.position.y - sirius.position.y).toBe(10);
  });

  it('keeps the GM’s viewport and clock on a replaced base system, but takes the new system data', () => {
    const campaign = OLD();
    campaign.systems[1] = sys('sys-sirius', 'Sirius', 240, 200, undefined, {
      viewport: { pan: { x: 5, y: 6 }, zoom: 2 }, time: { displayTimeSec: '123' }
    });
    (campaign.systems[1].system as any).nodes = [{ kind: 'body', id: 'stale' }];
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'n', 'N');
    const sirius = out.systems.find((s) => s.id === 'sys-sirius')!;
    expect(sirius.viewport).toEqual({ pan: { x: 5, y: 6 }, zoom: 2 });
    expect(sirius.time).toEqual({ displayTimeSec: '123' });
    expect((sirius.system as any).nodes).toEqual([]); // the new edition's data, not the stale copy
  });

  it('adds the base systems the campaign was missing', () => {
    const campaign = map({ systems: [sys('sys-sol', 'Sol', 400, 300)] });
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'n', 'N');
    expect(out.systems.map((s) => s.id).sort()).toEqual(['sys-sirius', 'sys-sol', 'sys-tauceti']);
  });

  it('re-measures routes against the final positions', () => {
    const campaign = OLD();
    campaign.routes = [{ id: 'r1', sourceSystemId: 'sys-sol', targetSystemId: 'sys-sirius', distance: 1, unit: 'ly', lineStyle: 'solid' }];
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'n', 'N');
    // Sol (400,300,0) -> Sirius (330,650,-107), /10 per ly.
    expect(out.routes[0].distance).toBeCloseTo(Math.hypot(70, 350, 107) / 10, 6);
  });

  it('honours a campaign that ignores depth when re-measuring', () => {
    const campaign = OLD();
    campaign.ignoreZForDistances = true;
    campaign.routes = [{ id: 'r1', sourceSystemId: 'sys-sol', targetSystemId: 'sys-sirius', distance: 1, unit: 'ly', lineStyle: 'solid' }];
    const out = applyRebase(campaign, NEW(), MANIFEST, planRebase(campaign, NEW(), MANIFEST, 1), 'n', 'N');
    expect(out.routes[0].distance).toBeCloseTo(Math.hypot(70, 350) / 10, 6);
  });

  it('stamps the rebased campaign with the new edition, so it is never offered the same upgrade twice', () => {
    const out = applyRebase(OLD(), NEW(), MANIFEST, planRebase(OLD(), NEW(), MANIFEST, 1), 'n', 'N');
    expect(out.baseMapVersion).toBe(2);
  });
});
