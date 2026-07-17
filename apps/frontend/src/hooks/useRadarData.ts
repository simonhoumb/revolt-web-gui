import { useEffect, useRef, useState } from "react";
import type { RadarSpokeMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/BridgeDataContext.js";

// The backend (client.py's RADAR_NUM_BINS) already aggregates the Furuno DRS4D-NXT's raw
// 8,192-spokes-per-revolution feed (confirmed via Furuno's NavNet API spec: "A frame of image
// consists of 8,192 lines of sweep") down to this many coarser azimuth bins before forwarding, so
// each incoming message already represents one full bin, not a raw fine spoke. This must match
// RADAR_NUM_BINS in client.py -- keying finer than that would just create empty gaps between
// bins, and keying coarser would silently merge two backend bins into one.
const RADAR_NUM_BINS = 512;
const BIN_WIDTH_RAD = (2 * Math.PI) / RADAR_NUM_BINS;

// If no new spoke arrives within this window, treat the sweep as stale (radar stopped or
// disconnected) and clear the buffer, rather than leaving the last sweep frozen on screen forever.
const STALE_TIMEOUT_MS = 5000;

export interface RadarData {
	spokes: RadarSpokeMsg[];
}

export function useRadarData(): RadarData {
	const { radarSpoke } = useBridgeData();
	const bufferRef = useRef<Map<number, RadarSpokeMsg>>(new Map());
	const lastUpdateRef = useRef<number>(0);
	const rafScheduledRef = useRef(false);
	const [spokes, setSpokes] = useState<RadarSpokeMsg[]>([]);

	useEffect(() => {
		if (!radarSpoke) return;
		const bin = Math.round(radarSpoke.azimuth / BIN_WIDTH_RAD);
		bufferRef.current.set(bin, radarSpoke);
		lastUpdateRef.current = Date.now();

		// Real hardware forwards spokes at roughly (RPM/60) * RADAR_NUM_BINS messages/second --
		// confirmed against a real DRS4D-NXT recording at ~410 msg/s (48 RPM). Calling setSpokes
		// on every message would trigger a React re-render at that same rate, which is enough to
		// starve the main thread before the canvas ever gets a chance to paint. Coalesce into at
		// most one state update per animation frame instead, same decoupling idea as the widget's
		// own rAF-batched draw.
		if (!rafScheduledRef.current) {
			rafScheduledRef.current = true;
			requestAnimationFrame(() => {
				rafScheduledRef.current = false;
				setSpokes(Array.from(bufferRef.current.values()));
			});
		}
	}, [radarSpoke]);

	useEffect(() => {
		const interval = setInterval(() => {
			if (
				lastUpdateRef.current !== 0 &&
				Date.now() - lastUpdateRef.current > STALE_TIMEOUT_MS
			) {
				bufferRef.current.clear();
				lastUpdateRef.current = 0;
				setSpokes([]);
			}
		}, 1000);
		return () => {
			clearInterval(interval);
		};
	}, []);

	return { spokes };
}
