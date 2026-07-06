import { vi } from "vitest";
import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver; provide a no-op stub so components
// that use it (TileGrid, LidarWidget, MapWidget) can mount without throwing
// in tests.
global.ResizeObserver = class ResizeObserver {
	observe() {}
	unobserve() {}
	disconnect() {}
};

// jsdom has no WebGL context and no URL.createObjectURL, both of which
// maplibre-gl touches at module-load time -- stub it globally so any test
// that mounts the full dashboard (e.g. App.test.tsx) doesn't crash just from
// MapWidget being present. Tests that care about MapWidget's own behavior
// (MapWidget.test.tsx) provide their own richer per-file mock, which takes
// precedence over this one.
vi.mock("maplibre-gl", () => {
	class NoopMap {
		setStyle = vi.fn();
		addControl = vi.fn();
		resize = vi.fn();
		remove = vi.fn();
	}

	return { default: { Map: NoopMap, NavigationControl: vi.fn() } };
});
