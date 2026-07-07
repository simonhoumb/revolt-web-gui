import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { MapWidget } from "./MapWidget.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useVesselTrack } from "../../hooks/useVesselTrack.js";
import type { GnssData } from "../../hooks/useGnssData.js";
import type { TrackPoint } from "../../hooks/useVesselTrack.js";

vi.mock("../../hooks/useGnssData.js", () => ({
	useGnssData: vi.fn(),
}));
vi.mock("../../hooks/useVesselTrack.js", () => ({
	useVesselTrack: vi.fn(),
}));

const mockUseGnssData = useGnssData as Mock;
const mockUseVesselTrack = useVesselTrack as Mock;

const baseGnss: GnssData = {
	latitude: null,
	longitude: null,
	altitudeM: null,
	fixStatus: null,
	fixLabel: "No fix",
	speedMs: null,
	headingDeg: null,
	courseDeg: null,
	isSimulation: false,
};

interface MockMapOptions {
	style: string;
}

type Handler = (e: { originalEvent?: unknown }) => void;

interface MockMapInstance {
	options: MockMapOptions;
	setStyle: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	addSource: ReturnType<typeof vi.fn>;
	addLayer: ReturnType<typeof vi.fn>;
	easeTo: ReturnType<typeof vi.fn>;
	jumpTo: ReturnType<typeof vi.fn>;
	zoomIn: ReturnType<typeof vi.fn>;
	zoomOut: ReturnType<typeof vi.fn>;
	dragPan: {
		enable: ReturnType<typeof vi.fn>;
		disable: ReturnType<typeof vi.fn>;
		isActive: ReturnType<typeof vi.fn>;
	};
	getSource: ReturnType<typeof vi.fn>;
	source: { setData: ReturnType<typeof vi.fn> };
	emit: (event: string, e?: { originalEvent?: unknown }) => void;
}

interface MockMarkerInstance {
	element: HTMLElement;
	setLngLat: ReturnType<typeof vi.fn>;
	setRotation: ReturnType<typeof vi.fn>;
}

// Plain arrays, not classes -- referenced from inside the vi.mock factory
// below, which the vitest transform hoists above this file's other
// top-level code, so any class it needs must be declared inside the
// factory itself (see vitest's "no top level variables inside" hoisting
// note).
const mapInstances: MockMapInstance[] = [];
const markerInstances: MockMarkerInstance[] = [];

vi.mock("maplibre-gl", () => {
	class MockSource {
		setData = vi.fn();
	}

	class MockDragPan {
		enable = vi.fn();
		disable = vi.fn();
		isActive = vi.fn(() => false);
	}

	class MockTouchZoomRotate {
		disableRotation = vi.fn();
	}

	class MockMap {
		options: MockMapOptions;
		setStyle = vi.fn();
		remove = vi.fn();
		addControl = vi.fn();
		resize = vi.fn();
		addSource = vi.fn();
		addLayer = vi.fn();
		easeTo = vi.fn();
		jumpTo = vi.fn();
		zoomIn = vi.fn();
		zoomOut = vi.fn();
		getZoom = vi.fn(() => 11);
		dragPan = new MockDragPan();
		touchZoomRotate = new MockTouchZoomRotate();
		source = new MockSource();
		handlers: Record<string, Handler[]> = {};

		getSource = vi.fn(() => this.source);

		on = vi.fn((event: string, handler: Handler) => {
			(this.handlers[event] ??= []).push(handler);
		});

		off = vi.fn((event: string, handler: Handler) => {
			this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
		});

		emit(event: string, e: { originalEvent?: unknown } = {}) {
			this.handlers[event]?.forEach((h) => {
				h(e);
			});
		}

		constructor(options: MockMapOptions) {
			this.options = options;
			mapInstances.push(this);
		}
	}

	class MockMarker {
		element: HTMLElement;
		setLngLat = vi.fn().mockReturnThis();
		setRotation = vi.fn().mockReturnThis();
		addTo = vi.fn().mockReturnThis();
		remove = vi.fn();

		constructor(options: { element: HTMLElement }) {
			this.element = options.element;
			markerInstances.push(this);
		}

		getElement() {
			return this.element;
		}
	}

	return { default: { Map: MockMap, NavigationControl: vi.fn(), Marker: MockMarker } };
});

afterEach(() => {
	cleanup();
	mapInstances.length = 0;
	markerInstances.length = 0;
	document.documentElement.removeAttribute("data-obc-theme");
});

function setGnss(overrides: Partial<GnssData> = {}) {
	mockUseGnssData.mockReturnValue({ ...baseGnss, ...overrides });
}

function setTrack(points: TrackPoint[] = []) {
	mockUseVesselTrack.mockReturnValue(points);
}

describe("MapWidget", () => {
	// index.html ships data-obc-theme="dusk" by default (TopNav's dimming
	// button toggles it to "day"); with no attribute at all -- the jsdom test
	// environment's starting state -- the widget should also fall back to the
	// dark style, since "day" is the only value that means light.
	it("initializes with the dark style by default (no theme attribute)", () => {
		setGnss();
		setTrack();
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-dark.json");
	});

	it("initializes with the light style when the theme is already day", () => {
		document.documentElement.setAttribute("data-obc-theme", "day");
		setGnss();
		setTrack();
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-light.json");
	});

	it("swaps to the light style when data-obc-theme changes to day", async () => {
		document.documentElement.setAttribute("data-obc-theme", "dusk");
		setGnss();
		setTrack();
		render(<MapWidget />);
		document.documentElement.setAttribute("data-obc-theme", "day");

		await vi.waitFor(() => {
			expect(mapInstances[0]?.setStyle).toHaveBeenCalledWith("/map-styles/oslo-fjord-light.json");
		});
	});

	it("removes the map instance on unmount", () => {
		setGnss();
		setTrack();
		const { unmount } = render(<MapWidget />);
		unmount();
		expect(mapInstances[0]?.remove).toHaveBeenCalled();
	});

	it("keeps the vessel marker hidden until a fix arrives", () => {
		setGnss();
		setTrack();
		render(<MapWidget />);
		expect(markerInstances[0]?.element.style.visibility).toBe("hidden");
		expect(markerInstances[0]?.setLngLat).not.toHaveBeenCalledWith([10.7, 59.9]);
	});

	it("moves and reveals the vessel marker once a fix arrives", () => {
		setGnss();
		setTrack();
		const { rerender } = render(<MapWidget />);

		setGnss({ latitude: 59.9, longitude: 10.7 });
		act(() => {
			rerender(<MapWidget />);
		});

		expect(markerInstances[0]?.setLngLat).toHaveBeenCalledWith([10.7, 59.9]);
		expect(markerInstances[0]?.element.style.visibility).toBe("visible");
	});

	it("rotates the vessel marker to the current heading", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 90 });
		setTrack();
		render(<MapWidget />);
		expect(markerInstances[0]?.setRotation).toHaveBeenCalledWith(90);
	});

	it("feeds past-track points into the map source", () => {
		setGnss();
		const points: TrackPoint[] = [
			{ latitude: 59.9, longitude: 10.7, timestampMs: 0 },
			{ latitude: 59.91, longitude: 10.71, timestampMs: 30_000 },
		];
		setTrack(points);
		render(<MapWidget />);

		mapInstances[0]?.emit("style.load");

		expect(mapInstances[0]?.addSource).toHaveBeenCalledWith(
			"vessel-track",
			expect.objectContaining({ type: "geojson" }),
		);
		expect(mapInstances[0]?.source.setData).toHaveBeenCalled();
	});

	function findByLabel(container: HTMLElement, label: string): Element {
		const el = container.querySelector(`[aria-label="${label}"]`);
		if (!el) throw new Error(`element not found: ${label}`);
		return el;
	}

	function dispatchToggleValue(el: Element, value: string, previousValue: string) {
		act(() => {
			el.dispatchEvent(new CustomEvent("value", { detail: { value, previousValue } }));
		});
	}

	it("zooms the map via the range stepper's up/down events", () => {
		setGnss();
		setTrack();
		const { container } = render(<MapWidget />);
		const stepper = findByLabel(container, "Chart range");

		act(() => {
			stepper.dispatchEvent(new CustomEvent("up"));
		});
		expect(mapInstances[0]?.zoomIn).toHaveBeenCalled();

		act(() => {
			stepper.dispatchEvent(new CustomEvent("down"));
		});
		expect(mapInstances[0]?.zoomOut).toHaveBeenCalled();
	});

	it("eases chart bearing to true heading in heading-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");
		expect(mapInstances[0]?.easeTo).toHaveBeenCalledWith(
			expect.objectContaining({ bearing: 45 }),
		);
	});

	it("eases chart bearing to course over ground in course-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "C", "N");
		expect(mapInstances[0]?.easeTo).toHaveBeenCalledWith(
			expect.objectContaining({ bearing: 90 }),
		);
	});

	it("resets chart bearing to zero in north-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");
		dispatchToggleValue(findByLabel(container, "Chart orientation"), "N", "H");
		expect(mapInstances[0]?.easeTo).toHaveBeenLastCalledWith(
			expect.objectContaining({ bearing: 0 }),
		);
	});

	it("does not fight an active drag gesture with a bearing update", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		mapInstances[0]?.dragPan.isActive.mockReturnValue(true);
		mapInstances[0]?.easeTo.mockClear();

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");

		expect(mapInstances[0]?.easeTo).not.toHaveBeenCalled();
	});

	it("disables map dragging while the camera is locked, re-enables when freed", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		const { container } = render(<MapWidget />);

		// Locked is the default state, so dragPan should already be disabled.
		expect(mapInstances[0]?.dragPan.disable).toHaveBeenCalled();

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		expect(mapInstances[0]?.dragPan.enable).toHaveBeenCalled();

		dispatchToggleValue(findByLabel(container, "Camera lock"), "locked", "free");
		expect(mapInstances[0]?.dragPan.disable).toHaveBeenCalledTimes(2);
	});

	it("recentres instantly (not eased) on new fixes while the camera is locked", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		const { rerender } = render(<MapWidget />);

		setGnss({ latitude: 59.91, longitude: 10.71 });
		act(() => {
			rerender(<MapWidget />);
		});
		// jumpTo, not easeTo -- an animated recentre on every single fix would
		// restart mid-flight on each new update and never catch up smoothly.
		expect(mapInstances[0]?.jumpTo).toHaveBeenCalledWith(
			expect.objectContaining({ center: [10.71, 59.91] }),
		);
	});

	it("stops recentring once the camera is freed", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		const { container, rerender } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		mapInstances[0]?.jumpTo.mockClear();

		setGnss({ latitude: 59.91, longitude: 10.71 });
		act(() => {
			rerender(<MapWidget />);
		});

		expect(mapInstances[0]?.jumpTo).not.toHaveBeenCalled();
	});
});
