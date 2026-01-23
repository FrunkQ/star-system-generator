import { describe, it, expect } from 'vitest';
import { TravellerDecoder } from './decoder';

describe('TravellerDecoder', () => {
    const decoder = new TravellerDecoder();

    it('parses UWP correctly', () => {
        // Reno (Spinward Marches) Example: C4207B9-A
        const uwp = decoder.parseUWP('C4207B9-A');
        expect(uwp.starport).toBe('C');
        expect(uwp.size).toBe('4');
        expect(uwp.atmosphere).toBe('2');
        expect(uwp.hydrographics).toBe('0');
        expect(uwp.population).toBe('7');
        expect(uwp.government).toBe('B');
        expect(uwp.law).toBe('9');
        expect(uwp.techLevel).toBe('A');
    });

    it('decodes descriptions correctly', () => {
        expect(decoder.getSizeDescription('4')).toContain('6,400 km');
        expect(decoder.getHydroDescription('0')).toContain('Desert World');
        expect(decoder.getAtmosphereDescription('6')).toBe('Standard');
        expect(decoder.decodeZone('A')).toBe('AMBER (Caution)');
    });

    it('parses a world line correctly', () => {
        // Mock header and line
        const headers = { "Name": 0, "Hex": 1, "UWP": 2, "PBG": 3, "Zone": 4, "Allegiance": 5, "Bases": 6, "Remarks": 7, "{Ix}": 8, "(Ex)": 9, "[Cx]": 10, "Stars": 11, "W": 12 };
        const line = "Regina\t1910\tA788899-C\t123\t\tIm\tNS\tRi Cp\t{ 4 }\t(A7C+3)\t[899A]\tF7 V\t9";
        
        const data = decoder.parseWorldLine(line, headers);
        
        expect(data).toBeDefined();
        if (data) {
            expect(data.name).toBe('Regina');
            expect(data.hex).toBe('1910');
            expect(data.uwp).toBe('A788899-C');
            expect(data.tradeCodes).toContain('Rich');
            expect(data.tradeCodes).toContain('Subsector Capital');
            expect(data.allegiance).toBe('Im');
            expect(data.bases).toBe('NS');
        }
    });
});
