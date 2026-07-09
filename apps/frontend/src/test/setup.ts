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

// jsdom's fetch (undici) requires an absolute URL, so a component that fetches a relative
// endpoint on mount (e.g. MissionContext's loadMissions()) throws an unhandled rejection in any
// test that mounts the full App tree without its own mock. Stub a benign empty-array response by
// default; tests that care about a specific call mock it locally (missionApi.test.ts,
// MissionContext.test.tsx) which takes precedence over this one.
global.fetch = vi.fn(() =>
	Promise.resolve(
		new Response(JSON.stringify([]), {
			status: 200,
			headers: { "Content-Type": "application/json" },
		}),
	),
);

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
		addSource = vi.fn();
		addLayer = vi.fn();
		getSource = vi.fn();
		easeTo = vi.fn();
		jumpTo = vi.fn();
		zoomIn = vi.fn();
		zoomOut = vi.fn();
		getZoom = vi.fn(() => 11);
		getCenter = vi.fn(() => ({ lng: 0, lat: 0 }));
		getLayer = vi.fn(() => ({}));
		setBearing = vi.fn();
		getCanvas = vi.fn(() => ({ style: {} }));
		project = vi.fn(() => ({ x: 0, y: 0 }));
		queryRenderedFeatures = vi.fn(() => []);
		dragPan = { enable: vi.fn(), disable: vi.fn(), isActive: vi.fn(() => false) };
		touchZoomRotate = { disableRotation: vi.fn() };
		on = vi.fn();
		off = vi.fn();
	}

	class NoopMarker {
		setLngLat = vi.fn().mockReturnThis();
		setRotation = vi.fn().mockReturnThis();
		addTo = vi.fn().mockReturnThis();
		remove = vi.fn();
		getElement = vi.fn(() => document.createElement("div"));
	}

	return { default: { Map: NoopMap, NavigationControl: vi.fn(), Marker: NoopMarker } };
});
