import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { EnclosureHealthWidget } from "./EnclosureHealthWidget.js";
import {
	useEnclosureHealthData,
	type EnclosureHealthData,
	type EnclosureReading,
} from "../../hooks/useEnclosureHealthData.js";

vi.mock("../../hooks/useEnclosureHealthData.js", () => ({
	useEnclosureHealthData: vi.fn(),
}));

const mockUseEnclosureHealthData = useEnclosureHealthData as Mock;

const UNKNOWN: EnclosureReading = { status: "unknown" };

function makeData(overrides: Partial<EnclosureHealthData> = {}): EnclosureHealthData {
	return {
		temperature: { bow: UNKNOWN, stern: UNKNOWN },
		humidity: { bow: UNKNOWN, stern: UNKNOWN },
		emergencyStopActive: false,
		actuatorRetracted: null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("EnclosureHealthWidget", () => {
	it("defaults to instrument view, showing an icon and an obc-instrument-field per reading, no text labels", () => {
		mockUseEnclosureHealthData.mockReturnValue(
			makeData({
				temperature: {
					bow: { valueC: 23.4, status: "normal" },
					stern: { valueC: 25.1, status: "normal" },
				},
				humidity: {
					bow: { valuePct: 40.2, status: "normal" },
					stern: { valuePct: 41.7, status: "normal" },
				},
			}),
		);
		render(<EnclosureHealthWidget />);

		expect(document.querySelectorAll("obi-temperature-air")).toHaveLength(2);
		expect(document.querySelectorAll("obi-sensor-water-drop-google")).toHaveLength(2);
		const fields = document.querySelectorAll("obc-instrument-field") as NodeListOf<
			HTMLElement & { value: number | undefined }
		>;
		expect([...fields].map((f) => f.value).sort()).toEqual([23.4, 25.1, 40.2, 41.7]);
		expect(screen.queryByText("Temp")).not.toBeInTheDocument();
		expect(screen.queryByText("Humidity")).not.toBeInTheDocument();
	});

	it("shows the plain-text env rows with labels but no icons in detailed view", () => {
		mockUseEnclosureHealthData.mockReturnValue(
			makeData({
				temperature: { bow: { valueC: 23.4, status: "normal" }, stern: UNKNOWN },
				humidity: { bow: { valuePct: 40.2, status: "normal" }, stern: UNKNOWN },
			}),
		);
		render(<EnclosureHealthWidget viewMode="detailed" />);

		expect(document.querySelector("obc-instrument-field")).toBeNull();
		expect(document.querySelector("obi-temperature-air")).toBeNull();
		expect(document.querySelector("obi-sensor-water-drop-google")).toBeNull();
		expect(screen.getAllByText("Temp").length).toBe(2);
		expect(screen.getAllByText("Humidity").length).toBe(2);
		expect(screen.getByText("23.4°C")).toBeInTheDocument();
		expect(screen.getByText("40.2%")).toBeInTheDocument();
	});

	it("shows an alarm/warning badge for out-of-range readings in both views", () => {
		mockUseEnclosureHealthData.mockReturnValue(
			makeData({
				temperature: {
					bow: { valueC: 105, status: "alarm" },
					stern: { valueC: 65, status: "warning" },
				},
			}),
		);
		const { rerender } = render(<EnclosureHealthWidget viewMode="instrument" />);
		expect(document.querySelectorAll("obc-badge")).toHaveLength(2);

		rerender(<EnclosureHealthWidget viewMode="detailed" />);
		expect(document.querySelectorAll("obc-badge")).toHaveLength(2);
	});

	it("shows E-Stop status regardless of view mode", () => {
		mockUseEnclosureHealthData.mockReturnValue(makeData({ emergencyStopActive: true }));
		const { rerender } = render(<EnclosureHealthWidget viewMode="instrument" />);
		expect(screen.getByText("E-Stop active")).toBeInTheDocument();

		rerender(<EnclosureHealthWidget viewMode="detailed" />);
		expect(screen.getByText("E-Stop active")).toBeInTheDocument();
	});

	it("shows E-Stop clear when inactive", () => {
		mockUseEnclosureHealthData.mockReturnValue(makeData({ emergencyStopActive: false }));
		render(<EnclosureHealthWidget />);
		expect(screen.getByText("E-Stop clear")).toBeInTheDocument();
	});
});
