import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useThrusterData, type ThrusterStatus } from "../../hooks/useThrusterData.js";
import styles from "./ThrusterWidget.module.css";

interface ThrusterRowProps {
	label: string;
	status: ThrusterStatus;
	isSimulation: boolean;
	bowExtra?: { retracted: boolean | null };
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
			{isSimulation && status.force !== null && status.angleDeg !== null && (
				<div className={styles.simData}>
					<span>Force: {status.force.toFixed(1)} N</span>
					<span>Angle: {status.angleDeg.toFixed(1)}°</span>
				</div>
			)}
			{bowExtra !== undefined && (
				<div className={styles.actuatorRow}>
					<ObcStatusIndicator
						status={
							bowExtra.retracted === null
								? StatusIndicatorStatus.inactive
								: bowExtra.retracted
									? StatusIndicatorStatus.inactive
									: StatusIndicatorStatus.running
						}
					/>
					<span className={styles.actuatorLabel}>
						{bowExtra.retracted === null
							? "Actuator unknown"
							: bowExtra.retracted
								? "Retracted"
								: "Deployed"}
					</span>
				</div>
			)}
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

	const isMiscomm = controlMode === "miscommunication";

	return (
		<section className={styles.widget}>
			<div className={styles.widgetHeader}>
				<h2 className={styles.header}>Thrusters</h2>
				{isMiscomm && <ObcBadge type="caution" showNumber={false} showIcon={true} />}
			</div>
			<div className={styles.modeRow}>
				<span className={styles.modeLabel}>Mode:</span>
				<span className={styles.modeValue}>
					{controlMode !== null ? (MODE_LABELS[controlMode] ?? controlMode) : "—"}
				</span>
			</div>
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
		</section>
	);
}
