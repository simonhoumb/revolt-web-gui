import { useEffect, useRef, useState } from "react";
import { useLidarData } from "../../hooks/useLidarData.js";
import styles from "./LidarWidget.module.css";

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function LidarWidget() {
	const { scan, points } = useLidarData();
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const drawRef = useRef<() => void>(() => { return; });
	const [canvasSize, setCanvasSize] = useState(260);

	// Observe container width and keep canvas square within it
	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			const entry = entries[0];
			if (!entry) return;
			const side = Math.floor(Math.min(entry.contentRect.width, entry.contentRect.height));
			if (side > 0) setCanvasSize(side);
		});
		observer.observe(el);
		return () => { observer.disconnect(); };
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

			const scale = radius / scan.range_max;

			// Three inner range rings at 25 / 50 / 75 % of range_max.
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 0.5;
			for (let i = 1; i <= 3; i++) {
				const r = (i / 4) * radius;
				ctx.beginPath();
				ctx.arc(center, center, r, 0, 2 * Math.PI);
				ctx.stroke();
			}

			// Range label just inside the top of the circle.
			ctx.fillStyle = cssVar("--instrument-tick-mark-label-secondary-color");
			ctx.font = "9px monospace";
			ctx.textAlign = "left";
			ctx.textBaseline = "top";
			ctx.fillText(`${scan.range_max.toFixed(0)} m`, center + 4, center - radius + 4);

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

			ctx.restore();
		};

		drawRef.current();
	}, [scan, points, canvasSize]);

	// Redraw when theme changes — registered once, always calls the latest closure.
	useEffect(() => {
		const observer = new MutationObserver(() => { drawRef.current(); });
		observer.observe(document.documentElement, {
			attributes: true,
			attributeFilter: ["data-obc-theme"],
		});
		return () => { observer.disconnect(); };
	}, []);

	return (
		<div ref={containerRef} className={styles.container}>
			<canvas
				ref={canvasRef}
				className={styles.canvas}
				width={canvasSize}
				height={canvasSize}
				aria-label="2D lidar scan view"
			/>
		</div>
	);
}
