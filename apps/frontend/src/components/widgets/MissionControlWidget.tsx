import { useMemo, useState } from "react";
import { MissionStatus, type MissionExecutionState, type Waypoint } from "@revolt/shared-types";
import { ObcProgressButton } from "@oicl/openbridge-webcomponents-react/components/progress-button/progress-button.js";
import {
	ProgressButtonType,
	ProgressMode,
} from "@oicl/openbridge-webcomponents/dist/components/progress-button/progress-button.js";
import { ObcProgressBar } from "@oicl/openbridge-webcomponents-react/components/progress-bar/progress-bar.js";
import {
	ProgressBarMode,
	ProgressBarType,
} from "@oicl/openbridge-webcomponents/dist/components/progress-bar/progress-bar.js";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObiMediaPlay } from "@oicl/openbridge-webcomponents-react/icons/icon-media-play.js";
import { ObiMediaPause } from "@oicl/openbridge-webcomponents-react/icons/icon-media-pause.js";
import { ObiMediaStop } from "@oicl/openbridge-webcomponents-react/icons/icon-media-stop.js";
import { useBridgeData } from "../../context/useBridgeData.js";
import { useMission } from "../../context/useMission.js";
import { useMissionExecutionStatus } from "../../hooks/useMissionExecutionStatus.js";
import { formatDuration, formatLatLon } from "../../lib/format.js";
import { haversineDistanceM } from "../../lib/geo.js";
import { accumulateRouteEta, type DistanceSpeedLeg, type RouteEta } from "../../lib/missionMath.js";
import {
	MissionBlockedError,
	MissionConflictError,
	MissionNotLoadedError,
} from "../../lib/missionApi.js";
import { statusIndicatorFor } from "../../lib/statusIndicator.js";
import { ConfirmDialog } from "./ConfirmDialog.js";
import { HazardList } from "./HazardList.js";
import styles from "./MissionControlWidget.module.css";

const STATE_LABEL: Record<MissionExecutionState, string> = {
	starting: "Starting…",
	active: "Active",
	pausing: "Pausing…",
	paused: "Paused",
	terminating: "Terminating…",
	aborted: "Aborted",
	completed: "Completed",
};

const EXECUTION_INDICATOR_STATUS: Partial<Record<MissionExecutionState, StatusIndicatorStatus>> = {
	starting: StatusIndicatorStatus.active,
	active: StatusIndicatorStatus.active,
	completed: StatusIndicatorStatus.running,
	terminating: StatusIndicatorStatus.alarm,
	aborted: StatusIndicatorStatus.alarm,
};

// Falls back to persisted Mission.status (draft/active/paused/completed/aborted) only until the
// vessel's first live execution status arrives for this mission (e.g. right after page load,
// before any /waypoint_list echo has been received in this session).
function fallbackLabel(missionStatus: MissionStatus): string {
	switch (missionStatus) {
		case MissionStatus.Active:
			return "Active (awaiting live update)";
		case MissionStatus.Paused:
			return "Paused";
		case MissionStatus.Aborted:
			return "Aborted";
		case MissionStatus.Completed:
			return "Completed";
		case MissionStatus.Draft:
		default:
			return "Not started";
	}
}

function fallbackExecutionState(missionStatus: MissionStatus): MissionExecutionState {
	switch (missionStatus) {
		case MissionStatus.Active:
			return "active";
		case MissionStatus.Aborted:
			return "aborted";
		case MissionStatus.Completed:
			return "completed";
		case MissionStatus.Paused:
		case MissionStatus.Draft:
		default:
			return "paused";
	}
}

// Best-effort dead reckoning, not authoritative: sums straight-line legs from own-ship position
// (when a GNSS fix is available) through the remaining waypoints in sequence order, dividing each
// leg by its target waypoint's speed -- the same distance/speed/duration idiom MissionWidget uses
// for its planning-time ETE (see lib/missionMath.ts's accumulateRouteEta), just starting from
// wherever the vessel currently is instead of waypoint zero.
function computeRemainingEta(
	waypoints: Waypoint[],
	currentSeq: number | null,
	ownship: { lat: number; lon: number } | null,
): RouteEta | null {
	if (currentSeq === null) return null;
	const remaining = waypoints
		.filter((w) => w.sequence_number >= currentSeq)
		.sort((a, b) => a.sequence_number - b.sequence_number);
	if (remaining.length === 0) return null;

	const legs: DistanceSpeedLeg[] = [];
	let prev = ownship;
	for (const wp of remaining) {
		if (prev) {
			legs.push({
				distanceM: haversineDistanceM(
					prev.lat,
					prev.lon,
					wp.position.latitude,
					wp.position.longitude,
				),
				speedKt: wp.target_speed,
			});
		}
		prev = { lat: wp.position.latitude, lon: wp.position.longitude };
	}
	return accumulateRouteEta(legs);
}

type DialogKind = "start" | "pause" | "terminate" | null;

export function MissionControlWidget() {
	const { loadedMission, startMission, pauseMission, terminateMission } = useMission();
	const { gnssFix, bridgeStatus } = useBridgeData();
	const liveStatus = useMissionExecutionStatus(loadedMission?.id ?? null);

	const [openDialog, setOpenDialog] = useState<DialogKind>(null);
	const [pending, setPending] = useState(false);
	const [blockedError, setBlockedError] = useState<MissionBlockedError | null>(null);
	const [actionError, setActionError] = useState<string | null>(null);
	const [autonomyNote, setAutonomyNote] = useState<string | null>(null);

	const currentWaypoint = useMemo(() => {
		if (!loadedMission || liveStatus?.current_waypoint_seq == null) return null;
		return (
			loadedMission.waypoints.find(
				(w) => w.sequence_number === liveStatus.current_waypoint_seq,
			) ?? null
		);
	}, [loadedMission, liveStatus?.current_waypoint_seq]);

	const eta = useMemo(() => {
		if (!loadedMission || !liveStatus) return null;
		const ownship = gnssFix ? { lat: gnssFix.latitude, lon: gnssFix.longitude } : null;
		return computeRemainingEta(
			loadedMission.waypoints,
			liveStatus.current_waypoint_seq,
			ownship,
		);
	}, [loadedMission, liveStatus, gnssFix]);

	const progressPct =
		liveStatus && liveStatus.total_count > 0
			? ((liveStatus.total_count - liveStatus.remaining_count) / liveStatus.total_count) * 100
			: 0;

	function closeDialog() {
		setOpenDialog(null);
	}

	async function handleStart() {
		if (!loadedMission) return;
		closeDialog();
		setPending(true);
		setBlockedError(null);
		setActionError(null);
		setAutonomyNote(null);
		try {
			const result = await startMission(loadedMission.id);
			if (result.autonomy_note) setAutonomyNote(result.autonomy_note);
		} catch (err) {
			if (err instanceof MissionBlockedError) {
				setBlockedError(err);
			} else if (
				err instanceof MissionNotLoadedError ||
				err instanceof MissionConflictError
			) {
				setActionError(err.message);
			} else {
				throw err;
			}
		} finally {
			setPending(false);
		}
	}

	async function handlePause() {
		if (!loadedMission) return;
		closeDialog();
		setPending(true);
		setActionError(null);
		try {
			await pauseMission(loadedMission.id);
		} catch (err) {
			if (err instanceof MissionConflictError) {
				setActionError(err.message);
			} else {
				throw err;
			}
		} finally {
			setPending(false);
		}
	}

	async function handleTerminate() {
		if (!loadedMission) return;
		closeDialog();
		setPending(true);
		setActionError(null);
		try {
			await terminateMission(loadedMission.id);
		} catch (err) {
			if (err instanceof MissionConflictError) {
				setActionError(err.message);
			} else {
				throw err;
			}
		} finally {
			setPending(false);
		}
	}

	if (!loadedMission) {
		return (
			<div className={styles.content}>
				<p className={styles.emptyState}>
					No mission is currently loaded on the vessel. Use &quot;Send to vessel&quot; in
					the mission planner to load a route before starting execution.
				</p>
			</div>
		);
	}

	const missionStatus = loadedMission.status;
	// Live execution state (from the WS broadcast) is shared by every open tab and updates the
	// instant *any* client issues a command -- unlike missionStatus, which only refreshes when
	// this tab itself calls refreshMission. Buttons must key off the same source as the label, or
	// a command issued via another tab (or curl) leaves this tab's buttons stuck showing the
	// state from before that command. Checked directly against liveStatus/missionStatus rather
	// than through fallbackExecutionState -- that mapping folds "draft" into "paused" for the
	// indicator dot's sake, which would wrongly make a never-started mission look terminable.
	const canStart = liveStatus
		? liveStatus.state !== "active"
		: missionStatus !== MissionStatus.Active;
	const canPause = liveStatus
		? liveStatus.state === "active"
		: missionStatus === MissionStatus.Active;
	const canTerminate = liveStatus
		? liveStatus.state === "active" || liveStatus.state === "paused"
		: missionStatus === MissionStatus.Active || missionStatus === MissionStatus.Paused;

	return (
		<div className={styles.content}>
			<div className={styles.loadedHeader}>{"Current Mission: " + loadedMission.name}</div>
			<div className={styles.statusRow}>
				<ObcStatusIndicator
					status={statusIndicatorFor(
						liveStatus ? liveStatus.state : fallbackExecutionState(missionStatus),
						EXECUTION_INDICATOR_STATUS,
					)}
				/>
				<span className={styles.statusLabel}>
					{liveStatus ? STATE_LABEL[liveStatus.state] : fallbackLabel(missionStatus)}
				</span>
			</div>

			{liveStatus && (
				<>
					<div className={styles.waypointRow}>
						<span className={styles.waypointLabel}>Current waypoint</span>
						<span>
							{currentWaypoint
								? `#${String(currentWaypoint.sequence_number + 1)} — ${formatLatLon(currentWaypoint.position.latitude, currentWaypoint.position.longitude)}`
								: "—"}
						</span>
					</div>

					<ObcProgressBar
						type={ProgressBarType.linear}
						mode={ProgressBarMode.determinate}
						value={progressPct}
						showValue
					/>
					<div className={styles.progressCaption}>
						{liveStatus.total_count - liveStatus.remaining_count} /{" "}
						{liveStatus.total_count} waypoints reached
					</div>

					<div className={styles.etaRow}>
						<span className={styles.waypointLabel}>ETA (estimate)</span>
						<span>{eta ? formatDuration(eta.hours) : "—"}</span>
					</div>
				</>
			)}

			<div className={styles.buttonRow}>
				<ObcProgressButton
					type={ProgressButtonType.Linear}
					mode={ProgressMode.Indeterminate}
					showProgress={pending}
					hasLeadingIcon
					label="Start"
					disabled={pending || !canStart}
					onClick={() => {
						setOpenDialog("start");
					}}
				>
					<ObiMediaPlay slot="leading-icon" />
				</ObcProgressButton>
				<ObcProgressButton
					type={ProgressButtonType.Linear}
					mode={ProgressMode.Indeterminate}
					showProgress={pending}
					hasLeadingIcon
					label="Pause"
					disabled={pending || !canPause}
					onClick={() => {
						setOpenDialog("pause");
					}}
				>
					<ObiMediaPause slot="leading-icon" />
				</ObcProgressButton>
			</div>

			<ObcProgressButton
				type={ProgressButtonType.Linear}
				mode={ProgressMode.Indeterminate}
				showProgress={pending}
				hasLeadingIcon
				label="Terminate"
				disabled={pending || !canTerminate}
				onClick={() => {
					setOpenDialog("terminate");
				}}
			>
				<ObiMediaStop slot="leading-icon" />
			</ObcProgressButton>

			{autonomyNote && <div className={styles.autonomyNote}>{autonomyNote}</div>}

			{actionError && <div className={styles.blockedError}>{actionError}</div>}

			{blockedError && (
				<div className={styles.blockedError}>
					<p className={styles.blockedErrorMessage}>{blockedError.message}</p>
					<HazardList hazards={blockedError.hazards} />
				</div>
			)}

			<ConfirmDialog
				open={openDialog === "start"}
				title="Start mission?"
				content={
					bridgeStatus?.target === "physical"
						? "Waypoints will be sent. Engaging autonomy is controlled by the RC remote's gear switch on the physical vessel, not by this button."
						: "The vessel will begin executing this mission's waypoints."
				}
				confirmLabel="Start"
				onConfirm={() => {
					void handleStart();
				}}
				onCancel={closeDialog}
			/>
			<ConfirmDialog
				open={openDialog === "pause"}
				title="Pause mission?"
				content="The vessel will stop where it is. Starting again resumes from its current position."
				confirmLabel="Pause"
				onConfirm={() => {
					void handlePause();
				}}
				onCancel={closeDialog}
			/>
			<ConfirmDialog
				open={openDialog === "terminate"}
				title="Terminate mission?"
				content="This immediately stops the vessel and cannot be resumed. A new start will begin the mission from the beginning."
				confirmLabel="Terminate"
				danger
				onConfirm={() => {
					void handleTerminate();
				}}
				onCancel={closeDialog}
			/>
		</div>
	);
}
