import { useEffect, useRef, useState } from "react";
import { useLidarData } from "../../hooks/useLidarData.js";
import styles from "./LidarWidget.module.css";

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Rotate the scan cloud so the vessel bow points up.
// Measure: place an object straight ahead of the bow, note how many degrees
// clockwise it appears from the top of the widget, then set that value here.
const MOUNTING_YAW_DEG = -80;

const ZOOM_STEPS = [5, 10, 20, 50, 100, 130];
const DEFAULT_ZOOM_IDX = 3; // 50 m

export function LidarWidget() {
	const { scan, points } = useLidarData();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const canvasAreaRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<() => void>(() => {
		return;
	});
	const [canvasSize, setCanvasSize] = useState(260);
	const [zoomIdx, setZoomIdx] = useState(DEFAULT_ZOOM_IDX);

	const displayRange = ZOOM_STEPS[zoomIdx] ?? 10;

	const zoomIn = () => {
		setZoomIdx((i) => Math.max(0, i - 1));
	};
	const zoomOut = () => {
		setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
	};

	// Observe only the canvas area (above the controls) so the zoom buttons
	// never eat into the space used for sizing the canvas.
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

	// Mouse-wheel zoom while the cursor is over the instrument, same convention as MapWidget's
	// scrollZoom -- only zooms this widget, not the dashboard page underneath it. Requires a
	// native (non-passive) listener since React's JSX onWheel can't reliably preventDefault.
	useEffect(() => {
		const el = canvasAreaRef.current;
		if (!el) return;
		const onWheel = (e: WheelEvent) => {
			e.preventDefault();
			if (e.deltaY < 0) {
				setZoomIdx((i) => Math.max(0, i - 1));
			} else if (e.deltaY > 0) {
				setZoomIdx((i) => Math.min(ZOOM_STEPS.length - 1, i + 1));
			}
		};
		el.addEventListener("wheel", onWheel, { passive: false });
		return () => {
			el.removeEventListener("wheel", onWheel);
		};
	}, []);

	useEffect(() => {
		drawRef.current = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const size = canvasSize;
			const center = size / 2;
			const radius = center - 4; // 4 px margin inside canvas bounds

			// Transparent outside the circle — tile background shows through.
			ctx.clearRect(0, 0, size, size);

			// Instrument background circle + border ring.
			ctx.beginPath();
			ctx.arc(center, center, radius, 0, 2 * Math.PI);
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
				ctx.fillText("No data", center, center);
				return;
			}

			// Clip everything else to the circle so points never spill outside.
			ctx.save();
			ctx.beginPath();
			ctx.arc(center, center, radius, 0, 2 * Math.PI);
			ctx.clip();

			const scale = radius / displayRange;

			// Three inner range rings at 25 / 50 / 75 % of displayRange.
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 0.5;
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * radius;
				ctx.beginPath();
				ctx.arc(center, center, r, 0, 2 * Math.PI);
				ctx.stroke();
			}

			// Ring distance labels — placed at right of center, vertically at each ring.
			const fmtDist = (v: number) =>
				v >= 10 ? `${String(Math.round(v))} m` : `${String(parseFloat(v.toFixed(1)))} m`;
			ctx.fillStyle = cssVar("--instrument-tick-mark-label-secondary-color");
			ctx.font = "8px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "middle";
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * radius;
				ctx.fillText(fmtDist(displayRange * (i / 4)), center + 4, center - r);
			}

			// Outer range label just inside the top of the circle.
			ctx.font = "9px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(`${String(displayRange)} m`, center + 4, center - radius + 4);

			// Rotate scan cloud so bow faces up. Positive = clockwise correction.
			ctx.save();
			ctx.translate(center, center);
			ctx.rotate(MOUNTING_YAW_DEG * (Math.PI / 180));
			ctx.translate(-center, -center);

			// Scan returns.
			ctx.fillStyle = cssVar("--instrument-enhanced-primary-color");
			for (const { x, y } of points) {
				const px = center + x * scale;
				const py = center - y * scale; // canvas Y-axis is inverted
				ctx.fillRect(px - 1, py - 1, 2, 2);
			}

			// Vessel marker at centre.
			ctx.fillStyle = cssVar("--element-active-color");
			ctx.beginPath();
			ctx.arc(center, center, 4, 0, 2 * Math.PI);
			ctx.fill();

			ctx.restore(); // undo rotation — back to clip-only space

			ctx.restore(); // undo clip
		};

		drawRef.current();
	}, [scan, points, canvasSize, displayRange]);

	// Redraw when theme changes — registered once, always calls the latest closure.
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
					aria-label="2D lidar scan view"
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
				<span className={styles.rangeLabel}>{displayRange} m</span>
				<button
					className={styles.zoomBtn}
					onClick={zoomOut}
					disabled={zoomIdx === ZOOM_STEPS.length - 1}
					aria-label="Zoom out"
				>
					−
				</button>
			</div>
		</div>
	);
}
