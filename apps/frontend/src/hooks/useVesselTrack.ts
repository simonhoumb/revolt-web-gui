import { useEffect, useRef, useState } from "react";
import { useGnssData } from "./useGnssData.js";

// Past-track sampling per IEC 62288 own-ship symbology: plot points at a fixed
// time interval rather than one per GNSS fix, over an operator-relevant rolling
// duration, so the trail stays legible regardless of the incoming fix rate.
const SAMPLE_INTERVAL_MS = 30_000; // 30 seconds
const TRACK_WINDOW_MS = 30 * 60_000; // 30 minutes

export interface TrackPoint {
	latitude: number;
	longitude: number;
	timestampMs: number;
}

/** Own-ship past-track breadcrumb trail, sampled at a fixed interval over a rolling window. */
export function useVesselTrack(): TrackPoint[] {
	const { latitude, longitude } = useGnssData();
	const pointsRef = useRef<TrackPoint[]>([]);
	const [points, setPoints] = useState<TrackPoint[]>([]);

	useEffect(() => {
		if (latitude === null || longitude === null) return;

		const now = Date.now();
		const last = pointsRef.current[pointsRef.current.length - 1];
		if (last !== undefined && now - last.timestampMs < SAMPLE_INTERVAL_MS) return;

		const cutoff = now - TRACK_WINDOW_MS;
		const next = [...pointsRef.current, { latitude, longitude, timestampMs: now }].filter(
			(p) => p.timestampMs >= cutoff,
		);
		pointsRef.current = next;
		setPoints(next);
	}, [latitude, longitude]);

	return points;
}
