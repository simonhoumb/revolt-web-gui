import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { LidarScanMsg } from "@revolt/shared-types";
import { LidarWidget } from "./LidarWidget.js";
import { useLidarData, type LidarData } from "../../hooks/useLidarData.js";

vi.mock("../../hooks/useLidarData.js", () => ({
	useLidarData: vi.fn(),
}));

const mockUseLidarData = useLidarData as Mock;

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
		render(<LidarWidget />);
		expect(screen.getByText("50 m")).toBeInTheDocument();

		act(() => {
			screen.getByLabelText("Zoom in").click();
		});
		expect(screen.getByText("20 m")).toBeInTheDocument();

		act(() => {
			screen.getByLabelText("Zoom out").click();
			screen.getByLabelText("Zoom out").click();
		});
		expect(screen.getByText("100 m")).toBeInTheDocument();
	});

	it("disables zoom in at the closest step and zoom out at the widest step", () => {
		mockUseLidarData.mockReturnValue(makeLidarData());
		render(<LidarWidget />);

		act(() => {
			for (let i = 0; i < 10; i++) screen.getByLabelText("Zoom in").click();
		});
		expect(screen.getByText("5 m")).toBeInTheDocument();
		expect(screen.getByLabelText("Zoom in")).toBeDisabled();

		act(() => {
			for (let i = 0; i < 10; i++) screen.getByLabelText("Zoom out").click();
		});
		expect(screen.getByText("130 m")).toBeInTheDocument();
		expect(screen.getByLabelText("Zoom out")).toBeDisabled();
	});
});
