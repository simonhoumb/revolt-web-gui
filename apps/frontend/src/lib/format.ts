/** Formats hours as "Xh Ym" (or "Ym" under an hour); "—" for non-finite or non-positive input. */
export function formatDuration(hours: number): string {
	if (!Number.isFinite(hours) || hours <= 0) return "—";
	const totalMinutes = Math.round(hours * 60);
	const h = Math.floor(totalMinutes / 60);
	const m = totalMinutes % 60;
	return h > 0 ? `${String(h)}h ${String(m)}m` : `${String(m)}m`;
}

// precision defaults to 5 decimal places (~1.1m resolution), matching mission-planning displays
// (waypoint lists, current-waypoint readouts). Callers showing a live GNSS fix pass a higher
// precision explicitly; the two contexts have different resolution needs, not an oversight.
export function formatCoordinate(value: number, precision = 5): string {
	return `${value.toFixed(precision)}°`;
}

/** Formats a lat/lon pair as two formatCoordinate() values, comma-separated. */
export function formatLatLon(lat: number, lon: number, precision = 5): string {
	return `${formatCoordinate(lat, precision)}, ${formatCoordinate(lon, precision)}`;
}
