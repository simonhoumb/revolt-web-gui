import styles from "./AppShell.module.css";
import { TopNav } from "./TopNav.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { MapArea } from "./MapArea.js";
import { useBridgeConnection } from "../../hooks/useBridgeConnection.js";

export function AppShell() {
	const { wsConnected, bridgeConnected, latencyMs } = useBridgeConnection();

	return (
		<div className={styles.shell}>
			<TopNav
				wsConnected={wsConnected}
				bridgeConnected={bridgeConnected}
				latencyMs={latencyMs}
			/>
			<div className={styles.content}>
				<DashboardPanel />
				<MapArea />
			</div>
		</div>
	);
}
