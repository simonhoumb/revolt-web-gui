import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Mission, MissionExecutionStatusMsg, Waypoint } from "@revolt/shared-types";
import { MissionControlWidget } from "./MissionControlWidget.js";
import { useMission } from "../../context/MissionContext.js";
import { useBridgeData } from "../../context/BridgeDataContext.js";

vi.mock("../../context/MissionContext.js", () => ({
	useMission: vi.fn(),
}));
vi.mock("../../context/BridgeDataContext.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseMission = useMission as Mock;
const mockUseBridgeData = useBridgeData as Mock;

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

function makeMission(overrides: Partial<Mission> = {}, waypoints: Waypoint[] = []): Mission {
	return {
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
		...overrides,
	};
}

interface MissionMockOverrides {
	startMission?: Mock;
	pauseMission?: Mock;
	terminateMission?: Mock;
}

function setLoadedMission(mission: Mission | null, overrides: MissionMockOverrides = {}) {
	mockUseMission.mockReturnValue({
		missions: mission ? [mission] : [],
		loading: false,
		activeMissionId: mission?.id ?? null,
		activeMission: mission,
		loadedMission: mission,
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
		sendActiveMission: vi.fn(),
		startMission: overrides.startMission ?? vi.fn(),
		pauseMission: overrides.pauseMission ?? vi.fn(),
		terminateMission: overrides.terminateMission ?? vi.fn(),
	});
}

function setBridgeData(
	overrides: {
		missionExecutionStatus?: MissionExecutionStatusMsg | null;
		gnssFix?: { latitude: number; longitude: number } | null;
		bridgeStatus?: { target: string } | null;
	} = {},
) {
	mockUseBridgeData.mockReturnValue({
		missionExecutionStatus: overrides.missionExecutionStatus ?? null,
		gnssFix: overrides.gnssFix ?? null,
		bridgeStatus: overrides.bridgeStatus ?? null,
	});
}

function getProgressButton(
	label: string,
): HTMLElement & { showProgress: boolean; disabled: boolean } {
	const buttons = Array.from(document.querySelectorAll("obc-progress-button")) as (HTMLElement & {
		label: string;
		showProgress: boolean;
		disabled: boolean;
	})[];
	const match = buttons.find((b) => b.label === label);
	if (!match) throw new Error(`No progress button found with label "${label}"`);
	return match;
}

afterEach(() => {
	cleanup();
});

describe("MissionControlWidget", () => {
	it("shows an empty state with no loaded mission", () => {
		setLoadedMission(null);
		setBridgeData();
		render(<MissionControlWidget />);
		expect(document.body.textContent).toContain("No mission is currently loaded on the vessel");
	});

	it("shows the loaded mission's name", () => {
		setLoadedMission(
			makeMission({ name: "Fjord loop", status: "active" as Mission["status"] }),
		);
		setBridgeData();
		render(<MissionControlWidget />);
		expect(document.body.textContent).toContain("Fjord loop");
	});

	it("clicking Start opens a confirmation dialog instead of starting immediately", () => {
		const startMission = vi.fn();
		setLoadedMission(makeMission({ status: "draft" as Mission["status"] }), {
			startMission,
		});
		setBridgeData();
		render(<MissionControlWidget />);

		const startButton = getProgressButton("Start");
		act(() => {
			startButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});

		expect(startMission).not.toHaveBeenCalled();
		// Title is projected into obc-modal-window's "title" slot as light DOM we authored --
		// directly queryable, unlike obc-sequence-modal's shadow-only modalTitle property.
		expect(document.querySelector('[slot="title"]')?.textContent).toBe("Start mission?");
	});

	it("confirming the Start dialog calls startMission with the loaded mission's id", async () => {
		const mission = makeMission({ status: "draft" as Mission["status"] });
		const startMission = vi.fn(() => Promise.resolve({ status: "acknowledged" }));
		setLoadedMission(mission, { startMission });
		setBridgeData();
		render(<MissionControlWidget />);

		act(() => {
			getProgressButton("Start").dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		// obc-modal-window's Done button lives in its own shadow root -- simulate a completed
		// click the way the component itself signals one: dispatch the custom event it re-fires
		// on its host element after an internal click.
		const modal = document.querySelector("obc-modal-window");
		await act(async () => {
			modal?.dispatchEvent(new CustomEvent("done-click"));
			await Promise.resolve();
		});

		expect(startMission).toHaveBeenCalledExactlyOnceWith(mission.id);
	});

	it("clicking Terminate opens a confirmation dialog instead of terminating immediately", () => {
		const terminateMission = vi.fn();
		setLoadedMission(makeMission({ status: "active" as Mission["status"] }), {
			terminateMission,
		});
		setBridgeData();
		render(<MissionControlWidget />);

		const terminateButton = getProgressButton("Terminate");
		act(() => {
			terminateButton.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(terminateMission).not.toHaveBeenCalled();
		expect(document.querySelector('[slot="title"]')?.textContent).toBe("Terminate mission?");
	});

	it("confirming the Terminate dialog calls terminateMission with the loaded mission's id", async () => {
		const mission = makeMission({ status: "active" as Mission["status"] });
		const terminateMission = vi.fn(() => Promise.resolve({ status: "aborted" }));
		setLoadedMission(mission, { terminateMission });
		setBridgeData();
		render(<MissionControlWidget />);

		act(() => {
			getProgressButton("Terminate").dispatchEvent(
				new MouseEvent("click", { bubbles: true }),
			);
		});
		const modal = document.querySelector("obc-modal-window");
		await act(async () => {
			modal?.dispatchEvent(new CustomEvent("done-click"));
			await Promise.resolve();
		});

		expect(terminateMission).toHaveBeenCalledExactlyOnceWith(mission.id);
	});

	it("renders current waypoint/progress from a live mission_execution_status message", () => {
		const mission = makeMission({ status: "active" as Mission["status"] }, [
			makeWaypoint({ id: "wp-1", sequence_number: 0 }),
			makeWaypoint({
				id: "wp-2",
				sequence_number: 1,
				position: { latitude: 60.0, longitude: 11.0 },
			}),
		]);
		setLoadedMission(mission);
		setBridgeData({
			missionExecutionStatus: {
				v: "1",
				type: "mission_execution_status",
				timestamp_ms: 1000,
				mission_id: mission.id,
				state: "active",
				current_waypoint_seq: 1,
				remaining_count: 1,
				total_count: 2,
			},
		});
		render(<MissionControlWidget />);

		expect(document.body.textContent).toContain("60.00000");
		expect(document.body.textContent).toContain("1 / 2");
	});

	it("disables Start while the mission is already active, and Pause otherwise", () => {
		setLoadedMission(makeMission({ status: "active" as Mission["status"] }));
		setBridgeData();
		render(<MissionControlWidget />);
		expect(getProgressButton("Start").disabled).toBe(true);
		expect(getProgressButton("Pause").disabled).toBe(false);
	});

	it("disables Terminate when the mission has never been started", () => {
		setLoadedMission(makeMission({ status: "draft" as Mission["status"] }));
		setBridgeData();
		render(<MissionControlWidget />);
		expect(getProgressButton("Terminate").disabled).toBe(true);
	});

	it("buttons follow a live mission_execution_status update, not just the mission's own stale status", () => {
		// Regression: an out-of-band command (a different tab, or curl) changes execution state
		// and broadcasts it over the WS, but this tab's loadedMission.status only refreshes when
		// *this* tab issues a command itself -- buttons must react to the live broadcast too.
		const mission = makeMission({ status: "active" as Mission["status"] });
		setLoadedMission(mission);
		setBridgeData({
			missionExecutionStatus: {
				v: "1",
				type: "mission_execution_status",
				timestamp_ms: 1000,
				mission_id: mission.id,
				state: "paused",
				current_waypoint_seq: null,
				remaining_count: 1,
				total_count: 2,
			},
		});
		render(<MissionControlWidget />);

		expect(getProgressButton("Start").disabled).toBe(false);
		expect(getProgressButton("Pause").disabled).toBe(true);
		expect(getProgressButton("Terminate").disabled).toBe(false);
	});
});
