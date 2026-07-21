import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLightBeaconData } from "./useLightBeaconData.js";
import { useBridgeData } from "../context/BridgeDataContext.js";
import type { BridgeData } from "../context/BridgeDataContext.js";
import type { LightBeaconMsg } from "@revolt/shared-types";

vi.mock("../context/BridgeDataContext.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

function withLightBeacon(lightBeacon: LightBeaconMsg | null): BridgeData {
	return {
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
		rcRemote: null,
		lightBeacon,
		bridgeStatus: null,
		cameraStatus: null,
		thrusterFeedback: { bow: null, port: null, starboard: null },
		lidarScan: null,
		radarSpoke: null,
		aisTargets: {},
		imu: null,
		activeWaypointList: null,
		missionSendStatus: null,
		missionExecutionStatus: null,
		wsConnected: true,
		bridgeConnected: true,
		latencyMs: 10,
	};
}

function beacon(overrides: Partial<LightBeaconMsg> = {}): LightBeaconMsg {
	return {
		v: "1",
		type: "light_beacon",
		timestamp_ms: 0,
		red: false,
		yellow: false,
		green: false,
		...overrides,
	};
}

describe("useLightBeaconData", () => {
	it("defaults all lamps off when no message has arrived", () => {
		mockUseBridgeData.mockReturnValue(withLightBeacon(null));
		const { result } = renderHook(() => useLightBeaconData());
		expect(result.current).toEqual({ red: false, yellow: false, green: false });
	});

	it("passes through a steady-green state", () => {
		mockUseBridgeData.mockReturnValue(withLightBeacon(beacon({ green: true })));
		const { result } = renderHook(() => useLightBeaconData());
		expect(result.current).toEqual({ red: false, yellow: false, green: true });
	});

	it("passes through multiple lamps on at once", () => {
		mockUseBridgeData.mockReturnValue(withLightBeacon(beacon({ red: true, yellow: true })));
		const { result } = renderHook(() => useLightBeaconData());
		expect(result.current).toEqual({ red: true, yellow: true, green: false });
	});
});
