import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import { useThrusterData } from "./useThrusterData.js";
import { useBridgeData } from "../context/BridgeDataContext.js";
import type { BridgeData } from "../context/BridgeDataContext.js";

vi.mock("../context/BridgeDataContext.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

const base: BridgeData = {
	battery: null,
	current: { stern_port: null, stern_star: null, bow: null },
	gnssFix: null,
	gnssVelocity: null,
	controlMode: null,
	emergencyStop: null,
	linearActuator: null,
	bridgeStatus: { v: "1", type: "bridge_status", timestamp_ms: 0, connected: true, bridge_url: "", target: "physical" },
	thrusterFeedback: { bow: null, port: null, starboard: null },
	lidarScan: null,
	cameraStatus: null,
	wsConnected: true,
	bridgeConnected: true,
	latencyMs: null,
};

describe("useThrusterData — isOn threshold", () => {
	beforeEach(() => {
		mockUseBridgeData.mockReturnValue(base);
	});

	it("isOn is false when amperes is null", () => {
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.isOn).toBe(false);
	});

	it("isOn is false at exactly 0.5 A (threshold is exclusive)", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: { v: "1", type: "current", timestamp_ms: 0, location: "stern_port", raw_adc: 0, amperes: 0.5 },
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.isOn).toBe(false);
	});

	it("isOn is true above 0.5 A", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: { v: "1", type: "current", timestamp_ms: 0, location: "stern_port", raw_adc: 0, amperes: 0.51 },
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.isOn).toBe(true);
	});

	it("isOn is false below 0.5 A", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			current: {
				stern_port: { v: "1", type: "current", timestamp_ms: 0, location: "stern_port", raw_adc: 0, amperes: 0.49 },
				stern_star: null,
				bow: null,
			},
		});
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.isOn).toBe(false);
	});
});

describe("useThrusterData — simulation feedback", () => {
	it("populates force and angleDeg from sim feedback when in simulation mode", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			bridgeStatus: { v: "1", type: "bridge_status", timestamp_ms: 0, connected: true, bridge_url: "", target: "simulation" },
			thrusterFeedback: {
				port: { v: "1", type: "sim_thruster_feedback", timestamp_ms: 0, thruster: "port", force: 42.0, angle: Math.PI },
				bow: null,
				starboard: null,
			},
		});
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.force).toBe(42.0);
		expect(result.current.stern_port.angleDeg).toBeCloseTo(180, 5);
		expect(result.current.isSimulation).toBe(true);
	});

	it("force and angleDeg are null in physical mode even if feedback data is present", () => {
		mockUseBridgeData.mockReturnValue({
			...base,
			thrusterFeedback: {
				port: { v: "1", type: "sim_thruster_feedback", timestamp_ms: 0, thruster: "port", force: 42.0, angle: Math.PI },
				bow: null,
				starboard: null,
			},
		});
		const { result } = renderHook(() => useThrusterData());
		expect(result.current.stern_port.force).toBeNull();
		expect(result.current.stern_port.angleDeg).toBeNull();
		expect(result.current.isSimulation).toBe(false);
	});
});
