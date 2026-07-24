import type { Waypoint } from "@revolt/shared-types";

const EARTH_RADIUS_M = 6_371_000;
export const METERS_PER_NM = 1852;
export const METERS_PER_SECOND_TO_KNOTS = 1.94384;

function toRad(deg: number): number {
	return (deg * Math.PI) / 180;
}

function toDeg(rad: number): number {
	return (rad * 180) / Math.PI;
}

/** Great-circle distance between two lat/lon points, in meters (haversine formula). */
export function haversineDistanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const dLat = toRad(bLat - aLat);
	const dLon = toRad(bLon - aLon);
	const lat1 = toRad(aLat);
	const lat2 = toRad(bLat);
	const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
	return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}

/** Initial great-circle bearing from point a to point b, in degrees, normalized to [0, 360). */
export function bearingDeg(aLat: number, aLon: number, bLat: number, bLon: number): number {
	const lat1 = toRad(aLat);
	const lat2 = toRad(bLat);
	const dLon = toRad(bLon - aLon);
	const y = Math.sin(dLon) * Math.cos(lat2);
	const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);
	return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function normalizeDeg180(deg: number): number {
	return ((((deg + 180) % 360) + 360) % 360) - 180;
}

/**
 * Great-circle destination point given a start position, bearing, and distance: the standard
 * "direct geodesic" formula (same family as haversineDistanceM/bearingDeg above).
 */
export function destinationPoint(
	lat: number,
	lon: number,
	bearingDegrees: number,
	distanceM: number,
): { lat: number; lon: number } {
	const delta = distanceM / EARTH_RADIUS_M;
	const theta = toRad(bearingDegrees);
	const phi1 = toRad(lat);
	const lambda1 = toRad(lon);
	const phi2 = Math.asin(
		Math.sin(phi1) * Math.cos(delta) + Math.cos(phi1) * Math.sin(delta) * Math.cos(theta),
	);
	const lambda2 =
		lambda1 +
		Math.atan2(
			Math.sin(theta) * Math.sin(delta) * Math.cos(phi1),
			Math.cos(delta) - Math.sin(phi1) * Math.sin(phi2),
		);
	return { lat: toDeg(phi2), lon: normalizeDeg180(toDeg(lambda2)) };
}

/** One end of a route leg. */
export interface LegEndpoint {
	id: string;
	lat: number;
	lon: number;
}

/** One leg of the route, from one waypoint to the next. */
export interface LegPositions {
	toId: string;
	from: LegEndpoint;
	to: LegEndpoint;
}

/** Substitutes one waypoint's live position (e.g. mid-drag) ahead of it being persisted. */
export interface PositionOverride {
	id: string;
	lat: number;
	lon: number;
}

/**
 * Consecutive from/to endpoint pairs for each leg of the route, in sequence order.
 * `override` substitutes one waypoint's live position (e.g. mid-drag, before it's
 * persisted) so callers can recompute geometry/hazards without touching context state.
 */
export function computeLegPositions(
	waypoints: Waypoint[],
	override?: PositionOverride,
): LegPositions[] {
	const endpoint = (w: Waypoint): LegEndpoint =>
		override?.id === w.id
			? { id: w.id, lat: override.lat, lon: override.lon }
			: { id: w.id, lat: w.position.latitude, lon: w.position.longitude };

	const legs: LegPositions[] = [];
	for (let i = 1; i < waypoints.length; i++) {
		const from = waypoints[i - 1];
		const to = waypoints[i];
		if (!from || !to) continue;
		legs.push({ toId: to.id, from: endpoint(from), to: endpoint(to) });
	}
	return legs;
}

// Turns tighter than this are treated as effectively straight: not worth drawing an arc for,
// and the tangent-length formula below blows up as the turn approaches a full reversal anyway.
const MIN_TURN_DEG = 2;
// Points sampled along each arc; enough to look smoothly curved at chart zoom levels without
// generating an excessive number of GeoJSON vertices per waypoint.
const ARC_SEGMENTS = 16;

/** One waypoint's turn-radius fillet, ready to render as a map line. */
export interface TurnArc {
	waypointId: string;
	points: { lat: number; lon: number }[];
}

/**
 * The circular-arc "fillet" a vessel actually follows through a waypoint, tangent to both the
 * inbound and outbound legs: the same construction real ECDIS route planning uses to turn a
 * per-waypoint turn radius into a course-change arc (paired with a wheel-over point marking where
 * the turn begins, not modeled here). Returns null when the turn is negligible or the radius is
 * zero; nothing to draw, the straight-line corner is already an accurate picture.
 */
export function computeTurnArc(
	prev: { lat: number; lon: number },
	turn: { lat: number; lon: number },
	next: { lat: number; lon: number },
	radiusM: number,
): { lat: number; lon: number }[] | null {
	if (radiusM <= 0) return null;

	const bearingIn = bearingDeg(prev.lat, prev.lon, turn.lat, turn.lon);
	const bearingOut = bearingDeg(turn.lat, turn.lon, next.lat, next.lon);
	const turnDelta = normalizeDeg180(bearingOut - bearingIn);
	if (Math.abs(turnDelta) < MIN_TURN_DEG) return null;

	const legInM = haversineDistanceM(prev.lat, prev.lon, turn.lat, turn.lon);
	const legOutM = haversineDistanceM(turn.lat, turn.lon, next.lat, next.lon);
	// Tangent length from the waypoint to where the arc leaves each straight leg: the standard
	// circular-fillet formula (radius * tan(halfAngle)), the same math behind wheel-over point
	// calculations.
	let tangentM = radiusM * Math.tan(toRad(Math.abs(turnDelta)) / 2);
	// Never eat more than 45% of either adjacent leg, so arcs at closely-spaced waypoints don't
	// overshoot past the next/previous waypoint or overlap a neighboring arc.
	const maxTangentM = 0.45 * Math.min(legInM, legOutM);
	if (tangentM > maxTangentM) tangentM = maxTangentM;
	if (tangentM <= 0) return null;

	const tangentIn = destinationPoint(turn.lat, turn.lon, bearingIn + 180, tangentM);
	// Center of the fillet circle sits perpendicular to the inbound leg at tangentIn, on the side
	// the turn curves toward.
	const turnSign = turnDelta >= 0 ? 1 : -1;
	const centerBearing = bearingIn + turnSign * 90;
	const center = destinationPoint(tangentIn.lat, tangentIn.lon, centerBearing, radiusM);
	const bearingCenterToTangentIn = centerBearing + 180;

	const points: { lat: number; lon: number }[] = [];
	for (let i = 0; i <= ARC_SEGMENTS; i++) {
		const sweep = (turnDelta * i) / ARC_SEGMENTS;
		points.push(
			destinationPoint(center.lat, center.lon, bearingCenterToTangentIn + sweep, radiusM),
		);
	}
	return points;
}

/**
 * Turn arcs for every interior waypoint (one with both a previous and next neighbor) that has a
 * non-negligible course change and a positive switch_radius. Endpoints of the route never get an
 * arc: there's no incoming or outgoing leg to blend.
 */
export function computeTurnArcs(waypoints: Waypoint[], override?: PositionOverride): TurnArc[] {
	const position = (w: Waypoint): { lat: number; lon: number } =>
		override?.id === w.id
			? { lat: override.lat, lon: override.lon }
			: { lat: w.position.latitude, lon: w.position.longitude };

	const arcs: TurnArc[] = [];
	for (let i = 1; i < waypoints.length - 1; i++) {
		const prev = waypoints[i - 1];
		const turn = waypoints[i];
		const next = waypoints[i + 1];
		if (!prev || !turn || !next) continue;
		const points = computeTurnArc(
			position(prev),
			position(turn),
			position(next),
			turn.switch_radius,
		);
		if (points) arcs.push({ waypointId: turn.id, points });
	}
	return arcs;
}
