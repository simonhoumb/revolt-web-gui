import { cleanup, render } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Mission, Waypoint } from "@revolt/shared-types";
import type { AisTarget } from "../../hooks/useAisTargets.js";
import { MapWidget } from "./MapWidget.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useVesselTrack } from "../../hooks/useVesselTrack.js";
import { useAisTargets } from "../../hooks/useAisTargets.js";
import { useMission } from "../../context/useMission.js";
import { useLegHazards } from "../../context/useLegHazards.js";
import { useApps } from "../../context/useApps.js";
import { APPS } from "./apps.js";
import type { GnssData } from "../../hooks/useGnssData.js";
import type { TrackPoint } from "../../hooks/useVesselTrack.js";

vi.mock("../../hooks/useGnssData.js", () => ({
	useGnssData: vi.fn(),
}));
vi.mock("../../hooks/useVesselTrack.js", () => ({
	useVesselTrack: vi.fn(),
}));
vi.mock("../../hooks/useAisTargets.js", () => ({
	useAisTargets: vi.fn(),
}));
vi.mock("../../context/useMission.js", () => ({
	useMission: vi.fn(),
}));
vi.mock("../../context/useLegHazards.js", () => ({
	useLegHazards: vi.fn(),
}));
vi.mock("../../context/useApps.js", () => ({
	useApps: vi.fn(),
}));

const mockUseGnssData = useGnssData as Mock;
const mockUseVesselTrack = useVesselTrack as Mock;
const mockUseAisTargets = useAisTargets as Mock;
const mockUseMission = useMission as Mock;
const mockUseLegHazards = useLegHazards as Mock;
const mockUseApps = useApps as Mock;

function setApp(activeAppId: keyof typeof APPS = "custom") {
	mockUseApps.mockReturnValue({
		activeAppId,
		appDef: APPS[activeAppId],
		isLocked: activeAppId !== "custom",
		setActiveApp: vi.fn(),
	});
}

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
	stale: false,
};

const mockAddWaypoint = vi.fn();
const mockUpdateWaypointPosition = vi.fn();
const mockSetLegValidation = vi.fn();

function makeWaypoint(overrides: Partial<Waypoint> = {}): Waypoint {
	return {
		id: "wp-1",
		mission_id: "mission-1",
		sequence_number: 0,
		position: { latitude: 59.0, longitude: 10.0 },
		target_speed: 5,
		switch_radius: 5,
		heading_mode: 0,
		heading_deg: null,
		validation_status: null,
		reached_at: null,
		...overrides,
	};
}

function setMission(waypoints: Waypoint[] = []) {
	const activeMission: Mission | null =
		waypoints.length > 0
			? {
					id: "mission-1",
					name: "Test mission",
					description: null,
					status: "draft" as Mission["status"],
					waypoints,
					started_at: null,
					completed_at: null,
					last_validated_at: null,
					last_validation_status: null,
					last_sent_at: null,
					last_send_status: null,
					created_at: "2026-07-08T00:00:00Z",
					updated_at: "2026-07-08T00:00:00Z",
				}
			: null;
	mockUseMission.mockReturnValue({
		missions: activeMission ? [activeMission] : [],
		loading: false,
		activeMissionId: activeMission?.id ?? null,
		activeMission,
		loadMissions: vi.fn(),
		createMission: vi.fn(),
		selectMission: vi.fn(),
		renameMission: vi.fn(),
		deleteMission: vi.fn(),
		addWaypoint: mockAddWaypoint,
		updateWaypointPosition: mockUpdateWaypointPosition,
		updateWaypointSpeed: vi.fn(),
		reorderWaypoints: vi.fn(),
		deleteWaypoint: vi.fn(),
	});
	mockUseLegHazards.mockReturnValue({
		legValidation: {},
		setLegValidation: mockSetLegValidation,
	});
}

interface MockMapOptions {
	style: string;
}

type Handler = (e: never) => void;

class MockGeoJSONSource {
	setData = vi.fn();
}

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
	isZooming: ReturnType<typeof vi.fn>;
	dragPan: {
		enable: ReturnType<typeof vi.fn>;
		disable: ReturnType<typeof vi.fn>;
		isActive: ReturnType<typeof vi.fn>;
	};
	scrollZoom: {
		enable: ReturnType<typeof vi.fn>;
		disable: ReturnType<typeof vi.fn>;
		aroundCenter: boolean;
	};
	getSource: ReturnType<typeof vi.fn>;
	queryRenderedFeatures: ReturnType<typeof vi.fn>;
	sources: Map<string, MockGeoJSONSource>;
	canvasStyle: { cursor: string };
	emit: (event: string, e?: unknown) => void;
}

interface MockMarkerInstance {
	element: HTMLElement;
	draggable: boolean;
	lngLat: { lat: number; lng: number };
	setLngLat: ReturnType<typeof vi.fn>;
	setRotation: ReturnType<typeof vi.fn>;
	getLngLat: () => { lat: number; lng: number };
	remove: ReturnType<typeof vi.fn>;
	emit: (event: string, e?: unknown) => void;
}

interface MockPopupInstance {
	lngLat: { lat: number; lng: number } | null;
	content: HTMLElement | null;
	options: Record<string, unknown>;
	setLngLat: ReturnType<typeof vi.fn>;
	setDOMContent: ReturnType<typeof vi.fn>;
	addTo: ReturnType<typeof vi.fn>;
	remove: ReturnType<typeof vi.fn>;
	emit: (event: string, e?: unknown) => void;
}

// Plain arrays, not classes -- referenced from inside the vi.mock factory
// below, which the vitest transform hoists above this file's other
// top-level code, so any class it needs must be declared inside the
// factory itself (see vitest's "no top level variables inside" hoisting
// note).
const mapInstances: MockMapInstance[] = [];
const markerInstances: MockMarkerInstance[] = [];
const popupInstances: MockPopupInstance[] = [];

vi.mock("maplibre-gl", () => {
	class MockDragPan {
		enable = vi.fn();
		disable = vi.fn();
		isActive = vi.fn(() => false);
	}

	class MockTouchZoomRotate {
		disableRotation = vi.fn();
	}

	class MockScrollZoom {
		// Mirrors real MapLibre: scrollZoom is enabled by default from map creation, and its real
		// enable() is a no-op (including not applying the "around" option) if already enabled --
		// this bit us for real (a disable()-then-enable() call was needed, not just enable()) so
		// the mock replicates that guard instead of blindly recording every call as if it worked.
		_enabled = true;
		aroundCenter = false;
		enable = vi.fn((options?: { around?: "center" }) => {
			if (this._enabled) return;
			this._enabled = true;
			this.aroundCenter = options?.around === "center";
		});
		disable = vi.fn(() => {
			this._enabled = false;
		});
	}

	class MockMap {
		options: MockMapOptions;
		setStyle = vi.fn();
		remove = vi.fn();
		addControl = vi.fn();
		resize = vi.fn();
		addLayer = vi.fn();
		easeTo = vi.fn();
		center = { lng: 0, lat: 0 };
		// Tracks the center so the camera-lock jitter threshold (which compares getCenter() against
		// the incoming fix via project()) sees a realistic before/after in tests, not a fixed stub.
		jumpTo = vi.fn((opts: { center?: [number, number] }) => {
			if (opts.center) this.center = { lng: opts.center[0], lat: opts.center[1] };
		});
		zoomIn = vi.fn();
		zoomOut = vi.fn();
		getZoom = vi.fn(() => 11);
		getCenter = vi.fn(() => this.center);
		// Always "exists" -- these tests aren't exercising the missing-layer guard itself
		// (encValidation.test.ts covers that in isolation), just need queryRenderedFeatures'
		// layer list to come through unfiltered.
		getLayer = vi.fn(() => ({}));
		isZooming = vi.fn(() => false);
		dragPan = new MockDragPan();
		touchZoomRotate = new MockTouchZoomRotate();
		scrollZoom = new MockScrollZoom();
		sources = new Map<string, MockGeoJSONSource>();
		canvasStyle = { cursor: "" };
		handlers: Record<string, Handler[]> = {};

		addSource = vi.fn((id: string) => {
			this.sources.set(id, new MockGeoJSONSource());
		});
		getSource = vi.fn((id: string) => this.sources.get(id));
		getCanvas = vi.fn(() => ({ style: this.canvasStyle }));
		project = vi.fn((lngLat: [number, number]) => ({ x: lngLat[0] * 100, y: lngLat[1] * 100 }));
		queryRenderedFeatures = vi.fn(() => []);

		on = vi.fn((event: string, handler: Handler) => {
			(this.handlers[event] ??= []).push(handler);
		});

		off = vi.fn((event: string, handler: Handler) => {
			this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
		});

		emit(event: string, e: unknown = {}) {
			this.handlers[event]?.forEach((h) => {
				h(e as never);
			});
		}

		constructor(options: MockMapOptions) {
			this.options = options;
			mapInstances.push(this);
		}
	}

	class MockMarker {
		element: HTMLElement;
		draggable: boolean;
		lngLat: { lat: number; lng: number } = { lat: 0, lng: 0 };
		setRotation = vi.fn().mockReturnThis();
		addTo = vi.fn().mockReturnThis();
		remove = vi.fn();
		handlers: Record<string, Handler[]> = {};

		setLngLat = vi.fn((coords: [number, number]) => {
			this.lngLat = { lng: coords[0], lat: coords[1] };
			return this;
		});

		setDraggable = vi.fn((shouldBeDraggable: boolean) => {
			this.draggable = shouldBeDraggable;
			return this;
		});

		on = vi.fn((event: string, handler: Handler) => {
			(this.handlers[event] ??= []).push(handler);
			return this;
		});

		off = vi.fn((event: string, handler: Handler) => {
			this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
			return this;
		});

		emit(event: string, e: unknown = {}) {
			this.handlers[event]?.forEach((h) => {
				h(e as never);
			});
		}

		constructor(options: { element: HTMLElement; draggable?: boolean }) {
			this.element = options.element;
			this.draggable = options.draggable ?? false;
			markerInstances.push(this);
		}

		getElement() {
			return this.element;
		}

		getLngLat() {
			return this.lngLat;
		}
	}

	class MockPopup {
		lngLat: { lat: number; lng: number } | null = null;
		content: HTMLElement | null = null;
		options: Record<string, unknown>;
		handlers: Record<string, Handler[]> = {};

		addTo = vi.fn().mockReturnThis();
		remove = vi.fn();

		setLngLat = vi.fn((coords: [number, number]) => {
			this.lngLat = { lng: coords[0], lat: coords[1] };
			return this;
		});

		setDOMContent = vi.fn((el: HTMLElement) => {
			this.content = el;
			return this;
		});

		on = vi.fn((event: string, handler: Handler) => {
			(this.handlers[event] ??= []).push(handler);
			return this;
		});

		off = vi.fn((event: string, handler: Handler) => {
			this.handlers[event] = (this.handlers[event] ?? []).filter((h) => h !== handler);
			return this;
		});

		emit(event: string, e: unknown = {}) {
			this.handlers[event]?.forEach((h) => {
				h(e as never);
			});
		}

		constructor(options: Record<string, unknown> = {}) {
			this.options = options;
			popupInstances.push(this);
		}
	}

	return {
		default: { Map: MockMap, NavigationControl: vi.fn(), Marker: MockMarker, Popup: MockPopup },
	};
});

beforeEach(() => {
	// Most tests don't care about AIS targets; default to none so they don't each need their own
	// setup call. The "AIS targets" describe block below overrides this per test.
	mockUseAisTargets.mockReturnValue([]);
	setApp();
});

afterEach(() => {
	cleanup();
	mapInstances.length = 0;
	markerInstances.length = 0;
	popupInstances.length = 0;
	mockAddWaypoint.mockClear();
	mockUpdateWaypointPosition.mockClear();
	mockSetLegValidation.mockClear();
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
		setMission();
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-dark.json");
	});

	it("initializes with the light style when the theme is already day", () => {
		document.documentElement.setAttribute("data-obc-theme", "day");
		setGnss();
		setTrack();
		setMission();
		render(<MapWidget />);
		expect(mapInstances[0]?.options.style).toBe("/map-styles/oslo-fjord-light.json");
	});

	it("swaps to the light style when data-obc-theme changes to day", async () => {
		document.documentElement.setAttribute("data-obc-theme", "dusk");
		setGnss();
		setTrack();
		setMission();
		render(<MapWidget />);
		document.documentElement.setAttribute("data-obc-theme", "day");

		await vi.waitFor(() => {
			expect(mapInstances[0]?.setStyle).toHaveBeenCalledWith(
				"/map-styles/oslo-fjord-light.json",
			);
		});
	});

	it("removes the map instance on unmount", () => {
		setGnss();
		setTrack();
		setMission();
		const { unmount } = render(<MapWidget />);
		unmount();
		expect(mapInstances[0]?.remove).toHaveBeenCalled();
	});

	it("keeps the vessel marker hidden until a fix arrives", () => {
		setGnss();
		setTrack();
		setMission();
		render(<MapWidget />);
		expect(markerInstances[0]?.element.style.visibility).toBe("hidden");
		expect(markerInstances[0]?.setLngLat).not.toHaveBeenCalledWith([10.7, 59.9]);
	});

	it("moves and reveals the vessel marker once a fix arrives", () => {
		setGnss();
		setTrack();
		setMission();
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
		setMission();
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
		setMission();
		const { rerender } = render(<MapWidget />);

		mapInstances[0]?.emit("style.load");

		expect(mapInstances[0]?.addSource).toHaveBeenCalledWith(
			"vessel-track",
			expect.objectContaining({ type: "geojson" }),
		);

		// Initial data arrives via addSource's own `data` field (asserted above); setData is
		// only exercised by subsequent updates once the source already exists.
		setTrack([...points, { latitude: 59.92, longitude: 10.72, timestampMs: 60_000 }]);
		act(() => {
			rerender(<MapWidget />);
		});
		expect(mapInstances[0]?.sources.get("vessel-track")?.setData).toHaveBeenCalled();
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
		setMission();
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

	function clickButton(el: Element) {
		act(() => {
			(el as HTMLElement).click();
		});
	}

	it("defaults to hidden controls in the Conning app, and shown elsewhere", () => {
		setGnss();
		setTrack();
		setMission();
		setApp("custom");
		const { container: customContainer } = render(<MapWidget />);
		expect(customContainer.querySelector('[aria-label="Chart range"]')).not.toBeNull();
		expect(findByLabel(customContainer, "Hide map controls")).toBeInTheDocument();
		cleanup();

		setApp("conning");
		const { container: conningContainer } = render(<MapWidget />);
		expect(conningContainer.querySelector('[aria-label="Chart range"]')).toBeNull();
		expect(findByLabel(conningContainer, "Show map controls")).toBeInTheDocument();
	});

	it("hides the whole toolbar when controls are toggled off, and restores it when toggled back on", () => {
		setGnss();
		setTrack();
		setMission();
		setApp("custom");
		const { container } = render(<MapWidget />);
		expect(container.querySelector('[aria-label="Chart range"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="Chart orientation"]')).not.toBeNull();
		expect(container.querySelector('[aria-label="AIS targets"]')).not.toBeNull();

		clickButton(findByLabel(container, "Hide map controls"));
		expect(container.querySelector('[aria-label="Chart range"]')).toBeNull();
		expect(container.querySelector('[aria-label="Chart orientation"]')).toBeNull();
		expect(container.querySelector('[aria-label="AIS targets"]')).toBeNull();
		expect(container.querySelector('[aria-label="Route edit mode"]')).toBeNull();
		expect(container.querySelector('[aria-label="Camera lock"]')).toBeNull();

		clickButton(findByLabel(container, "Show map controls"));
		expect(container.querySelector('[aria-label="Chart orientation"]')).not.toBeNull();
	});

	it("forces edit mode back to pan-only when controls are hidden while adding a waypoint", () => {
		setGnss();
		setTrack();
		setMission();
		setApp("custom");
		const { container } = render(<MapWidget />);
		dispatchToggleValue(findByLabel(container, "Route edit mode"), "add", "edit");

		act(() => {
			mapInstances[0]?.emit("click", { lngLat: { lat: 59.5, lng: 10.5 } });
		});
		expect(mockAddWaypoint).toHaveBeenCalledTimes(1);

		clickButton(findByLabel(container, "Hide map controls"));
		clickButton(findByLabel(container, "Show map controls"));
		act(() => {
			mapInstances[0]?.emit("click", { lngLat: { lat: 59.6, lng: 10.6 } });
		});
		// Still 1: hiding controls reset edit mode back to "edit" (pan-only), so showing them
		// again doesn't leave "add" active and this second click doesn't place a waypoint.
		expect(mockAddWaypoint).toHaveBeenCalledTimes(1);
	});

	it("eases chart bearing to true heading in heading-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		setMission();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");
		expect(mapInstances[0]?.easeTo).toHaveBeenCalledWith(
			expect.objectContaining({ bearing: 45 }),
		);
	});

	it("eases chart bearing to course over ground in course-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		setMission();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "C", "N");
		expect(mapInstances[0]?.easeTo).toHaveBeenCalledWith(
			expect.objectContaining({ bearing: 90 }),
		);
	});

	it("resets chart bearing to zero in north-up mode", () => {
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		setMission();
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
		setMission();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		mapInstances[0]?.dragPan.isActive.mockReturnValue(true);
		mapInstances[0]?.easeTo.mockClear();

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");

		expect(mapInstances[0]?.easeTo).not.toHaveBeenCalled();
	});

	it("does not fight an active scroll-zoom gesture with a bearing update", () => {
		// Same reasoning as the drag-gesture guard above: a heading/course tick arriving mid-zoom
		// retargeting the camera's bearing via its own easeTo, while MapLibre's own zoom
		// interpolation is also actively driving the same camera, is what read as jitter
		// specifically while zooming.
		setGnss({ latitude: 59.9, longitude: 10.7, headingDeg: 45, courseDeg: 90 });
		setTrack();
		setMission();
		const { container } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		mapInstances[0]?.isZooming.mockReturnValue(true);
		mapInstances[0]?.easeTo.mockClear();

		dispatchToggleValue(findByLabel(container, "Chart orientation"), "H", "N");

		expect(mapInstances[0]?.easeTo).not.toHaveBeenCalled();
	});

	it("disables map dragging while the camera is locked, re-enables when freed", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		setMission();
		const { container } = render(<MapWidget />);

		// Locked is the default state, so dragPan should already be disabled.
		expect(mapInstances[0]?.dragPan.disable).toHaveBeenCalled();

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		expect(mapInstances[0]?.dragPan.enable).toHaveBeenCalled();

		dispatchToggleValue(findByLabel(container, "Camera lock"), "locked", "free");
		expect(mapInstances[0]?.dragPan.disable).toHaveBeenCalledTimes(2);
	});

	it("zooms around the vessel while locked, around the cursor once freed", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		setMission();
		const { container } = render(<MapWidget />);

		// Asserting the mock's resulting aroundCenter state (not just that enable() was called
		// with the right args) matters here: the mock replicates MapLibre's real early-return
		// guard in scrollZoom.enable() (a no-op if already enabled, which it is by default from
		// map creation) -- a version of this effect that called enable() without disable() first
		// would still "call enable() with the right args" but silently never take effect.
		expect(mapInstances[0]?.scrollZoom.aroundCenter).toBe(true);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		expect(mapInstances[0]?.scrollZoom.aroundCenter).toBe(false);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "locked", "free");
		expect(mapInstances[0]?.scrollZoom.aroundCenter).toBe(true);
	});

	it("recentres instantly (not eased) on new fixes while the camera is locked", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		setMission();
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

	it("does not recentre for GNSS noise too small to be visible on screen", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		setMission();
		const { rerender } = render(<MapWidget />);
		mapInstances[0]?.jumpTo.mockClear();

		// A tiny fix-to-fix delta (real receiver noise, or the mock backend's simulated drift)
		// that the mock's project() (scale x100) resolves to well under 1px of apparent movement.
		setGnss({ latitude: 59.900001, longitude: 10.700001 });
		act(() => {
			rerender(<MapWidget />);
		});

		expect(mapInstances[0]?.jumpTo).not.toHaveBeenCalled();
	});

	it("stops recentring once the camera is freed", () => {
		setGnss({ latitude: 59.9, longitude: 10.7 });
		setTrack();
		setMission();
		const { container, rerender } = render(<MapWidget />);

		dispatchToggleValue(findByLabel(container, "Camera lock"), "free", "locked");
		mapInstances[0]?.jumpTo.mockClear();

		setGnss({ latitude: 59.91, longitude: 10.71 });
		act(() => {
			rerender(<MapWidget />);
		});

		expect(mapInstances[0]?.jumpTo).not.toHaveBeenCalled();
	});

	describe("waypoint editing", () => {
		it("renders a marker for each waypoint, not draggable until selected", () => {
			setGnss();
			setTrack();
			setMission([
				makeWaypoint({ id: "wp-1", position: { latitude: 59.0, longitude: 10.0 } }),
				makeWaypoint({ id: "wp-2", position: { latitude: 59.1, longitude: 10.1 } }),
			]);
			render(<MapWidget />);

			// markerInstances[0] is the own-ship marker; waypoint markers follow.
			const waypointMarkers = markerInstances.slice(1);
			expect(waypointMarkers).toHaveLength(2);
			expect(waypointMarkers[0]?.draggable).toBe(false);
			expect(waypointMarkers[0]?.lngLat).toEqual({ lng: 10.0, lat: 59.0 });
			expect(waypointMarkers[1]?.lngLat).toEqual({ lng: 10.1, lat: 59.1 });
		});

		it("becomes draggable only once its marker is clicked to select it", () => {
			setGnss();
			setTrack();
			setMission([makeWaypoint({ id: "wp-1" })]);
			render(<MapWidget />);

			const marker = markerInstances[1];
			expect(marker?.draggable).toBe(false);

			act(() => {
				marker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(marker?.draggable).toBe(true);
		});

		it("shows the idle-outline icon unselected, active-outline once selected, active-filled while dragging, and stays selected after drag ends", () => {
			setGnss();
			setTrack();
			setMission([makeWaypoint({ id: "wp-1" })]);
			render(<MapWidget />);

			const marker = markerInstances[1];
			expect(marker?.element.querySelector("obi-waypoint-optional-iec")).not.toBeNull();

			act(() => {
				marker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(marker?.element.querySelector("obi-waypoint-active-iec")).not.toBeNull();
			expect(marker?.element.querySelector("obi-waypoint-optional-iec")).toBeNull();

			marker?.emit("dragstart");
			expect(marker?.element.querySelector("obi-waypoint-active-filled")).not.toBeNull();
			expect(marker?.element.querySelector("obi-waypoint-active-iec")).toBeNull();

			marker?.emit("dragend");
			expect(marker?.element.querySelector("obi-waypoint-active-iec")).not.toBeNull();
			expect(marker?.element.querySelector("obi-waypoint-active-filled")).toBeNull();
		});

		it("deselects (and becomes non-draggable again) when the map is clicked away from any marker", () => {
			setGnss();
			setTrack();
			setMission([makeWaypoint({ id: "wp-1" })]);
			render(<MapWidget />);

			const marker = markerInstances[1];
			act(() => {
				marker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(marker?.draggable).toBe(true);

			act(() => {
				mapInstances[0]?.emit("click", { lngLat: { lat: 59.5, lng: 10.5 } });
			});

			expect(marker?.draggable).toBe(false);
			expect(marker?.element.querySelector("obi-waypoint-optional-iec")).not.toBeNull();
		});

		it("removes a waypoint's marker when it's deleted from the mission", () => {
			setGnss();
			setTrack();
			setMission([makeWaypoint({ id: "wp-1" }), makeWaypoint({ id: "wp-2" })]);
			const { rerender } = render(<MapWidget />);

			expect(markerInstances.slice(1)).toHaveLength(2);
			const removedMarker = markerInstances[1];

			setMission([makeWaypoint({ id: "wp-2" })]);
			act(() => {
				rerender(<MapWidget />);
			});

			expect(removedMarker?.remove).toHaveBeenCalled();
		});

		it("does not place a waypoint on map click while in the default edit mode", () => {
			setGnss();
			setTrack();
			setMission();
			render(<MapWidget />);

			mapInstances[0]?.emit("click", { lngLat: { lat: 59.5, lng: 10.5 } });

			expect(mockAddWaypoint).not.toHaveBeenCalled();
		});

		it("places a waypoint on map click after switching to add mode", () => {
			setGnss();
			setTrack();
			setMission();
			const { container } = render(<MapWidget />);

			dispatchToggleValue(findByLabel(container, "Route edit mode"), "add", "edit");
			mapInstances[0]?.emit("click", { lngLat: { lat: 59.5, lng: 10.5 } });

			expect(mockAddWaypoint).toHaveBeenCalledWith(59.5, 10.5);
		});

		it("sets a crosshair cursor while in add mode", () => {
			setGnss();
			setTrack();
			setMission();
			const { container } = render(<MapWidget />);

			expect(mapInstances[0]?.canvasStyle.cursor).toBe("");
			dispatchToggleValue(findByLabel(container, "Route edit mode"), "add", "edit");
			expect(mapInstances[0]?.canvasStyle.cursor).toBe("crosshair");
		});

		it("persists the new position when a waypoint marker drag ends", () => {
			setGnss();
			setTrack();
			setMission([
				makeWaypoint({ id: "wp-1", position: { latitude: 59.0, longitude: 10.0 } }),
			]);
			render(<MapWidget />);

			const wpMarker = markerInstances[1];
			wpMarker?.setLngLat([10.6, 59.4]);
			wpMarker?.emit("dragend");

			expect(mockUpdateWaypointPosition).toHaveBeenCalledWith("wp-1", 59.4, 10.6);
		});

		it("does not persist a position while a drag is still in progress", () => {
			setGnss();
			setTrack();
			setMission([
				makeWaypoint({ id: "wp-1", position: { latitude: 59.0, longitude: 10.0 } }),
				makeWaypoint({ id: "wp-2", position: { latitude: 59.1, longitude: 10.1 } }),
			]);
			render(<MapWidget />);
			mapInstances[0]?.emit("style.load");

			const wpMarker = markerInstances[1];
			wpMarker?.setLngLat([10.6, 59.4]);
			wpMarker?.emit("drag");

			expect(mockUpdateWaypointPosition).not.toHaveBeenCalled();
			// Live drag feedback still pushes an updated legs line into the source.
			expect(mapInstances[0]?.sources.get("mission-legs")?.setData).toHaveBeenCalled();
		});

		it("adds the mission-legs source and layer on style load", () => {
			setGnss();
			setTrack();
			setMission([makeWaypoint({ id: "wp-1" }), makeWaypoint({ id: "wp-2" })]);
			render(<MapWidget />);

			mapInstances[0]?.emit("style.load");

			expect(mapInstances[0]?.addSource).toHaveBeenCalledWith(
				"mission-legs",
				expect.objectContaining({ type: "geojson" }),
			);
			expect(mapInstances[0]?.addLayer).toHaveBeenCalledWith(
				expect.objectContaining({ id: "mission-legs-casing" }),
			);
			expect(mapInstances[0]?.addLayer).toHaveBeenCalledWith(
				expect.objectContaining({ id: "mission-legs-line" }),
			);
			// The casing must render before (i.e. underneath) the colored line.
			const casingCallIndex = mapInstances[0]?.addLayer.mock.calls.findIndex(
				(call: unknown[]) => (call[0] as { id?: string }).id === "mission-legs-casing",
			);
			const lineCallIndex = mapInstances[0]?.addLayer.mock.calls.findIndex(
				(call: unknown[]) => (call[0] as { id?: string }).id === "mission-legs-line",
			);
			expect(casingCallIndex).toBeLessThan(lineCallIndex ?? -1);
		});

		it("recomputes leg hazards once the map settles, correcting an evaluation that ran before tiles loaded", () => {
			// Regression test: waypoints can arrive (and trigger the waypoints-effect's evaluation)
			// before the map's vector tiles have actually loaded, which queryRenderedFeatures sees
			// as empty results everywhere -- read by the coverage check as "no charted data", so
			// every leg reported no_data/grey until some unrelated interaction happened to trigger
			// another recompute. The map's own "idle" event (fires once loading/rendering settles)
			// should correct this without needing a waypoint change.
			setGnss();
			setTrack();
			setMission([
				makeWaypoint({ id: "wp-1", position: { latitude: 59.0, longitude: 10.0 } }),
				makeWaypoint({ id: "wp-2", position: { latitude: 59.1, longitude: 10.1 } }),
			]);
			render(<MapWidget />);
			mapInstances[0]?.emit("style.load");

			// Mount-time evaluation already ran via the waypoints effect, with the mock's default
			// queryRenderedFeatures() -> [] standing in for "tiles not loaded yet" -- confirm that
			// actually produced no_data, or the rest of this test isn't exercising the bug at all.
			const beforeIdle = mockSetLegValidation.mock.calls.at(-1)?.[0] as
				| Record<string, { status: string }>
				| undefined;
			expect(beforeIdle?.["wp-2"]?.status).toBe("no_data");
			mockSetLegValidation.mockClear();

			// Tiles finish loading: queryRenderedFeatures now returns real (covered, hazard-free)
			// data, and the map fires "idle".
			if (mapInstances[0]) {
				mapInstances[0].queryRenderedFeatures = vi.fn(() => [
					{ layer: { id: "m_covr" }, properties: { CATCOV: 1 } },
				]);
			}
			mapInstances[0]?.emit("idle");

			expect(mockSetLegValidation).toHaveBeenCalled();
			const afterIdle = mockSetLegValidation.mock.calls.at(-1)?.[0] as
				| Record<string, { status: string }>
				| undefined;
			expect(afterIdle?.["wp-2"]?.status).toBe("safe");
		});
	});

	describe("AIS target details", () => {
		function makeAisTarget(overrides: Partial<AisTarget> = {}): AisTarget {
			return {
				mmsi: 123456789,
				lat: 59.9,
				lon: 10.7,
				sogKn: 12.3,
				headingDeg: 90,
				cogDeg: 95,
				turnDegPerMin: 2,
				navStatus: 0,
				stale: false,
				...overrides,
			};
		}

		it("opens a popup with the target's details when its marker is clicked", () => {
			setGnss();
			setTrack();
			setMission();
			mockUseAisTargets.mockReturnValue([makeAisTarget()]);
			render(<MapWidget />);

			const aisMarker = markerInstances[1];
			act(() => {
				aisMarker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(popupInstances).toHaveLength(1);
			expect(popupInstances[0]?.lngLat).toEqual({ lng: 10.7, lat: 59.9 });
			const content = popupInstances[0]?.content;
			// MMSI is set as the obc-toggletip's own "title" property (rendered in its shadow root,
			// so not part of textContent below), not a light-DOM row like the other fields.
			expect(content?.tagName.toLowerCase()).toBe("obc-toggletip");
			expect((content as unknown as { title?: string } | undefined)?.title).toBe(
				"MMSI 123456789",
			);
			expect(content?.textContent).toContain("12.3 kn");
		});

		it("does not fall through to the map's own click handler (e.g. placing a waypoint)", () => {
			setGnss();
			setTrack();
			setMission();
			mockUseAisTargets.mockReturnValue([makeAisTarget()]);
			const { container } = render(<MapWidget />);
			dispatchToggleValue(findByLabel(container, "Route edit mode"), "add", "edit");

			const aisMarker = markerInstances[1];
			act(() => {
				aisMarker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			expect(mockAddWaypoint).not.toHaveBeenCalled();
			expect(popupInstances).toHaveLength(1);
		});

		it("moves and refreshes the open popup as the target updates", () => {
			setGnss();
			setTrack();
			setMission();
			mockUseAisTargets.mockReturnValue([makeAisTarget()]);
			const { rerender } = render(<MapWidget />);

			const aisMarker = markerInstances[1];
			act(() => {
				aisMarker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});

			mockUseAisTargets.mockReturnValue([
				makeAisTarget({ lat: 59.95, lon: 10.75, sogKn: 5 }),
			]);
			act(() => {
				rerender(<MapWidget />);
			});

			expect(popupInstances[0]?.setLngLat).toHaveBeenCalledWith([10.75, 59.95]);
			expect(popupInstances[0]?.content?.textContent).toContain("5.0 kn");
		});

		it("clears the selection and removes the popup when it fires its own close event", () => {
			setGnss();
			setTrack();
			setMission();
			mockUseAisTargets.mockReturnValue([makeAisTarget()]);
			render(<MapWidget />);

			const aisMarker = markerInstances[1];
			act(() => {
				aisMarker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(popupInstances).toHaveLength(1);

			// The popup's own closeOnClick/close-button dismissal fires "close"; the hook listens
			// for that to clear selectedMmsi, which in turn tears the popup down on the next effect
			// pass -- exactly what this simulates.
			act(() => {
				popupInstances[0]?.emit("close");
			});

			expect(popupInstances[0]?.remove).toHaveBeenCalled();
		});

		it("closes the popup when the selected target expires", () => {
			setGnss();
			setTrack();
			setMission();
			mockUseAisTargets.mockReturnValue([makeAisTarget()]);
			const { rerender } = render(<MapWidget />);

			const aisMarker = markerInstances[1];
			act(() => {
				aisMarker?.element.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			});
			expect(popupInstances).toHaveLength(1);

			mockUseAisTargets.mockReturnValue([]);
			act(() => {
				rerender(<MapWidget />);
			});

			expect(popupInstances[0]?.remove).toHaveBeenCalled();
		});
	});
});
