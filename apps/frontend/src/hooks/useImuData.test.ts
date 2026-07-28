import { describe, it, expect, vi } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useImuData } from "./useImuData.js";
import { useBridgeData } from "../context/useBridgeData.js";
import type { BridgeData } from "../context/bridgeDataReducer.js";
import type { ImuMsg } from "@revolt/shared-types";

vi.mock("../context/useBridgeData.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

function withImu(imu: ImuMsg | null): BridgeData {
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
		lightBeacon: null,
		bridgeStatus: null,
		cameraStatus: null,
		thrusterFeedback: { bow: null, port: null, starboard: null },
		lidarScan: null,
		pointCloud: null,
		radarSpoke: null,
		aisTargets: {},
		imu,
		activeWaypointList: null,
		missionSendStatus: null,
		missionExecutionStatus: null,
		wsConnected: true,
		bridgeConnected: true,
		latencyMs: 10,
	};
}

describe("useImuData", () => {
	it("returns all nulls when no imu message has arrived", () => {
		mockUseBridgeData.mockReturnValue(withImu(null));
		const { result } = renderHook(() => useImuData());
		expect(result.current).toEqual({
			rollDeg: null,
			pitchDeg: null,
			yawDeg: null,
			accelX: null,
			accelY: null,
			accelZ: null,
			angVelX: null,
			angVelY: null,
			angVelZ: null,
		});
	});

	it("passes through fields from the latest imu message", () => {
		mockUseBridgeData.mockReturnValue(
			withImu({
				v: "1",
				type: "imu_data",
				timestamp_ms: 0,
				roll_deg: 5.5,
				pitch_deg: -2.1,
				yaw_deg: 180.0,
				accel_x: 0.1,
				accel_y: 0.2,
				accel_z: 9.81,
				ang_vel_x: 0.01,
				ang_vel_y: 0.02,
				ang_vel_z: 0.03,
			}),
		);
		const { result } = renderHook(() => useImuData());
		expect(result.current).toEqual({
			rollDeg: 5.5,
			pitchDeg: -2.1,
			yawDeg: 180.0,
			accelX: 0.1,
			accelY: 0.2,
			accelZ: 9.81,
			angVelX: 0.01,
			angVelY: 0.02,
			angVelZ: 0.03,
		});
	});
});
