import { useState, useCallback } from "react";
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar.js";

export function TopNav() {
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
		/>
	);
}
