import { useEffect, useState } from "react";
import type { HazardHit } from "@revolt/shared-types";
import { ObcDropdownButton } from "@oicl/openbridge-webcomponents-react/components/dropdown-button/dropdown-button.js";
import { ObcTextInputField } from "@oicl/openbridge-webcomponents-react/components/text-input-field/text-input-field.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { ObiDelete } from "@oicl/openbridge-webcomponents-react/icons/icon-delete.js";
import { ObiWidgetAddGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-widget-add-google.js";
import { ObiRouteExportIec } from "@oicl/openbridge-webcomponents-react/icons/icon-route-export-iec.js";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcProgressButton } from "@oicl/openbridge-webcomponents-react/components/progress-button/progress-button.js";
import {
	ProgressButtonType,
	ProgressMode,
} from "@oicl/openbridge-webcomponents/dist/components/progress-button/progress-button.js";
import { useMission } from "../../context/useMission.js";
import { useMissionSendStatus } from "../../hooks/useMissionSendStatus.js";
import { useWaypointDraft } from "../../hooks/useWaypointDraft.js";
import { inputValue } from "../../lib/dom.js";
import { formatDuration } from "../../lib/format.js";
import { accumulateRouteEta } from "../../lib/missionMath.js";
import { MissionBlockedError } from "../../lib/missionApi.js";
import { statusIndicatorFor } from "../../lib/statusIndicator.js";
import { HazardList } from "./HazardList.js";
import { WaypointRow } from "./WaypointRow.js";
import { moveWaypointId } from "./moveWaypointId.js";
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
	no_data:
		"Sent, but part of the route has no charted ENC data — not verified safe, just unchecked:",
};

const SEND_INDICATOR_STATUS: Partial<Record<string, StatusIndicatorStatus>> = {
	sending: StatusIndicatorStatus.active,
	acknowledged: StatusIndicatorStatus.running,
	timed_out: StatusIndicatorStatus.alarm,
	not_connected: StatusIndicatorStatus.alarm,
	mismatched: StatusIndicatorStatus.alarm,
};

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
	const sendStatus = useMissionSendStatus(activeMission?.id ?? null);

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
			if (
				result?.validation_status === "warning" ||
				result?.validation_status === "no_data"
			) {
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
	const { distanceNm: totalDistanceNm, hours: totalDurationHours } = accumulateRouteEta(
		legs.map((leg) => ({
			distanceM: leg.distanceM,
			speedKt: waypointById.get(leg.toId)?.target_speed ?? 0,
		})),
	);

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
					Total: {totalDistanceNm.toFixed(1)} NM · ETE{" "}
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
							<ObcStatusIndicator
								status={statusIndicatorFor(
									sendStatus.status,
									SEND_INDICATOR_STATUS,
								)}
							/>
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
					<HazardList hazards={blockedError.hazards} />
				</div>
			)}

			{sendNotice && (
				<div
					className={
						sendNotice.status === "no_data" ? styles.sendNoData : styles.sendWarning
					}
				>
					<p
						className={
							sendNotice.status === "no_data"
								? styles.sendNoDataMessage
								: styles.sendWarningMessage
						}
					>
						{SEND_NOTICE_MESSAGE[sendNotice.status]}
					</p>
					<HazardList hazards={sendNotice.hazards} />
				</div>
			)}
		</div>
	);
}
