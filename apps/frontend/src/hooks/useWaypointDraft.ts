import { useMemo } from "react";
import type { HazardSummary, Waypoint } from "@revolt/shared-types";
import { useMission } from "../context/MissionContext.js";
import { useLegHazards } from "../context/LegHazardsContext.js";
import { computeLegPositions, haversineDistanceM, bearingDeg } from "../lib/geo.js";

export interface Leg {
	fromId: string;
	toId: string;
	distanceM: number;
	bearingDeg: number;
	hazard: HazardSummary | null;
}

export interface WaypointDraft {
	waypoints: Waypoint[];
	legs: Leg[];
}

// Stable identity so useMemo below doesn't invalidate on every render when there's no active
// mission (a fresh [] literal would otherwise be a new reference each time).
const EMPTY_WAYPOINTS: Waypoint[] = [];

export function useWaypointDraft(): WaypointDraft {
	const { activeMission } = useMission();
	const { legValidation } = useLegHazards();
	const waypoints = activeMission?.waypoints ?? EMPTY_WAYPOINTS;

	const legs = useMemo(() => {
		return computeLegPositions(waypoints).map(
			(leg): Leg => ({
				fromId: leg.from.id,
				toId: leg.to.id,
				distanceM: haversineDistanceM(leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon),
				bearingDeg: bearingDeg(leg.from.lat, leg.from.lon, leg.to.lat, leg.to.lon),
				hazard: legValidation[leg.toId] ?? null,
			}),
		);
	}, [waypoints, legValidation]);

	return { waypoints, legs };
}
