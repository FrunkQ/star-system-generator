import type { CelestialBody, SystemNode } from "../types";

export const STAR_COLOR_MAP: Record<string, string> = { 
    "O": "#9bb0ff", 
    "B": "#aabfff", 
    "A": "#cad8ff", 
    "F": "#f8f7ff", 
    "G": "#fff4ea", 
    "K": "#ffd2a1", 
    "M": "#ffc46f", 
    "L": "#8a4a4a", // Brown Dwarf (L-type)
    "T": "#4a2a2a", // Brown Dwarf (T-type)
    "Y": "#2a1a1a", // Brown Dwarf (Y-type)
    "brown-dwarf": "#5d4037", // Generic Brown Dwarf
    "WD": "#f0f0f0", // White Dwarf
    "NS": "#c0c0ff", // Neutron Star
    "magnetar": "#800080", // Magnetar (Purple)
    "BH": "#000000", // Black Hole (Black, but maybe a glow?)
    "red-giant": "#8b0000", // Red Giant (Deep Red)
    "default": "#ffffff" 
};

/**
 * Returns the primary visual color for a celestial body based on its type and tags.
 */
export function getPlanetColor(node: CelestialBody): string {
    if (node.roleHint === 'star') {
        const starClassKey = node.classes[0] || 'default';
        const spectralType = starClassKey.split('/')[1];
        return STAR_COLOR_MAP[spectralType] || STAR_COLOR_MAP['default'];
    }
    if (node.tags?.some(t => t.key === 'habitability/earth-like' || t.key === 'habitability/human')) return '#007bff'; // Blue for Earth-like
    if (node.biosphere) return '#00ff00'; // Green for biosphere
    
    // Brown Dwarfs (Planet-like)
    const isBrownDwarf = node.classes?.some(c => c.includes('brown-dwarf'));
    if (isBrownDwarf) return '#5d4037'; // Dark Brown

    const isIceGiant = node.classes?.some(c => c.includes('ice-giant'));
    if (isIceGiant) return '#add8e6'; // Light Blue
    const isGasGiant = node.classes?.some(c => c.includes('gas-giant'));
    if (isGasGiant) return '#cc0000'; // Darker Red for Gas Giants
    return '#cc6600'; // Darker Orange/Brown for Terrestrial Bodies
}

/**
 * Returns the visual color for any system node (body or construct).
 */
export function getNodeColor(node: SystemNode): string {
    if (node.kind === 'construct') {
        return node.icon_color || '#f0f0f0'; // Use construct's defined color, or default
    } else if (node.kind === 'body') {
        return getPlanetColor(node);
    }
    return '#ffffff'; // Default for barycenters or unknown
}
