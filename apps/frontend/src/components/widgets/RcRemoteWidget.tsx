import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useRcRemoteData } from "../../hooks/useRcRemoteData.js";
import { cx } from "../../lib/classNames.js";
import { StaleBadge } from "./StaleBadge.js";
import styles from "./RcRemoteWidget.module.css";

interface StickRowProps {
	label: string;
	percent: number | null;
}

function StickRow({ label, percent }: StickRowProps) {
	return (
		<div className={styles.stickRow}>
			<span className={styles.stickLabel}>{label}</span>
			<div className={styles.barTrack}>
				<div
					className={styles.barFill}
					style={{
						left: percent !== null && percent >= 0 ? "50%" : undefined,
						right: percent !== null && percent < 0 ? "50%" : undefined,
						width: percent !== null ? `${(Math.abs(percent) / 2).toFixed(2)}%` : "0%",
					}}
				/>
			</div>
			<span className={styles.stickValue}>
				{percent !== null ? `${percent.toFixed(0)}%` : "—"}
			</span>
		</div>
	);
}

export function RcRemoteWidget() {
	const { throttlePercent, aileronPercent, rudderPercent, gear, stale } = useRcRemoteData();

	return (
		<div className={cx(styles.content, stale && styles.stale)}>
			{stale && <StaleBadge corner />}
			<StickRow label="Throttle" percent={throttlePercent} />
			<StickRow label="Aileron" percent={aileronPercent} />
			<StickRow label="Rudder" percent={rudderPercent} />
			<div className={styles.gearRow}>
				<ObcStatusIndicator
					status={
						gear === "auto"
							? StatusIndicatorStatus.running
							: StatusIndicatorStatus.inactive
					}
				/>
				<span className={styles.gearLabel}>
					{gear === null ? "Gear unknown" : gear === "auto" ? "Auto" : "Manual"}
				</span>
			</div>
		</div>
	);
}
