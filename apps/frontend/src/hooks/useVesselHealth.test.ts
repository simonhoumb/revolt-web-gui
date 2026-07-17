import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useVesselHealth } from "./useVesselHealth.js";
import { useBridgeData } from "../context/BridgeDataContext.js";
import type { BridgeData } from "../context/BridgeDataContext.js";

vi.mock("../context/BridgeDataContext.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

const base: BridgeData = {
	battery: null,
	current: { stern_port: null, stern_star: null, bow: null },
	temperature: { stern: null, bow: null },
	humidity: { stern: null, bow: null },
	gnssFix: null,
	gnssHeading: null,
	gnssVelocity: null,
	gnssVelocityPhysical: null,
	controlMode: null,
	emergencyStop: null,
	linearActuator: null,
	azimuthFeedback: { port: null, starboard: null },
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

// Baseline with no alerts: connected, normal battery, no e-stop, no miscomm.
const healthy: BridgeData = {
	...base,
	battery: { v: "1", type: "battery", timestamp_ms: 0, voltage_v: 12.5 },
};

function alertIds(data: Partial<BridgeData>): string[] {
	mockUseBridgeData.mockReturnValue({ ...healthy, ...data });
	const { result } = renderHook(() => useVesselHealth());
	return result.current.alerts.map((a) => a.id);
}

describe("useVesselHealth — ws-disconnected alert", () => {
	it("appears when wsConnected is false", () => {
		expect(alertIds({ wsConnected: false })).toContain("ws-disconnected");
	});

	it("does not appear when wsConnected is true", () => {
		expect(alertIds({})).not.toContain("ws-disconnected");
	});
});

describe("useVesselHealth — bridge-offline alert", () => {
	it("appears when connected to backend but bridge is down", () => {
		expect(alertIds({ bridgeConnected: false })).toContain("bridge-offline");
	});

	it("does not appear when both ws and bridge are connected", () => {
		expect(alertIds({})).not.toContain("bridge-offline");
	});

	it("does not appear when ws itself is disconnected (bridge state is irrelevant)", () => {
		expect(alertIds({ wsConnected: false, bridgeConnected: false })).not.toContain(
			"bridge-offline",
		);
	});
});

describe("useVesselHealth — estop alert", () => {
	it("appears when emergency stop is active", () => {
		expect(
			alertIds({
				emergencyStop: { v: "1", type: "emergency_stop", timestamp_ms: 0, active: true },
			}),
		).toContain("estop");
	});

	it("does not appear when emergency stop is inactive", () => {
		expect(
			alertIds({
				emergencyStop: { v: "1", type: "emergency_stop", timestamp_ms: 0, active: false },
			}),
		).not.toContain("estop");
	});

	it("does not appear when emergencyStop is null", () => {
		expect(alertIds({ emergencyStop: null })).not.toContain("estop");
	});
});

describe("useVesselHealth — miscomm alert", () => {
	it("appears when control mode is miscommunication", () => {
		expect(
			alertIds({
				controlMode: {
					v: "1",
					type: "control_mode",
					timestamp_ms: 0,
					mode: "miscommunication",
				},
			}),
		).toContain("miscomm");
	});

	it("does not appear for other control modes", () => {
		expect(
			alertIds({
				controlMode: { v: "1", type: "control_mode", timestamp_ms: 0, mode: "manual" },
			}),
		).not.toContain("miscomm");
	});
});

describe("useVesselHealth — bat-unknown alert", () => {
	it("appears when battery data is missing and bridge is fully connected", () => {
		expect(alertIds({ battery: null })).toContain("bat-unknown");
	});

	it("does not appear when bridge is not connected (not yet receiving data)", () => {
		expect(alertIds({ battery: null, bridgeConnected: false })).not.toContain("bat-unknown");
	});

	it("does not appear when battery data is present", () => {
		expect(alertIds({})).not.toContain("bat-unknown");
	});
});

describe("useVesselHealth — bat-alarm alert", () => {
	it("appears when battery voltage is below 11.0 V", () => {
		expect(
			alertIds({ battery: { v: "1", type: "battery", timestamp_ms: 0, voltage_v: 10.9 } }),
		).toContain("bat-alarm");
	});

	it("does not appear when battery voltage is in the normal range", () => {
		expect(alertIds({})).not.toContain("bat-alarm");
	});
});

describe("useVesselHealth — bat-overvolt alert", () => {
	it("appears when battery voltage exceeds 16.0 V", () => {
		expect(
			alertIds({ battery: { v: "1", type: "battery", timestamp_ms: 0, voltage_v: 16.1 } }),
		).toContain("bat-overvolt");
	});

	it("does not appear when battery voltage is in the normal range", () => {
		expect(alertIds({})).not.toContain("bat-overvolt");
	});
});

describe("useVesselHealth — bat-warning alert", () => {
	it("appears when battery voltage is between 11.0 and 11.5 V", () => {
		expect(
			alertIds({ battery: { v: "1", type: "battery", timestamp_ms: 0, voltage_v: 11.2 } }),
		).toContain("bat-warning");
	});

	it("does not appear when battery voltage is in the normal range", () => {
		expect(alertIds({})).not.toContain("bat-warning");
	});
});

describe("useVesselHealth — highestAlertLevel", () => {
	beforeEach(() => {
		mockUseBridgeData.mockReturnValue(healthy);
	});

	it("is null when there are no alerts", () => {
		const { result } = renderHook(() => useVesselHealth());
		expect(result.current.highestAlertLevel).toBeNull();
	});

	it("is alarm when any alarm-level alert is present", () => {
		mockUseBridgeData.mockReturnValue({ ...healthy, wsConnected: false });
		const { result } = renderHook(() => useVesselHealth());
		expect(result.current.highestAlertLevel).toBe("alarm");
	});

	it("is caution when only caution-level alerts are present", () => {
		mockUseBridgeData.mockReturnValue({
			...healthy,
			controlMode: {
				v: "1",
				type: "control_mode",
				timestamp_ms: 0,
				mode: "miscommunication",
			},
		});
		const { result } = renderHook(() => useVesselHealth());
		expect(result.current.highestAlertLevel).toBe("caution");
	});
});
