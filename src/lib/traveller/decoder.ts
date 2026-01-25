import type { TravellerWorldData, UWP } from './types';

export class TravellerDecoder {
  private starports: Record<string, string> = {
    'A': 'Excellent (Refined Fuel, Annual Overhaul)', 'B': 'Good (Refined Fuel, Annual Overhaul)',
    'C': 'Routine (Unrefined Fuel, Repairs)', 'D': 'Poor (Unrefined Fuel, No Repairs)',
    'E': 'Frontier (No Fuel, No Repairs)', 'X': 'No Starport',
    'F': 'Good (Non-Imperial)', 'G': 'Poor (Non-Imperial)', 'H': 'Primitive'
  };

  private atmospheres: Record<string, string> = {
    '0': 'Vacuum', '1': 'Trace', '2': 'Very Thin, Tainted', '3': 'Very Thin',
    '4': 'Thin, Tainted', '5': 'Thin', '6': 'Standard', '7': 'Standard, Tainted',
    '8': 'Dense', '9': 'Dense, Tainted', 'A': 'Exotic', 'B': 'Corrosive',
    'C': 'Insidious', 'D': 'Dense, High', 'E': 'Ellipsoid', 'F': 'Thin, Low'
  };

  private governments: Record<string, string> = {
    '0': 'No Government Structure', '1': 'Company/Corporation', '2': 'Participating Democracy',
    '3': 'Self-Perpetuating Oligarchy', '4': 'Representative Democracy', '5': 'Feudal Technocracy',
    '6': 'Captive Government', '7': 'Balkanization', '8': 'Civil Service Bureaucracy',
    '9': 'Impersonal Bureaucracy', 'A': 'Charismatic Dictator', 'B': 'Non-Charismatic Leader',
    'C': 'Charismatic Oligarchy', 'D': 'Religious Dictatorship', 'E': 'Religious Autocracy',
    'F': 'Totalitarian Oligarchy'
  };

  public tradeCodes: Record<string, string> = {
    'Ag': 'Agricultural', 'As': 'Asteroid', 'Ba': 'Barren', 'De': 'Desert',
    'Fl': 'Fluid Oceans', 'Ga': 'Garden', 'Hi': 'High Population', 'Ht': 'High Tech',
    'Ic': 'Ice-Capped', 'In': 'Industrial', 'Lo': 'Low Population', 'Lt': 'Low Tech',
    'Na': 'Non-Agricultural', 'Ni': 'Non-Industrial', 'Po': 'Poor', 'Ri': 'Rich',
    'Va': 'Vacuum', 'Wa': 'Water World', 'He': 'Hellworld', 'Pz': 'Puzzle',
    'Pi': 'Pre-Industrial', 'Ph': 'Pre-High', 'Pa': 'Pre-Agricultural',
    'Pr': 'Pre-Rich', 'Da': 'Dangerous', 'Fa': 'Farming', 'Mi': 'Mining',
    'Mr': 'Military Rule', 'Px': 'Prison/Exile', 'Pe': 'Penal Colony',
    'Re': 'Reserve', 'Sa': 'Satellite', 'Fo': 'Forbidden', 'Oc': 'Occupied',
    'Cx': 'Capital', 'Cp': 'Subsector Capital', 'Cs': 'Sector Capital'
  };

  private allegiances: Record<string, string> = {
    'Im': 'Third Imperium', 'Zh': 'Zhodani Consulate', 'ZhIN': 'Zhodani Consulate (Iadr Nsobl)',
    'ZhCa': 'Zhodani Consulate (Core)', 'Na': 'Non-Aligned', 'NaHu': 'Non-Aligned (Human)',
    'Cs': 'Client State', 'So': 'Solomani Confederation', 'Va': 'Vargr Extents',
    'As': 'Aslan Hierate', 'Kk': 'K\'kree', 'Hv': 'Hiver'
  };

  public hexVal(char: string): number {
    if (char === '-' || char === '+') return 0;
    if (char >= '0' && char <= '9') return parseInt(char);
    if (char >= 'A' && char <= 'Z') return char.charCodeAt(0) - 55;
    if (char >= 'a' && char <= 'z') return char.toUpperCase().charCodeAt(0) - 55;
    return 0;
  }

  parseUWP(uwpStr: string): UWP {
    // E.g. C4207B9-A
    // 0: Starport
    // 1: Size
    // 2: Atmo
    // 3: Hydro
    // 4: Pop
    // 5: Gov
    // 6: Law
    // 7: Hyphen
    // 8: Tech
    return {
      starport: uwpStr[0] || 'X',
      size: uwpStr[1] || '0',
      atmosphere: uwpStr[2] || '0',
      hydrographics: uwpStr[3] || '0',
      population: uwpStr[4] || '0',
      government: uwpStr[5] || '0',
      law: uwpStr[6] || '0',
      techLevel: uwpStr[8] || '0'
    };
  }

  getSizeDescription(char: string): string {
    const val = this.hexVal(char);
    const km = val * 1600;
    const gravity = val > 0 ? val / 8.0 : 0;
    return `${km.toLocaleString()} km (${gravity.toFixed(2)}g)`;
  }

  getHydroDescription(char: string): string {
    const val = this.hexVal(char);
    if (val === 0) return "Desert World (0%)";
    if (val === 10) return "Water World (100%)";
    return `Wet World (${val * 10}% Water)`;
  }

  getPopDescription(char: string): string {
    const val = this.hexVal(char);
    if (val === 0) return "None";
    return `10^${val}`;
  }

  formatPopulation(multiplierChar: string, exponentChar: string): string {
      const m = parseInt(multiplierChar) || 1;
      const e = this.hexVal(exponentChar);
      
      if (e === 0) return "None";
      
      const total = m * Math.pow(10, e);
      
      if (total >= 1e12) return `${(total / 1e12).toFixed(1)} Trillion`;
      if (total >= 1e9) return `${(total / 1e9).toFixed(1)} Billion`;
      if (total >= 1e6) return `${(total / 1e6).toFixed(1)} Million`;
      if (total >= 1e3) return `${(total / 1e3).toFixed(1)} Thousand`;
      
      return total.toLocaleString();
  }

  getLawDescription(char: string): string {
    const val = this.hexVal(char);
    if (val === 0) return "No Law";
    if (val <= 3) return "Low Law";
    if (val <= 7) return "Moderate Law";
    if (val <= 9) return "High Law";
    return "Extreme Law";
  }

  decodeZone(zoneChar: string): string {
    const z = zoneChar.toUpperCase().trim();
    if (z === 'A') return "AMBER (Caution)";
    if (z === 'R') return "RED (Interdicted)";
    if (z === 'F') return "FORBIDDEN";
    if (z === 'U') return "UNCLASSIFIED";
    return "Green (Safe)";
  }

  decodeImportance(ixStr: string): string {
    const clean = ixStr.replace(/[\{\}]/g, '').trim();
    const val = parseInt(clean);
    if (!isNaN(val)) {
        let desc = "Ordinary";
        if (val >= 4) desc = "Important";
        if (val <= -1) desc = "Unimportant";
        return `${val} (${desc})`;
    }
    return ixStr;
  }

  decodeEconomics(exStr: string): string {
    const clean = exStr.replace(/[\(\)]/g, '').trim();
    if (clean.length < 4) return exStr;

    const r = clean[0];
    const l = clean[1];
    const i = clean[2];
    const e = clean.substring(3);

    const resVal = this.hexVal(r);
    const labVal = this.hexVal(l);
    const infVal = this.hexVal(i);

    let resDesc = "Average";
    if (resVal >= 12) resDesc = "Very Abundant";
    else if (resVal <= 5) resDesc = "Scarce";

    const labDesc = labVal > 0 ? `Pop 10^${labVal}` : "None";
    
    let infDesc = "Developing";
    if (infVal >= 10) infDesc = "Extensive";
    else if (infVal <= 4) infDesc = "Limited";

    return `Resources: [${r}] ${resDesc}, Labor: [${l}] ${labDesc}, Infra: [${i}] ${infDesc}, Efficiency: ${e}`;
  }

  decodeCultural(cxStr: string): string {
    const clean = cxStr.replace(/[\[\]]/g, '').trim();
    if (clean.length < 4) return cxStr;

    const hChar = clean[0];
    const aChar = clean[1];
    const sChar = clean[2];
    const bChar = clean[3];

    const h = this.hexVal(hChar);
    const a = this.hexVal(aChar);
    const s = this.hexVal(sChar);
    const b = this.hexVal(bChar);

    // Homogeneity
    let hom = "Harmonious";
    if (h <= 3) hom = "Monolithic";
    else if (h >= 10) hom = "Discordant";
    else if (h >= 7) hom = "Diverse";

    // Acceptance
    let acc = "Neutral";
    if (a <= 3) acc = "Xenophobic";
    else if (a >= 10) acc = "Very Xenophilic";
    else if (a >= 7) acc = "Friendly";
    else if (a <= 5) acc = "Aloof";

    // Strangeness
    let str = "Typical";
    if (s <= 3) str = "Normal";
    else if (s >= 10) str = "Exotic";
    else if (s >= 7) str = "Confusing";
    else if (s >= 5) str = "Distinctive";

    // Symbols
    let sym = "Typical";
    if (b <= 3) sym = "Concrete";
    else if (b >= 10) sym = "Extremely Abstract";
    else if (b >= 7) sym = "Abstract";
    else if (b >= 5) sym = "Symbolic";

    return `Heterogeneity: [${hChar}] ${hom}, Acceptance: [${aChar}] ${acc}, Strangeness: [${sChar}] ${str}, Symbols: [${bChar}] ${sym}`;
  }
  
  // Method to interpret raw T5 tab-delimited data
  parseWorldLine(line: string, headers: Record<string, number>): TravellerWorldData | null {
      const cols = line.split('\t');
      if (cols.length < 2) return null;

      const getCol = (name: string) => {
          const idx = headers[name];
          if (idx !== undefined && idx < cols.length) return cols[idx].trim();
          return "";
      };

      const uwp = getCol("UWP");
      if (uwp.length < 9) return null;

      const pbg = getCol("PBG");
      
      return {
          name: getCol("Name"),
          uwp: uwp,
          hex: getCol("Hex"),
          zone: getCol("Zone"),
          allegiance: getCol("Allegiance"),
          bases: getCol("Bases"),
          tradeCodes: getCol("Remarks").split(' ').map(c => this.tradeCodes[c] || c),
          travelZone: this.decodeZone(getCol("Zone")),
          pbg: pbg,
          ix: getCol("{Ix}"),
          ex: getCol("(Ex)"),
          cx: getCol("[Cx]"),
          stars: getCol("Stars"),
          w: getCol("W"),
          raw: line
      };
  }
  
  getAllegianceName(code: string): string {
      return this.allegiances[code] || this.allegiances[code.substring(0, 2)] || code;
  }

  getStarportDescription(code: string): string {
      return this.starports[code] || "Unknown";
  }

  getAtmosphereDescription(code: string): string {
      return this.atmospheres[code] || "Unknown";
  }
}
