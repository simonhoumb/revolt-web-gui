import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver; provide a no-op stub so components
// that use it (TileGrid, LidarWidget) can mount without throwing in tests.
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};
