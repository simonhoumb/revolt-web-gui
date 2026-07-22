import type { ReactNode } from "react";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcInstrumentField } from "@oicl/openbridge-webcomponents-react/navigation-instruments/instrument-field/instrument-field.js";
import { InstrumentFieldSize } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/instrument-field/instrument-field.js";
import {
	useEnclosureHealthData,
	type EnclosureReading,
} from "../../hooks/useEnclosureHealthData.js";
import styles from "./EnclosureHealthWidget.module.css";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import { ObiTemperatureAir } from "@oicl/openbridge-webcomponents-react/icons/icon-temperature-air.js";
import { ObiSensorWaterDropGoogle } from "@oicl/openbridge-webcomponents-react/icons/icon-sensor-water-drop-google.js";

interface EnvRowProps {
	label: string;
	reading: EnclosureReading;
	unit: string;
}

// Detailed view: label + value only, no icon -- the label text already identifies the reading,
// so the icon (kept for instrument view instead, see EnvField below) would just be redundant here.
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

// Instrument view's counterpart to EnvRow: no dedicated OBC gauge exists for temperature/humidity
// (it's a maritime navigation-instrument library, not an HVAC one), so obc-instrument-field's
// compact value/unit readout stands in as this widget's "instrument" style, the same role it plays
// as the secondary readout beside a real gauge in GnssWidget/ImuWidget/ThrusterWidget. The icon
// identifies the reading here instead of a text label (tag left at its default empty string) --
// instrument view favors compact glanceable values over the detailed view's spelled-out labels.
function EnvField({
	icon,
	reading,
	unit,
}: {
	icon: ReactNode;
	reading: EnclosureReading;
	unit: string;
}) {
	const value = reading.valueC ?? reading.valuePct;
	return (
		<div className={styles.envField}>
			<span className={styles.envIcon}>{icon}</span>
			<ObcInstrumentField
				unit={unit}
				fractionDigits={1}
				value={value}
				size={InstrumentFieldSize.regular}
			/>
			{reading.status === "alarm" && (
				<ObcBadge type="alarm" showNumber={false} showIcon={true} />
			)}
			{reading.status === "warning" && (
				<ObcBadge type="warning" showNumber={false} showIcon={true} />
			)}
		</div>
	);
}

export function EnclosureHealthWidget({ viewMode = "instrument" }: { viewMode?: WidgetViewMode }) {
	const { temperature, humidity, emergencyStopActive } = useEnclosureHealthData();

	return (
		<div className={styles.content}>
			{viewMode === "instrument" ? (
				<div className={styles.locationsRow}>
					<div className={styles.locationSection}>
						<span className={styles.locationLabel}>Bow</span>
						<EnvField
							icon={<ObiTemperatureAir />}
							reading={temperature.bow}
							unit="°C"
						/>
						<EnvField
							icon={<ObiSensorWaterDropGoogle />}
							reading={humidity.bow}
							unit="%"
						/>
					</div>
					<div className={styles.locationSection}>
						<span className={styles.locationLabel}>Stern</span>
						<EnvField
							icon={<ObiTemperatureAir />}
							reading={temperature.stern}
							unit="°C"
						/>
						<EnvField
							icon={<ObiSensorWaterDropGoogle />}
							reading={humidity.stern}
							unit="%"
						/>
					</div>
				</div>
			) : (
				<>
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
				</>
			)}
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
			</div>
		</div>
	);
}
