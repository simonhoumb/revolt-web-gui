import { useEffect, useState } from "react";
import type { HazardHit, Waypoint } from "@revolt/shared-types";
import { ObcDropdownButton } from "@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button.js";
import { ObcTextInputField } from "@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field.js";
import { ObcNumberInputField } from "@oicl/openbridge-webcomponents-react/components/number-input-field/number-input-field.js";
import { ObcNumberInputFieldSize } from "@oicl/openbridge-webcomponents/dist/components/number-input-field/number-input-field.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObiDelete } from "@oicl/openbridge-webcomponents-react/icons/icon-delete.js";
import { ObiWidgetAddGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-widget-add-google.js";
import { ObiArrowUpGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-up-google.js";
import { ObiArrowDownGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-arrow-down-google.js";
import { ObiWaypointDeleteIec } from "@oicl/openbridge-webcomponents-react/icons/icon-waypoint-delete-iec.js";
import { ObiRouteExportIec } from "@oicl/openbridge-webcomponents-react/icons/icon-route-export-iec.js";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcProgressButton } from "@oicl/openbridge-webcomponents-react/components/progress-button/progress-button.js";
import {
	ProgressButtonType,
	ProgressMode,
} from "@oicl/openbridge-webcomponents/dist/components/progress-button/progress-button.js";
import { useBridgeData } from "../../context/BridgeDataContext.js";
import { useMission } from "../../context/MissionContext.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";
import { MissionBlockedError } from "../../lib/missionApi.js";
import styles from "./MissionWidget.module.css";

const SEND_STATUS_LABEL: Record<string, string> = {
	sending: "Sending…",
	acknowledged: "Acknowledged",
	timed_out: "Timed out — no response from vessel",
	not_connected: "Bridge not connected",
	mismatched: "Vessel reported a different route",
};

interface SendNotice {
	status: "warning" | "no_data";
	hazards: HazardHit[];
}

const SEND_NOTICE_MESSAGE: Record<SendNotice["status"], string> = {
	warning: "Sent, but the route was flagged by the server-side chart check:",
	no_data: "Sent, but part of the route has no charted ENC data — not verified safe, just unchecked:",
};

function sendIndicatorStatus(status: string): StatusIndicatorStatus {
	switch (status) {
		case "sending":
			return StatusIndicatorStatus.active;
		case "acknowledged":
			return StatusIndicatorStatus.running;
		case "timed_out":
		case "not_connected":
		case "mismatched":
			return StatusIndicatorStatus.alarm;
		default:
			return StatusIndicatorStatus.inactive;
	}
}

function inputValue(e: { target: EventTarget | null }): string {
	return (e.target as { value?: string } | null)?.value ?? "";
}

export function moveWaypointId(
	waypoints: Waypoint[],
	waypointId: string,
	direction: -1 | 1,
): string[] {
	const ids = waypoints.map((w) => w.id);
	const index = ids.indexOf(waypointId);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= ids.length) return ids;
	return ids.map((id, i) => {
		if (i === index) return ids[target] ?? id;
		if (i === target) return ids[index] ?? id;
		return id;
	});
}

const METERS_PER_NM = 1852;

export function formatDuration(hours: number): string {
	if (!Number.isFinite(hours) || hours <= 0) return "—";
	const totalMinutes = Math.round(hours * 60);
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return h > 0 ? `${String(h)}h ${String(m)}m` : `${String(m)}m`;
}

interface WaypointRowProps {
	waypoint: Waypoint;
	index: number;
	total: number;
	onMoveUp: () => void;
	onMoveDown: () => void;
	onDelete: () => void;
	onSpeedCommit: (knots: number) => void;
}

function WaypointRow({
	waypoint,
	index,
	total,
	onMoveUp,
	onMoveDown,
	onDelete,
	onSpeedCommit,
}: WaypointRowProps) {
	const [speedDraft, setSpeedDraft] = useState(String(waypoint.target_speed));

	useEffect(() => {
		setSpeedDraft(String(waypoint.target_speed));
	}, [waypoint.target_speed]);

	function commitSpeed() {
		const parsed = Number.parseFloat(speedDraft);
		if (Number.isFinite(parsed) && parsed >= 0 && parsed !== waypoint.target_speed) {
			onSpeedCommit(parsed);
		} else {
			setSpeedDraft(String(waypoint.target_speed));
		}
	}

	return (
		<div className={styles.waypointRow}>
			<div className={styles.waypointMeta}>
				<span className={styles.sequenceBadge}>{index + 1}</span>
				<span className={styles.coords}>
					{waypoint.position.latitude.toFixed(5)}°,{" "}
					{waypoint.position.longitude.toFixed(5)}°
				</span>
			</div>
			<ObcNumberInputField
				size={ObcNumberInputFieldSize.Regular}
				unit="kt"
				value={speedDraft}
				onInput={(e) => {
					setSpeedDraft(inputValue(e));
				}}
				onBlur={commitSpeed}
			/>
			<div className={styles.waypointActions}>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Move waypoint up"
					disabled={index === 0}
					onClick={onMoveUp}
				>
					<ObiArrowUpGoogle />
				</ObcIconButton>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Move waypoint down"
					disabled={index === total - 1}
					onClick={onMoveDown}
				>
					<ObiArrowDownGoogle />
				</ObcIconButton>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Delete waypoint"
					onClick={onDelete}
				>
					<ObiWaypointDeleteIec />
				</ObcIconButton>
			</div>
		</div>
	);
}

export function MissionWidget() {
	const {
		missions,
		loading,
		activeMissionId,
		activeMission,
		selectMission,
		createMission,
		renameMission,
		deleteMission,
		updateWaypointSpeed,
		deleteWaypoint,
		reorderWaypoints,
		sendActiveMission,
	} = useMission();
	const { legs } = useWaypointDraft();
	const { missionSendStatus } = useBridgeData();

	const [newMissionName, setNewMissionName] = useState("");
	const [renameDraft, setRenameDraft] = useState("");
	const [sendPending, setSendPending] = useState(false);
	const [blockedError, setBlockedError] = useState<MissionBlockedError | null>(null);
	const [sendNotice, setSendNotice] = useState<SendNotice | null>(null);

	async function handleSend() {
		if (!activeMission) return;
		setSendPending(true);
		setBlockedError(null);
		setSendNotice(null);
		try {
			const result = await sendActiveMission();
			// "blocked" never reaches here (missionApi.send() throws MissionBlockedError for that
			// case instead) -- "warning" and "no_data" both need surfacing (the vessel is tested in
			// areas outside ENC coverage, so a no_data send is expected, not just tolerated -- but
			// the operator should still see it happened), "safe" needs nothing shown.
			if (result?.validation_status === "warning" || result?.validation_status === "no_data") {
				setSendNotice({ status: result.validation_status, hazards: result.hazards });
			}
		} catch (err) {
			if (err instanceof MissionBlockedError) {
				setBlockedError(err);
			} else {
				throw err;
			}
		} finally {
			setSendPending(false);
		}
	}

	const sendStatus =
		activeMission && missionSendStatus?.mission_id === activeMission.id
			? missionSendStatus
			: null;

	useEffect(() => {
		setRenameDraft(activeMission?.name ?? "");
	}, [activeMission?.id, activeMission?.name]);

	// A blocked-send error or a send notice describes a specific route; once the operator edits
	// waypoints (or switches missions entirely) it no longer reflects the current route, so don't
	// leave it displayed as if it still applied.
	useEffect(() => {
		setBlockedError(null);
		setSendNotice(null);
	}, [activeMission?.id, activeMission?.waypoints]);

	async function handleCreateMission() {
		const name = newMissionName.trim();
		if (!name) return;
		setNewMissionName("");
		await createMission(name);
	}

	function commitRename() {
		const name = renameDraft.trim();
		if (!activeMission || !name || name === activeMission.name) return;
		void renameMission(activeMission.id, name);
	}

	const missionOptions = missions.map((m) => ({ value: m.id, label: m.name }));

	const waypointById = new Map((activeMission?.waypoints ?? []).map((w) => [w.id, w]));
	const totalDistanceNm = legs.reduce((sum, leg) => sum + leg.distanceM / METERS_PER_NM, 0);
	const totalDurationHours = legs.reduce((sum, leg) => {
		const speedKt = waypointById.get(leg.toId)?.target_speed ?? 0;
		return speedKt > 0 ? sum + leg.distanceM / METERS_PER_NM / speedKt : sum;
	}, 0);

	return (
		<div className={styles.content}>
			<div className={styles.missionRow}>
				<ObcDropdownButton
					options={missionOptions}
					value={activeMissionId ?? undefined}
					fullWidth
					disabled={missions.length === 0}
					onDropdownChange={(e) => {
						selectMission(e.detail.value);
					}}
				/>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Delete mission"
					disabled={!activeMission}
					onClick={() => {
						if (activeMission) void deleteMission(activeMission.id);
					}}
				>
					<ObiDelete />
				</ObcIconButton>
			</div>

			<div className={styles.newMissionRow}>
				<ObcTextInputField
					placeholder="New mission name…"
					value={newMissionName}
					onInput={(e) => {
						setNewMissionName(inputValue(e));
					}}
					onKeyDown={(e) => {
						if (e.key === "Enter") void handleCreateMission();
					}}
				/>
				<ObcIconButton
					variant={IconButtonVariant.flat}
					aria-label="Create mission"
					disabled={!newMissionName.trim()}
					onClick={() => {
						void handleCreateMission();
					}}
				>
					<ObiWidgetAddGoogle />
				</ObcIconButton>
			</div>

			{activeMission && (
				<ObcTextInputField
					label="Mission name"
					value={renameDraft}
					onInput={(e) => {
						setRenameDraft(inputValue(e));
					}}
					onBlur={commitRename}
				/>
			)}

			{legs.length > 0 && (
				<div className={styles.summaryRow}>
					Total: {totalDistanceNm.toFixed(1)} nm · ETE{" "}
					{formatDuration(totalDurationHours)}
				</div>
			)}

			<div className={styles.waypointList}>
				{!activeMission && !loading && (
					<p className={styles.emptyState}>
						Create or select a mission to start planning waypoints.
					</p>
				)}
				{activeMission?.waypoints.length === 0 && (
					<p className={styles.emptyState}>No waypoints yet.</p>
				)}
				{activeMission?.waypoints.map((wp, index) => (
					<WaypointRow
						key={wp.id}
						waypoint={wp}
						index={index}
						total={activeMission.waypoints.length}
						onMoveUp={() => {
							void reorderWaypoints(
								moveWaypointId(activeMission.waypoints, wp.id, -1),
							);
						}}
						onMoveDown={() => {
							void reorderWaypoints(
								moveWaypointId(activeMission.waypoints, wp.id, 1),
							);
						}}
						onDelete={() => {
							void deleteWaypoint(wp.id);
						}}
						onSpeedCommit={(knots) => {
							void updateWaypointSpeed(wp.id, knots);
						}}
					/>
				))}
			</div>

			{activeMission && (
				<div className={styles.sendRow}>
					<ObcProgressButton
						type={ProgressButtonType.Linear}
						mode={ProgressMode.Indeterminate}
						showProgress={sendPending}
						hasLeadingIcon
						label="Send to vessel"
						disabled={activeMission.waypoints.length === 0 || sendPending}
						onClick={() => {
							void handleSend();
						}}
					>
						<ObiRouteExportIec slot="leading-icon" />
					</ObcProgressButton>
					{sendStatus && (
						<>
							<ObcStatusIndicator status={sendIndicatorStatus(sendStatus.status)} />
							<span className={styles.sendStatus}>
								{SEND_STATUS_LABEL[sendStatus.status] ?? sendStatus.status}
							</span>
						</>
					)}
				</div>
			)}

			{blockedError && (
				<div className={styles.blockedError}>
					<p className={styles.blockedErrorMessage}>{blockedError.message}</p>
					{renderHazardList(blockedError.hazards)}
				</div>
			)}

			{sendNotice && (
				<div className={sendNotice.status === "no_data" ? styles.sendNoData : styles.sendWarning}>
					<p
						className={
							sendNotice.status === "no_data"
								? styles.sendNoDataMessage
								: styles.sendWarningMessage
						}
					>
						{SEND_NOTICE_MESSAGE[sendNotice.status]}
					</p>
					{renderHazardList(sendNotice.hazards)}
				</div>
			)}
		</div>
	);
}

function renderHazardList(hazards: HazardHit[]) {
	return (
		<ul className={styles.hazardList}>
			{hazards.map((hazard) => (
				<li key={hazard.layer}>
					{hazard.description}
					{hazard.count > 1 ? ` (${String(hazard.count)} charted features)` : ""}
				</li>
			))}
		</ul>
	);
}
