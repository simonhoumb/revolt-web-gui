import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { RadarSpokeMsg } from "@revolt/shared-types";
import { RadarWidget } from "./RadarWidget.js";
import { useRadarData, type RadarData } from "../../hooks/useRadarData.js";

vi.mock("../../hooks/useRadarData.js", () => ({
	useRadarData: vi.fn(),
}));

const mockUseRadarData = useRadarData as Mock;

// Same technique as LidarWidget.test.tsx -- jsdom has no 2D canvas context, so a fake one lets
// these tests assert on which drawing calls the widget actually made.
class FakeContext2D {
	fillStyle = "";
	strokeStyle = "";
	lineWidth = 0;
	font = "";
	textAlign = "";
	textBaseline = "";
	globalAlpha = 1;
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

function makeSpoke(overrides: Partial<RadarSpokeMsg> = {}): RadarSpokeMsg {
	return {
		v: "1",
		type: "radar_spoke",
		timestamp_ms: 0,
		azimuth: 0,
		range_start: 5,
		range_increment: 10,
		num_samples: 4,
		min_intensity: 0,
		max_intensity: 255,
		intensity: [50, 100, 150, 200],
		...overrides,
	};
}

function makeRadarData(overrides: Partial<RadarData> = {}): RadarData {
	return { spokes: [], ...overrides };
}

// Unlike LidarWidget (which draws synchronously in its effect), RadarWidget batches the draw via
// requestAnimationFrame so bursts of spoke messages coalesce into one paint per frame -- tests
// need to flush that frame before asserting on canvas calls.
async function flushRaf(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

describe("RadarWidget", () => {
	it("draws a 'No data' label when the sweep buffer is empty", async () => {
		mockUseRadarData.mockReturnValue(makeRadarData());
		render(<RadarWidget />);
		await flushRaf();
		expect(fakeCtx.fillText).toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("draws a filled point for each sample above the intensity floor once spokes arrive", async () => {
		mockUseRadarData.mockReturnValue(makeRadarData({ spokes: [makeSpoke()] }));
		render(<RadarWidget />);
		await flushRaf();
		// min_intensity=0, so all 4 samples clear the "intensity <= min_intensity" skip.
		expect(fakeCtx.fillRect).toHaveBeenCalledTimes(4);
		expect(fakeCtx.fillText).not.toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("renders the canvas with an accessible label", () => {
		mockUseRadarData.mockReturnValue(makeRadarData());
		render(<RadarWidget />);
		expect(screen.getByLabelText("Radar PPI view")).toBeInTheDocument();
	});

	it("starts at the default 1 NM range and steps in/out through the fixed zoom levels", () => {
		mockUseRadarData.mockReturnValue(makeRadarData());
		render(<RadarWidget />);
		expect(screen.getByText("1 NM")).toBeInTheDocument();

		act(() => {
			screen.getByLabelText("Zoom in").click();
		});
		expect(screen.getByText("3/4 NM")).toBeInTheDocument();

		act(() => {
			screen.getByLabelText("Zoom out").click();
			screen.getByLabelText("Zoom out").click();
		});
		expect(screen.getByText("1.5 NM")).toBeInTheDocument();
	});

	it("disables zoom in at the closest step and zoom out at the widest step", () => {
		mockUseRadarData.mockReturnValue(makeRadarData());
		render(<RadarWidget />);

		act(() => {
			for (let i = 0; i < 20; i++) screen.getByLabelText("Zoom in").click();
		});
		expect(screen.getByText("1/16 NM")).toBeInTheDocument();
		expect(screen.getByLabelText("Zoom in")).toBeDisabled();

		act(() => {
			for (let i = 0; i < 20; i++) screen.getByLabelText("Zoom out").click();
		});
		expect(screen.getByText("48 NM")).toBeInTheDocument();
		expect(screen.getByLabelText("Zoom out")).toBeDisabled();
	});

	it("zooms via mouse wheel over the canvas area, in on scroll-up and out on scroll-down", () => {
		mockUseRadarData.mockReturnValue(makeRadarData());
		render(<RadarWidget />);
		expect(screen.getByText("1 NM")).toBeInTheDocument();

		const canvasArea = screen.getByLabelText("Radar PPI view").parentElement;
		if (!canvasArea) throw new Error("canvas has no parent element");

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: -100 });
		});
		expect(screen.getByText("3/4 NM")).toBeInTheDocument();

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: 100 });
		});
		expect(screen.getByText("1 NM")).toBeInTheDocument();
	});
});
