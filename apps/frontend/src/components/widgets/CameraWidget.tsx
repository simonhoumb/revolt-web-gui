import { useState, useEffect, useRef } from "react";
import { useBridgeData } from "../../context/BridgeDataContext.js";
import styles from "./CameraWidget.module.css";

export function CameraWidget() {
	const { wsConnected, bridgeConnected } = useBridgeData();
	const [streamError, setStreamError] = useState(false);
	const [streamKey, setStreamKey] = useState(0);
	const prevBridgeConnected = useRef(bridgeConnected);

	// When the bridge reconnects after being down, the browser holds a dead
	// MJPEG stream and shows a frozen last frame. Changing the key unmounts and
	// remounts the <img>, forcing a fresh HTTP request to the stream endpoint.
	useEffect(() => {
		if (bridgeConnected && !prevBridgeConnected.current) {
			setStreamKey((k) => k + 1);
			setStreamError(false);
		}
		prevBridgeConnected.current = bridgeConnected;
	}, [bridgeConnected]);

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
					key={streamKey}
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
