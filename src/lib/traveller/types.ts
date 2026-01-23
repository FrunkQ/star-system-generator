export interface UWP {
    starport: string;
    size: string;
    atmosphere: string;
    hydrographics: string;
    population: string;
    government: string;
    law: string;
    techLevel: string;
}

export interface TravellerWorldData {
    name: string;
    uwp: string;
    hex: string;
    zone: string;
    allegiance: string;
    bases: string;
    tradeCodes: string[];
    travelZone: string;
    pbg: string; // Pop mult, Belts, Gas giants
    ix: string;
    ex: string;
    cx: string;
    stars: string;
    w: string;
    raw: string;
}

export interface TravellerSubsector {
    name: string;
    sectorName: string;
    subsectorCode: string; // A-P
    worlds: TravellerWorldData[];
    originHex: { x: number; y: number }; // Top-left hex coordinate in Starmap grid
}
