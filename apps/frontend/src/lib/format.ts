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

// Fixed by the AIS standard (ITU-R M.1371), not something this app defines -- codes and their
// meanings never change independently of the protocol itself. 15 ("Undefined") also doubles as
// the fallback for any code outside 0-15, which shouldn't occur from a spec-compliant decoder but
// isn't worth a thrown error over.
const NAV_STATUS_LABELS: Record<number, string> = {
	0: "Under way using engine",
	1: "At anchor",
	2: "Not under command",
	3: "Restricted manoeuverability",
	4: "Constrained by draught",
	5: "Moored",
	6: "Aground",
	7: "Engaged in fishing",
	8: "Under way sailing",
	9: "Reserved",
	10: "Reserved",
	11: "Power-driven vessel towing astern",
	12: "Power-driven vessel pushing ahead",
	13: "Reserved",
	14: "AIS-SART active",
	15: "Undefined",
};

/** Human-readable label for an AIS navigational status code (0-15); "Undefined" for any other value. */
export function formatNavStatus(code: number): string {
	return NAV_STATUS_LABELS[code] ?? "Undefined";
}
