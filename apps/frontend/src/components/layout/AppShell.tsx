import { LayoutProvider } from "../../context/LayoutContext.js";
import { TopNav } from "./TopNav.js";
import { TileGrid } from "./TileGrid.js";
import styles from "./AppShell.module.css";

export function AppShell() {
	return (
		<LayoutProvider>
			<div className={styles.shell}>
				<TopNav />
				<TileGrid />
			</div>
		</LayoutProvider>
	);
}
