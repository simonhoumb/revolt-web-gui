import { useEffect, useRef, useState } from "react";
import { useLidarData } from "../../hooks/useLidarData.js";
import styles from "./LidarWidget.module.css";

const CANVAS_SIZE = 280;
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CENTER - 4; // instrument circle, 4 px margin inside canvas bounds

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Rotate the scan cloud so the vessel bow points up.
// Measure: place an object straight ahead of the bow, note how many degrees
// clockwise it appears from the top of the widget, then set that value here.
const MOUNTING_YAW_DEG = -80;

const ZOOM_STEPS = [2, 5, 10, 20, 50, 100, 130];
const DEFAULT_ZOOM_IDX = 2; // 10 m

export function LidarWidget() {
	const { scan, points } = useLidarData();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawRef = useRef<() => void>(() => {});
	const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);

	const displayRange = ZOOM_STEPS[zoomIdx] ?? 10;

	const zoomIn = () => setZoomIdx((i) => Math.max(0, i - 1));
	const zoomOut = () => setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));

	useEffect(() => {
		drawRef.current = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			// Transparent outside the circle — widget background shows through.
			ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);

			// Instrument background circle + border ring.
			ctx.beginPath();
			ctx.arc(CENTER, CENTER, RADIUS, 0, 2 * Math.PI);
			ctx.fillStyle = cssVar("--instrument-frame-primary-color");
			ctx.fill();
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 1.5;
			ctx.stroke();

			if (!scan) {
				ctx.fillStyle = cssVar("--element-inactive-color");
				ctx.font = "12px monospace";
				ctx.textAlign = "center";
				ctx.textBaseline = "middle";
				ctx.fillText("No data", CENTER, CENTER);
				return;
			}

			// Clip everything else to the circle so points never spill outside.
			ctx.save();
			ctx.beginPath();
			ctx.arc(CENTER, CENTER, RADIUS, 0, 2 * Math.PI);
			ctx.clip();

			const scale = RADIUS / displayRange;

			// Three inner range rings at 25 / 50 / 75 % of displayRange.
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 0.5;
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * RADIUS;
				ctx.beginPath();
				ctx.arc(CENTER, CENTER, r, 0, 2 * Math.PI);
				ctx.stroke();
			}

			// Range label just inside the top of the circle.
			ctx.fillStyle = cssVar("--instrument-tick-mark-label-secondary-color");
			ctx.font = "9px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(`${displayRange} m`, CENTER + 4, CENTER - RADIUS + 4);

			// Rotate scan cloud so bow faces up. Positive = clockwise correction.
			ctx.save();
			ctx.translate(CENTER, CENTER);
			ctx.rotate(MOUNTING_YAW_DEG * (Math.PI / 180));
			ctx.translate(-CENTER, -CENTER);

			// Scan returns — enhanced-primary contrasts with both day and dusk backgrounds.
			ctx.fillStyle = cssVar("--instrument-enhanced-primary-color");
			for (const { x, y } of points) {
				const px = CENTER + x * scale;
				const py = CENTER - y * scale; // canvas Y-axis is inverted
				ctx.fillRect(px - 1, py - 1, 2, 2);
			}

			// Vessel marker at centre.
			ctx.fillStyle = cssVar("--element-active-color");
			ctx.beginPath();
			ctx.arc(CENTER, CENTER, 4, 0, 2 * Math.PI);
			ctx.fill();

			ctx.restore(); // undo rotation
			ctx.restore(); // undo clip
		};

		drawRef.current();
	}, [scan, points, displayRange]);

	// Redraw when brilliance changes — registered once, always calls the latest closure.
	useEffect(() => {
		const observer = new MutationObserver(() => drawRef.current());
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-obc-theme"],
		});
		return () => observer.disconnect();
	}, []);

	return (
		<section className={styles.widget}>
			<h2 className={styles.header}>
				L<span style={{ textTransform: "lowercase" }}>I</span>DAR
			</h2>
			<canvas
				ref={canvasRef}
				className={styles.canvas}
				width={CANVAS_SIZE}
				height={CANVAS_SIZE}
				aria-label="2D lidar scan view"
			/>
			<div className={styles.controls}>
				<button className={styles.zoomBtn} onClick={zoomIn} disabled={zoomIdx === 0} aria-label="Zoom in">+</button>
				<span className={styles.rangeLabel}>{displayRange} m</span>
				<button className={styles.zoomBtn} onClick={zoomOut} disabled={zoomIdx === ZOOM_STEPS.length - 1} aria-label="Zoom out">−</button>
			</div>
		</section>
	);
}
