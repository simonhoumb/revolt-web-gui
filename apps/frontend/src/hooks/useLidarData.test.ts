import { describe, it, expect, vi, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useLidarData } from "./useLidarData.js";
import { useBridgeData } from "../context/useBridgeData.js";
import type { BridgeData } from "../context/bridgeDataReducer.js";
import type { LidarScanMsg } from "@revolt/shared-types";
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

const makeScan = (overrides: Partial<LidarScanMsg> = {}): LidarScanMsg => ({
	v: "1",
	type: "lidar_scan",
	timestamp_ms: 0,
	angle_min: 0,
	angle_max: 2 * Math.PI,
	angle_increment: Math.PI / 2,
	range_min: 0.1,
	range_max: 10.0,
	ranges: [5, 5, 5, 5],
	...overrides,
});

describe("useLidarData", () => {
	it("returns empty points when lidarScan is null", () => {
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: null });
		const { result } = renderHook(() => useLidarData());
		expect(result.current.scan).toBeNull();
		expect(result.current.points).toEqual([]);
	});

	it("returns one point per range measurement", () => {
		const scan = makeScan({ ranges: [1, 2, 3] });
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: scan });
		const { result } = renderHook(() => useLidarData());
		expect(result.current.points).toHaveLength(3);
	});

	it("computes correct Cartesian for angle=0 (point along +X axis)", () => {
		const scan = makeScan({ angle_min: 0, angle_increment: Math.PI / 2, ranges: [5] });
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: scan });
		const { result } = renderHook(() => useLidarData());
		const p = result.current.points[0] as { x: number; y: number };
		expect(p.x).toBeCloseTo(5, 5);
		expect(p.y).toBeCloseTo(0, 5);
	});

	it("computes correct Cartesian for angle=π/2 (point along +Y axis)", () => {
		const scan = makeScan({
			angle_min: Math.PI / 2,
			angle_increment: Math.PI / 2,
			ranges: [3],
		});
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: scan });
		const { result } = renderHook(() => useLidarData());
		const p = result.current.points[0] as { x: number; y: number };
		expect(p.x).toBeCloseTo(0, 5);
		expect(p.y).toBeCloseTo(3, 5);
	});

	it("exposes the raw scan object", () => {
		const scan = makeScan();
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: scan });
		const { result } = renderHook(() => useLidarData());
		expect(result.current.scan).toBe(scan);
	});
});

describe("useLidarData — staleness", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	it("is stale when no scan has ever arrived", () => {
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: null });
		const { result } = renderHook(() => useLidarData());
		expect(result.current.stale).toBe(true);
	});

	it("is not stale for a fresh scan, and becomes stale once the window elapses", () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		const scan = makeScan();
		mockUseBridgeData.mockReturnValue({ ...base, lidarScan: scan });
		const { result, rerender } = renderHook(() => useLidarData());
		expect(result.current.stale).toBe(false);

		vi.setSystemTime(SENSOR_STALE_MS + 1);
		rerender();
		expect(result.current.stale).toBe(true);
	});
});
