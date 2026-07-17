import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { Mock } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { useRadarData } from "./useRadarData.js";
import { useBridgeData } from "../context/BridgeDataContext.js";
import type { BridgeData } from "../context/BridgeDataContext.js";
import type { RadarSpokeMsg } from "@revolt/shared-types";

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
	rcRemote: null,
	bridgeStatus: null,
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	radarSpoke: null,
	activeWaypointList: null,
	missionSendStatus: null,
	missionExecutionStatus: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

function spoke(azimuth: number): RadarSpokeMsg {
	return {
		v: "1",
		type: "radar_spoke",
		timestamp_ms: 0,
		azimuth,
		range_start: 0.5,
		range_increment: 0.5,
		num_samples: 4,
		min_intensity: 0,
		max_intensity: 255,
		intensity: [0, 10, 255, 128],
	};
}

describe("useRadarData", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mockUseBridgeData.mockReturnValue(base);
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns an empty buffer when no spoke has arrived", () => {
		const { result } = renderHook(() => useRadarData());
		expect(result.current.spokes).toEqual([]);
	});

	it("accumulates spokes at distinct azimuths into the buffer", () => {
		mockUseBridgeData.mockReturnValue({ ...base, radarSpoke: spoke(0.1) });
		const { result, rerender } = renderHook(() => useRadarData());
		expect(result.current.spokes).toHaveLength(1);

		mockUseBridgeData.mockReturnValue({ ...base, radarSpoke: spoke(1.0) });
		rerender();
		expect(result.current.spokes).toHaveLength(2);
	});

	it("overwrites the same azimuth bin rather than growing unbounded", () => {
		mockUseBridgeData.mockReturnValue({ ...base, radarSpoke: spoke(0.1) });
		const { result, rerender } = renderHook(() => useRadarData());
		expect(result.current.spokes).toHaveLength(1);

		mockUseBridgeData.mockReturnValue({ ...base, radarSpoke: spoke(0.1) });
		rerender();
		expect(result.current.spokes).toHaveLength(1);
	});

	it("clears the buffer after the stale timeout with no new spoke", async () => {
		mockUseBridgeData.mockReturnValue({ ...base, radarSpoke: spoke(0.1) });
		const { result } = renderHook(() => useRadarData());
		expect(result.current.spokes).toHaveLength(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(6000);
		});
		expect(result.current.spokes).toHaveLength(0);
	});
});
