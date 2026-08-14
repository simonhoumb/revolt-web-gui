import { describe, it, expect, vi, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useRadarPointsData } from "./useRadarPointsData.js";
import { useBridgeData } from "../context/useBridgeData.js";
import type { BridgeData } from "../context/bridgeDataReducer.js";
import type { RadarPointCloudMsg } from "@revolt/shared-types";
import { SENSOR_STALE_MS } from "../lib/thresholds.js";

vi.mock("../context/useBridgeData.js", () => ({
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
	rcRemote: null,
	lightBeacon: null,
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	pointCloud: null,
	radarSpoke: null,
	radarPointCloud: null,
	aisTargets: {},
	imu: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

const makeCloud = (overrides: Partial<RadarPointCloudMsg> = {}): RadarPointCloudMsg => ({
	v: "1",
	type: "radar_point_cloud",
	timestamp_ms: 0,
	points: [1, 2, 3, 100, -4, 5, -6, 200],
	point_count: 2,
	...overrides,
});

describe("useRadarPointsData", () => {
	it("returns empty points when radarPointCloud is null", () => {
		mockUseBridgeData.mockReturnValue({ ...base, radarPointCloud: null });
		const { result } = renderHook(() => useRadarPointsData());
		expect(result.current.cloud).toBeNull();
		expect(result.current.points).toEqual([]);
	});

	it("unpacks the flat interleaved array into one point per quadruple", () => {
		const cloud = makeCloud();
		mockUseBridgeData.mockReturnValue({ ...base, radarPointCloud: cloud });
		const { result } = renderHook(() => useRadarPointsData());
		expect(result.current.points).toEqual([
			{ x: 1, y: 2, z: 3, intensity: 100 },
			{ x: -4, y: 5, z: -6, intensity: 200 },
		]);
	});

	it("exposes the raw cloud message", () => {
		const cloud = makeCloud();
		mockUseBridgeData.mockReturnValue({ ...base, radarPointCloud: cloud });
		const { result } = renderHook(() => useRadarPointsData());
		expect(result.current.cloud).toBe(cloud);
	});
});

describe("useRadarPointsData — staleness", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("is stale when no cloud has ever arrived", () => {
		mockUseBridgeData.mockReturnValue({ ...base, radarPointCloud: null });
		const { result } = renderHook(() => useRadarPointsData());
		expect(result.current.stale).toBe(true);
	});

	it("is not stale for a fresh cloud, and becomes stale once the window elapses", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const cloud = makeCloud();
		mockUseBridgeData.mockReturnValue({ ...base, radarPointCloud: cloud });
		const { result, rerender } = renderHook(() => useRadarPointsData());
		expect(result.current.stale).toBe(false);

		vi.setSystemTime(SENSOR_STALE_MS + 1);
		rerender();
		expect(result.current.stale).toBe(true);
	});
});
