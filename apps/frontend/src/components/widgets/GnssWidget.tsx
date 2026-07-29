import { useEffect, useRef, useState } from "react";
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

// Matches .instrumentLayout's column-gap in GnssWidget.module.css.
const GNSS_GRID_GAP_PX = 4;

// The readout column (3 instrument fields + divider + position block) needs this much height to
// render without clipping at InstrumentFieldSize.enhanced -- measured directly (not guessed), so
// below it the fields switch down to .regular instead of overflowing past the row the same way
// the compass used to overflow past the tile's width.
const GNSS_READOUT_HEIGHT_ENHANCED_PX = 221;

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

	const rowRef = useRef<HTMLDivElement>(null);
	const readoutRef = useRef<HTMLDivElement>(null);
	const [compassSize, setCompassSize] = useState(200);
	const [fieldSize, setFieldSize] = useState(InstrumentFieldSize.enhanced);

	// The compass previously sized itself purely off the row's height (CSS height: 100% +
	// aspect-ratio: 1), which never accounted for available width -- a tile tall enough but not
	// wide enough let the resulting square overflow past the tile's right edge. Measuring both
	// axes here and taking the smaller one guarantees the compass never exceeds either. The
	// readout's width is subtracted twice (not once) to mirror .instrumentLayout's symmetric
	// 1fr auto 1fr columns: the empty third column reserves the same width as the readout so the
	// compass stays centered, so both must come out of the row's available width.
	useEffect(() => {
		if (viewMode !== "instrument") return;
		const row = rowRef.current;
		const readout = readoutRef.current;
		if (!row || !readout) return;

		let rowSize = { width: row.clientWidth, height: row.clientHeight };
		let readoutWidth = readout.clientWidth;

		const recompute = () => {
			const availableWidth = rowSize.width - 2 * readoutWidth - 2 * GNSS_GRID_GAP_PX;
			const size = Math.max(0, Math.floor(Math.min(rowSize.height, availableWidth)));
			setCompassSize(size);
			setFieldSize(
				rowSize.height < GNSS_READOUT_HEIGHT_ENHANCED_PX
					? InstrumentFieldSize.regular
					: InstrumentFieldSize.enhanced,
			);
		};

		const rowObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry)
				rowSize = { width: entry.contentRect.width, height: entry.contentRect.height };
			recompute();
		});
		const readoutObserver = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (entry) readoutWidth = entry.contentRect.width;
			recompute();
		});
		rowObserver.observe(row);
		readoutObserver.observe(readout);
		recompute();

		return () => {
			rowObserver.disconnect();
			readoutObserver.disconnect();
		};
	}, [viewMode]);

	return (
		<div className={styles.content}>
			{viewMode === "instrument" && (
				<div ref={rowRef} className={cx(styles.instrumentLayout, stale && styles.stale)}>
					{stale && <StaleBadge corner />}
					<div ref={readoutRef} className={styles.readout}>
						<ObcInstrumentField
							tag="HDG"
							unit="DEG"
							fractionDigits={1}
							value={headingDeg ?? undefined}
							size={fieldSize}
						/>
						<ObcInstrumentField
							tag="COG"
							unit="DEG"
							fractionDigits={1}
							value={courseDeg ?? undefined}
							size={fieldSize}
						/>
						<ObcInstrumentField
							tag="SPD"
							unit="KN"
							fractionDigits={1}
							value={
								speedMs !== null ? speedMs * METERS_PER_SECOND_TO_KNOTS : undefined
							}
							size={fieldSize}
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
						style={{ width: compassSize, height: compassSize }}
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
