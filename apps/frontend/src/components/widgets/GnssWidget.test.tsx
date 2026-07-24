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
	vi.clearAllMocks();
});

describe("GnssWidget", () => {
	it("shows placeholders for every field when there is no fix, in detailed view", () => {
		mockUseGnssData.mockReturnValue(makeGnssData());
		render(<GnssWidget viewMode="detailed" />);
		expect(screen.getByText("No fix")).toBeInTheDocument();
		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
		expect(screen.getAllByText("N/A").length).toBe(2);
	});

	it("shows lat/lon to 6 decimal places and altitude/speed/heading once a fix arrives, in detailed view", () => {
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
		render(<GnssWidget viewMode="detailed" />);
		expect(screen.getByText("59.912345°")).toBeInTheDocument();
		expect(screen.getByText("10.712345°")).toBeInTheDocument();
		expect(screen.getByText("12.3 m")).toBeInTheDocument();
		expect(screen.getByText("1.23 m/s")).toBeInTheDocument();
		expect(screen.getByText("90.5°")).toBeInTheDocument();
	});

	it("defaults to instrument view when no viewMode prop is given", () => {
		mockUseGnssData.mockReturnValue(makeGnssData({ speedMs: 1, headingDeg: 90 }));
		render(<GnssWidget />);
		expect(document.querySelector("obc-compass")).not.toBeNull();
		expect(screen.queryByText("90.0°")).not.toBeInTheDocument();
	});

	it("maps heading/course/speed onto the compass and the HDG/COG/SPD instrument fields", () => {
		mockUseGnssData.mockReturnValue(makeGnssData({ headingDeg: 45, courseDeg: 50, speedMs: 2 }));
		render(<GnssWidget viewMode="instrument" />);

		const compass = document.querySelector("obc-compass") as HTMLElement & {
			heading: number;
			courseOverGround: number;
		};
		expect(compass.heading).toBe(45);
		expect(compass.courseOverGround).toBe(50);

		const fields = document.querySelectorAll("obc-instrument-field") as NodeListOf<
			HTMLElement & { tag: string; value: number | undefined }
		>;
		const byTag = new Map([...fields].map((f) => [f.tag, f.value]));
		expect(byTag.get("HDG")).toBe(45);
		expect(byTag.get("COG")).toBe(50);
		expect(byTag.get("SPD")).toBeCloseTo(2 * 1.94384, 5);
	});

	it("shows the position in degrees and decimal minutes with a hemisphere letter in instrument view", () => {
		mockUseGnssData.mockReturnValue(
			makeGnssData({ latitude: 62 + 27.583 / 60, longitude: -(6 + 11.918 / 60) }),
		);
		render(<GnssWidget viewMode="instrument" />);
		expect(screen.getByText("62° 27.583'")).toBeInTheDocument();
		expect(screen.getByText("N")).toBeInTheDocument();
		expect(screen.getByText("6° 11.918'")).toBeInTheDocument();
		expect(screen.getByText("W")).toBeInTheDocument();
	});
});
