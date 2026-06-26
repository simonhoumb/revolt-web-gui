import styles from "./DashboardPanel.module.css";
import { BatteryWidget } from "../widgets/BatteryWidget.js";
import { GnssWidget } from "../widgets/GnssWidget.js";
import { ThrusterWidget } from "../widgets/ThrusterWidget.js";
import { ConnectionWidget } from "../widgets/ConnectionWidget.js";
import { LidarWidget } from "../widgets/LidarWidget.js";

export function DashboardPanel() {
	return (
		<aside className={styles.panel} aria-label="Dashboard">
			<BatteryWidget />
			<GnssWidget />
			<ThrusterWidget />
			<ConnectionWidget />
			<LidarWidget />
		</aside>
	);
}
