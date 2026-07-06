import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useVesselHealth } from "../../hooks/useVesselHealth.js";
import styles from "./ConnectionWidget.module.css";

export function ConnectionWidget() {
	const { wsConnected, bridgeConnected, latencyMs, emergencyStopActive } = useVesselHealth();

	return (
		<div className={styles.content}>
			<div className={styles.statusList}>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							wsConnected
								? StatusIndicatorStatus.running
								: StatusIndicatorStatus.alarm
						}
					/>
					<span className={styles.statusLabel}>WebSocket</span>
				</div>
				<div className={styles.statusRow}>
					<ObcStatusIndicator
						status={
							bridgeConnected
								? StatusIndicatorStatus.running
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
					<ObcStatusIndicator
						status={
							emergencyStopActive
								? StatusIndicatorStatus.alarm
								: StatusIndicatorStatus.inactive
						}
					/>
					<span className={styles.statusLabel}>Emergency Stop</span>
				</div>
			</div>
		</div>
	);
}
