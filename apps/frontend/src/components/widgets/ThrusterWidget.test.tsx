import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ThrusterWidget } from "./ThrusterWidget.js";
import {
	useThrusterData,
	type ThrusterData,
	type ThrusterStatus,
} from "../../hooks/useThrusterData.js";

vi.mock("../../hooks/useThrusterData.js", () => ({
	useThrusterData: vi.fn(),
}));

const mockUseThrusterData = useThrusterData as Mock;

const OFF_STATUS: ThrusterStatus = { isOn: false, amperes: null, force: null, angleDeg: null };

function makeThrusterData(overrides: Partial<ThrusterData> = {}): ThrusterData {
	return {
		stern_port: OFF_STATUS,
		stern_star: OFF_STATUS,
		bow: OFF_STATUS,
		bowRetracted: null,
		controlMode: null,
		isSimulation: false,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("ThrusterWidget", () => {
	it("labels each thruster row", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget />);
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(screen.getByText("Starboard")).toBeInTheDocument();
		expect(screen.getByText("Bow")).toBeInTheDocument();
	});

	it("shows the mode label for a known control mode, and the raw value for an unknown one", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "autonomous" }));
		const { rerender } = render(<ThrusterWidget />);
		expect(screen.getByText("Autonomous")).toBeInTheDocument();

		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "something_new" }));
		rerender(<ThrusterWidget />);
		expect(screen.getByText("something_new")).toBeInTheDocument();
	});

	it("shows a miscommunication badge only when the control mode is miscommunication", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "manual" }));
		const { rerender } = render(<ThrusterWidget />);
		expect(screen.queryByText("Miscommunication")).not.toBeInTheDocument();

		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "miscommunication" }));
		rerender(<ThrusterWidget />);
		expect(screen.getAllByText("Miscommunication").length).toBeGreaterThan(0);
	});

	it("shows sim force/angle only in simulation, and the actuator state for the bow thruster", () => {
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				bow: { isOn: true, amperes: 1.5, force: 3.2, angleDeg: 45 },
				bowRetracted: false,
				isSimulation: true,
			}),
		);
		render(<ThrusterWidget />);
		expect(screen.getByText("Force: 3.2 N")).toBeInTheDocument();
		expect(screen.getByText("Angle: 45.0°")).toBeInTheDocument();
		expect(screen.getByText("Deployed")).toBeInTheDocument();
	});

	it("shows actuator unknown when bowRetracted has no reading", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData({ bowRetracted: null }));
		render(<ThrusterWidget />);
		expect(screen.getByText("Actuator unknown")).toBeInTheDocument();
	});
});
