import { useEffect, useRef, useState } from "react";
import type { RadarSpokeMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";

// The backend (client.py's RADAR_NUM_BINS) already aggregates the Furuno DRS4D-NXT's raw
// 8,192-spokes-per-revolution feed down to this many coarser azimuth bins before forwarding, so
// each incoming message already represents one full bin, not a raw fine spoke. This must match
// RADAR_NUM_BINS in client.py: keying finer would create empty gaps between bins, keying coarser
// would silently merge two backend bins into one.
const RADAR_NUM_BINS = 512;
const BIN_WIDTH_RAD = (2 * Math.PI) / RADAR_NUM_BINS;

// If no new spoke arrives within this window, the sweep is stale (radar stopped or disconnected).
// The last sweep stays displayed, per the same "last known value, clearly marked" convention as
// every other sensor here -- callers should show a stale/no-signal indicator, not blank the buffer.
const STALE_TIMEOUT_MS = 5000;

export interface RadarData {
	spokes: RadarSpokeMsg[];
	stale: boolean;
}

/** Accumulates per-bin radar spokes into one sweep buffer; flags it stale if the feed goes quiet. */
export function useRadarData(): RadarData {
	const { radarSpoke } = useBridgeData();
	const bufferRef = useRef<Map<number, RadarSpokeMsg>>(new Map());
	const lastUpdateRef = useRef<number>(0);
	const rafScheduledRef = useRef(false);
	const [spokes, setSpokes] = useState<RadarSpokeMsg[]>([]);
	const [stale, setStale] = useState(true);

	useEffect(() => {
		if (!radarSpoke) return;
		const bin = Math.round(radarSpoke.azimuth / BIN_WIDTH_RAD);
		bufferRef.current.set(bin, radarSpoke);
		lastUpdateRef.current = Date.now();
		setStale(false);

		// Real hardware forwards spokes at roughly (RPM/60) * RADAR_NUM_BINS messages/second
		// (confirmed against a real DRS4D-NXT recording at ~410 msg/s, 48 RPM). Calling setSpokes
		// on every message would trigger a React re-render at that same rate, enough to starve the
		// main thread before the canvas ever paints. Coalesce into at most one state update per
		// animation frame instead, same decoupling idea as the widget's own rAF-batched draw.
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
				setStale(true);
			}
		}, 1000);
		return () => {
			clearInterval(interval);
		};
	}, []);

	return { spokes, stale };
}
