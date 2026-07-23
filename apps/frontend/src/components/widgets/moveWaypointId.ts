import type { Waypoint } from "@revolt/shared-types";

export function moveWaypointId(
	waypoints: Waypoint[],
	waypointId: string,
	direction: -1 | 1,
): string[] {
	const ids = waypoints.map((w) => w.id);
	const index = ids.indexOf(waypointId);
	const target = index + direction;
	if (index < 0 || target < 0 || target >= ids.length) return ids;
	return ids.map((id, i) => {
		if (i === index) return ids[target] ?? id;
		if (i === target) return ids[index] ?? id;
		return id;
	});
}
