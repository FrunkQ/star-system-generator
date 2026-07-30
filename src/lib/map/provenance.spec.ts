import { describe, it, expect } from 'vitest';
import { stampForSave, baseMapEdition, isBaseMapOutdated, CURRENT_BASE_MAP_VERSION } from './provenance';
import { APP_VERSION } from '$lib/constants';

describe('starmap provenance', () => {
  it('stamps the build that saved the file', () => {
    expect(stampForSave({}).appVersion).toBe(APP_VERSION);
  });

  it('overwrites a stamp from an older build, because the stamp is who saved it LAST', () => {
    expect(stampForSave({ appVersion: '2.0.1-beta' }).appVersion).toBe(APP_VERSION);
  });

  it('does not mutate the live campaign it stamps', () => {
    const live = { appVersion: undefined as string | undefined, baseMapVersion: 2 };
    const out = stampForSave(live);
    expect(live.appVersion).toBeUndefined();
    expect(out).not.toBe(live);
  });

  it('carries baseMapVersion through untouched, and never invents one', () => {
    expect(stampForSave({ baseMapVersion: 2 }).baseMapVersion).toBe(2);
    expect(stampForSave({}).baseMapVersion).toBeUndefined();
  });
});

describe('starmap provenance — inferring the base edition of unstamped files', () => {
  it('trusts an explicit baseMapVersion', () => {
    expect(baseMapEdition({ baseMapVersion: 2 }, true)).toBe(2);
    // Even against a map whose base systems have since been deleted — the stamp is the record.
    expect(baseMapEdition({ baseMapVersion: 1 }, false)).toBe(1);
  });

  it('reads an unstamped map that still holds base systems as edition 1', () => {
    expect(baseMapEdition({}, true)).toBe(1);
  });

  it('reports NO base for a map the GM built themselves, rather than guessing edition 1', () => {
    expect(baseMapEdition({}, false)).toBeNull();
    expect(isBaseMapOutdated({}, false)).toBe(false);
  });

  it('flags an older edition as outdated and the current one as not', () => {
    expect(isBaseMapOutdated({}, true)).toBe(true);
    expect(isBaseMapOutdated({ baseMapVersion: CURRENT_BASE_MAP_VERSION }, true)).toBe(false);
  });

  it('never flags a base edition NEWER than this build ships — that is a downgrade, not an upgrade', () => {
    expect(isBaseMapOutdated({ baseMapVersion: CURRENT_BASE_MAP_VERSION + 1 }, true)).toBe(false);
  });

  it('ignores a nonsense baseMapVersion instead of trusting it', () => {
    expect(baseMapEdition({ baseMapVersion: NaN }, true)).toBe(1);
  });
});
