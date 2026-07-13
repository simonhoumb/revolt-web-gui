"""Geodesy and route geometry shared by Phase 2 ENC validation.

Deliberate parity with apps/frontend/src/lib/geo.ts: the server-side hazard check needs to reason
about the same path the map draws (straight legs joined by turn-radius arcs), or the "authoritative"
check could disagree with what the operator sees on screen. Ported formula-for-formula rather than
sharing code across languages -- keep this in sync with geo.ts if either changes.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

EARTH_RADIUS_M = 6_371_000.0

# Turns tighter than this are treated as effectively straight -- mirrors geo.ts's MIN_TURN_DEG.
_MIN_TURN_DEG = 2.0
# Points sampled along each arc -- mirrors geo.ts's ARC_SEGMENTS.
_ARC_SEGMENTS = 16


def haversine_distance_m(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
	d_lat = math.radians(b_lat - a_lat)
	d_lon = math.radians(b_lon - a_lon)
	lat1 = math.radians(a_lat)
	lat2 = math.radians(b_lat)
	h = math.sin(d_lat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(d_lon / 2) ** 2
	return 2 * EARTH_RADIUS_M * math.asin(math.sqrt(h))


def bearing_deg(a_lat: float, a_lon: float, b_lat: float, b_lon: float) -> float:
	lat1 = math.radians(a_lat)
	lat2 = math.radians(b_lat)
	d_lon = math.radians(b_lon - a_lon)
	y = math.sin(d_lon) * math.cos(lat2)
	x = math.cos(lat1) * math.sin(lat2) - math.sin(lat1) * math.cos(lat2) * math.cos(d_lon)
	return (math.degrees(math.atan2(y, x)) + 360) % 360


def _normalize_deg_180(deg: float) -> float:
	return ((deg + 180) % 360 + 360) % 360 - 180


def destination_point(
	lat: float, lon: float, bearing_degrees: float, distance_m: float
) -> tuple[float, float]:
	"""Great-circle destination point given a start position, bearing, and distance."""
	delta = distance_m / EARTH_RADIUS_M
	theta = math.radians(bearing_degrees)
	phi1 = math.radians(lat)
	lambda1 = math.radians(lon)
	phi2 = math.asin(
		math.sin(phi1) * math.cos(delta) + math.cos(phi1) * math.sin(delta) * math.cos(theta)
	)
	lambda2 = lambda1 + math.atan2(
		math.sin(theta) * math.sin(delta) * math.cos(phi1),
		math.cos(delta) - math.sin(phi1) * math.sin(phi2),
	)
	return math.degrees(phi2), _normalize_deg_180(math.degrees(lambda2))


def compute_turn_arc(
	prev: tuple[float, float],
	turn: tuple[float, float],
	next_: tuple[float, float],
	radius_m: float,
) -> list[tuple[float, float]] | None:
	"""The circular-arc fillet a vessel follows through a waypoint, tangent to both the inbound and
	outbound legs. Returns None when the turn is negligible or the radius is non-positive -- the
	straight-line corner is already an accurate picture. Mirrors geo.ts's computeTurnArc exactly."""
	if radius_m <= 0:
		return None

	prev_lat, prev_lon = prev
	turn_lat, turn_lon = turn
	next_lat, next_lon = next_

	bearing_in = bearing_deg(prev_lat, prev_lon, turn_lat, turn_lon)
	bearing_out = bearing_deg(turn_lat, turn_lon, next_lat, next_lon)
	turn_delta = _normalize_deg_180(bearing_out - bearing_in)
	if abs(turn_delta) < _MIN_TURN_DEG:
		return None

	leg_in_m = haversine_distance_m(prev_lat, prev_lon, turn_lat, turn_lon)
	leg_out_m = haversine_distance_m(turn_lat, turn_lon, next_lat, next_lon)
	tangent_m = radius_m * math.tan(math.radians(abs(turn_delta)) / 2)
	max_tangent_m = 0.45 * min(leg_in_m, leg_out_m)
	if tangent_m > max_tangent_m:
		tangent_m = max_tangent_m
	if tangent_m <= 0:
		return None

	tangent_in = destination_point(turn_lat, turn_lon, bearing_in + 180, tangent_m)
	turn_sign = 1 if turn_delta >= 0 else -1
	center_bearing = bearing_in + turn_sign * 90
	center = destination_point(tangent_in[0], tangent_in[1], center_bearing, radius_m)
	bearing_center_to_tangent_in = center_bearing + 180

	points: list[tuple[float, float]] = []
	for i in range(_ARC_SEGMENTS + 1):
		sweep = (turn_delta * i) / _ARC_SEGMENTS
		points.append(
			destination_point(center[0], center[1], bearing_center_to_tangent_in + sweep, radius_m)
		)
	return points


@dataclass(frozen=True)
class RouteWaypoint:
	lat: float
	lon: float
	switch_radius: float


def build_route_points(waypoints: Sequence[RouteWaypoint]) -> list[tuple[float, float]]:
	"""The actual path a vessel follows: straight legs joined by turn-radius arcs at each interior
	waypoint (cutting the corner), not the naive straight-line-through-every-waypoint polyline.
	Used to build the LineString that Phase 2 buffers and checks against charted hazards, so the
	server-side check reasons about the same path the map draws rather than a cruder approximation
	of it."""
	if len(waypoints) < 2:
		return [(w.lat, w.lon) for w in waypoints]

	points: list[tuple[float, float]] = [(waypoints[0].lat, waypoints[0].lon)]
	for i in range(1, len(waypoints) - 1):
		prev, turn, nxt = waypoints[i - 1], waypoints[i], waypoints[i + 1]
		arc = compute_turn_arc(
			(prev.lat, prev.lon), (turn.lat, turn.lon), (nxt.lat, nxt.lon), turn.switch_radius
		)
		if arc is None:
			points.append((turn.lat, turn.lon))
		else:
			points.extend(arc)
	points.append((waypoints[-1].lat, waypoints[-1].lon))
	return points
