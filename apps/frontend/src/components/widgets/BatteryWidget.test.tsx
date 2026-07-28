import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { BatteryWidget } from "./BatteryWidget.js";
import { useBatteryData, type BatteryData } from "../../hooks/useBatteryData.js";

vi.mock("../../hooks/useBatteryData.js", () => ({
	useBatteryData: vi.fn(),
}));

const mockUseBatteryData = useBatteryData as Mock;

function makeBatteryData(overrides: Partial<BatteryData> = {}): BatteryData {
	return {
		voltageV: 12.5,
		voltagePercent: 60,
		voltageStatus: "normal",
		voltageStale: false,
		current: {
			stern_port: { amperes: 1.2, isOn: true, stale: false },
			stern_star: { amperes: 0, isOn: false, stale: false },
			bow: { amperes: null, isOn: false, stale: false },
		},
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("BatteryWidget", () => {
	it("shows the voltage reading to two decimal places", () => {
		mockUseBatteryData.mockReturnValue(makeBatteryData({ voltageV: 12.34 }));
		render(<BatteryWidget />);
		expect(screen.getByText("12.34 V")).toBeInTheDocument();
	});

	it("shows a placeholder when no voltage reading is available", () => {
		mockUseBatteryData.mockReturnValue(makeBatteryData({ voltageV: null }));
		render(<BatteryWidget />);
		expect(screen.getByText("— V")).toBeInTheDocument();
	});

	it("labels each current reading by its location", () => {
		mockUseBatteryData.mockReturnValue(makeBatteryData());
		render(<BatteryWidget />);
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(screen.getByText("Starboard")).toBeInTheDocument();
		expect(screen.getByText("Bow")).toBeInTheDocument();
	});

	it("shows a placeholder for a current reading with no data, and the value otherwise", () => {
		mockUseBatteryData.mockReturnValue(makeBatteryData());
		render(<BatteryWidget />);
		expect(screen.getByText("1.2 A")).toBeInTheDocument();
		expect(screen.getByText("— A")).toBeInTheDocument();
	});

	it("shows a Stale badge for a stale voltage reading", () => {
		mockUseBatteryData.mockReturnValue(makeBatteryData({ voltageStale: true }));
		render(<BatteryWidget />);
		expect(screen.getByText("Stale")).toBeInTheDocument();
	});

	it("shows a Stale badge for a stale per-motor current reading", () => {
		mockUseBatteryData.mockReturnValue(
			makeBatteryData({
				current: {
					stern_port: { amperes: 1.2, isOn: true, stale: true },
					stern_star: { amperes: 0, isOn: false, stale: false },
					bow: { amperes: null, isOn: false, stale: false },
				},
			}),
		);
		render(<BatteryWidget />);
		expect(screen.getByText("Stale")).toBeInTheDocument();
	});
});
