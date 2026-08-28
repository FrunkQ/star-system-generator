// G53 phase 1: the §3.3 truth table, held as a gate. The whole point of chrome.ts is that this
// table has exactly ONE implementation — these tests pin what it says, row by row, plus the
// backwards-compatibility row the acceptance demands: both flags absent means today's behaviour
// exactly, everywhere.
import { describe, it, expect } from 'vitest';
import { showsAsConstruct, isArtificial } from './chrome';

describe('chrome predicates — the §3.3 table', () => {
  it('a hybrid megastructure (body + chrome + artificial) shows as a construct and is artificial', () => {
    const deathStar = { kind: 'body' as const, constructChrome: true as const, artificial: true as const };
    expect(showsAsConstruct(deathStar)).toBe(true);
    expect(isArtificial(deathStar)).toBe(true);
  });

  it('an asteroid-as-place (body + chrome, natural) shows as a construct but is NOT artificial', () => {
    const rock = { kind: 'body' as const, constructChrome: true as const };
    expect(showsAsConstruct(rock)).toBe(true);
    expect(isArtificial(rock)).toBe(false); // a real rock — its composition is DERIVED, not declared
  });

  it('an ordinary construct still shows as a construct (an unmigrated site and a migrated one agree)', () => {
    const station = { kind: 'construct' as const };
    expect(showsAsConstruct(station)).toBe(true);
    // showsAsConstruct must give the same answer as the legacy test at every existing site.
    expect(showsAsConstruct(station)).toBe(station.kind === 'construct');
  });

  it('a plain body with both flags absent behaves exactly as today: no chrome, not artificial', () => {
    const planet = { kind: 'body' as const };
    expect(showsAsConstruct(planet)).toBe(false);
    expect(isArtificial(planet)).toBe(false);
  });

  it('the flags are read strictly — a truthy-but-not-true value is not a flag', () => {
    // Saves are hand-editable JSON; only literal `true` may switch chrome on.
    expect(showsAsConstruct({ kind: 'body', constructChrome: 1 as unknown as true })).toBe(false);
    expect(isArtificial({ kind: 'body', artificial: 'yes' as unknown as true })).toBe(false);
  });
});
