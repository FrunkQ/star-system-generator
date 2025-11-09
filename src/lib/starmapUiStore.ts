import { writable } from 'svelte/store';

const STARMAP_UI_STORE_KEY = 'starmap-ui-store';

// Function to get initial value from localStorage
const getInitialState = () => {
  if (typeof window === 'undefined') {
    return {
      gridType: 'none' as 'grid' | 'hex' | 'none',
      mouseZoomDisabled: true,
      showBackgroundImage: true
    };
  }

  const savedState = localStorage.getItem(STARMAP_UI_STORE_KEY);
  if (savedState) {
    return JSON.parse(savedState);
  }

  return {
    gridType: 'none' as 'grid' | 'hex' | 'none',
    mouseZoomDisabled: true,
    showBackgroundImage: true
  };
};

const store = writable(getInitialState());

// Subscribe to changes and save to localStorage
if (typeof window !== 'undefined') {
  store.subscribe(value => {
    localStorage.setItem(STARMAP_UI_STORE_KEY, JSON.stringify(value));
  });
}

export const starmapUiStore = store;