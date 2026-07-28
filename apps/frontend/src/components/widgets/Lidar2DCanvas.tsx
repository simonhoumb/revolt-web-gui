import { useEffect, useRef } from "react";
import styles from "./LidarWidget.module.css";

function cssVar(name: string): string {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

// Rotate the scan cloud so the vessel bow points up.
// Measure: place an object straight ahead of the bow, note how many degrees
// clockwise it appears from the top of the widget, then set that value here.
// Shared with Lidar3DScene so both views agree on which way is "forward".
export const MOUNTING_YAW_DEG = -90;

// Height band (metres, sensor-relative z) mapped to the point color ramp below; a starting
// point for a small-vessel-mounted VLP-16, not yet tuned against the real mounting height.
const HEIGHT_COLOR_MIN_M = -2;
const HEIGHT_COLOR_MAX_M = 4;

export interface Lidar2DPoint {
	x: number;
	y: number;
	z?: number; // metres; absent for /scan-derived fallback points, which carry no height info
}

interface Lidar2DCanvasProps {
	points: Lidar2DPoint[];
	canvasSize: number;
	displayRange: number; // metres, current zoom level
}

// Resolves any valid CSS color (hex, rgb, hsl, named, ...) to RGB by round-tripping it through
// the canvas context's own color parser, rather than hand-parsing every CSS color syntax --
// needed since the ramp endpoints come from theme CSS variables, not fixed literals.
function resolveColorRgb(
	ctx: CanvasRenderingContext2D,
	cssColor: string,
): [number, number, number] {
	const prevFillStyle = ctx.fillStyle;
	ctx.fillStyle = cssColor;
	const normalized = ctx.fillStyle;
	ctx.fillStyle = prevFillStyle;

	if (normalized.startsWith("#") && normalized.length >= 7) {
		return [
			parseInt(normalized.slice(1, 3), 16),
			parseInt(normalized.slice(3, 5), 16),
			parseInt(normalized.slice(5, 7), 16),
		];
	}
	const match = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(normalized);
	if (match?.[1] !== undefined && match[2] !== undefined && match[3] !== undefined) {
		return [Number(match[1]), Number(match[2]), Number(match[3])];
	}
	return [255, 255, 255];
}

function lerpColor(a: [number, number, number], b: [number, number, number], t: number): string {
	const r = Math.round(a[0] + (b[0] - a[0]) * t);
	const g = Math.round(a[1] + (b[1] - a[1]) * t);
	const bl = Math.round(a[2] + (b[2] - a[2]) * t);
	return `rgb(${String(r)}, ${String(g)}, ${String(bl)})`;
}

export function Lidar2DCanvas({ points, canvasSize, displayRange }: Lidar2DCanvasProps) {
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const drawRef = useRef<() => void>(() => {
		return;
	});

	useEffect(() => {
		drawRef.current = () => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const ctx = canvas.getContext("2d");
			if (!ctx) return;

			const size = canvasSize;
			const center = size / 2;
			const radius = center - 4; // 4 px margin inside canvas bounds

			// Transparent outside the circle -- tile background shows through.
			ctx.clearRect(0, 0, size, size);

			// Instrument background circle + border ring.
			ctx.beginPath();
			ctx.arc(center, center, radius, 0, 2 * Math.PI);
			ctx.fillStyle = cssVar("--instrument-frame-primary-color");
			ctx.fill();
			ctx.strokeStyle = cssVar("--instrument-frame-tertiary-color");
			ctx.lineWidth = 1.5;
			ctx.stroke();

			if (points.length === 0) {
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

			// Ring distance labels -- placed at right of center, vertically at each ring.
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

			// Height-color ramp endpoints, resolved once per draw rather than per point.
			const lowRgb = resolveColorRgb(ctx, cssVar("--instrument-frame-tertiary-color"));
			const highRgb = resolveColorRgb(ctx, cssVar("--instrument-enhanced-primary-color"));
			const defaultColor = cssVar("--instrument-enhanced-primary-color");

			for (const p of points) {
				const px = center + p.x * scale;
				const py = center - p.y * scale; // canvas Y-axis is inverted
				if (p.z === undefined) {
					// /scan-derived fallback points carry no height info -- same single color the
					// widget always used before multi-ring point-cloud support existed.
					ctx.fillStyle = defaultColor;
				} else {
					const clamped = Math.max(HEIGHT_COLOR_MIN_M, Math.min(HEIGHT_COLOR_MAX_M, p.z));
					const t =
						(clamped - HEIGHT_COLOR_MIN_M) / (HEIGHT_COLOR_MAX_M - HEIGHT_COLOR_MIN_M);
					ctx.fillStyle = lerpColor(lowRgb, highRgb, t);
				}
				ctx.fillRect(px - 1, py - 1, 2, 2);
			}

			// Vessel marker at centre.
			ctx.fillStyle = cssVar("--element-active-color");
			ctx.beginPath();
			ctx.arc(center, center, 4, 0, 2 * Math.PI);
			ctx.fill();

			ctx.restore(); // undo rotation -- back to clip-only space

			ctx.restore(); // undo clip
		};

		drawRef.current();
	}, [points, canvasSize, displayRange]);

	// Redraw when theme changes -- registered once, always calls the latest closure.
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
		<canvas
			ref={canvasRef}
			className={styles.canvas}
			width={canvasSize}
			height={canvasSize}
			aria-label="2D lidar scan view"
		/>
	);
}
