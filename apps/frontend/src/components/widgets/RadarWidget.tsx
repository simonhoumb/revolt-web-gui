import { useEffect, useRef, useState } from "react";
import { useRadarData } from "../../hooks/useRadarData.js";
import { METERS_PER_NM } from "../../lib/geo.js";
import styles from "./RadarWidget.module.css";

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Mounting yaw correction, same technique as LidarWidget.tsx's MOUNTING_YAW_DEG: measure by
// placing an object dead ahead of the bow and noting how many degrees clockwise it appears from
// the top of the widget. Left at 0 -- no radar hardware has been available to calibrate this
// against yet.
const MOUNTING_YAW_DEG = 0;

// The vessel's radar is a Furuno DRS4D-NXT (20 m - 48 nm range). Marine radar range rings are
// always read in nautical miles, not metres -- this is the unit's own full selectable range-scale
// ladder for this exact model (the "X" = available column for DRS4D-NXT in Furuno's NavNet API
// spec's range-code table), not an arbitrary doubling sequence, so it goes as fine as 0.0625 nm
// (~116 m). That matters here: testing happens close to docks, where an 8 nm default (a reasonable
// offshore-transit range) would be useless -- close-quarters maneuvering needs the tight end of
// the ladder, not just the wide end.
const ZOOM_STEPS_NM = [0.0625, 0.125, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4, 6, 8, 12, 16, 24, 36, 48];
const DEFAULT_ZOOM_IDX = 5; // 1 nm -- tight enough for dock-adjacent operation by default

export function RadarWidget() {
	const { spokes } = useRadarData();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const canvasAreaRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<() => void>(() => {
		return;
	});
	const rafRef = useRef<number | null>(null);
	const [canvasSize, setCanvasSize] = useState(260);
	const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);

	const displayRangeNm = ZOOM_STEPS_NM[zoomIdx] ?? ZOOM_STEPS_NM[DEFAULT_ZOOM_IDX] ?? 8;
	const displayRangeM = displayRangeNm * METERS_PER_NM;

	const zoomIn = () => {
		setZoomIdx((i) => Math.max(0, i - 1));
	};
	const zoomOut = () => {
		setZoomIdx((i) => Math.min(ZOOM_STEPS_NM.length - 1, i + 1));
	};

	useEffect(() => {
		const el = canvasAreaRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const side = Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height));
			if (side > 0) setCanvasSize(side);
		});
		observer.observe(el);
		return () => {
			observer.disconnect();
		};
	}, []);

	// Spoke messages can arrive far faster than Lidar's ~10 Hz full-scan rate, so the draw itself
	// is batched via requestAnimationFrame instead of running synchronously on every message --
	// if several spokes land within one frame, only the last scheduled draw actually paints.
	useEffect(() => {
		drawRef.current = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const size = canvasSize;
			const center = size / 2;
			const radius = center - 4;

			ctx.clearRect(0, 0, size, size);

			ctx.beginPath();
			ctx.arc(center, center, radius, 0, 2 * Math.PI);
			ctx.fillStyle = cssVar("--instrument-frame-primary-color");
			ctx.fill();
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 1.5;
			ctx.stroke();

			if (spokes.length === 0) {
				ctx.fillStyle = cssVar("--element-inactive-color");
				ctx.font = "12px monospace";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText("No data", center, center);
				return;
			}

			ctx.save();
			ctx.beginPath();
			ctx.arc(center, center, radius, 0, 2 * Math.PI);
			ctx.clip();

			const scale = radius / displayRangeM;

			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 0.5;
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * radius;
				ctx.beginPath();
				ctx.arc(center, center, r, 0, 2 * Math.PI);
				ctx.stroke();
			}

			const fmtDistNm = (nm: number) =>
				nm >= 10
					? `${String(Math.round(nm))} NM`
					: `${String(parseFloat(nm.toFixed(2)))} NM`;
			ctx.fillStyle = cssVar("--instrument-tick-mark-label-secondary-color");
			ctx.font = "8px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * radius;
				ctx.fillText(fmtDistNm(displayRangeNm * (i / 4)), center + 4, center - r);
			}

			ctx.font = "9px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(fmtDistNm(displayRangeNm), center + 4, center - radius + 4);

			ctx.save();
			ctx.translate(center, center);
			ctx.rotate(MOUNTING_YAW_DEG * (Math.PI / 180));
			ctx.translate(-center, -center);

			const echoColor = cssVar("--instrument-enhanced-primary-color");
			for (const spoke of spokes) {
				const maxIntensity = spoke.max_intensity > 0 ? spoke.max_intensity : 255;
				for (let i = 0; i < spoke.num_samples; i++) {
					const intensity = spoke.intensity[i] ?? 0;
					if (intensity <= spoke.min_intensity) continue;
					const range = spoke.range_start + i * spoke.range_increment;
					if (range <= 0 || range > displayRangeM) continue;
					const x = range * Math.cos(spoke.azimuth);
					const y = range * Math.sin(spoke.azimuth);
					const px = center + x * scale;
					const py = center - y * scale;
					const alpha = Math.min(1, intensity / maxIntensity);
					ctx.globalAlpha = alpha;
					ctx.fillStyle = echoColor;
					ctx.fillRect(px - 1, py - 1, 2, 2);
				}
			}
			ctx.globalAlpha = 1;

			ctx.fillStyle = cssVar("--element-active-color");
			ctx.beginPath();
			ctx.arc(center, center, 4, 0, 2 * Math.PI);
			ctx.fill();

			ctx.restore();
			ctx.restore();
		};

		if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		rafRef.current = requestAnimationFrame(() => {
			drawRef.current();
			rafRef.current = null;
		});

		return () => {
			if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
		};
	}, [spokes, canvasSize, displayRangeM, displayRangeNm]);

	useEffect(() => {
		const observer = new MutationObserver(() => {
			drawRef.current();
		});
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-obc-theme"],
		});
		return () => {
			observer.disconnect();
		};
	}, []);

	return (
		<div className={styles.container}>
			<div ref={canvasAreaRef} className={styles.canvasArea}>
				<canvas
					ref={canvasRef}
					className={styles.canvas}
					width={canvasSize}
					height={canvasSize}
					aria-label="Radar PPI view"
				/>
			</div>
			<div className={styles.controls}>
				<button
					className={styles.zoomBtn}
					onClick={zoomIn}
					disabled={zoomIdx === 0}
					aria-label="Zoom in"
				>
					+
				</button>
				<span className={styles.rangeLabel}>{displayRangeNm} NM</span>
				<button
					className={styles.zoomBtn}
					onClick={zoomOut}
					disabled={zoomIdx === ZOOM_STEPS_NM.length - 1}
					aria-label="Zoom out"
				>
					−
				</button>
			</div>
		</div>
	);
}
