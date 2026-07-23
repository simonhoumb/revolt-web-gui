import { useState, useCallback, useEffect, useRef } from "react";
import { ObcTopBar } from "@oicl/openbridge-webcomponents-react/components/top-bar/top-bar.js";
import { ObcAlertButton } from "@oicl/openbridge-webcomponents-react/components/alert-button/alert-button.js";
import { ObcIconButton } from "@oicl/openbridge-webcomponents-react/components/icon-button/icon-button.js";
import { ObcClock } from "@oicl/openbridge-webcomponents-react/components/clock/clock.js";
import { ObcSystemButton } from "@oicl/openbridge-webcomponents-react/components/system-button/system-button.js";
import type { SystemState } from "@oicl/openbridge-webcomponents-react/components/system-button/system-button.js";
import type { ObcSystemButton as ObcSystemButtonElement } from "@oicl/openbridge-webcomponents/dist/components/system-button/system-button.js";
import { ObcSystemMenu } from "@oicl/openbridge-webcomponents-react/components/system-menu/system-menu.js";
import type {
	WifiState,
	BatteryState,
} from "@oicl/openbridge-webcomponents/dist/components/system-menu/system-menu.js";
import { ObcAlertButtonType } from "@oicl/openbridge-webcomponents/dist/components/alert-button/alert-button.js";
import { IconButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/icon-button/icon-button.js";
import { SystemButtonVariant } from "@oicl/openbridge-webcomponents/dist/components/system-button/system-button.js";
import { AlertType } from "@oicl/openbridge-webcomponents/dist/types.js";
import { ObiWidgets } from "@oicl/openbridge-webcomponents-react/icons/icon-widgets.js";
import { useVesselHealth, type AlertLevel } from "../../hooks/useVesselHealth.js";
import { useBatteryData } from "../../hooks/useBatteryData.js";
import { useLayout } from "../../context/useLayout.js";
import { useApps } from "../../context/useApps.js";
import { useMinuteUpdate } from "../../hooks/useMinuteUpdate.js";
import { AlertMenu } from "./AlertMenu.js";
import { WidgetPicker } from "./WidgetPicker.js";
import { NavigationMenu } from "./NavigationMenu.js";
import styles from "./TopNav.module.css";

function toObcAlertType(level: AlertLevel | null): AlertType | undefined {
	if (level === "alarm") return AlertType.Alarm;
	if (level === "warning") return AlertType.Warning;
	if (level === "caution") return AlertType.Caution;
	return undefined;
}

export function TopNav() {
	const [dusk, setDusk] = useState(true);
	const [alertMenuOpen, setAlertMenuOpen] = useState(false);
	const [pickerOpen, setPickerOpen] = useState(false);
	const [navMenuOpen, setNavMenuOpen] = useState(false);
	const [systemMenuOpen, setSystemMenuOpen] = useState(false);
	const wrapperRef = useRef<HTMLDivElement>(null);
	const systemButtonRef = useRef<ObcSystemButtonElement>(null);

	const toggleTheme = useCallback(() => {
		const next = !dusk;
		document.documentElement.setAttribute("data-obc-theme", next ? "dusk" : "day");
		setDusk(next);
	}, [dusk]);

	const {
		alertCount,
		highestAlertLevel,
		emergencyStopActive,
		alerts,
		wsConnected,
		bridgeConnected,
		latencyMs,
	} = useVesselHealth();
	const { voltagePercent, voltageStatus } = useBatteryData();
	const { editMode } = useLayout();
	const { activeAppId, appDef } = useApps();
	const time = useMinuteUpdate();

	// The system button manages its own internal open/closed state (there's no prop to control
	// it), so closing it from anywhere other than its own click, e.g. the mutual-exclusion cases
	// below or an outside click, needs the imperative closeMenu() method too, otherwise our
	// systemMenuOpen and the button's internal state fall out of sync and the next click just
	// re-closes what we already consider closed instead of opening it.
	const closeSystemMenu = useCallback(() => {
		setSystemMenuOpen(false);
		systemButtonRef.current?.closeMenu();
	}, []);

	const handleAlertClick = useCallback(() => {
		setAlertMenuOpen((open) => !open);
		setPickerOpen(false);
		setNavMenuOpen(false);
		closeSystemMenu();
	}, [closeSystemMenu]);

	const handlePickerClick = useCallback(() => {
		setPickerOpen((open) => !open);
		setAlertMenuOpen(false);
		setNavMenuOpen(false);
		closeSystemMenu();
	}, [closeSystemMenu]);

	const handleMenuClick = useCallback(() => {
		setNavMenuOpen((open) => !open);
		setAlertMenuOpen(false);
		setPickerOpen(false);
		closeSystemMenu();
	}, [closeSystemMenu]);

	const handleSystemMenuToggle = useCallback((e: CustomEvent<{ open: boolean }>) => {
		setSystemMenuOpen(e.detail.open);
		if (e.detail.open) {
			setAlertMenuOpen(false);
			setPickerOpen(false);
			setNavMenuOpen(false);
		}
	}, []);

	const anyMenuOpen = alertMenuOpen || pickerOpen || navMenuOpen || systemMenuOpen;
	useEffect(() => {
		if (!anyMenuOpen) return;
		function handleClickOutside(e: MouseEvent) {
			if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
				setAlertMenuOpen(false);
				setPickerOpen(false);
				setNavMenuOpen(false);
				closeSystemMenu();
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => {
			document.removeEventListener("mousedown", handleClickOutside);
		};
	}, [anyMenuOpen, closeSystemMenu]);

	// obc-system-button's wifi icon is driven purely by the connected flag (confirmed against its
	// own source: every strength value 0-4 renders the identical icon, only connected:false swaps
	// to the "off" icon), so the icon itself can only be a binary good/bad, not a three-tier
	// WS-down vs bridge-down distinction. Treat it as good only when both the socket and the ROS
	// bridge are up, and push the WS-vs-bridge breakdown the old ConnectionWidget showed into the
	// system menu's status text instead, reached by clicking through.
	const fullyConnected = wsConnected && bridgeConnected;
	// voltagePercent is a raw float; both the system button and system menu render this level as
	// a percentage readout, so round it here rather than showing fractional percent digits.
	const batteryLevel = Math.round(voltagePercent ?? 0);

	const systemState: SystemState = {
		wifi: {
			connected: fullyConnected,
			strength: fullyConnected ? 4 : 0,
		},
		battery: {
			level: batteryLevel,
			charging: false,
			notification: voltageStatus !== "normal",
		},
	};

	// obc-system-menu takes a differently-shaped state than obc-system-button's SystemState
	// (its own WifiState/BatteryState interfaces), so this is a second derivation from the same
	// underlying vessel-health/battery data rather than a reuse of systemState above.
	const wifiStatusText = bridgeConnected
		? "WebSocket and ROS Bridge connected"
		: wsConnected
			? "WebSocket connected, ROS Bridge offline"
			: "WebSocket disconnected";
	const wifiState: WifiState = {
		enabled: true,
		connected: fullyConnected,
		strength: fullyConnected ? 4 : 0,
		// networkName renders directly in the main menu row (always visible); status only renders
		// inside the Wi-Fi sub-menu detail view, which this app never navigates to (that requires
		// wifiState.networks to be populated, and we have no real network list to show). Set both
		// so the connectivity detail is actually visible, not just technically present.
		networkName: wifiStatusText,
		status: wifiStatusText,
	};
	const batteryState: BatteryState = {
		level: batteryLevel,
		charging: false,
		notification: voltageStatus !== "normal",
		hasUsageButton: false,
	};

	return (
		<div ref={wrapperRef}>
			<ObcTopBar
				appTitle="ReVolt GUI"
				pageName={appDef.label}
				showClock
				showDimmingButton
				dimmingButtonActivated={dusk}
				onDimmingButtonClicked={toggleTheme}
				menuButtonActivated={navMenuOpen}
				onMenuButtonClicked={handleMenuClick}
			>
				{activeAppId === "custom" && (
					<ObcIconButton
						slot="command-button"
						variant={IconButtonVariant.flat}
						aria-label="Dashboard widgets"
						activated={pickerOpen || editMode}
						onClick={handlePickerClick}
					>
						<ObiWidgets />
					</ObcIconButton>
				)}
				<ObcClock
					slot="clock"
					date={time}
					timeZoneOffsetHours={-(new Date().getTimezoneOffset() / 60)}
				/>
				<div slot="alerts" className={styles.statusCluster}>
					<span
						className={styles.latencyBadge}
						data-stale={latencyMs === null || undefined}
					>
						{latencyMs !== null ? `${latencyMs.toString()} ms` : "— ms"}
					</span>
					<div className={styles.systemButtonAnchor}>
						<ObcSystemButton
							ref={systemButtonRef}
							variant={SystemButtonVariant.expanded}
							systemState={systemState}
							onMenuToggle={handleSystemMenuToggle}
						/>
						{systemMenuOpen && (
							<ObcSystemMenu
								className={styles.systemMenuPanel}
								wifiState={wifiState}
								batteryState={batteryState}
							/>
						)}
					</div>
					<ObcAlertButton
						nAlerts={alertCount}
						alertType={toObcAlertType(highestAlertLevel)}
						type={ObcAlertButtonType.Normal}
						counter={true}
						blinking={emergencyStopActive}
						onClickAlert={handleAlertClick}
					/>
				</div>
			</ObcTopBar>
			{alertMenuOpen && <AlertMenu alerts={alerts} />}
			{pickerOpen && (
				<WidgetPicker
					onClose={() => {
						setPickerOpen(false);
					}}
				/>
			)}
			{navMenuOpen && (
				<NavigationMenu
					onClose={() => {
						setNavMenuOpen(false);
					}}
				/>
			)}
		</div>
	);
}
