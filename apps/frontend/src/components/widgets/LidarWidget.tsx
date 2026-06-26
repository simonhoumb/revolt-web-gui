import { useEffect, useRef } from "react";
import { useLidarData } from "../../hooks/useLidarData.js";
import styles from "./LidarWidget.module.css";

const CANVAS_SIZE = 280;
const CENTER = CANVAS_SIZE / 2;
const RADIUS = CENTER - 4; // instrument circle, 4 px margin inside canvas bounds

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function LidarWidget() {
	const { scan, points } = useLidarData();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawRef = useRef<() => void>(() => {});

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

			const scale = RADIUS / scan.range_max;

			// Three inner range rings at 25 / 50 / 75 % of range_max.
			// The outer border IS the 100 % ring, so no fourth ring needed.
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
			ctx.fillText(`${scan.range_max.toFixed(0)} m`, CENTER + 4, CENTER - RADIUS + 4);

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

			ctx.restore();
		};

		drawRef.current();
	}, [scan, points]);

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
		</section>
	);
}
