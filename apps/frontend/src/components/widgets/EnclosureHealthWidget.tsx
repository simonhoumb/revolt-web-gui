import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import {
	useEnclosureHealthData,
	type EnclosureReading,
} from "../../hooks/useEnclosureHealthData.js";
import styles from "./EnclosureHealthWidget.module.css";

interface EnvRowProps {
	label: string;
	reading: EnclosureReading;
	unit: string;
}

function EnvRow({ label, reading, unit }: EnvRowProps) {
	const value = reading.valueC ?? reading.valuePct;
	return (
		<div className={styles.envRow}>
			<span className={styles.envLabel}>{label}</span>
			<span className={styles.envValue}>
				{value !== undefined ? `${value.toFixed(1)}${unit}` : "—"}
			</span>
			{reading.status === "alarm" && (
				<ObcBadge type="alarm" showNumber={false} showIcon={true} />
			)}
			{reading.status === "warning" && (
				<ObcBadge type="warning" showNumber={false} showIcon={true} />
			)}
		</div>
	);
}

export function EnclosureHealthWidget() {
	const { temperature, humidity, emergencyStopActive, actuatorRetracted } =
		useEnclosureHealthData();

	return (
		<div className={styles.content}>
			<div className={styles.locationSection}>
				<span className={styles.locationLabel}>Bow</span>
				<EnvRow label="Temp" reading={temperature.bow} unit="°C" />
				<EnvRow label="Humidity" reading={humidity.bow} unit="%" />
			</div>
			<div className={styles.locationSection}>
				<span className={styles.locationLabel}>Stern</span>
				<EnvRow label="Temp" reading={temperature.stern} unit="°C" />
				<EnvRow label="Humidity" reading={humidity.stern} unit="%" />
			</div>
			<div className={styles.statusList}>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							emergencyStopActive
								? StatusIndicatorStatus.alarm
								: StatusIndicatorStatus.running
						}
					/>
					<span className={styles.statusLabel}>
						{emergencyStopActive ? "E-Stop active" : "E-Stop clear"}
					</span>
				</div>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							actuatorRetracted === null
								? StatusIndicatorStatus.inactive
								: actuatorRetracted
									? StatusIndicatorStatus.inactive
									: StatusIndicatorStatus.running
						}
					/>
					<span className={styles.statusLabel}>
						{actuatorRetracted === null
							? "Actuator unknown"
							: actuatorRetracted
								? "Actuator retracted"
								: "Actuator deployed"}
					</span>
				</div>
			</div>
		</div>
	);
}
