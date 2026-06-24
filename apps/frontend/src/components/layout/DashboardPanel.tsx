import styles from "./DashboardPanel.module.css";

export function DashboardPanel() {
	return (
		<aside className={styles.panel} aria-label="Dashboard">
			<div className={styles.placeholder}>
				Vessel status widgets will appear here
			</div>
		</aside>
	);
}
