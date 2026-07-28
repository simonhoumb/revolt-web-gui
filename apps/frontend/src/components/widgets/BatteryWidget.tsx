import { ObcBatteryIcon } from "@oicl/openbridge-webcomponents-react/components/battery-icon/battery-icon.js";
import { ObcBadge } from "@oicl/openbridge-webcomponents-react/components/badge/badge.js";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useBatteryData } from "../../hooks/useBatteryData.js";
import { cx } from "../../lib/classNames.js";
import { StaleBadge } from "./StaleBadge.js";
import styles from "./BatteryWidget.module.css";

const LOCATION_LABELS: Record<string, string> = {
	stern_port: "Port",
	stern_star: "Starboard",
	bow: "Bow",
};

export function BatteryWidget() {
	const { voltageV, voltagePercent, voltageStatus, voltageStale, current } = useBatteryData();

	return (
		<div className={styles.content}>
			<div className={styles.readingList}>
				<div className={styles.readingRow}>
					<ObcBatteryIcon
						className={cx(styles.batteryIcon, voltageStale && styles.stale)}
						level={voltagePercent ?? 0}
						charging={false}
						horizontal={true}
						notification={voltageStatus !== "normal"}
					/>
					<span className={cx(styles.readingLabel, voltageStale && styles.stale)}>
						Voltage
					</span>
					<span className={styles.readingValueCell}>
						{(voltageStatus === "alarm" || voltageStatus === "overvolt") && (
							<ObcBadge type="alarm" showNumber={false} showIcon={true} />
						)}
						{voltageStatus === "warning" && (
							<ObcBadge type="warning" showNumber={false} showIcon={true} />
						)}
						<span className={cx(styles.readingValue, voltageStale && styles.stale)}>
							{voltageV !== null ? `${voltageV.toFixed(2)} V` : "— V"}
						</span>
						{voltageStale && <StaleBadge />}
					</span>
				</div>
				{(["stern_port", "stern_star", "bow"] as const).map((loc) => {
					const reading = current[loc];
					return (
						<div key={loc} className={styles.readingRow}>
							<ObcStatusIndicator
								className={cx(styles.statusIcon, reading.stale && styles.stale)}
								status={
									reading.isOn
										? StatusIndicatorStatus.running
										: StatusIndicatorStatus.inactive
								}
							/>
							<span
								className={cx(styles.readingLabel, reading.stale && styles.stale)}
							>
								{LOCATION_LABELS[loc]}
							</span>
							<span className={styles.readingValueCell}>
								<span
									className={cx(
										styles.readingValue,
										reading.stale && styles.stale,
									)}
								>
									{reading.amperes !== null
										? `${reading.amperes.toFixed(1)} A`
										: "— A"}
								</span>
								{reading.stale && <StaleBadge />}
							</span>
						</div>
					);
				})}
			</div>
		</div>
	);
}
