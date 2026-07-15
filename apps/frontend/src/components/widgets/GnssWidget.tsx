import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { formatCoordinate } from "../../lib/format.js";
import styles from "./GnssWidget.module.css";

// Higher precision than mission-planning displays (formatLatLon's default of 5) -- a live GNSS
// fix benefits from finer resolution for monitoring, not an oversight.
const GNSS_COORDINATE_PRECISION = 6;

function fixIndicatorStatus(fixStatus: number | null): StatusIndicatorStatus {
	if (fixStatus === null) return StatusIndicatorStatus.inactive;
	if (fixStatus < 0) return StatusIndicatorStatus.alarm;
	if (fixStatus === 0) return StatusIndicatorStatus.running;
	return StatusIndicatorStatus.running; // SBAS or GBAS augmented — better than basic fix
}

export function GnssWidget() {
	const { latitude, longitude, altitudeM, fixStatus, fixLabel, speedMs, headingDeg } =
		useGnssData();

	return (
		<div className={styles.content}>
			<div className={styles.fixRow}>
				<ObcStatusIndicator status={fixIndicatorStatus(fixStatus)} />
				<span className={styles.fixLabel}>{fixLabel}</span>
			</div>
			<dl className={styles.dataList}>
				<div className={styles.dataRow}>
					<dt>Lat</dt>
					<dd>
						{latitude !== null
							? formatCoordinate(latitude, GNSS_COORDINATE_PRECISION)
							: "—"}
					</dd>
				</div>
				<div className={styles.dataRow}>
					<dt>Lon</dt>
					<dd>
						{longitude !== null
							? formatCoordinate(longitude, GNSS_COORDINATE_PRECISION)
							: "—"}
					</dd>
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
		</div>
	);
}
