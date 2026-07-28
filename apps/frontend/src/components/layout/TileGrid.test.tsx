import { useEffect } from "react";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { TileGrid } from "./TileGrid.js";
import { nextNeededRowsBasis } from "./neededRowsBasis.js";
import { useLayout } from "../../context/useLayout.js";
import { useApps } from "../../context/useApps.js";
import { APPS } from "../widgets/apps.js";

vi.mock("../../context/useLayout.js", () => ({
	useLayout: vi.fn(),
}));

vi.mock("../../context/useApps.js", () => ({
	useApps: vi.fn(),
}));

// TileGrid renders the real widget components registered for each configured tile id (e.g. the
// real BatteryWidget/GnssWidget), which read live telemetry via useBridgeData() -- stub it so
// tiles mount without needing a real BridgeDataProvider, matching how App.test.tsx isn't
// exercising these widgets' own data-driven behavior, just TileGrid's layout wiring.
vi.mock("../../context/useBridgeData.js", () => ({
	useBridgeData: vi.fn(() => ({
		battery: null,
		current: { stern_port: null, stern_star: null, bow: null },
		gnssFix: null,
		gnssHeading: null,
		gnssVelocity: null,
		gnssVelocityPhysical: null,
		controlMode: null,
		emergencyStop: null,
		linearActuator: null,
		bridgeStatus: null,
		cameraStatus: null,
		thrusterFeedback: { bow: null, port: null, starboard: null },
		lidarScan: null,
		pointCloud: null,
		activeWaypointList: null,
		missionSendStatus: null,
		missionExecutionStatus: null,
		wsConnected: false,
		bridgeConnected: false,
		latencyMs: null,
	})),
}));

// react-grid-layout does real drag/resize math against actual DOM layout that jsdom doesn't
// compute (no real layout engine) -- TileGrid's own logic (rowHeight/maxRows derivation, mapping
// config.tiles to Layout props, and what it does with the drag/resize/layout-change callbacks)
// is what these tests care about, so replace GridLayout with a stub that renders its children and
// exposes the exact props it was last called with for the test to invoke directly.
interface CapturedGridLayoutProps {
	width: number;
	layout: { i: string; x: number; y: number; w: number; h: number }[];
	gridConfig: { rowHeight: number; maxRows: number | undefined };
	dragConfig: { enabled: boolean };
	onDrag: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
	onResize: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
	onDragStop: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
	onResizeStop: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
	onLayoutChange: (layout: { i: string; x: number; y: number; w: number; h: number }[]) => void;
	children?: React.ReactNode;
}

let lastGridLayoutProps: CapturedGridLayoutProps | null = null;
let gridLayoutMountCount = 0;

vi.mock("react-grid-layout", () => ({
	GridLayout: (props: CapturedGridLayoutProps) => {
		lastGridLayoutProps = props;
		// Runs once per mount (not per re-render), so this counts how many times TileGrid's
		// key={`${activeAppId}-${gridKey}`} actually forced a fresh GridLayout instance, the
		// mechanism per-app widget view-mode state relies on to reset when switching apps.
		useEffect(() => {
			gridLayoutMountCount += 1;
		}, []);
		return props.children;
	},
}));

const mockUseLayout = useLayout as Mock;
const mockUseApps = useApps as Mock;

// A fabricated locked app, deliberately built only from widgets ("battery"/"gnss") the mocked
// BridgeDataContext above already supports, rather than the real APPS.conning (which includes
// thruster/imu/map, each needing more context than this file sets up, e.g. MissionProvider for
// MapWidget). These tests are about TileGrid's own tile-source branching, not real widget
// rendering, so a minimal fixture keeps that distinction clear.
const testLockedApp: (typeof APPS)["conning"] = {
	id: "conning",
	label: "Test Locked App",
	icon: () => null,
	kind: "locked",
	tiles: [{ i: "battery", x: 0, y: 0, w: 3, h: 5 }],
};

function setLayout(overrides: Partial<ReturnType<typeof useLayout>> = {}) {
	mockUseLayout.mockReturnValue({
		config: {
			tiles: [
				{ i: "battery", x: 0, y: 0, w: 3, h: 5 },
				{ i: "gnss", x: 3, y: 0, w: 3, h: 5 },
			],
			hiddenWidgets: [],
		},
		updateLayout: vi.fn(),
		editMode: false,
		removeWidget: vi.fn(),
		layoutGeneration: 0,
		...overrides,
	});
}

function setApp(overrides: Partial<ReturnType<typeof useApps>> = {}) {
	mockUseApps.mockReturnValue({
		activeAppId: "custom",
		appDef: APPS.custom,
		isLocked: false,
		setActiveApp: vi.fn(),
		...overrides,
	});
}

beforeEach(() => {
	setApp();
});

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	lastGridLayoutProps = null;
	gridLayoutMountCount = 0;
});

describe("TileGrid", () => {
	it("renders a tile for every configured widget", () => {
		setLayout();
		render(<TileGrid />);
		// TileCard's own title text renders inside obc-title-container's shadow root (not
		// queryable via screen.getByText -- see TileCard.test.tsx); assert on each widget's own
		// distinctive rendered content instead. Both widgets default to instrument view (no
		// viewMode override wired up in this test), so "Lat" (a detailed-view-only label) isn't
		// present -- obc-compass is GnssWidget's instrument-view content instead.
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(document.querySelector("obc-compass")).not.toBeNull();
	});

	it("uses a widget's own defaultViewMode instead of the shared DEFAULT_VIEW_MODE when set", () => {
		// lidar's registry entry sets defaultViewMode: "detailed" (2D) specifically because 3D is
		// heavier to render and less useful for a first look -- unlike gnss/battery above, which
		// have no override and fall through to the shared "instrument" default.
		setLayout({
			config: {
				tiles: [{ i: "lidar", x: 0, y: 0, w: 2, h: 5 }],
				hiddenWidgets: [],
			},
		});
		render(<TileGrid />);
		expect(screen.getByLabelText("2D lidar scan view")).toBeInTheDocument();
	});

	it("maps each configured tile's position/size into the GridLayout layout prop", () => {
		setLayout();
		render(<TileGrid />);
		expect(lastGridLayoutProps?.layout).toEqual([
			expect.objectContaining({ i: "battery", x: 0, y: 0, w: 3, h: 5 }),
			expect.objectContaining({ i: "gnss", x: 3, y: 0, w: 3, h: 5 }),
		]);
	});

	it("passes updateLayout the new tile positions on layout change", () => {
		const updateLayout = vi.fn();
		setLayout({ updateLayout });
		render(<TileGrid />);

		act(() => {
			lastGridLayoutProps?.onLayoutChange([
				{ i: "battery", x: 1, y: 0, w: 3, h: 5 },
				{ i: "gnss", x: 4, y: 0, w: 3, h: 5 },
			]);
		});
		expect(updateLayout).toHaveBeenCalledWith([
			{ i: "battery", x: 1, y: 0, w: 3, h: 5 },
			{ i: "gnss", x: 4, y: 0, w: 3, h: 5 },
		]);
	});

	it("only enables dragging/resizing while in edit mode", () => {
		setLayout({ editMode: true });
		render(<TileGrid />);
		expect(lastGridLayoutProps?.dragConfig.enabled).toBe(true);

		cleanup();
		setLayout({ editMode: false });
		render(<TileGrid />);
		expect(lastGridLayoutProps?.dragConfig.enabled).toBe(false);
	});

	it("renders a locked app's own static tiles instead of config.tiles", () => {
		setLayout();
		setApp({ activeAppId: "conning", appDef: testLockedApp, isLocked: true });
		render(<TileGrid />);
		expect(lastGridLayoutProps?.layout.map((t) => t.i)).toEqual(["battery"]);
		// gnss from the mocked customizable-dashboard config.tiles must not leak in
		expect(screen.queryByText("Lat")).not.toBeInTheDocument();
	});

	it("disables dragging/resizing for a locked app even if editMode is true", () => {
		setLayout({ editMode: true });
		setApp({ activeAppId: "conning", appDef: testLockedApp, isLocked: true });
		render(<TileGrid />);
		expect(lastGridLayoutProps?.dragConfig.enabled).toBe(false);
	});

	it("does not call updateLayout on layout change for a locked app", () => {
		const updateLayout = vi.fn();
		setLayout({ updateLayout, editMode: true });
		setApp({ activeAppId: "conning", appDef: testLockedApp, isLocked: true });
		render(<TileGrid />);

		act(() => {
			lastGridLayoutProps?.onLayoutChange([{ i: "battery", x: 1, y: 0, w: 3, h: 5 }]);
		});
		expect(updateLayout).not.toHaveBeenCalled();
	});

	it("remounts the grid when the active app changes", () => {
		setLayout();
		setApp({ activeAppId: "custom", appDef: APPS.custom, isLocked: false });
		const { rerender } = render(<TileGrid />);
		expect(gridLayoutMountCount).toBe(1);

		setApp({ activeAppId: "conning", appDef: testLockedApp, isLocked: true });
		rerender(<TileGrid />);
		expect(gridLayoutMountCount).toBe(2);
	});
});

describe("nextNeededRowsBasis", () => {
	// Regression coverage for the "shrinking a tile doesn't visibly shrink it" bug: a tile's
	// pixel height is h * rowHeight, and rowHeight is derived from neededRows, so a naive
	// Math.max(...) recomputed every render would let shrinking the deepest tile grow rowHeight
	// right back. See TileGrid.tsx's comment on nextNeededRowsBasis for the full mechanism.

	it("adopts the raw value on the very first call (generation -1 sentinel)", () => {
		const result = nextNeededRowsBasis({ generation: -1, rows: 1 }, 0, 28);
		expect(result).toEqual({ generation: 0, rows: 28 });
	});

	it("does not shrink within the same generation, even if the raw value drops", () => {
		const afterFirstFit = nextNeededRowsBasis({ generation: -1, rows: 1 }, 0, 28);
		// Operator shrinks the deepest tile's h -- raw value drops to 24, same generation.
		const afterShrink = nextNeededRowsBasis(afterFirstFit, 0, 24);
		expect(afterShrink.rows).toBe(28);
	});

	it("grows within the same generation if a tile is resized/moved taller than the basis", () => {
		const afterFirstFit = nextNeededRowsBasis({ generation: -1, rows: 1 }, 0, 28);
		const afterGrow = nextNeededRowsBasis(afterFirstFit, 0, 32);
		expect(afterGrow.rows).toBe(32);
	});

	it("re-fits to the raw value when the generation changes, even if that's smaller", () => {
		const afterFirstFit = nextNeededRowsBasis({ generation: -1, rows: 1 }, 0, 28);
		// A widget was removed (layoutGeneration bumped to 1): the grid should re-fit tighter,
		// not stay pinned at the old, now-irrelevant basis.
		const afterRemoval = nextNeededRowsBasis(afterFirstFit, 1, 20);
		expect(afterRemoval).toEqual({ generation: 1, rows: 20 });
	});

	it("returns the same object reference when nothing changes, for stability", () => {
		const basis = { generation: 0, rows: 28 };
		expect(nextNeededRowsBasis(basis, 0, 20)).toBe(basis);
	});
});
