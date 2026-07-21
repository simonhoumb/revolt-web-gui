import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ThrusterWidget } from "./ThrusterWidget.js";
import {
	useThrusterData,
	type ThrusterData,
	type ThrusterStatus,
} from "../../hooks/useThrusterData.js";
import { useApps } from "../../context/AppContext.js";
import { APPS } from "./apps.js";

vi.mock("../../hooks/useThrusterData.js", () => ({
	useThrusterData: vi.fn(),
}));
vi.mock("../../context/AppContext.js", () => ({
	useApps: vi.fn(),
}));

const mockUseThrusterData = useThrusterData as Mock;
const mockUseApps = useApps as Mock;

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

describe("ThrusterWidget", () => {
	it("labels each thruster row", () => {
		setApp();
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget />);
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(screen.getByText("Starboard")).toBeInTheDocument();
		expect(screen.getByText("Bow")).toBeInTheDocument();
	});

	it("shows the mode label for a known control mode, and the raw value for an unknown one", () => {
		setApp();
		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "autonomous" }));
		const { rerender } = render(<ThrusterWidget />);
		expect(screen.getByText("Autonomous")).toBeInTheDocument();

		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "something_new" }));
		rerender(<ThrusterWidget />);
		expect(screen.getByText("something_new")).toBeInTheDocument();
	});

	it("shows a miscommunication badge only when the control mode is miscommunication", () => {
		setApp();
		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "manual" }));
		const { rerender } = render(<ThrusterWidget />);
		expect(screen.queryByText("Miscommunication")).not.toBeInTheDocument();

		mockUseThrusterData.mockReturnValue(makeThrusterData({ controlMode: "miscommunication" }));
		rerender(<ThrusterWidget />);
		expect(screen.getAllByText("Miscommunication").length).toBeGreaterThan(0);
	});

	it("shows sim force/angle only in simulation, and the actuator state for the bow thruster", () => {
		setApp();
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
		setApp();
		mockUseThrusterData.mockReturnValue(makeThrusterData({ bowRetracted: null }));
		render(<ThrusterWidget />);
		expect(screen.getByText("Actuator unknown")).toBeInTheDocument();
	});

	it("defaults to detailed view outside the Conning app, and instrument view inside it", () => {
		// A fresh render() per app, not rerender(): the view-mode default is only read by
		// useState's initializer on mount, matching how the real app relies on TileGrid's
		// app-scoped remount key to reseed this state when switching apps (see TileGrid.tsx).
		setApp("custom");
		mockUseThrusterData.mockReturnValue(makeThrusterData());
		render(<ThrusterWidget />);
		expect(screen.getByText("Port")).toBeInTheDocument();
		expect(document.querySelector("obc-azimuth-thruster")).toBeNull();
		cleanup();

		setApp("conning");
		render(<ThrusterWidget />);
		expect(screen.queryByText("Port")).not.toBeInTheDocument();
		expect(document.querySelectorAll("obc-azimuth-thruster")).toHaveLength(2);
		expect(document.querySelector("obc-thruster")).not.toBeNull();
	});

	it("toggling to instrument view maps angle/thrust onto the azimuth thrusters", () => {
		setApp("custom");
		mockUseThrusterData.mockReturnValue(
			makeThrusterData({
				stern_port: { isOn: true, amperes: 2.5, force: null, angleDeg: 30 },
				stern_star: { isOn: false, amperes: null, force: null, angleDeg: null },
			}),
		);
		render(<ThrusterWidget />);

		act(() => {
			document.querySelector("obc-toggle-button-group")?.dispatchEvent(
				new CustomEvent("value", {
					detail: { value: "instrument", previousValue: "detailed" },
				}),
			);
		});

		const azimuthThrusters = document.querySelectorAll("obc-azimuth-thruster") as NodeListOf<
			HTMLElement & { angle: number; thrust: number; state: string }
		>;
		expect(azimuthThrusters[0]?.angle).toBe(30);
		expect(azimuthThrusters[0]?.thrust).toBe(50); // 2.5A / THRUSTER_MAX_AMPERES(5.0) * 100
		expect(azimuthThrusters[0]?.state).toBe("active");
		expect(azimuthThrusters[1]?.angle).toBe(0);
		expect(azimuthThrusters[1]?.thrust).toBe(0);
		expect(azimuthThrusters[1]?.state).toBe("off");
	});
});
