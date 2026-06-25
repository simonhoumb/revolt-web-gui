import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import styles from "./GnssWidget.module.css";

function fixIndicatorStatus(fixStatus: number | null): StatusIndicatorStatus {
	if (fixStatus === null) return StatusIndicatorStatus.inactive;
	if (fixStatus < 0) return StatusIndicatorStatus.alarm;
	if (fixStatus === 0) return StatusIndicatorStatus.active;
	return StatusIndicatorStatus.running; // SBAS or GBAS augmented — better than basic fix
}

export function GnssWidget() {
	const { latitude, longitude, altitudeM, fixStatus, fixLabel, speedMs, headingDeg } =
		useGnssData();

	return (
		<section className={styles.widget}>
			<h2 className={styles.header}>GNSS</h2>
			<div className={styles.fixRow}>
				<ObcStatusIndicator status={fixIndicatorStatus(fixStatus)} />
				<span className={styles.fixLabel}>{fixLabel}</span>
			</div>
			<dl className={styles.dataList}>
				<div className={styles.dataRow}>
					<dt>Lat</dt>
					<dd>{latitude !== null ? `${latitude.toFixed(6)}°` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Lon</dt>
					<dd>{longitude !== null ? `${longitude.toFixed(6)}°` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Alt</dt>
					<dd>{altitudeM !== null ? `${altitudeM.toFixed(1)} m` : "—"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Speed</dt>
					<dd>{speedMs !== null ? `${speedMs.toFixed(2)} m/s` : "N/A"}</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Heading</dt>
					<dd>{headingDeg !== null ? `${headingDeg.toFixed(1)}°` : "N/A"}</dd>
				</div>
			</dl>
		</section>
	);
}
