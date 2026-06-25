import styles from "./AppShell.module.css";
import { TopNav } from "./TopNav.js";
import { DashboardPanel } from "./DashboardPanel.js";
import { MapArea } from "./MapArea.js";

export function AppShell() {
	return (
		<div className={styles.shell}>
			<TopNav />
			<div className={styles.content}>
				<DashboardPanel />
				<MapArea />
			</div>
		</div>
	);
}
