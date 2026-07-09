import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook } from "@testing-library/react";
import type { Mission, Waypoint } from "@revolt/shared-types";
import { useWaypointDraft } from "./useWaypointDraft.js";
import { useMission } from "../context/MissionContext.js";

vi.mock("../context/MissionContext.js", () => ({
	useMission: vi.fn(),
}));

const mockUseMission = useMission as Mock;

function makeWaypoint(id: string, lat: number, lon: number): Waypoint {
	return {
		id,
		mission_id: "m1",
		sequence_number: 0,
		position: { latitude: lat, longitude: lon },
		target_speed: 5,
		switch_radius: 5,
		heading_mode: 0,
		heading_deg: null,
		validation_status: null,
		reached_at: null,
	};
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("useWaypointDraft", () => {
	it("returns an empty draft when there is no active mission", () => {
		mockUseMission.mockReturnValue({ activeMission: null, legValidation: {} });
		const { result } = renderHook(() => useWaypointDraft());
		expect(result.current.waypoints).toEqual([]);
		expect(result.current.legs).toEqual([]);
	});

	it("derives legs with distance, bearing, and hazard status from context", () => {
		const waypoints = [makeWaypoint("a", 59.0, 10.0), makeWaypoint("b", 59.0, 11.0)];
		const activeMission: Partial<Mission> = { waypoints };
		mockUseMission.mockReturnValue({
			activeMission,
			legValidation: { b: { status: "warning", description: "shallow" } },
		});

		const { result } = renderHook(() => useWaypointDraft());

		expect(result.current.waypoints).toEqual(waypoints);
		expect(result.current.legs).toHaveLength(1);
		expect(result.current.legs[0]?.fromId).toBe("a");
		expect(result.current.legs[0]?.toId).toBe("b");
		expect(result.current.legs[0]?.distanceM).toBeGreaterThan(0);
		expect(result.current.legs[0]?.hazard).toEqual({
			status: "warning",
			description: "shallow",
		});
	});

	it("leaves hazard null for legs with no entry in legValidation", () => {
		const waypoints = [makeWaypoint("a", 59.0, 10.0), makeWaypoint("b", 59.0, 11.0)];
		mockUseMission.mockReturnValue({ activeMission: { waypoints }, legValidation: {} });

		const { result } = renderHook(() => useWaypointDraft());
		expect(result.current.legs[0]?.hazard).toBeNull();
	});
});
