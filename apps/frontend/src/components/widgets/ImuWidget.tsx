import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useImuData } from "../../hooks/useImuData.js";
import styles from "./ImuWidget.module.css";

export function ImuWidget() {
	const { rollDeg, pitchDeg, yawDeg, accelX, accelY, accelZ } = useImuData();
	const hasData = rollDeg !== null;

	return (
		<div className={styles.content}>
			<div className={styles.statusRow}>
				<ObcStatusIndicator
					status={
						hasData ? StatusIndicatorStatus.running : StatusIndicatorStatus.inactive
					}
				/>
				<span className={styles.statusLabel}>{hasData ? "Live" : "No data"}</span>
			</div>
			<dl className={styles.dataList}>
				<div className={styles.dataRow}>
					<dt>Roll</dt>
					<dd>{rollDeg !== null ? `${rollDeg.toFixed(1)}°` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Pitch</dt>
					<dd>{pitchDeg !== null ? `${pitchDeg.toFixed(1)}°` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Yaw</dt>
					<dd>{yawDeg !== null ? `${yawDeg.toFixed(1)}°` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Accel X</dt>
					<dd>{accelX !== null ? `${accelX.toFixed(2)} m/s²` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Accel Y</dt>
					<dd>{accelY !== null ? `${accelY.toFixed(2)} m/s²` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Accel Z</dt>
					<dd>{accelZ !== null ? `${accelZ.toFixed(2)} m/s²` : "—"}</dd>
				</div>
			</dl>
		</div>
	);
}
