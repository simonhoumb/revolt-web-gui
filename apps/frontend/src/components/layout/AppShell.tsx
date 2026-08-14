import { AppProvider } from "../../context/AppContext.js";
import { LayoutProvider } from "../../context/LayoutContext.js";
import { MissionProvider } from "../../context/MissionContext.js";
import { LegHazardsProvider } from "../../context/LegHazardsContext.js";
import { ChartSettingsProvider } from "../../context/ChartSettingsContext.js";
import { TopNav } from "./TopNav.js";
import { TileGrid } from "./TileGrid.js";
import styles from "./AppShell.module.css";

export function AppShell() {
	return (
		<AppProvider>
			<LayoutProvider>
				<ChartSettingsProvider>
					<MissionProvider>
						<LegHazardsProvider>
							<div className={styles.shell}>
								<TopNav />
								<TileGrid />
							</div>
						</LegHazardsProvider>
					</MissionProvider>
				</ChartSettingsProvider>
			</LayoutProvider>
		</AppProvider>
	);
}
