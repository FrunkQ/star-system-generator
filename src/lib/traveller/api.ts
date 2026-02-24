export interface Sector {
    name: string;
    abbreviation?: string;
    tags?: string[];
}

const API_BASE = "https://travellermap.com/data";

export class TravellerAPI {
    
    async getSectors(): Promise<Sector[]> {
        try {
            const response = await fetch(API_BASE, {
                headers: { 'User-Agent': 'StarSystemExplorer/1.9.0' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            
            const data = await response.json();
            const sectorList = Array.isArray(data) ? data : (data.Sectors || []);
            
            // Deduplicate and clean
            const unique: Record<string, Sector> = {};
            
            for (const s of sectorList) {
                if (!s.Names || s.Names.length === 0) continue;
                
                const name = s.Names[0].Text;
                const abbr = s.Abbreviation;
                const tags = s.Tags ? (Array.isArray(s.Tags) ? s.Tags : s.Tags.split(' ')) : [];
                const isOfficial = tags.some((t: string) => t.toLowerCase() === 'official');
                
                // key logic: prefer official versions
                const key = abbr || name;
                
                if (!unique[key] || (isOfficial && !unique[key].tags?.includes('official'))) {
                    unique[key] = {
                        name: name,
                        abbreviation: abbr,
                        tags: tags
                    };
                }
            }
            
            return Object.values(unique).sort((a, b) => a.name.localeCompare(b.name));
            
        } catch (e) {
            console.error("Failed to fetch sectors", e);
            return [];
        }
    }

    async getSubsectorData(sectorAbbr: string, subsectorIndex: string): Promise<string | null> {
        // subsectorIndex is A-P
        const url = `${API_BASE}/${encodeURIComponent(sectorAbbr)}/${subsectorIndex}/tab`;
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'StarSystemExplorer/1.9.0' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.text();
        } catch (e) {
            console.error(`Failed to fetch subsector ${sectorAbbr}/${subsectorIndex}`, e);
            return null;
        }
    }

    async getSectorData(sectorName: string): Promise<string | null> {
        const url = `${API_BASE}/${encodeURIComponent(sectorName)}`;
        try {
            const response = await fetch(url, {
                headers: { 'User-Agent': 'StarSystemExplorer/1.9.0' }
            });
            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
            return await response.text();
        } catch (e) {
            console.error(`Failed to fetch sector data for ${sectorName}`, e);
            return null;
        }
    }
}

