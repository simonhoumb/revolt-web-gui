import { ObcStatusIndicator } from "@oicl/openbridge-webcomponents-react/components/status-indicator/status-indicator.js";
import { StatusIndicatorStatus } from "@oicl/openbridge-webcomponents/dist/components/status-indicator/status-indicator.js";
import { ObcPitchRoll } from "@oicl/openbridge-webcomponents-react/navigation-instruments/pitch-roll/pitch-roll.js";
import { useImuData } from "../../hooks/useImuData.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./ImuWidget.module.css";
import { ObcInstrumentField } from "@oicl/openbridge-webcomponents-react/navigation-instruments/instrument-field/instrument-field.js";
import { InstrumentFieldSize } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/instrument-field/instrument-field.js";
import { Priority } from "@oicl/openbridge-webcomponents/dist/navigation-instruments/types.js";

export function ImuWidget({ viewMode = "instrument" }: { viewMode?: WidgetViewMode }) {
	const { rollDeg, pitchDeg, yawDeg, accelX, accelY, accelZ } = useImuData();
	const hasData = rollDeg !== null;

	return (
		<div className={styles.content}>
			{viewMode === "instrument" && (
				<div className={styles.instrumentLayout}>
					<div className={styles.readout}>
						<ObcInstrumentField
							tag="ACC-X"
							unit="m/s²"
							fractionDigits={1}
							value={accelX ?? undefined}
							size={InstrumentFieldSize.regular}
						/>
						<ObcInstrumentField
							tag="ACC-Y"
							unit="m/s²"
							fractionDigits={1}
							value={accelY ?? undefined}
							size={InstrumentFieldSize.regular}
						/>
						<ObcInstrumentField
							tag="ACC-Z"
							unit="m/s²"
							fractionDigits={1}
							value={accelZ ?? undefined}
							size={InstrumentFieldSize.regular}
						/>
					</div>
					<ObcPitchRoll
						className={styles.instrument}
						priority={Priority.enhanced}
						pitch={pitchDeg ?? 0}
						roll={rollDeg ?? 0}
						maxAvgPitch={2.0}
						minAvgPitch={-2.0}
						maxAvgRoll={2.0}
						minAvgRoll={-2.0}
					/>
					<div className={styles.readout}>
						<ObcInstrumentField
							tag="Pitch"
							unit="DEG"
							fractionDigits={1}
							value={pitchDeg ?? undefined}
							size={InstrumentFieldSize.regular}
						/>
						<ObcInstrumentField
							tag="Roll"
							unit="DEG"
							fractionDigits={1}
							value={rollDeg ?? undefined}
							size={InstrumentFieldSize.regular}
						/>
					</div>
				</div>
			)}
			<dl className={styles.dataList}>
				{viewMode === "detailed" && (
					<>
						<div className={styles.statusRow}>
							<ObcStatusIndicator
								status={
									hasData
										? StatusIndicatorStatus.running
										: StatusIndicatorStatus.inactive
								}
							/>
							<span className={styles.statusLabel}>
								{hasData ? "Live" : "No data"}
							</span>
						</div>
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
					</>
				)}
			</dl>
		</div>
	);
}
