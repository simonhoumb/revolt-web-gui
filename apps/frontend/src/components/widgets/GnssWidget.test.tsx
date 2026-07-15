import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { GnssWidget } from "./GnssWidget.js";
import { useGnssData, type GnssData } from "../../hooks/useGnssData.js";

vi.mock("../../hooks/useGnssData.js", () => ({
	useGnssData: vi.fn(),
}));

const mockUseGnssData = useGnssData as Mock;

function makeGnssData(overrides: Partial<GnssData> = {}): GnssData {
	return {
		latitude: null,
		longitude: null,
		altitudeM: null,
		fixStatus: null,
		fixLabel: "No fix",
		speedMs: null,
		headingDeg: null,
		courseDeg: null,
		isSimulation: false,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("GnssWidget", () => {
	it("shows placeholders for every field when there is no fix", () => {
		mockUseGnssData.mockReturnValue(makeGnssData());
		render(<GnssWidget />);
		expect(screen.getByText("No fix")).toBeInTheDocument();
		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
		expect(screen.getAllByText("N/A").length).toBe(2);
	});

	it("shows lat/lon to 6 decimal places and altitude/speed/heading once a fix arrives", () => {
		mockUseGnssData.mockReturnValue(
			makeGnssData({
				latitude: 59.912345,
				longitude: 10.712345,
				altitudeM: 12.345,
				fixStatus: 0,
				fixLabel: "Fix",
				speedMs: 1.234,
				headingDeg: 90.5,
			}),
		);
		render(<GnssWidget />);
		expect(screen.getByText("59.912345°")).toBeInTheDocument();
		expect(screen.getByText("10.712345°")).toBeInTheDocument();
		expect(screen.getByText("12.3 m")).toBeInTheDocument();
		expect(screen.getByText("1.23 m/s")).toBeInTheDocument();
		expect(screen.getByText("90.5°")).toBeInTheDocument();
	});
});
