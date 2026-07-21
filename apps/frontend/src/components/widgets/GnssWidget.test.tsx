import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { GnssWidget } from "./GnssWidget.js";
import { useGnssData, type GnssData } from "../../hooks/useGnssData.js";
import { useApps } from "../../context/AppContext.js";
import { APPS } from "./apps.js";

vi.mock("../../hooks/useGnssData.js", () => ({
	useGnssData: vi.fn(),
}));
vi.mock("../../context/AppContext.js", () => ({
	useApps: vi.fn(),
}));

const mockUseGnssData = useGnssData as Mock;
const mockUseApps = useApps as Mock;

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

function setApp(activeAppId: keyof typeof APPS = "custom") {
	mockUseApps.mockReturnValue({
		activeAppId,
		appDef: APPS[activeAppId],
		isLocked: activeAppId !== "custom",
		setActiveApp: vi.fn(),
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("GnssWidget", () => {
	it("shows placeholders for every field when there is no fix", () => {
		setApp();
		mockUseGnssData.mockReturnValue(makeGnssData());
		render(<GnssWidget />);
		expect(screen.getByText("No fix")).toBeInTheDocument();
		expect(screen.getAllByText("—").length).toBeGreaterThanOrEqual(2);
		expect(screen.getAllByText("N/A").length).toBe(2);
	});

	it("shows lat/lon to 6 decimal places and altitude/speed/heading once a fix arrives", () => {
		setApp();
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

	it("defaults to detailed view outside the Conning app, and instrument view inside it", () => {
		setApp("custom");
		mockUseGnssData.mockReturnValue(makeGnssData({ speedMs: 1, headingDeg: 90 }));
		render(<GnssWidget />);
		expect(screen.getByText("90.0°")).toBeInTheDocument();
		expect(document.querySelector("obc-compass")).toBeNull();
		cleanup();

		setApp("conning");
		render(<GnssWidget />);
		expect(screen.queryByText("90.0°")).not.toBeInTheDocument();
		expect(document.querySelector("obc-compass")).not.toBeNull();
		expect(document.querySelector("obc-speed-gauge")).not.toBeNull();
	});

	it("maps heading/course/speed onto the compass and speed gauge in instrument view", () => {
		setApp("custom");
		mockUseGnssData.mockReturnValue(
			makeGnssData({ headingDeg: 45, courseDeg: 50, speedMs: 2 }),
		);
		render(<GnssWidget />);

		act(() => {
			document.querySelector("obc-toggle-button-group")?.dispatchEvent(
				new CustomEvent("value", {
					detail: { value: "instrument", previousValue: "detailed" },
				}),
			);
		});

		const compass = document.querySelector("obc-compass") as HTMLElement & {
			heading: number;
			courseOverGround: number;
		};
		expect(compass.heading).toBe(45);
		expect(compass.courseOverGround).toBe(50);

		const speedGauge = document.querySelector("obc-speed-gauge") as HTMLElement & {
			speed: number;
		};
		expect(speedGauge.speed).toBeCloseTo(2 * 1.94384, 5);
	});
});
