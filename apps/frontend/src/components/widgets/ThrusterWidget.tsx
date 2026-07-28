import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcAzimuthThrusterLabeled } from "@oicl/openbridge-webcomponents-react/navigation-instruments/azimuth-thruster-labeled/azimuth-thruster-labeled.js";
import { AzimuthThrusterLabeledSize } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/azimuth-thruster-labeled/azimuth-thruster-labeled.js";
import { CommandStatus } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/badge-command/badge-command.js";
import { useThrusterData, type ThrusterStatus } from "../../hooks/useThrusterData.js";
import { cx } from "../../lib/classNames.js";
import { THRUSTER_MAX_AMPERES } from "../../lib/thresholds.js";
import { StaleBadge } from "./StaleBadge.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./ThrusterWidget.module.css";
import { PropellerType } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/thruster/propeller.js";

// obc-azimuth-thruster-labeled has no "off" visual state of its own (its internal state is always
// InstrumentState.active; only the enhanced/regular priority varies with commandStatus). Mapping
// isOn to CommandStatus.InCommand/NoCommand at least dims an off thruster (regular priority)
// instead of it always reading as fully active regardless of whether it's actually running.
function thrusterCommandStatus(isOn: boolean): CommandStatus {
	return isOn ? CommandStatus.InCommand : CommandStatus.NoCommand;
}

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

function actuatorStatus(retracted: boolean | null): {
	status: StatusIndicatorStatus;
	label: string;
} {
	if (retracted === null)
		return { status: StatusIndicatorStatus.inactive, label: "Actuator unknown" };
	return retracted
		? { status: StatusIndicatorStatus.inactive, label: "Retracted" }
		: { status: StatusIndicatorStatus.running, label: "Deployed" };
}

function BowActuatorRow({ retracted, compact }: { retracted: boolean | null; compact?: boolean }) {
	const { status, label } = actuatorStatus(retracted);
	return (
		<div className={compact ? styles.readoutActuatorRow : styles.actuatorRow}>
			<ObcStatusIndicator status={status} />
			<span className={styles.actuatorLabel}>{label}</span>
		</div>
	);
}

function ThrusterRow({ label, status, isSimulation, bowExtra }: ThrusterRowProps) {
	return (
		<div className={cx(styles.thrusterRow, status.stale && styles.stale)}>
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
				{status.stale && <StaleBadge />}
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

export function ThrusterWidget({ viewMode = "instrument" }: { viewMode?: WidgetViewMode }) {
	const {
		stern_port,
		stern_star,
		bow,
		bowRetracted,
		controlMode,
		controlModeStale,
		isSimulation,
	} = useThrusterData();

	const isMiscomm = controlMode === "miscommunication";

	return (
		<div className={styles.content}>
			<div className={cx(styles.modeRow, controlModeStale && styles.stale)}>
				<span className={styles.modeLabel}>Mode:</span>
				{isMiscomm && <ObcBadge type="caution" showNumber={false} showIcon={true} />}
				<span className={styles.modeValue}>
					{controlMode !== null ? (MODE_LABELS[controlMode] ?? controlMode) : "—"}
				</span>
				{controlModeStale && <StaleBadge />}
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
				<div className={styles.propulsionLayout}>
					{/* obc-azimuth-thruster-labeled bundles a label, Angle/Power(%) fields, and the
					    gauge itself into one component (matching the OpenBridge demo's own azimuth
					    readout), used uniformly for all three thrusters -- including the bow, which
					    isn't really an azimuth thruster (fixed, angle always 0) and has no
					    "labeled" wrapper of its own, but this keeps all three visually consistent
					    rather than mixing in a differently-shaped plain obc-thruster. This does
					    trade away the CUR (amperes) and sim-only Force readouts the old per-thruster
					    ObcInstrumentField pairing showed, and the starboardPortIndicator marker
					    obc-azimuth-thruster had, since the labeled component doesn't expose either --
					    Power (%) is the same thrustPercent() value CUR used to be derived from, just
					    relabeled to match the component's fixed Angle/Power fields. The bow's own
					    actuator retracted/deployed status has no equivalent field either, so it's
					    kept as a compact addendum below the gauge. */}
					<div className={styles.bowRow}>
						<div className={styles.gaugeWrap}>
							<ObcAzimuthThrusterLabeled
								className={cx(styles.sternLabeled, bow.stale && styles.stale)}
								label="Bow"
								angle={0}
								thrust={thrustPercent(bow)}
								commandStatus={thrusterCommandStatus(bow.isOn && !bowRetracted)}
								size={AzimuthThrusterLabeledSize.large}
							/>
							{bow.stale && <StaleBadge corner />}
						</div>
						<BowActuatorRow retracted={bowRetracted} compact />
					</div>
					<div className={styles.sternRow}>
						<div className={styles.gaugeWrap}>
							<ObcAzimuthThrusterLabeled
								className={cx(
									styles.sternLabeled,
									stern_port.stale && styles.stale,
								)}
								label="Port"
								angle={stern_port.angleDeg ?? 0}
								thrust={thrustPercent(stern_port)}
								commandStatus={thrusterCommandStatus(stern_port.isOn)}
								size={AzimuthThrusterLabeledSize.large}
								topPropeller={PropellerType.cap}
								bottomPropeller={PropellerType.single}
							/>
							{stern_port.stale && <StaleBadge corner />}
						</div>
						<div className={styles.gaugeWrap}>
							<ObcAzimuthThrusterLabeled
								className={cx(
									styles.sternLabeled,
									stern_star.stale && styles.stale,
								)}
								label="Starboard"
								angle={stern_star.angleDeg ?? 0}
								thrust={thrustPercent(stern_star)}
								commandStatus={thrusterCommandStatus(stern_star.isOn)}
								size={AzimuthThrusterLabeledSize.large}
								topPropeller={PropellerType.cap}
								bottomPropeller={PropellerType.single}
							/>
							{stern_star.stale && <StaleBadge corner />}
						</div>
					</div>
				</div>
			)}
		</div>
	);
}
