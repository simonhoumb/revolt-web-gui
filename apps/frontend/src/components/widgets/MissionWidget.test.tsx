import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Mission, Waypoint } from "@revolt/shared-types";
import { MissionWidget, formatDuration, moveWaypointId } from "./MissionWidget.js";
import { useMission } from "../../context/MissionContext.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";

vi.mock("../../context/MissionContext.js", () => ({
	useMission: vi.fn(),
}));
vi.mock("../../hooks/useWaypointDraft.js", () => ({
	useWaypointDraft: vi.fn(),
}));

const mockUseMission = useMission as Mock;
const mockUseWaypointDraft = useWaypointDraft as Mock;

function makeWaypoint(overrides: Partial<Waypoint> = {}): Waypoint {
	return {
		id: "wp-1",
		mission_id: "mission-1",
		sequence_number: 0,
		position: { latitude: 59.0, longitude: 10.0 },
		target_speed: 5,
		switch_radius: 5,
		heading_mode: 0,
		heading_deg: null,
		validation_status: null,
		reached_at: null,
		...overrides,
	};
}

function setMission(waypoints: Waypoint[]) {
	const activeMission: Mission = {
		id: "mission-1",
		name: "Test mission",
		description: null,
		status: "draft" as Mission["status"],
		waypoints,
		started_at: null,
		completed_at: null,
		last_validated_at: null,
		last_validation_status: null,
		last_sent_at: null,
		last_send_status: null,
		created_at: "2026-07-08T00:00:00Z",
		updated_at: "2026-07-08T00:00:00Z",
	};
	mockUseMission.mockReturnValue({
		missions: [activeMission],
		loading: false,
		activeMissionId: activeMission.id,
		activeMission,
		legValidation: {},
		loadMissions: vi.fn(),
		createMission: vi.fn(),
		selectMission: vi.fn(),
		renameMission: vi.fn(),
		deleteMission: vi.fn(),
		addWaypoint: vi.fn(),
		updateWaypointPosition: vi.fn(),
		updateWaypointSpeed: vi.fn(),
		reorderWaypoints: vi.fn(),
		deleteWaypoint: vi.fn(),
		setLegValidation: vi.fn(),
	});
}

afterEach(() => {
	cleanup();
});

describe("formatDuration", () => {
	it("returns an em dash for zero or non-finite durations", () => {
		expect(formatDuration(0)).toBe("—");
		expect(formatDuration(Number.NaN)).toBe("—");
		expect(formatDuration(-1)).toBe("—");
	});

	it("formats sub-hour durations as minutes only", () => {
		expect(formatDuration(0.5)).toBe("30m");
	});

	it("formats multi-hour durations as hours and minutes", () => {
		expect(formatDuration(2.25)).toBe("2h 15m");
	});

	it("rounds to the nearest minute", () => {
		expect(formatDuration(1 / 60 / 2)).toBe("1m");
	});
});

describe("moveWaypointId", () => {
	it("swaps the target waypoint with its upward neighbor", () => {
		const waypoints = [
			makeWaypoint({ id: "a" }),
			makeWaypoint({ id: "b" }),
			makeWaypoint({ id: "c" }),
		];
		expect(moveWaypointId(waypoints, "b", -1)).toEqual(["b", "a", "c"]);
	});

	it("swaps the target waypoint with its downward neighbor", () => {
		const waypoints = [
			makeWaypoint({ id: "a" }),
			makeWaypoint({ id: "b" }),
			makeWaypoint({ id: "c" }),
		];
		expect(moveWaypointId(waypoints, "b", 1)).toEqual(["a", "c", "b"]);
	});

	it("is a no-op at the boundaries", () => {
		const waypoints = [makeWaypoint({ id: "a" }), makeWaypoint({ id: "b" })];
		expect(moveWaypointId(waypoints, "a", -1)).toEqual(["a", "b"]);
		expect(moveWaypointId(waypoints, "b", 1)).toEqual(["a", "b"]);
	});
});

describe("MissionWidget", () => {
	it("shows a total distance/ETE summary once there are legs", () => {
		const waypoints = [
			makeWaypoint({ id: "wp-1", target_speed: 10 }),
			makeWaypoint({ id: "wp-2", target_speed: 10 }),
		];
		setMission(waypoints);
		// 18520 m = 10 nm at 10 kt -> 1 hour.
		mockUseWaypointDraft.mockReturnValue({
			waypoints,
			legs: [{ fromId: "wp-1", toId: "wp-2", distanceM: 18520, bearingDeg: 0, hazard: null }],
		});

		render(<MissionWidget />);
		expect(screen.getByText(/Total: 10\.0 nm/)).toBeInTheDocument();
		expect(screen.getByText(/ETE 1h 0m/)).toBeInTheDocument();
	});

	it("does not show a summary row with no legs", () => {
		setMission([]);
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
	});
});
