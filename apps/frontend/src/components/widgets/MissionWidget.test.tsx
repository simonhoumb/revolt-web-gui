import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import type { Mission, Waypoint } from "@revolt/shared-types";
import { MissionWidget } from "./MissionWidget.js";
import { moveWaypointId } from "./moveWaypointId.js";
import { useMission } from "../../context/useMission.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";
import { useBridgeData } from "../../context/useBridgeData.js";
import { formatDuration } from "../../lib/format.js";
import { MissionBlockedError } from "../../lib/missionApi.js";

vi.mock("../../context/useMission.js", () => ({
	useMission: vi.fn(),
}));
vi.mock("../../hooks/useWaypointDraft.js", () => ({
	useWaypointDraft: vi.fn(),
}));
vi.mock("../../context/useBridgeData.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseMission = useMission as Mock;
const mockUseWaypointDraft = useWaypointDraft as Mock;
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

function setMission(
	waypoints: Waypoint[],
	overrides: { sendActiveMission?: Mock; updateWaypointSpeed?: Mock } = {},
) {
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
		loadMissions: vi.fn(),
		createMission: vi.fn(),
		selectMission: vi.fn(),
		renameMission: vi.fn(),
		deleteMission: vi.fn(),
		addWaypoint: vi.fn(),
		updateWaypointPosition: vi.fn(),
		updateWaypointSpeed: overrides.updateWaypointSpeed ?? vi.fn(),
		reorderWaypoints: vi.fn(),
		deleteWaypoint: vi.fn(),
		sendActiveMission: overrides.sendActiveMission ?? vi.fn(),
	});
}

afterEach(() => {
	cleanup();
});

beforeEach(() => {
	mockUseBridgeData.mockReturnValue({ missionSendStatus: null });
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
		expect(screen.getByText(/Total: 10\.0 NM/)).toBeInTheDocument();
		expect(screen.getByText(/ETE 1h 0m/)).toBeInTheDocument();
	});

	it("commits the current speed value on focusout, not a stale one", () => {
		// Regression: ObcNumberInputField's onBlur *prop* is unreliable (see the comment in
		// MissionWidget.tsx) -- the fix listens for focusout via a ref instead. This checks that
		// path fires with the value that was actually typed, not one keystroke behind it.
		const updateWaypointSpeed = vi.fn();
		setMission([makeWaypoint({ id: "wp-1", target_speed: 5 })], { updateWaypointSpeed });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const field = document.querySelector("obc-number-input-field") as HTMLElement & {
			value: string;
		};
		expect(field).toBeInTheDocument();

		act(() => {
			field.value = "22";
			field.dispatchEvent(new Event("input", { bubbles: true }));
		});
		act(() => {
			field.dispatchEvent(new Event("focusout", { bubbles: true }));
		});

		expect(updateWaypointSpeed).toHaveBeenCalledExactlyOnceWith("wp-1", 22);
	});

	it("does not show a summary row with no legs", () => {
		setMission([]);
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		expect(screen.queryByText(/Total:/)).not.toBeInTheDocument();
	});

	it("shows the mission send status once a mission_send_status message matches the active mission", () => {
		setMission([makeWaypoint()]);
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });
		mockUseBridgeData.mockReturnValue({
			missionSendStatus: {
				v: "1",
				type: "mission_send_status",
				timestamp_ms: 0,
				mission_id: "mission-1",
				status: "acknowledged",
				waypoint_count: 1,
			},
		});

		render(<MissionWidget />);
		expect(screen.getByText("Acknowledged")).toBeInTheDocument();
	});

	it("does not show a send status for a different mission's status message", () => {
		setMission([makeWaypoint()]);
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });
		mockUseBridgeData.mockReturnValue({
			missionSendStatus: {
				v: "1",
				type: "mission_send_status",
				timestamp_ms: 0,
				mission_id: "some-other-mission",
				status: "acknowledged",
				waypoint_count: 1,
			},
		});

		render(<MissionWidget />);
		expect(screen.queryByText("Acknowledged")).not.toBeInTheDocument();
	});

	it("shows an indeterminate progress bar on the send button while a send is in flight", async () => {
		let resolveSend: () => void = () => {
			// overwritten below
		};
		const sendActiveMission = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					resolveSend = resolve;
				}),
		);
		setMission([makeWaypoint()], { sendActiveMission });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const sendButton = document.querySelector("obc-progress-button") as
			| (HTMLElement & { showProgress: boolean; disabled: boolean })
			| null;
		expect(sendButton).not.toBeNull();
		expect(sendButton?.showProgress).toBe(false);

		act(() => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
		});
		expect(sendActiveMission).toHaveBeenCalledOnce();
		expect(sendButton?.showProgress).toBe(true);
		expect(sendButton?.disabled).toBe(true);

		await act(async () => {
			resolveSend();
			await Promise.resolve();
		});
		expect(sendButton?.showProgress).toBe(false);
	});

	it("shows the blocked hazards inline when send is refused for crossing a charted hazard", async () => {
		const sendActiveMission = vi.fn(() =>
			Promise.reject(
				new MissionBlockedError("Route crosses a charted hazard and cannot be sent.", [
					{ layer: "lndare", description: "Route crosses charted land.", count: 1 },
				]),
			),
		);
		setMission([makeWaypoint()], { sendActiveMission });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const sendButton = document.querySelector("obc-progress-button");
		expect(sendButton).not.toBeNull();

		await act(async () => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(
			screen.getByText("Route crosses a charted hazard and cannot be sent."),
		).toBeInTheDocument();
		expect(screen.getByText("Route crosses charted land.")).toBeInTheDocument();
	});

	it("shows the warning hazards inline when a send succeeds but the route was flagged", async () => {
		const sendActiveMission = vi.fn(() =>
			Promise.resolve({
				status: "acknowledged",
				waypoint_count: 1,
				checked_at: "2026-07-09T00:00:00Z",
				validation_status: "warning" as const,
				hazards: [
					{
						layer: "depare",
						description: "Route crosses charted depth below the 3 m safety contour.",
						count: 1,
					},
				],
			}),
		);
		setMission([makeWaypoint()], { sendActiveMission });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const sendButton = document.querySelector("obc-progress-button");
		expect(sendButton).not.toBeNull();

		await act(async () => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(
			screen.getByText("Sent, but the route was flagged by the server-side chart check:"),
		).toBeInTheDocument();
		expect(
			screen.getByText("Route crosses charted depth below the 3 m safety contour."),
		).toBeInTheDocument();
	});

	it("shows the no_data notice inline when a send succeeds outside charted ENC coverage", async () => {
		const sendActiveMission = vi.fn(() =>
			Promise.resolve({
				status: "acknowledged",
				waypoint_count: 1,
				checked_at: "2026-07-09T00:00:00Z",
				validation_status: "no_data" as const,
				hazards: [
					{
						layer: "m_covr",
						description:
							"Route passes through an area with no charted ENC data -- not verified safe, just unchecked.",
						count: 1,
					},
				],
			}),
		);
		setMission([makeWaypoint()], { sendActiveMission });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const sendButton = document.querySelector("obc-progress-button");
		expect(sendButton).not.toBeNull();

		await act(async () => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(
			screen.getByText(
				"Sent, but part of the route has no charted ENC data — not verified safe, just unchecked:",
			),
		).toBeInTheDocument();
		expect(
			screen.getByText(
				"Route passes through an area with no charted ENC data -- not verified safe, just unchecked.",
			),
		).toBeInTheDocument();
	});

	it("shows no warning panel when a send succeeds with a safe result", async () => {
		const sendActiveMission = vi.fn(() =>
			Promise.resolve({
				status: "acknowledged",
				waypoint_count: 1,
				checked_at: "2026-07-09T00:00:00Z",
				validation_status: "safe" as const,
				hazards: [],
			}),
		);
		setMission([makeWaypoint()], { sendActiveMission });
		mockUseWaypointDraft.mockReturnValue({ waypoints: [], legs: [] });

		render(<MissionWidget />);
		const sendButton = document.querySelector("obc-progress-button");

		await act(async () => {
			sendButton?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
			await Promise.resolve();
			await Promise.resolve();
		});

		expect(
			screen.queryByText("Sent, but the route was flagged by the server-side chart check:"),
		).not.toBeInTheDocument();
	});
});
