import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { LidarScanMsg, PointCloudMsg } from "@revolt/shared-types";
import { LidarWidget } from "./LidarWidget.js";
import { useLidarData, type LidarData } from "../../hooks/useLidarData.js";
import { usePointCloudData, type PointCloudData } from "../../hooks/usePointCloudData.js";

vi.mock("../../hooks/useLidarData.js", () => ({
	useLidarData: vi.fn(),
}));
vi.mock("../../hooks/usePointCloudData.js", () => ({
	usePointCloudData: vi.fn(),
}));
// The real Lidar3DScene mounts an r3f <Canvas>, which needs a WebGL context jsdom doesn't
// provide -- stubbed here so the 2D/3D toggle tests can assert on which component rendered
// without touching r3f internals (Lidar3DScene has its own dedicated test for that).
vi.mock("./Lidar3DScene.js", () => ({
	Lidar3DScene: vi.fn(() => <div data-testid="lidar-3d-scene" />),
}));

const mockUseLidarData = useLidarData as Mock;
const mockUsePointCloudData = usePointCloudData as Mock;

// jsdom implements HTMLCanvasElement but not its 2D rendering context -- getContext("2d")
// returns null by default, which the widget already guards against (drawing is skipped
// entirely). Stubbing a fake context lets these tests instead assert on which drawing calls the
// widget actually made, the same way a real canvas-testing setup would.
class FakeContext2D {
	fillStyle = "";
	strokeStyle = "";
	lineWidth = 0;
	font = "";
	textAlign = "";
	textBaseline = "";
	clearRect = vi.fn();
	beginPath = vi.fn();
	arc = vi.fn();
	fill = vi.fn();
	stroke = vi.fn();
	save = vi.fn();
	restore = vi.fn();
	clip = vi.fn();
	translate = vi.fn();
	rotate = vi.fn();
	fillRect = vi.fn();
	fillText = vi.fn();
}

let fakeCtx: FakeContext2D;

beforeEach(() => {
	fakeCtx = new FakeContext2D();
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
		fakeCtx as unknown as CanvasRenderingContext2D,
	);
	// Default: no point cloud yet, so tests that only set up useLidarData fall back to /scan
	// points exactly like before point-cloud support existed. Overridden per-test where needed.
	mockUsePointCloudData.mockReturnValue(makePointCloudData());
});

afterEach(() => {
	cleanup();
	vi.restoreAllMocks();
});

function makeScan(overrides: Partial<LidarScanMsg> = {}): LidarScanMsg {
	return {
		v: "1",
		type: "lidar_scan",
		timestamp_ms: 0,
		angle_min: 0,
		angle_max: Math.PI,
		angle_increment: Math.PI / 4,
		range_min: 0.1,
		range_max: 25,
		ranges: [5, 5, 5, 5, 5],
		...overrides,
	};
}

function makeLidarData(overrides: Partial<LidarData> = {}): LidarData {
	return { scan: null, points: [], ...overrides };
}

function makeCloud(overrides: Partial<PointCloudMsg> = {}): PointCloudMsg {
	return {
		v: "1",
		type: "point_cloud",
		timestamp_ms: 0,
		points: [],
		point_count: 0,
		...overrides,
	};
}

function makePointCloudData(overrides: Partial<PointCloudData> = {}): PointCloudData {
	return { cloud: null, points: [], ...overrides };
}

// ObcStepperBox's own up/down buttons live in its shadow DOM, not reachable via RTL's usual
// role/label queries -- same technique MapWidget.test.tsx uses for its own stepper box: find the
// host element by aria-label and dispatch the custom "up"/"down" events it fires directly.
function findByLabel(container: HTMLElement, label: string): Element {
	const el = container.querySelector(`[aria-label="${label}"]`);
	if (!el) throw new Error(`element not found: ${label}`);
	return el;
}

describe("LidarWidget", () => {
	it("draws a 'No data' label when there is no scan yet", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget />);
		expect(fakeCtx.fillText).toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("draws a filled point for each lidar return once a scan arrives", () => {
		mockUseLidarData.mockReturnValue(
			makeLidarData({
				scan: makeScan(),
				points: [
					{ x: 1, y: 2 },
					{ x: -3, y: 4 },
				],
			}),
		);
		render(<LidarWidget />);
		expect(fakeCtx.fillRect).toHaveBeenCalledTimes(2);
		expect(fakeCtx.fillText).not.toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("renders the canvas with an accessible label", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget />);
		expect(screen.getByLabelText("2D lidar scan view")).toBeInTheDocument();
	});

	it("starts at the default 50 m range and steps in/out through the fixed zoom levels", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		const { container } = render(<LidarWidget />);
		expect(screen.getByText("50")).toBeInTheDocument();
		const stepper = findByLabel(container, "Lidar range");

		act(() => {
			stepper.dispatchEvent(new CustomEvent("up"));
		});
		expect(screen.getByText("20")).toBeInTheDocument();

		act(() => {
			stepper.dispatchEvent(new CustomEvent("down"));
			stepper.dispatchEvent(new CustomEvent("down"));
		});
		expect(screen.getByText("100")).toBeInTheDocument();
	});

	it("stays pinned at the closest and widest zoom steps rather than wrapping", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		const { container } = render(<LidarWidget />);
		const stepper = findByLabel(container, "Lidar range");

		act(() => {
			for (let i = 0; i < 10; i++) stepper.dispatchEvent(new CustomEvent("up"));
		});
		expect(screen.getByText("5")).toBeInTheDocument();

		act(() => {
			for (let i = 0; i < 10; i++) stepper.dispatchEvent(new CustomEvent("down"));
		});
		expect(screen.getByText("130")).toBeInTheDocument();
	});

	it("zooms via mouse wheel over the canvas area, in on scroll-up and out on scroll-down", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget />);
		expect(screen.getByText("50")).toBeInTheDocument();

		const canvasArea = screen.getByLabelText("2D lidar scan view").parentElement;
		if (!canvasArea) throw new Error("canvas has no parent element");

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: -100 });
		});
		expect(screen.getByText("20")).toBeInTheDocument();

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: 100 });
		});
		expect(screen.getByText("50")).toBeInTheDocument();
	});

	it("prefers point-cloud points over /scan points when both are present", () => {
		mockUseLidarData.mockReturnValue(
			makeLidarData({ scan: makeScan(), points: [{ x: 1, y: 1 }] }),
		);
		mockUsePointCloudData.mockReturnValue(
			makePointCloudData({
				cloud: makeCloud({ points: [1, 2, 3, 4, 5, 6, 7, 8, 9], point_count: 3 }),
				points: [
					{ x: 1, y: 2, z: 3 },
					{ x: 4, y: 5, z: 6 },
					{ x: 7, y: 8, z: 9 },
				],
			}),
		);
		render(<LidarWidget />);
		expect(fakeCtx.fillRect).toHaveBeenCalledTimes(3);
	});

	it("falls back to /scan points when the point cloud is empty", () => {
		mockUseLidarData.mockReturnValue(
			makeLidarData({
				scan: makeScan(),
				points: [
					{ x: 1, y: 2 },
					{ x: -3, y: 4 },
				],
			}),
		);
		mockUsePointCloudData.mockReturnValue(makePointCloudData());
		render(<LidarWidget />);
		expect(fakeCtx.fillRect).toHaveBeenCalledTimes(2);
	});

	it("renders the 2D canvas, not the 3D scene, when viewMode is undefined or 'detailed'", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget />);
		expect(screen.getByLabelText("2D lidar scan view")).toBeInTheDocument();
		expect(screen.queryByTestId("lidar-3d-scene")).not.toBeInTheDocument();

		cleanup();
		render(<LidarWidget viewMode="detailed" />);
		expect(screen.getByLabelText("2D lidar scan view")).toBeInTheDocument();
		expect(screen.queryByTestId("lidar-3d-scene")).not.toBeInTheDocument();
	});

	it("renders the 3D scene instead of the 2D canvas when viewMode is 'instrument'", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		mockUsePointCloudData.mockReturnValue(
			makePointCloudData({ points: [{ x: 1, y: 2, z: 3 }] }),
		);
		render(<LidarWidget viewMode="instrument" />);
		expect(screen.getByTestId("lidar-3d-scene")).toBeInTheDocument();
		expect(screen.queryByLabelText("2D lidar scan view")).not.toBeInTheDocument();
	});

	it("hides the zoom stepper in 3D mode, since the zoom ladder is a 2D-only concept", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget viewMode="instrument" />);
		expect(screen.queryByLabelText("Lidar range")).not.toBeInTheDocument();
	});
});
