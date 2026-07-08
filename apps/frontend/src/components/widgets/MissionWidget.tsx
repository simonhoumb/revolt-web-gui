import { useEffect, useState } from "react";
import type { Waypoint } from "@revolt/shared-types";
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
import { useMission } from "../../context/MissionContext.js";
import styles from "./MissionWidget.module.css";

function inputValue(e: { target: EventTarget | null }): string {
	return (e.target as { value?: string } | null)?.value ?? "";
}

function moveWaypointId(waypoints: Waypoint[], waypointId: string, direction: -1 | 1): string[] {
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
	} = useMission();

	const [newMissionName, setNewMissionName] = useState("");
	const [renameDraft, setRenameDraft] = useState("");

	useEffect(() => {
		setRenameDraft(activeMission?.name ?? "");
	}, [activeMission?.id, activeMission?.name]);

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
		</div>
	);
}
