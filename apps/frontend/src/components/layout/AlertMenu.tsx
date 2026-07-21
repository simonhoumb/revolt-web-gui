import { ObcAlertMenu } from "@oicl/openbridge-webcomponents-react/components/alert-menu/alert-menu.js";
import { ObcAlertMenuItem } from "@oicl/openbridge-webcomponents-react/components/alert-menu-item/alert-menu-item.js";
import { ObcAlertMenuItemStatus } from "@oicl/openbridge-webcomponents/dist/components/alert-menu-item/alert-menu-item.js";
import { ObcAlertIcon } from "@oicl/openbridge-webcomponents-react/components/alert-icon/alert-icon.js";
import { AlertType } from "@oicl/openbridge-webcomponents/dist/types.js";
import type { AlertEntry, AlertLevel } from "../../hooks/useVesselHealth.js";
import styles from "./AlertMenu.module.css";

function toItemStatus(level: AlertLevel): ObcAlertMenuItemStatus {
	if (level === "alarm") return ObcAlertMenuItemStatus.NoAckAlarm;
	if (level === "warning") return ObcAlertMenuItemStatus.NoAckWarning;
	return ObcAlertMenuItemStatus.Caution;
}

function toAlertType(level: AlertLevel): AlertType {
	if (level === "alarm") return AlertType.Alarm;
	if (level === "warning") return AlertType.Warning;
	return AlertType.Caution;
}

interface AlertMenuProps {
	alerts: AlertEntry[];
}

export function AlertMenu({ alerts }: AlertMenuProps) {
	return (
		<ObcAlertMenu className={styles.panel} hasShelved={false} canAckAll={false}>
			{alerts.map((alert) => (
				<ObcAlertMenuItem
					key={alert.id}
					status={toItemStatus(alert.level)}
					title={alert.title}
					description={alert.description}
				>
					<ObcAlertIcon
						slot="alert-icon"
						type={toAlertType(alert.level)}
						active={true}
						acknowledged={false}
					/>
				</ObcAlertMenuItem>
			))}
		</ObcAlertMenu>
	);
}
