import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { TileGrid } from "./TileGrid.js";
import { useLayout } from "../../context/LayoutContext.js";

vi.mock("../../context/LayoutContext.js", () => ({
	useLayout: vi.fn(),
}));

// TileGrid renders the real widget components registered for each configured tile id (e.g. the
// real BatteryWidget/GnssWidget), which read live telemetry via useBridgeData() -- stub it so
// tiles mount without needing a real BridgeDataProvider, matching how App.test.tsx isn't
// exercising these widgets' own data-driven behavior, just TileGrid's layout wiring.
vi.mock("../../context/BridgeDataContext.js", () => ({
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

vi.mock("react-grid-layout", () => ({
	GridLayout: (props: CapturedGridLayoutProps) => {
		lastGridLayoutProps = props;
		return props.children;
	},
}));

const mockUseLayout = useLayout as Mock;

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
		...overrides,
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
	lastGridLayoutProps = null;
});

describe("TileGrid", () => {
	it("renders a tile for every configured widget", () => {
		setLayout();
		render(<TileGrid />);
		// TileCard's own title text renders inside obc-title-container's shadow root (not
		// queryable via screen.getByText -- see TileCard.test.tsx); assert on each widget's own
		// distinctive rendered content instead.
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(screen.getByText("Lat")).toBeInTheDocument();
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
});
