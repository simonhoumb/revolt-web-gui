import { useState } from "react";
import { useBridgeData } from "../../context/BridgeDataContext.js";
import styles from "./CameraWidget.module.css";

export function CameraWidget() {
	const { wsConnected, bridgeConnected } = useBridgeData();
	const [streamError, setStreamError] = useState(false);

	const showOverlay = !wsConnected || !bridgeConnected || streamError;

	return (
		<div className={styles.container}>
			<h2 className={styles.header}>Camera</h2>
			<div className={styles.viewport}>
				{showOverlay ? (
					<div className={styles.overlay}>
						<span className={styles.overlayText}>No signal</span>
					</div>
				) : null}
				<img
					className={styles.feed}
					src="/api/camera/main/stream"
					alt="Live camera feed"
					onError={() => setStreamError(true)}
					onLoad={() => setStreamError(false)}
				/>
			</div>
		</div>
	);
}
