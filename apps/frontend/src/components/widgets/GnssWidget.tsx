import { useState } from "react";
import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcCompass } from "@oicl/openbridge-webcomponents-react/navigation-instruments/compass/compass.js";
import { ObcSpeedGauge } from "@oicl/openbridge-webcomponents-react/navigation-instruments/speed-gauge/speed-gauge.js";
import { CompassDirection } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/compass/compass.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { useApps } from "../../context/AppContext.js";
import { formatCoordinate } from "../../lib/format.js";
import { ViewModeToggle, type WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./GnssWidget.module.css";

// Higher precision than mission-planning displays (formatLatLon's default of 5) -- a live GNSS
// fix benefits from finer resolution for monitoring, not an oversight.
const GNSS_COORDINATE_PRECISION = 6;

const METERS_PER_SECOND_TO_KNOTS = 1.94384;
// Placeholder gauge ceiling; ReVolt has no documented top speed in this repo. Confirm against
// real hardware/ops data and update once known.
const SPEED_GAUGE_MAX_KN = 10;

function fixIndicatorStatus(fixStatus: number | null): StatusIndicatorStatus {
	if (fixStatus === null) return StatusIndicatorStatus.inactive;
	if (fixStatus < 0) return StatusIndicatorStatus.alarm;
	if (fixStatus === 0) return StatusIndicatorStatus.running;
	return StatusIndicatorStatus.running; // SBAS or GBAS augmented — better than basic fix
}

export function GnssWidget() {
	const { latitude, longitude, altitudeM, fixStatus, fixLabel, speedMs, headingDeg, courseDeg } =
		useGnssData();
	const { activeAppId } = useApps();
	const [viewMode, setViewMode] = useState<WidgetViewMode>(
		activeAppId === "conning" ? "instrument" : "detailed",
	);

	return (
		<div className={styles.content}>
			<div className={styles.toolbar}>
				<ViewModeToggle value={viewMode} onChange={setViewMode} />
			</div>
			<div className={styles.fixRow}>
				<ObcStatusIndicator status={fixIndicatorStatus(fixStatus)} />
				<span className={styles.fixLabel}>{fixLabel}</span>
			</div>
			{viewMode === "instrument" && (
				<>
					<ObcCompass
						className={styles.instrument}
						heading={headingDeg ?? 0}
						courseOverGround={courseDeg ?? headingDeg ?? 0}
						direction={CompassDirection.NorthUp}
					/>
					<ObcSpeedGauge
						className={styles.instrument}
						speed={speedMs !== null ? speedMs * METERS_PER_SECOND_TO_KNOTS : 0}
						maxSpeed={SPEED_GAUGE_MAX_KN}
						showReadout
					/>
				</>
			)}
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
				{viewMode === "detailed" && (
					<>
						<div className={styles.dataRow}>
							<dt>Speed</dt>
							<dd>{speedMs !== null ? `${speedMs.toFixed(2)} m/s` : "N/A"}</dd>
						</div>
						<div className={styles.dataRow}>
							<dt>Heading</dt>
							<dd>{headingDeg !== null ? `${headingDeg.toFixed(1)}°` : "N/A"}</dd>
						</div>
					</>
				)}
			</dl>
		</div>
	);
}
