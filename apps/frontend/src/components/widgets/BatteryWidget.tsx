import { ObcBatteryIcon } from "@oicl/openbridge-webcomponents-react/components/battery-icon/battery-icon.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useBatteryData } from "../../hooks/useBatteryData.js";
import styles from "./BatteryWidget.module.css";

const LOCATION_LABELS: Record<string, string> = {
	stern_port: "Port",
	stern_star: "Starboard",
	bow: "Bow",
};

export function BatteryWidget() {
	const { voltageV, voltagePercent, voltageStatus, current } = useBatteryData();

	return (
		<div className={styles.content}>
			<div className={styles.batteryRow}>
				<div className={styles.iconWrapper}>
					<ObcBatteryIcon
						className={styles.batteryIcon}
						level={voltagePercent ?? 0}
						charging={false}
						horizontal={false}
						notification={voltageStatus !== "normal"}
					/>
				</div>
				<div className={styles.voltageBlock}>
					<span className={styles.voltage}>
						{voltageV !== null ? `${voltageV.toFixed(2)} V` : "— V"}
					</span>
					{(voltageStatus === "alarm" || voltageStatus === "overvolt") && (
						<ObcBadge type="alarm" showNumber={false} showIcon={true} />
					)}
					{voltageStatus === "warning" && (
						<ObcBadge type="warning" showNumber={false} showIcon={true} />
					)}
				</div>
			</div>
			<div className={styles.currentList}>
				{(["stern_port", "stern_star", "bow"] as const).map((loc) => {
					const reading = current[loc];
					return (
						<div key={loc} className={styles.currentRow}>
							<ObcStatusIndicator
								status={
									reading.isOn
										? StatusIndicatorStatus.running
										: StatusIndicatorStatus.inactive
								}
							/>
							<span className={styles.currentLabel}>{LOCATION_LABELS[loc]}</span>
							<span className={styles.currentValue}>
								{reading.amperes !== null
									? `${reading.amperes.toFixed(1)} A`
									: "— A"}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
