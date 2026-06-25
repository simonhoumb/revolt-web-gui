import { useState, useCallback } from "react";
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar.js";
import { ObiComputerServer } from "@oicl/openbridge-webcomponents-react/icons/icon-computer-server.js";
import styles from "./TopNav.module.css";

interface ConnectionStatusProps {
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
}

function ConnectionStatus({ wsConnected, bridgeConnected, latencyMs }: ConnectionStatusProps) {
	let colorVar: string;
	let label: string;

	if (!wsConnected) {
		colorVar = "var(--alert-alarm-color)";
		label = "Offline";
	} else if (!bridgeConnected) {
		colorVar = "var(--alert-caution-color)";
		label = "ROS offline";
	} else {
		colorVar = "var(--alert-success-color)";
		label = latencyMs !== null ? `${latencyMs.toFixed(0)} ms` : "Connected";
	}

	return (
		<span className={styles.connectionStatus} style={{ color: colorVar }}>
			<ObiComputerServer />
			<span className={styles.connectionLabel}>{label}</span>
		</span>
	);
}

interface TopNavProps {
	wsConnected: boolean;
	bridgeConnected: boolean;
	latencyMs: number | null;
}

export function TopNav({ wsConnected, bridgeConnected, latencyMs }: TopNavProps) {
	const [dusk, setDusk] = useState(true);

	const toggleTheme = useCallback(() => {
		const next = !dusk;
		document.documentElement.setAttribute("data-obc-theme", next ? "dusk" : "day");
		setDusk(next);
	}, [dusk]);

	return (
		<ObcTopBar
			appTitle="ReVolt GUI"
			pageName="Dashboard"
			showClock={true}
			showDimmingButton={true}
			dimmingButtonActivated={dusk}
			onDimmingButtonClicked={toggleTheme}
		>
			{/* slot="alerts" must be on a real DOM element, not a React component */}
			<span slot="alerts">
				<ConnectionStatus
					wsConnected={wsConnected}
					bridgeConnected={bridgeConnected}
					latencyMs={latencyMs}
				/>
			</span>
		</ObcTopBar>
	);
}
