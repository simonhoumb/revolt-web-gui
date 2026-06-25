import { useState, useCallback, useEffect, useRef } from "react";
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar.js";
import { ObcAlertButton } from "@oicl/openbridge-webcomponents-react/components/alert-button/alert-button.js";
import { ObcClock } from "@oicl/openbridge-webcomponents-react/components/clock/clock.js";
import { ObcAlertButtonType } from "@oicl/openbridge-webcomponents/dist/components/alert-button/alert-button.js";
import { AlertType } from "@oicl/openbridge-webcomponents/dist/types.js";
import { useVesselHealth, type AlertLevel } from "../../hooks/useVesselHealth.js";
import { useMinuteUpdate } from "../../hooks/useMinuteUpdate.js";
import { AlertMenu } from "./AlertMenu.js";

function toObcAlertType(level: AlertLevel | null): AlertType | undefined {
	if (level === "alarm") return AlertType.Alarm;
	if (level === "warning") return AlertType.Warning;
	if (level === "caution") return AlertType.Caution;
	return undefined;
}

export function TopNav() {
	const [dusk, setDusk] = useState(true);
	const [menuOpen, setMenuOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);

	const toggleTheme = useCallback(() => {
		const next = !dusk;
		document.documentElement.setAttribute("data-obc-theme", next ? "dusk" : "day");
		setDusk(next);
	}, [dusk]);

	const { alertCount, highestAlertLevel, emergencyStopActive, alerts } = useVesselHealth();
	const time = useMinuteUpdate();

	const handleAlertClick = useCallback(() => {
		setMenuOpen((open) => !open);
	}, []);

	useEffect(() => {
		if (!menuOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				setMenuOpen(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [menuOpen]);

	return (
		<div ref={wrapperRef}>
			<ObcTopBar
				appTitle="ReVolt GUI"
				pageName="Dashboard"
				showClock
				showDimmingButton
				dimmingButtonActivated={dusk}
				onDimmingButtonClicked={toggleTheme}
			>
				<ObcClock slot="clock" date={time} timeZoneOffsetHours={-(new Date().getTimezoneOffset() / 60)} />
				<ObcAlertButton
					slot="alerts"
					nAlerts={alertCount}
					alertType={toObcAlertType(highestAlertLevel)}
					type={ObcAlertButtonType.Normal}
					counter={true}
					blinking={emergencyStopActive}
					onClickAlert={handleAlertClick}
				/>
			</ObcTopBar>
			{menuOpen && <AlertMenu alerts={alerts} />}
		</div>
	);
}
