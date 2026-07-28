import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useLightBeaconData } from "../../hooks/useLightBeaconData.js";
import { cx } from "../../lib/classNames.js";
import { StaleBadge } from "./StaleBadge.js";
import styles from "./LightBeaconWidget.module.css";

interface LampRowProps {
	label: string;
	on: boolean;
	status: StatusIndicatorStatus;
}

function LampRow({ label, on, status }: LampRowProps) {
	return (
		<div className={styles.statusRow}>
			<ObcStatusIndicator status={on ? status : StatusIndicatorStatus.inactive} />
			<span className={styles.statusLabel}>{label}</span>
		</div>
	);
}

export function LightBeaconWidget() {
	const { red, yellow, green, stale } = useLightBeaconData();

	return (
		<div className={cx(styles.content, stale && styles.stale)}>
			{stale && <StaleBadge corner />}
			<LampRow label="Red" on={red} status={StatusIndicatorStatus.alarm} />
			<LampRow label="Yellow" on={yellow} status={StatusIndicatorStatus.caution} />
			<LampRow label="Green" on={green} status={StatusIndicatorStatus.running} />
		</div>
	);
}
