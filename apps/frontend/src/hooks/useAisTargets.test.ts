import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useAisTargets } from "./useAisTargets.js";
import { useBridgeData } from "../context/useBridgeData.js";
import type { BridgeData } from "../context/bridgeDataReducer.js";
import type { AisTargetMsg } from "@revolt/shared-types";

vi.mock("../context/useBridgeData.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

function withAisTargets(aisTargets: BridgeData["aisTargets"]): BridgeData {
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
		aisTargets,
		imu: null,
		activeWaypointList: null,
		missionSendStatus: null,
		missionExecutionStatus: null,
		wsConnected: true,
		bridgeConnected: true,
		latencyMs: 10,
	};
}

function target(overrides: Partial<AisTargetMsg> = {}): AisTargetMsg {
	return {
		v: "1",
		type: "ais_target",
		timestamp_ms: 0,
		mmsi: 257123456,
		lat: 59.38,
		lon: 10.6,
		sog_kn: 8.0,
		heading_deg: 90,
		...overrides,
	};
}

describe("useAisTargets", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns an empty array when there are no targets", () => {
		mockUseBridgeData.mockReturnValue(withAisTargets({}));
		const { result } = renderHook(() => useAisTargets());
		expect(result.current).toEqual([]);
	});

	it("maps a fresh target to a non-stale AisTarget", () => {
		mockUseBridgeData.mockReturnValue(
			withAisTargets({ 257123456: target({ timestamp_ms: 0 }) }),
		);
		const { result } = renderHook(() => useAisTargets());
		expect(result.current).toEqual([
			{
				mmsi: 257123456,
				lat: 59.38,
				lon: 10.6,
				sogKn: 8.0,
				headingDeg: 90,
				stale: false,
			},
		]);
	});

	it("marks a target stale past the stale window but keeps it", () => {
		vi.setSystemTime(3 * 60_000 + 1);
		mockUseBridgeData.mockReturnValue(
			withAisTargets({ 257123456: target({ timestamp_ms: 0 }) }),
		);
		const { result } = renderHook(() => useAisTargets());
		expect(result.current).toHaveLength(1);
		expect(result.current[0]?.stale).toBe(true);
	});

	it("drops a target past the hard expiry window", () => {
		vi.setSystemTime(15 * 60_000 + 1);
		mockUseBridgeData.mockReturnValue(
			withAisTargets({ 257123456: target({ timestamp_ms: 0 }) }),
		);
		const { result } = renderHook(() => useAisTargets());
		expect(result.current).toEqual([]);
	});

	it("passes through null sog/heading for targets without valid data", () => {
		mockUseBridgeData.mockReturnValue(
			withAisTargets({ 2571234: target({ mmsi: 2571234, sog_kn: null, heading_deg: null }) }),
		);
		const { result } = renderHook(() => useAisTargets());
		expect(result.current[0]?.sogKn).toBeNull();
		expect(result.current[0]?.headingDeg).toBeNull();
	});

	it("returns multiple targets keyed by mmsi", () => {
		mockUseBridgeData.mockReturnValue(
			withAisTargets({
				257123456: target({ mmsi: 257123456 }),
				257654321: target({ mmsi: 257654321 }),
			}),
		);
		const { result } = renderHook(() => useAisTargets());
		expect(result.current.map((t) => t.mmsi).sort()).toEqual([257123456, 257654321]);
	});
});
