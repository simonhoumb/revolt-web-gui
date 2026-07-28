import { useEffect, useRef, useState } from "react";
import { ObcStepperBox } from "@oicl/openbridge-webcomponents-react/components/stepper-box/stepper-box.js";
import { useLidarData } from "../../hooks/useLidarData.js";
import { usePointCloudData } from "../../hooks/usePointCloudData.js";
import { Lidar2DCanvas } from "./Lidar2DCanvas.js";
import { Lidar3DScene } from "./Lidar3DScene.js";
import type { WidgetViewMode } from "./ViewModeToggle.js";
import styles from "./LidarWidget.module.css";

const ZOOM_STEPS = [5, 10, 20, 50, 100, 130];
const DEFAULT_ZOOM_IDX = 3; // 50 m

interface LidarWidgetProps {
	viewMode?: WidgetViewMode; // "detailed" = 2D top-down, "instrument" = 3D point cloud scene
}

export function LidarWidget({ viewMode }: LidarWidgetProps) {
	const is3D = viewMode === "instrument";

	const { points: scanPoints } = useLidarData();
	const { points: cloudPoints } = usePointCloudData();
	// Prefer the full multi-ring point cloud; fall back to the single-ring /scan points if the
	// point cloud topic hasn't arrived yet, so a problem in the new pipeline doesn't blank the
	// whole 2D view. The 3D scene has no such fallback -- /scan carries no height info, so there's
	// nothing meaningful to render in 3D from it.
	const points2D = cloudPoints.length > 0 ? cloudPoints : scanPoints;

	const canvasAreaRef = useRef<HTMLDivElement>(null);
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
	// Skipped in 3D mode -- the scene's own OrbitControls handles wheel zoom there instead, and
	// this zoom ladder is a 2D-only concept (a fixed top-down display range).
	useEffect(() => {
		if (is3D) return;
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
	}, [is3D]);

	return (
		<div className={styles.container}>
			<div ref={canvasAreaRef} className={styles.canvasArea}>
				{is3D ? (
					<Lidar3DScene points={cloudPoints} />
				) : (
					<Lidar2DCanvas
						points={points2D}
						canvasSize={canvasSize}
						displayRange={displayRange}
					/>
				)}
			</div>
			{!is3D && (
				<div className={styles.controls}>
					<ObcStepperBox aria-label="Lidar range" onUp={zoomIn} onDown={zoomOut}>
						<div>{displayRange}</div>
						<div slot="unit">m</div>
					</ObcStepperBox>
				</div>
			)}
		</div>
	);
}
