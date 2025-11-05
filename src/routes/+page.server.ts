import fs from 'fs';
import path from 'path';

export async function load() {
    const examplesPath = path.resolve('static/examples');
    try {
        const files = fs.readdirSync(examplesPath);
        const jsonFiles = files.filter(file => file.endsWith('.json'));
        return {
            exampleSystems: jsonFiles
        };
    } catch (error) {
        console.error('Could not read the examples directory:', error);
        return {
            exampleSystems: []
        };
    }
}