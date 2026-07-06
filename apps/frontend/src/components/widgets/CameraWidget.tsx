import { useEffect, useRef, useState } from "react";
import { useBridgeData } from "../../context/BridgeDataContext.js";
import styles from "./CameraWidget.module.css";

export function CameraWidget() {
	const { wsConnected, bridgeConnected, cameraStatus } = useBridgeData();
	const cameraConnected = cameraStatus?.connected ?? false;
	const [streamKey, setStreamKey] = useState(0);
	const prevCameraConnected = useRef(cameraConnected);

	// When the camera comes online after being absent, remount the <img> to
	// force a fresh MJPEG request — the browser may hold a stale connection.
	useEffect(() => {
		if (cameraConnected && !prevCameraConnected.current) {
			setStreamKey((k: number) => k + 1);
		}
		prevCameraConnected.current = cameraConnected;
	}, [cameraConnected]);

	const showOverlay = !wsConnected || !bridgeConnected || !cameraConnected;

	return (
		<div className={styles.container}>
			<h2 className={styles.header}>Camera</h2>
			<div className={styles.viewport}>
				<img
					key={streamKey}
					className={styles.feed}
					src="/api/camera/main/stream"
					alt="Live camera feed"
				/>
				{showOverlay ? (
					<div className={styles.overlay}>
						<span className={styles.overlayText}>No signal</span>
					</div>
				) : null}
			</div>
		</div>
	);
}
