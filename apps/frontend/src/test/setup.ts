import { vi } from "vitest";
import "@testing-library/jest-dom";

// jsdom does not implement ResizeObserver; provide a no-op stub so components
// that use it (TileGrid, LidarWidget, MapWidget) can mount without throwing
// in tests.
global.ResizeObserver = class ResizeObserver {
	observe = () => undefined;
	unobserve = () => undefined;
	disconnect = () => undefined;
};

// jsdom does not implement IntersectionObserver either; ObcAlertMenu's internal
// obc-alert-list building block creates one in connectedCallback purely to track whether the
// panel is scrolled into view, which none of this app's tests care about -- a no-op observer
// that never fires an entry is a faithful enough stand-in.
global.IntersectionObserver = class IntersectionObserver {
	observe = () => undefined;
	unobserve = () => undefined;
	disconnect = () => undefined;
	takeRecords = () => [];
	root = null;
	rootMargin = "";
	thresholds: number[] = [];
};

// jsdom does not implement Element.checkVisibility either, which the same obc-alert-list
// building block guards a mutation-observer callback with. lib.dom types this as always present,
// so the usual feature-detection guard is unnecessary here -- just stub it unconditionally.
Element.prototype.checkVisibility = () => true;

// jsdom does not implement the Web Animations API either. obc-compass/obc-speed-gauge (used by
// GnssWidget's instrument view) build on obc-watch, whose internal RateOfTurnController calls
// element.animate() in a ReactiveController's hostConnected(), outside any render cycle a test
// awaits, so a missing method here surfaces as an unhandled rejection rather than a thrown render
// error. None of this app's tests assert on the rotation animation itself, so a minimal stub
// (enough for pause/cancel/currentTime/effect.getComputedTiming to not throw) is sufficient.
Element.prototype.animate = () =>
	({
		cancel: () => undefined,
		pause: () => undefined,
		play: () => undefined,
		finish: () => undefined,
		currentTime: 0,
		effect: { getComputedTiming: () => ({ duration: 1000, direction: "normal" }) },
	}) as unknown as Animation;

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
		scrollZoom = { enable: vi.fn(), disable: vi.fn() };
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
