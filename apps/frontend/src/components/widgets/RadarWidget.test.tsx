import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { RadarWidget } from "./RadarWidget.js";
import {
	useRadarPointsData,
	type RadarPointsData,
	type RadarPoint,
} from "../../hooks/useRadarPointsData.js";

vi.mock("../../hooks/useRadarPointsData.js", () => ({
	useRadarPointsData: vi.fn(),
}));

const mockUseRadarPointsData = useRadarPointsData as Mock;

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

function makePoint(overrides: Partial<RadarPoint> = {}): RadarPoint {
	return { x: 10, y: 0, z: 0, intensity: 200, ...overrides };
}

function makeRadarPointsData(overrides: Partial<RadarPointsData> = {}): RadarPointsData {
	return { cloud: null, points: [], stale: false, ...overrides };
}

// Unlike LidarWidget (which draws synchronously in its effect), RadarWidget batches the draw via
// requestAnimationFrame -- carried over from when it consumed /radar/spoke, where bursts of
// messages needed coalescing into one paint per frame; tests still need to flush that frame
// before asserting on canvas calls.
async function flushRaf(): Promise<void> {
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 20));
	});
}

// ObcStepperBox's own up/down buttons live in its shadow DOM, not reachable via RTL's usual
// role/label queries -- same technique MapWidget.test.tsx uses for its own stepper box: find the
// host element by aria-label and dispatch the custom "up"/"down" events it fires directly.
function findByLabel(container: HTMLElement, label: string): Element {
	const el = container.querySelector(`[aria-label="${label}"]`);
	if (!el) throw new Error(`element not found: ${label}`);
	return el;
}

describe("RadarWidget", () => {
	it("draws a 'No data' label when there are no points", async () => {
		mockUseRadarPointsData.mockReturnValue(makeRadarPointsData());
		render(<RadarWidget />);
		await flushRaf();
		expect(fakeCtx.fillText).toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("draws a filled point for each point within the display range once points arrive", async () => {
		mockUseRadarPointsData.mockReturnValue(
			makeRadarPointsData({
				points: [
					makePoint({ x: 10, y: 0 }),
					makePoint({ x: 0, y: 20 }),
					makePoint({ x: 5, y: 5 }),
				],
			}),
		);
		render(<RadarWidget />);
		await flushRaf();
		expect(fakeCtx.fillRect).toHaveBeenCalledTimes(3);
		expect(fakeCtx.fillText).not.toHaveBeenCalledWith(
			"No data",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("skips points outside the current display range", async () => {
		// Default zoom is 1 NM (~1852 m); this point is far beyond it.
		mockUseRadarPointsData.mockReturnValue(
			makeRadarPointsData({ points: [makePoint({ x: 50_000, y: 0 })] }),
		);
		render(<RadarWidget />);
		await flushRaf();
		expect(fakeCtx.fillRect).not.toHaveBeenCalled();
	});

	it("renders the canvas with an accessible label", () => {
		mockUseRadarPointsData.mockReturnValue(makeRadarPointsData());
		render(<RadarWidget />);
		expect(screen.getByLabelText("Radar PPI view")).toBeInTheDocument();
	});

	it("starts at the default 1 NM range and steps in/out through the fixed zoom levels", () => {
		mockUseRadarPointsData.mockReturnValue(makeRadarPointsData());
		const { container } = render(<RadarWidget />);
		expect(screen.getByText("1")).toBeInTheDocument();
		const stepper = findByLabel(container, "Radar range");

		act(() => {
			stepper.dispatchEvent(new CustomEvent("up"));
		});
		expect(screen.getByText("3/4")).toBeInTheDocument();

		act(() => {
			stepper.dispatchEvent(new CustomEvent("down"));
			stepper.dispatchEvent(new CustomEvent("down"));
		});
		expect(screen.getByText("1.5")).toBeInTheDocument();
	});

	it("stays pinned at the closest and widest zoom steps rather than wrapping", () => {
		mockUseRadarPointsData.mockReturnValue(makeRadarPointsData());
		const { container } = render(<RadarWidget />);
		const stepper = findByLabel(container, "Radar range");

		act(() => {
			for (let i = 0; i < 20; i++) stepper.dispatchEvent(new CustomEvent("up"));
		});
		expect(screen.getByText("1/16")).toBeInTheDocument();

		act(() => {
			for (let i = 0; i < 20; i++) stepper.dispatchEvent(new CustomEvent("down"));
		});
		expect(screen.getByText("48")).toBeInTheDocument();
	});

	it("zooms via mouse wheel over the canvas area, in on scroll-up and out on scroll-down", () => {
		mockUseRadarPointsData.mockReturnValue(makeRadarPointsData());
		render(<RadarWidget />);
		expect(screen.getByText("1")).toBeInTheDocument();

		const canvasArea = screen.getByLabelText("Radar PPI view").parentElement;
		if (!canvasArea) throw new Error("canvas has no parent element");

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: -100 });
		});
		expect(screen.getByText("3/4")).toBeInTheDocument();

		act(() => {
			fireEvent.wheel(canvasArea, { deltaY: 100 });
		});
		expect(screen.getByText("1")).toBeInTheDocument();
	});

	it("shows a 'No signal' overlay when the feed has gone stale", () => {
		mockUseRadarPointsData.mockReturnValue(
			makeRadarPointsData({ points: [makePoint()], stale: true }),
		);
		render(<RadarWidget />);
		expect(screen.getByText("No signal")).toBeInTheDocument();
	});

	it("hides the 'No signal' overlay when the feed is fresh", () => {
		mockUseRadarPointsData.mockReturnValue(
			makeRadarPointsData({ points: [makePoint()], stale: false }),
		);
		render(<RadarWidget />);
		expect(screen.queryByText("No signal")).not.toBeInTheDocument();
	});
});
