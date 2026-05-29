import '@testing-library/jest-dom';

// jsdom doesn't implement matchMedia; components that query it would throw in tests.
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	window.matchMedia = (query: string) =>
		({
			matches: false,
			media: query,
			onchange: null,
			addListener: () => {},
			removeListener: () => {},
			addEventListener: () => {},
			removeEventListener: () => {},
			dispatchEvent: () => false
		}) as unknown as MediaQueryList;
}
