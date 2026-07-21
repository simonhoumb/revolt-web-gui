import { METERS_PER_NM } from "./geo.js";

export interface DistanceSpeedLeg {
	distanceM: number;
	speedKt: number;
}

export interface RouteEta {
	distanceNm: number;
	hours: number;
}

/**
 * Sums leg distance and accumulates duration across a route -- the same distance/speed/duration
 * idiom used both for a mission's full planning-time ETE (MissionWidget) and the vessel's live
 * remaining-route ETA from its current position (MissionControlWidget). Callers differ only in
 * how they build the leg list, not in this accumulation.
 */
export function accumulateRouteEta(legs: DistanceSpeedLeg[]): RouteEta {
	let distanceM = 0;
	let hours = 0;
	for (const leg of legs) {
		distanceM += leg.distanceM;
		if (leg.speedKt > 0) {
			hours += leg.distanceM / METERS_PER_NM / leg.speedKt;
		}
	}
	return { distanceNm: distanceM / METERS_PER_NM, hours };
}
