import { useBridgeData } from "../context/BridgeDataContext.js";
import { useMinuteUpdate } from "./useMinuteUpdate.js";

// AIS has no "target gone" message, so staleness/expiry are computed at read time from each
// target's own last report age, not by removal on receipt. No protocol precedent for the exact
// windows (real AIS class-A reporting intervals vary 2-180s by speed/class, so a fixed multiple
// of that isn't meaningful here); these are GUI-side placeholders picked to be forgiving enough
// for a receiver that may only hear a handful of nearby vessels.
const STALE_MS = 3 * 60_000; // 3 minutes with no report: shown as "sleeping"
const EXPIRE_MS = 15 * 60_000; // 15 minutes with no report: dropped entirely

export interface AisTarget {
	mmsi: number;
	lat: number;
	lon: number;
	sogKn: number | null;
	headingDeg: number | null;
	stale: boolean;
}

export function useAisTargets(): AisTarget[] {
	const { aisTargets } = useBridgeData();
	// Ticks once a minute purely to force staleness/expiry to re-evaluate against the current
	// time even when no new AIS message has arrived to trigger a re-render otherwise.
	useMinuteUpdate();

	const now = Date.now();
	const targets: AisTarget[] = [];
	for (const msg of Object.values(aisTargets)) {
		const age = now - msg.timestamp_ms;
		if (age > EXPIRE_MS) continue;
		targets.push({
			mmsi: msg.mmsi,
			lat: msg.lat,
			lon: msg.lon,
			sogKn: msg.sog_kn,
			headingDeg: msg.heading_deg,
			stale: age > STALE_MS,
		});
	}
	return targets;
}
