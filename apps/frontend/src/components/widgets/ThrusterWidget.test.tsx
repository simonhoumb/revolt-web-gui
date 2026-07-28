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

const OFF_STATUS: ThrusterStatus = {
	isOn: false,
	amperes: null,
	force: null,
	angleDeg: null,
	stale: false,
};

function makeThrusterData(overrides: Partial<ThrusterData> = {}): ThrusterData {
	return {
		stern_port: OFF_STATUS,
		stern_star: OFF_STATUS,
		bow: OFF_STATUS,
		bowRetracted: null,
		controlMode: null,
		controlModeStale: false,
		isSimulation: false,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ThrusterWidget", () => {
	it("labels each obc-azimuth-thruster-labeled gauge in instrument view", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget viewMode="instrument" />);
		const labeled = document.querySelectorAll("obc-azimuth-thruster-labeled") as NodeListOf<
			HTMLElement & { label: string }
		>;
		expect([...labeled].map((el) => el.label).sort()).toEqual(["Bow", "Port", "Starboard"]);
	});

	it("labels each thruster row in detailed view", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget viewMode="detailed" />);
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

	it("shows sim force/angle only in simulation, and the actuator state for the bow thruster, in detailed view", () => {
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				bow: { isOn: true, amperes: 1.5, force: 3.2, angleDeg: 45, stale: false },
				bowRetracted: false,
				isSimulation: true,
			}),
		);
		render(<ThrusterWidget viewMode="detailed" />);
		expect(screen.getByText("Force: 3.2 N")).toBeInTheDocument();
		expect(screen.getByText("Angle: 45.0°")).toBeInTheDocument();
		expect(screen.getByText("Deployed")).toBeInTheDocument();
	});

	it("shows actuator unknown when bowRetracted has no reading, in detailed view", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData({ bowRetracted: null }));
		render(<ThrusterWidget viewMode="detailed" />);
		expect(screen.getByText("Actuator unknown")).toBeInTheDocument();
	});

	it("defaults to instrument view when no viewMode prop is given", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget />);
		expect(document.querySelectorAll("obc-azimuth-thruster-labeled")).toHaveLength(3);
	});

	it("renders the detailed thruster rows instead of the gauges when viewMode is 'detailed'", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget viewMode="detailed" />);
		expect(document.querySelector("obc-azimuth-thruster-labeled")).toBeNull();
	});

	it("maps angle/thrust onto the azimuth thrusters in instrument view, with a fixed angle of 0 for the bow", () => {
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				stern_port: { isOn: true, amperes: 15, force: null, angleDeg: 30, stale: false },
				stern_star: {
					isOn: false,
					amperes: null,
					force: null,
					angleDeg: null,
					stale: false,
				},
			}),
		);
		render(<ThrusterWidget viewMode="instrument" />);

		const labeled = document.querySelectorAll("obc-azimuth-thruster-labeled") as NodeListOf<
			HTMLElement & { label: string; angle: number; thrust: number; commandStatus: string }
		>;
		const byLabel = new Map([...labeled].map((el) => [el.label, el]));
		expect(byLabel.get("Port")?.angle).toBe(30);
		expect(byLabel.get("Port")?.thrust).toBe(50); // 15A / THRUSTER_MAX_AMPERES(30.0) * 100
		expect(byLabel.get("Port")?.commandStatus).toBe("in-command");
		expect(byLabel.get("Starboard")?.angle).toBe(0);
		expect(byLabel.get("Starboard")?.thrust).toBe(0);
		expect(byLabel.get("Starboard")?.commandStatus).toBe("no-command");
		expect(byLabel.get("Bow")?.angle).toBe(0);
	});

	it("shows a Stale badge next to a stale thruster row in detailed view", () => {
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				bow: { isOn: true, amperes: 1.5, force: null, angleDeg: null, stale: true },
			}),
		);
		render(<ThrusterWidget viewMode="detailed" />);
		expect(screen.getByText("Stale")).toBeInTheDocument();
	});

	it("shows a Stale badge over a stale gauge in instrument view, and not for a fresh one", () => {
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				bow: { isOn: true, amperes: 1.5, force: null, angleDeg: null, stale: true },
			}),
		);
		render(<ThrusterWidget viewMode="instrument" />);
		expect(screen.getAllByText("Stale")).toHaveLength(1);
	});

	it("shows a Stale badge in the mode row when control mode has gone stale", () => {
		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlModeStale: true }));
		render(<ThrusterWidget />);
		expect(screen.getByText("Stale")).toBeInTheDocument();
	});
});
