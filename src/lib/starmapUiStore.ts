import { writable } from 'svelte/store';

export const starmapUiStore = writable({
    gridType: 'none' as 'grid' | 'hex' | 'none',
    mouseZoomDisabled: true
});
