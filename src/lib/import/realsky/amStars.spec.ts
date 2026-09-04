// B116: SIRIUS IS AN Am STAR, AND THE PARSER MUST READ THE NOTATION RATHER THAN CHOKE ON IT.
//
// SIMBAD gives Sirius A as `A0mA1Va`. That is the condensed metallic-line notation: the calcium K
// line reads as an A0 star, the metallic lines as A1, and `Va` is the main-sequence class with its
// `a` sub-division. The previous parser stopped at `A0`, lost the luminosity class because `mA1`
// interrupted it, and the class builder then emitted the RAW STRING as a third class
// (`star/A0`, `star/A`, `star/A0mA1Va`) — a class key nothing has ever defined. The owner:
// "if we have this info I guess we SHOULD be using it better" — so the peculiarity is PARSED and
// KEPT (kLineType, metallicType, hydrogenType, peculiarity), the temperature type follows the
// hydrogen lines when stated and the midpoint of the K-line and metallic types when not, and the
// class keys stay canonical.
import { describe, it, expect } from 'vitest';
import { parseStellarType, formatStellarType, luminosityClassOf, starClasses } from './stars.mjs';

describe('B116: Am/Ap notation and MK sub-divisions', () => {
  it('Sirius A, condensed `A0mA1Va`: temperature type A1, class V, peculiarity recorded, nothing lost', () => {
    const t = parseStellarType('A0mA1Va') as any;
    expect(t.spectral).toBe('A');
    expect(t.subclass).toBe(1);            // midpoint of K-line A0 and metallic A1, rounded up
    expect(t.luminosity).toBe('V');        // canonical, so class KEYS stay strict-valid
    expect(t.band).toBe('V');
    expect(t.luminositySub).toBe('a');     // the `a` of `Va`, kept
    expect(t.peculiarity).toContain('m');
    expect(t.kLineType).toBe('A0');
    expect(t.metallicType).toBe('A1');
  });

  it('the full component form `kA0hA1mA1Va`: the hydrogen type is the temperature type', () => {
    const t = parseStellarType('kA0hA1mA1Va') as any;
    expect(t.spectral).toBe('A');
    expect(t.subclass).toBe(1);
    expect(t.hydrogenType).toBe('A1');
    expect(t.kLineType).toBe('A0');
    expect(t.metallicType).toBe('A1');
    expect(t.band).toBe('V');
  });

  it('a classic Am star `A1mF0IV` lands between its two types and keeps the subgiant class', () => {
    const t = parseStellarType('A1mF0IV') as any;
    expect(t.spectral).toBe('A');
    expect(t.luminosity).toBe('IV');
    expect(t.peculiarity).toContain('m');
    // A1 = 21, F0 = 30 on the OBAFGKM ladder -> 25.5 -> 26 -> A6
    expect(t.subclass).toBe(6);
  });

  it('`Va` / `Vb` sub-divisions no longer drop the luminosity class', () => {
    expect(luminosityClassOf('A1Va')).toBe('V');
    expect(luminosityClassOf('A0mA1Va')).toBe('V');
    expect((parseStellarType('G2Vb') as any).luminositySub).toBe('b');
  });

  it('annotation suffixes are kept as peculiarity codes, not lost and not mistaken for class', () => {
    expect((parseStellarType('B9.5Vn') as any).peculiarity).toContain('n');
    expect(luminosityClassOf('B9.5Vn')).toBe('V');
    expect((parseStellarType('F0IVp') as any).peculiarity).toContain('p');
    expect((parseStellarType('G8IIIe') as any).peculiarity).toContain('e');
    expect(luminosityClassOf('G8IIIe')).toBe('III');
  });

  it('THE RAW STRING IS NEVER A CLASS: Sirius classes are canonical, most specific first', () => {
    const c = starClasses('A0mA1Va').classes;
    expect(c).toEqual(['star/A1V', 'star/A']);
    expect(c.some((k: string) => /m/.test(k.replace(/^star\//, '')))).toBe(false);
  });

  it('the designation round-trips canonically: format(parse) states the same type, and is idempotent', () => {
    expect(formatStellarType(parseStellarType('A0mA1Va'))).toBe('A1V');
    const once = parseStellarType('A0mA1Va');
    const twice = parseStellarType(formatStellarType(once));
    expect(twice.spectral).toBe(once.spectral);
    expect(twice.subclass).toBe(once.subclass);
    expect(twice.band).toBe(once.band);
  });

  it('plain types are untouched by the new grammar', () => {
    expect(parseStellarType('G2V')).toMatchObject({ spectral: 'G', subclass: 2, luminosity: 'V', band: 'V' });
    expect(parseStellarType('M1.5Iab+B2Vn')).toMatchObject({ spectral: 'M', subclass: 1.5, luminosity: 'Iab', band: 'I', companion: 'B2Vn' });
    expect(starClasses('G2V').classes).toEqual(['star/G2V', 'star/G']);
  });
});
