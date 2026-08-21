// G16 - DOES THE ANCHOR REACH A PLAYER, AND WHAT DOES IT COST?
//
// In map-fixed mode a player whose copy is out of register is looking at a WRONG map - borders in
// the wrong place - rather than a slightly different one. So the anchor reaching the player window
// is a CORRECTNESS requirement, and this file pins it end to end: through the player redaction
// (TAG-9's single point) and out through the broadcast's own change gate and byte meter.
//
// IT ALSO CORRECTS A CLAIM IN THE BRIEF. The handoff said to meter `bc.SYNC_PRESET.bytes` with a
// 2 MB image. `SYNC_PRESET` carries `{ presetId, overrides }` and nothing else (broadcast.ts:107) -
// presets, their uploaded images and the map background all ride the CAMPAIGN, i.e. SYNC_STARMAP.
// So both are measured below and the test says which one actually moves.
import { describe, it, expect, beforeEach } from 'vitest';
import { computePlayerStarmapSnapshot } from '$lib/system/utils';
import { broadcastService } from '$lib/broadcast';
import { perfCounters } from '$lib/perfTrace';
import { resolveMapBackground, backgroundRectMap, mapPointToImageUV, backgroundPixelsPerUnit } from './mapBackground';
import type { MapBackground, Starmap } from '$lib/types';

const ANCHOR: MapBackground = {
  source: 'asset', assetId: 'asset-sector-map', attach: 'map',
  opacity: 0.8, sizePct: 100, widthUnits: 40, offsetX: 3, offsetY: -2, rotationDeg: 15
};

/** A campaign carrying a background image of roughly `mb` megabytes as a data URL. */
function campaign(mb = 0.001): Starmap {
  // A base64 payload of the requested size. The bytes are not a real PNG - nothing here decodes it,
  // and what is being measured is the WIRE COST, which is a function of length alone.
  const payload = 'A'.repeat(Math.max(1, Math.round(mb * 1024 * 1024)));
  return {
    id: 'map-1', name: 'Border Reach', distanceUnit: 'ly', unitIsPrefix: false,
    scale: { unit: 'ly', pixelsPerUnit: 10, showScaleBar: true },
    systems: [
      { id: 'sol', name: 'Sol', position: { x: 0, y: 0 }, system: { id: 'sol', nodes: [] } },
      { id: 'ac', name: 'Alpha Centauri', position: { x: 44, y: 12 }, system: { id: 'ac', nodes: [] } }
    ],
    routes: [],
    playerAssets: [
      { id: 'asset-sector-map', name: 'Sector map', dataUrl: `data:image/png;base64,${payload}`, w: 2048, h: 1280, credit: 'A Cartographer' }
    ],
    playerPresets: [],
    mapBackground: { ...ANCHOR }
  } as unknown as Starmap;
}

describe('G16: the anchor reaches the player window intact', () => {
  it('survives the player snapshot - the ONE redaction point every player surface reads (TAG-9)', () => {
    const snap = computePlayerStarmapSnapshot(campaign());
    expect(snap.mapBackground).toEqual(ANCHOR);
    expect(snap.playerAssets?.[0]?.id).toBe('asset-sector-map');
    expect(snap.playerAssets?.[0]?.credit).toBe('A Cartographer'); // the credit travels with the art
  });

  it('REGISTRATION PARITY: the GM and the player resolve one system to one image pixel', () => {
    const gm = campaign();
    const player = computePlayerStarmapSnapshot(gm);
    const uvOn = (map: Starmap) => {
      const r = resolveMapBackground(map, map.playerAssets ?? [])!;
      const rect = backgroundRectMap(r.bg, (r.naturalW ?? 1) / (r.naturalH ?? 1), backgroundPixelsPerUnit(map));
      const sys = (map.systems as any[]).find((s) => s.id === 'ac');
      return mapPointToImageUV(rect, sys.position.x, sys.position.y);
    };
    // The same system, the same point of the picture. This is the acceptance criterion, checked
    // without rendering anything - because neither side's answer involves a view transform.
    expect(uvOn(player)).toEqual(uvOn(gm));
  });

  it('a GM changing the anchor produces a DIFFERENT snapshot, so the change actually goes out', () => {
    const before = JSON.stringify(computePlayerStarmapSnapshot(campaign()).mapBackground);
    const moved = campaign();
    (moved as any).mapBackground.offsetX = 9;
    expect(JSON.stringify(computePlayerStarmapSnapshot(moved).mapBackground)).not.toBe(before);
  });
});

describe('G16: what the broadcast actually costs', () => {
  // The service is a singleton (there is one GM tab). Its change-gate state is cleared between
  // tests so each one measures a first send rather than inheriting the previous test's fingerprint.
  const bc = broadcastService as any;
  beforeEach(() => {
    for (const k of Object.keys(perfCounters)) delete perfCounters[k];
    bc.lastSentByType.clear();
    bc.lastSentAtByType.clear();
    for (const p of bc.pendingByType.values()) clearTimeout(p.timer);
    bc.pendingByType.clear();
  });

  it('SYNC_PRESET does NOT carry the image - it carries a preset id and the momentary overrides', () => {
    bc.sendIfChanged({ type: 'SYNC_PRESET', payload: { presetId: 'p1', overrides: {} } } as any);
    // Tens of bytes, not megabytes. The brief's "meter SYNC_PRESET with a 2 MB image" cannot be done
    // as written, because the image never goes down this message.
    expect(perfCounters['bc.SYNC_PRESET.bytes']).toBeLessThan(200);
  });

  it('SYNC_STARMAP is the message that carries it, and a 2 MB image costs about 2 MB', () => {
    const snap = computePlayerStarmapSnapshot(campaign(2));
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: snap } as any);
    const bytes = perfCounters['bc.SYNC_STARMAP.bytes'];
    // Reported rather than merely asserted: this is the figure the brief asked for.
    // eslint-disable-next-line no-console
    console.log(`G16 measured: bc.SYNC_STARMAP.bytes = ${bytes} with a 2 MB background image`);
    expect(bytes).toBeGreaterThan(2 * 1024 * 1024);
    // A data URL is base64 already, so the JSON adds only the quoting and the rest of the campaign.
    // If this ever fails high, something has started re-encoding the payload - which is the fault
    // DATA-M1 records for models and the reason a binary must not ride the node.
    expect(bytes).toBeLessThan(2.2 * 1024 * 1024);
  });

  it('AND THE GATE HOLDS: an unchanged campaign re-sends nothing, whatever the image weighs', () => {
    const snap = computePlayerStarmapSnapshot(campaign(2));
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: snap } as any);
    bc.sendIfChanged({ type: 'SYNC_STARMAP', payload: computePlayerStarmapSnapshot(campaign(2)) } as any);
    // `sendIfChanged` compares the stringified payload; the second call is suppressed. Without this
    // a 2 MB background would cross the wire on every reactive tick of the GM's stores.
    expect(perfCounters['bc.SYNC_STARMAP.sent']).toBe(1);
    expect(perfCounters['bc.SYNC_STARMAP.unchanged']).toBe(1);
  });
});
