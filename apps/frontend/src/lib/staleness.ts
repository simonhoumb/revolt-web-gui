import { SENSOR_STALE_MS } from "./thresholds.js";

/** Whether a reading is missing entirely, or its message is older than the staleness threshold. */
export function isStale(
	timestampMs: number | null | undefined,
	now: number,
	thresholdMs: number = SENSOR_STALE_MS,
): boolean {
	return timestampMs == null || now - timestampMs > thresholdMs;
}
