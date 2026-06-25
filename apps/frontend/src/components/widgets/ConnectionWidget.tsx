import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { ObcAlertIcon } from "@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { AlertType } from "@oicl/openbridge-webcomponents/dist/types.js";
import { useVesselHealth } from "../../hooks/useVesselHealth.js";
import styles from "./ConnectionWidget.module.css";

export function ConnectionWidget() {
	const { wsConnected, bridgeConnected, latencyMs, emergencyStopActive } = useVesselHealth();

	return (
		<section className={styles.widget}>
			<h2 className={styles.header}>Connection</h2>
			<div className={styles.statusList}>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							wsConnected ? StatusIndicatorStatus.active : StatusIndicatorStatus.alarm
						}
					/>
					<span className={styles.statusLabel}>WebSocket</span>
				</div>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							bridgeConnected
								? StatusIndicatorStatus.active
								: wsConnected
									? StatusIndicatorStatus.warning
									: StatusIndicatorStatus.inactive
						}
					/>
					<span className={styles.statusLabel}>ROS Bridge</span>
				</div>
				<div className={styles.latencyRow}>
					<span className={styles.latencyLabel}>Latency</span>
					<span className={styles.latencyValue}>
						{latencyMs !== null ? `${latencyMs.toString()} ms` : "—"}
					</span>
				</div>
				<div className={styles.statusRow}>
					<ObcAlertIcon
						type={AlertType.Alarm}
						active={emergencyStopActive}
						acknowledged={false}
					/>
					<span className={styles.statusLabel}>E-STOP</span>
				</div>
			</div>
		</section>
	);
}
