import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcCompass } from "@oicl/openbridge-webcomponents-react/navigation-instruments/compass/compass.js";
import { ObcInstrumentField } from "@oicl/openbridge-webcomponents-react/navigation-instruments/instrument-field/instrument-field.js";
import { CompassDirection } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/compass/compass.js";
import { useGnssData } from "../../hooks/useGnssData.js";
import { formatCoordinate } from "../../lib/format.js";
import { METERS_PER_SECOND_TO_KNOTS } from "../../lib/geo.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./GnssWidget.module.css";
import { InstrumentFieldSize } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/instrument-field/instrument-field.js";
import { Priority } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/types.js";
import { VesselImage } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/watch/vessel.js";
import { cx } from "../../lib/classNames.js";
import { StaleBadge } from "./StaleBadge.js";

// Higher precision than mission-planning displays (formatLatLon's default of 5) -- a live GNSS
// fix benefits from finer resolution for monitoring, not an oversight.
const GNSS_COORDINATE_PRECISION = 6;

function fixIndicatorStatus(fixStatus: number | null): StatusIndicatorStatus {
	if (fixStatus === null) return StatusIndicatorStatus.inactive;
	if (fixStatus < 0) return StatusIndicatorStatus.alarm;
	if (fixStatus === 0) return StatusIndicatorStatus.running;
	return StatusIndicatorStatus.running; // SBAS or GBAS augmented — better than basic fix
}

// Degrees + decimal minutes + hemisphere letter (e.g. "62° 27.583'" / "N"), the format the
// OpenBridge demo's own ship-data card uses for position, rather than this widget's own plain
// decimal-degree formatCoordinate() used in detailed view.
function formatDegreesMinutes(
	value: number,
	positiveHemisphere: string,
	negativeHemisphere: string,
): { value: string; hemisphere: string } {
	const hemisphere = value >= 0 ? positiveHemisphere : negativeHemisphere;
	const absValue = Math.abs(value);
	const degrees = Math.floor(absValue);
	const minutes = (absValue - degrees) * 60;
	return { value: `${degrees.toString()}° ${minutes.toFixed(3)}'`, hemisphere };
}

export function GnssWidget({ viewMode = "instrument" }: { viewMode?: WidgetViewMode }) {
	const {
		latitude,
		longitude,
		altitudeM,
		fixStatus,
		fixLabel,
		speedMs,
		headingDeg,
		courseDeg,
		stale,
	} = useGnssData();

	const lat = latitude !== null ? formatDegreesMinutes(latitude, "N", "S") : null;
	const lon = longitude !== null ? formatDegreesMinutes(longitude, "E", "W") : null;

	return (
		<div className={styles.content}>
			{viewMode === "instrument" && (
				<div className={cx(styles.instrumentLayout, stale && styles.stale)}>
					{stale && <StaleBadge corner />}
					<div className={styles.readout}>
						<ObcInstrumentField
							tag="HDG"
							unit="DEG"
							fractionDigits={1}
							value={headingDeg ?? undefined}
							size={InstrumentFieldSize.enhanced}
						/>
						<ObcInstrumentField
							tag="COG"
							unit="DEG"
							fractionDigits={1}
							value={courseDeg ?? undefined}
							size={InstrumentFieldSize.enhanced}
						/>
						<ObcInstrumentField
							tag="SPD"
							unit="KN"
							fractionDigits={1}
							value={
								speedMs !== null ? speedMs * METERS_PER_SECOND_TO_KNOTS : undefined
							}
							size={InstrumentFieldSize.enhanced}
						/>
						<div className={styles.divider} />
						<div className={styles.position}>
							<div className={styles.positionRow}>
								<span className={styles.positionValue}>{lat?.value ?? "—"}</span>
								<span className={styles.positionUnit}>{lat?.hemisphere ?? ""}</span>
							</div>
							<div className={styles.positionRow}>
								<span className={styles.positionValue}>{lon?.value ?? "—"}</span>
								<span className={styles.positionUnit}>{lon?.hemisphere ?? ""}</span>
							</div>
						</div>
					</div>
					<ObcCompass
						className={styles.instrument}
						heading={headingDeg ?? 0}
						courseOverGround={courseDeg ?? headingDeg ?? 0}
						direction={CompassDirection.NorthUp}
						priority={Priority.enhanced}
						showLabels
						vesselImage={VesselImage.psvTop}
					/>
				</div>
			)}
			{viewMode === "detailed" && (
				<dl className={cx(styles.dataList, stale && styles.stale)}>
					<div className={styles.fixRow}>
						<ObcStatusIndicator status={fixIndicatorStatus(fixStatus)} />
						<span className={styles.fixLabel}>{fixLabel}</span>
						{stale && <StaleBadge />}
					</div>
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
				</dl>
			)}
		</div>
	);
}
