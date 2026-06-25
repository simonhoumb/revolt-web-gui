import { useState, useCallback } from "react";
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar.js";
import { ObcAlertButton } from "@oicl/openbridge-webcomponents-react/components/alert-button/alert-button.js";
import { AlertType } from "@oicl/openbridge-webcomponents/dist/types.js";
import { useVesselHealth, type AlertLevel } from "../../hooks/useVesselHealth.js";

function toObcAlertType(level: AlertLevel | null): AlertType | undefined {
	if (level === "alarm") return AlertType.Alarm;
	if (level === "warning") return AlertType.Warning;
	if (level === "caution") return AlertType.Caution;
	return undefined;
}

export function TopNav() {
	const [dusk, setDusk] = useState(true);

	const toggleTheme = useCallback(() => {
		const next = !dusk;
		document.documentElement.setAttribute("data-obc-theme", next ? "dusk" : "day");
		setDusk(next);
	}, [dusk]);

	const { alertCount, highestAlertLevel, emergencyStopActive } = useVesselHealth();

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
				<ObcAlertButton
					nAlerts={alertCount}
					alertType={toObcAlertType(highestAlertLevel)}
					counter={true}
					blinking={emergencyStopActive}
				/>
			</span>
		</ObcTopBar>
	);
}
