import { useState } from "react";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcAzimuthThruster } from "@oicl/openbridge-webcomponents-react/navigation-instruments/azimuth-thruster/azimuth-thruster.js";
import { ObcThruster } from "@oicl/openbridge-webcomponents-react/navigation-instruments/thruster/thruster.js";
import { InstrumentState } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/types.js";
import { useThrusterData, type ThrusterStatus } from "../../hooks/useThrusterData.js";
import { useApps } from "../../context/AppContext.js";
import { THRUSTER_MAX_AMPERES } from "../../lib/thresholds.js";
import { ViewModeToggle, type WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./ThrusterWidget.module.css";

interface ThrusterRowProps {
	label: string;
	status: ThrusterStatus;
	isSimulation: boolean;
	bowExtra?: { retracted: boolean | null };
}

function clamp(value: number, min: number, max: number): number {
	return Math.max(min, Math.min(max, value));
}

// obc-thruster/obc-azimuth-thruster's thrust prop is a percent (-100..100); this app only has
// current draw (and, in simulation, force) to work with, so THRUSTER_MAX_AMPERES is a placeholder
// ceiling until real hardware calibration data exists. Magnitude only, direction is carried by
// the separate angle prop.
function thrustPercent(status: ThrusterStatus): number {
	if (!status.isOn || status.amperes === null) return 0;
	return clamp((status.amperes / THRUSTER_MAX_AMPERES) * 100, 0, 100);
}

function BowActuatorRow({ retracted }: { retracted: boolean | null }) {
	return (
		<div className={styles.actuatorRow}>
			<ObcStatusIndicator
				status={
					retracted === null
						? StatusIndicatorStatus.inactive
						: retracted
							? StatusIndicatorStatus.inactive
							: StatusIndicatorStatus.running
				}
			/>
			<span className={styles.actuatorLabel}>
				{retracted === null ? "Actuator unknown" : retracted ? "Retracted" : "Deployed"}
			</span>
		</div>
	);
}

function ThrusterRow({ label, status, isSimulation, bowExtra }: ThrusterRowProps) {
	return (
		<div className={styles.thrusterRow}>
			<div className={styles.thrusterHeader}>
				<ObcStatusIndicator
					status={
						status.isOn ? StatusIndicatorStatus.running : StatusIndicatorStatus.inactive
					}
				/>
				<span className={styles.thrusterLabel}>{label}</span>
				<span className={styles.thrusterCurrent}>
					{status.amperes !== null ? `${status.amperes.toFixed(1)} A` : "— A"}
				</span>
			</div>
			{(isSimulation || status.angleDeg !== null) && (
				<div className={styles.simData}>
					{isSimulation && status.force !== null && (
						<span>Force: {status.force.toFixed(1)} N</span>
					)}
					{status.angleDeg !== null && <span>Angle: {status.angleDeg.toFixed(1)}°</span>}
				</div>
			)}
			{bowExtra !== undefined && <BowActuatorRow retracted={bowExtra.retracted} />}
		</div>
	);
}

const MODE_LABELS: Record<string, string> = {
	manual: "Manual",
	manual_assisted: "Manual Assisted",
	autonomous: "Autonomous",
	miscommunication: "Miscommunication",
};

export function ThrusterWidget() {
	const { stern_port, stern_star, bow, bowRetracted, controlMode, isSimulation } =
		useThrusterData();
	const { activeAppId } = useApps();
	const [viewMode, setViewMode] = useState<WidgetViewMode>(
		activeAppId === "conning" ? "instrument" : "detailed",
	);

	const isMiscomm = controlMode === "miscommunication";

	return (
		<div className={styles.content}>
			<div className={styles.toolbar}>
				<ViewModeToggle value={viewMode} onChange={setViewMode} />
			</div>
			{isMiscomm && (
				<div className={styles.badgeRow}>
					<ObcBadge type="caution" showNumber={false} showIcon={true} />
					<span className={styles.modeLabel}>Miscommunication</span>
				</div>
			)}
			<div className={styles.modeRow}>
				<span className={styles.modeLabel}>Mode:</span>
				<span className={styles.modeValue}>
					{controlMode !== null ? (MODE_LABELS[controlMode] ?? controlMode) : "—"}
				</span>
			</div>
			{viewMode === "detailed" ? (
				<div className={styles.thrusterList}>
					<ThrusterRow label="Port" status={stern_port} isSimulation={isSimulation} />
					<ThrusterRow
						label="Starboard"
						status={stern_star}
						isSimulation={isSimulation}
					/>
					<ThrusterRow
						label="Bow"
						status={bow}
						isSimulation={isSimulation}
						bowExtra={{ retracted: bowRetracted }}
					/>
				</div>
			) : (
				<div className={styles.instrumentList}>
					<ObcAzimuthThruster
						className={styles.instrument}
						angle={stern_port.angleDeg ?? 0}
						thrust={thrustPercent(stern_port)}
						state={stern_port.isOn ? InstrumentState.active : InstrumentState.off}
						starboardPortIndicator
					/>
					<ObcAzimuthThruster
						className={styles.instrument}
						angle={stern_star.angleDeg ?? 0}
						thrust={thrustPercent(stern_star)}
						state={stern_star.isOn ? InstrumentState.active : InstrumentState.off}
						starboardPortIndicator
					/>
					<ObcThruster
						className={styles.instrument}
						thrust={thrustPercent(bow)}
						state={bow.isOn ? InstrumentState.active : InstrumentState.off}
					/>
					<BowActuatorRow retracted={bowRetracted} />
				</div>
			)}
		</div>
	);
}
