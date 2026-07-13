import { LayoutProvider } from "../../context/LayoutContext.js";
import { MissionProvider } from "../../context/MissionContext.js";
import { TopNav } from "./TopNav.js";
import { TileGrid } from "./TileGrid.js";
import styles from "./AppShell.module.css";

export function AppShell() {
	return (
		<LayoutProvider>
			<MissionProvider>
				<div className={styles.shell}>
					<TopNav />
					<TileGrid />
				</div>
			</MissionProvider>
		</LayoutProvider>
	);
}
