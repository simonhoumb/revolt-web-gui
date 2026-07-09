import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import type { Mission } from "@revolt/shared-types";
import { MissionProvider, useMission } from "./MissionContext.js";
import { missionApi } from "../lib/missionApi.js";

vi.mock("../lib/missionApi.js", () => ({
	missionApi: {
		list: vi.fn(),
		create: vi.fn(),
		get: vi.fn(),
		update: vi.fn(),
		remove: vi.fn(),
		createWaypoint: vi.fn(),
		updateWaypoint: vi.fn(),
		deleteWaypoint: vi.fn(),
		replaceWaypoints: vi.fn(),
	},
}));

// missionApi's methods are plain vi.fn() mocks with no `this` usage, so unbound-method's
// concern (losing `this` binding when torn off an object) doesn't apply here.
/* eslint-disable @typescript-eslint/unbound-method */
const mockApi = {
	list: missionApi.list as Mock,
	create: missionApi.create as Mock,
	update: missionApi.update as Mock,
	remove: missionApi.remove as Mock,
	createWaypoint: missionApi.createWaypoint as Mock,
	updateWaypoint: missionApi.updateWaypoint as Mock,
	deleteWaypoint: missionApi.deleteWaypoint as Mock,
	replaceWaypoints: missionApi.replaceWaypoints as Mock,
};
/* eslint-enable @typescript-eslint/unbound-method */

function makeMission(overrides: Partial<Mission> = {}): Mission {
	return {
		id: "mission-1",
		name: "Oslo Fjord transit",
		description: null,
		status: "draft" as Mission["status"],
		waypoints: [],
		started_at: null,
		completed_at: null,
		last_validated_at: null,
		last_validation_status: null,
		last_sent_at: null,
		last_send_status: null,
		created_at: "2026-07-08T00:00:00Z",
		updated_at: "2026-07-08T00:00:00Z",
		...overrides,
	};
}

function makeWaypoint(overrides: Partial<Mission["waypoints"][number]> = {}) {
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

beforeEach(() => {
	vi.clearAllMocks();
});

describe("MissionProvider", () => {
	it("loads missions on mount and selects the first as active", async () => {
		const missions = [makeMission({ id: "a" }), makeMission({ id: "b" })];
		mockApi.list.mockResolvedValue(missions);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });

		await waitFor(() => {
			expect(result.current.missions).toHaveLength(2);
		});
		expect(result.current.activeMissionId).toBe("a");
		expect(result.current.activeMission?.id).toBe("a");
	});

	it("createMission appends the created mission and makes it active", async () => {
		mockApi.list.mockResolvedValue([]);
		const created = makeMission({ id: "new-mission", name: "New route" });
		mockApi.create.mockResolvedValue(created);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(mockApi.list).toHaveBeenCalled();
		});

		await act(async () => {
			await result.current.createMission("New route");
		});

		expect(mockApi.create).toHaveBeenCalledWith({ name: "New route" });
		expect(result.current.missions.map((m) => m.id)).toContain("new-mission");
		expect(result.current.activeMissionId).toBe("new-mission");
	});

	it("renameMission updates optimistically then reconciles with the server response", async () => {
		mockApi.list.mockResolvedValue([makeMission({ id: "a", name: "Old name" })]);
		mockApi.update.mockResolvedValue(makeMission({ id: "a", name: "New name" }));

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMissionId).toBe("a");
		});

		await act(async () => {
			await result.current.renameMission("a", "New name");
		});

		expect(result.current.missions[0]?.name).toBe("New name");
	});

	it("renameMission rolls back via reload when the server rejects the update", async () => {
		mockApi.list
			.mockResolvedValueOnce([makeMission({ id: "a", name: "Old name" })])
			.mockResolvedValueOnce([makeMission({ id: "a", name: "Old name" })]);
		mockApi.update.mockRejectedValue(new Error("boom"));

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMissionId).toBe("a");
		});

		await act(async () => {
			await result.current.renameMission("a", "New name");
		});

		// Optimistic update was reverted by the reload fallback.
		expect(result.current.missions[0]?.name).toBe("Old name");
		expect(mockApi.list).toHaveBeenCalledTimes(2);
	});

	it("deleteMission removes the mission and clears activeMissionId if it was active", async () => {
		mockApi.list.mockResolvedValue([makeMission({ id: "a" })]);
		mockApi.remove.mockResolvedValue(undefined);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMissionId).toBe("a");
		});

		await act(async () => {
			await result.current.deleteMission("a");
		});

		expect(result.current.missions).toHaveLength(0);
		expect(result.current.activeMissionId).toBeNull();
	});

	it("deleteMission falls back to another remaining mission if the active one is deleted", async () => {
		mockApi.list.mockResolvedValue([makeMission({ id: "a" }), makeMission({ id: "b" })]);
		mockApi.remove.mockResolvedValue(undefined);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMissionId).toBe("a");
		});

		await act(async () => {
			await result.current.deleteMission("a");
		});

		expect(result.current.missions.map((m) => m.id)).toEqual(["b"]);
		expect(result.current.activeMissionId).toBe("b");
	});

	it("addWaypoint appends the created waypoint to the active mission", async () => {
		mockApi.list.mockResolvedValue([makeMission({ id: "a", waypoints: [] })]);
		const waypoint = makeWaypoint({ id: "wp-new" });
		mockApi.createWaypoint.mockResolvedValue(waypoint);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMissionId).toBe("a");
		});

		await act(async () => {
			await result.current.addWaypoint(59.5, 10.5);
		});

		expect(mockApi.createWaypoint).toHaveBeenCalledWith(
			"a",
			expect.objectContaining({ latitude: 59.5, longitude: 10.5 }),
		);
		expect(result.current.activeMission?.waypoints).toEqual([waypoint]);
	});

	it("reorderWaypoints reorders locally then replaces with the server response", async () => {
		const wp1 = makeWaypoint({ id: "wp-1", sequence_number: 0 });
		const wp2 = makeWaypoint({ id: "wp-2", sequence_number: 1 });
		mockApi.list.mockResolvedValue([makeMission({ id: "a", waypoints: [wp1, wp2] })]);
		const serverResult = [
			{ ...wp2, sequence_number: 0 },
			{ ...wp1, sequence_number: 1 },
		];
		mockApi.replaceWaypoints.mockResolvedValue(serverResult);

		const { result } = renderHook(() => useMission(), { wrapper: MissionProvider });
		await waitFor(() => {
			expect(result.current.activeMission?.waypoints).toHaveLength(2);
		});

		await act(async () => {
			await result.current.reorderWaypoints(["wp-2", "wp-1"]);
		});

		expect(mockApi.replaceWaypoints).toHaveBeenCalled();
		expect(result.current.activeMission?.waypoints.map((w) => w.id)).toEqual(["wp-2", "wp-1"]);
	});
});
