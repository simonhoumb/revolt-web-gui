"""Unit tests for geo.py. Mirrors apps/frontend/src/lib/geo.test.ts's cases for the ported
functions, so a regression in either language's geometry is caught independently."""

import pytest

from revolt_api.geo import (
	RouteWaypoint,
	bearing_deg,
	build_route_points,
	compute_turn_arc,
	destination_point,
	haversine_distance_m,
	latlon_to_local_cartesian,
	local_cartesian_to_latlon,
)


def test_haversine_same_point_is_zero() -> None:
	assert haversine_distance_m(59.9, 10.7, 59.9, 10.7) == 0


def test_haversine_roughly_111_2_km_per_degree_latitude() -> None:
	d = haversine_distance_m(59.0, 10.0, 60.0, 10.0)
	assert 110_000 < d < 112_000


def test_bearing_due_north() -> None:
	assert bearing_deg(59.0, 10.0, 60.0, 10.0) == pytest.approx(0, abs=0.5)


def test_bearing_due_east_at_equator() -> None:
	assert bearing_deg(0, 10.0, 0, 11.0) == pytest.approx(90, abs=0.5)


def test_bearing_due_south() -> None:
	assert bearing_deg(60.0, 10.0, 59.0, 10.0) == pytest.approx(180, abs=0.5)


def test_bearing_due_west_at_equator() -> None:
	assert bearing_deg(0, 11.0, 0, 10.0) == pytest.approx(270, abs=0.5)


def test_destination_point_moves_due_north() -> None:
	lat, lon = destination_point(0, 0, 0, 111_320)
	assert lat == pytest.approx(1, abs=0.05)
	assert lon == pytest.approx(0, abs=0.0005)


def test_destination_point_moves_due_east_at_equator() -> None:
	lat, lon = destination_point(0, 0, 90, 111_320)
	assert lat == pytest.approx(0, abs=0.0005)
	assert lon == pytest.approx(1, abs=0.05)


def test_destination_point_round_trips_when_reversed() -> None:
	lat, lon = destination_point(59.4, 10.6, 37, 500)
	back_lat, back_lon = destination_point(lat, lon, 37 + 180, 500)
	assert back_lat == pytest.approx(59.4, abs=1e-5)
	assert back_lon == pytest.approx(10.6, abs=1e-5)


# prev -> turn heads due east; turn -> next heads due north -- a clean 90 degree turn.
_PREV = (0.0, 0.0)
_TURN = (0.0, 0.001)
_NEXT = (0.001, 0.001)


def test_compute_turn_arc_returns_none_for_zero_or_negative_radius() -> None:
	assert compute_turn_arc(_PREV, _TURN, _NEXT, 0) is None
	assert compute_turn_arc(_PREV, _TURN, _NEXT, -5) is None


def test_compute_turn_arc_returns_none_for_negligible_turn() -> None:
	straight_next = (0.0, 0.002)
	assert compute_turn_arc(_PREV, _TURN, straight_next, 20) is None


def test_compute_turn_arc_builds_arc_tangent_to_both_legs() -> None:
	points = compute_turn_arc(_PREV, _TURN, _NEXT, 20)
	assert points is not None
	assert len(points) > 2

	start_lat, start_lon = points[0]
	assert start_lat == pytest.approx(0, abs=1e-4)
	assert start_lon < _TURN[1]
	assert start_lon > _PREV[1]

	end_lat, end_lon = points[-1]
	assert end_lon == pytest.approx(_TURN[1], abs=1e-4)
	assert end_lat < _NEXT[0]
	assert end_lat > _TURN[0]


def test_compute_turn_arc_clamps_tangent_on_short_adjacent_leg() -> None:
	short_next = (0.0001, 0.001)
	points = compute_turn_arc(_PREV, _TURN, short_next, 500)
	assert points is not None
	start_lat, start_lon = points[0]
	assert start_lon > _PREV[1]
	assert start_lon < _TURN[1]


def test_build_route_points_passes_through_with_fewer_than_two_waypoints() -> None:
	assert build_route_points([]) == []
	one = [RouteWaypoint(lat=0, lon=0, switch_radius=5)]
	assert build_route_points(one) == [(0.0, 0.0)]


def test_build_route_points_is_just_endpoints_for_two_waypoints() -> None:
	waypoints = [
		RouteWaypoint(lat=0, lon=0, switch_radius=5),
		RouteWaypoint(lat=0.001, lon=0.001, switch_radius=5),
	]
	assert build_route_points(waypoints) == [(0.0, 0.0), (0.001, 0.001)]


def test_build_route_points_splices_an_arc_at_a_real_turn() -> None:
	waypoints = [
		RouteWaypoint(lat=_PREV[0], lon=_PREV[1], switch_radius=5),
		RouteWaypoint(lat=_TURN[0], lon=_TURN[1], switch_radius=20),
		RouteWaypoint(lat=_NEXT[0], lon=_NEXT[1], switch_radius=5),
	]
	path = build_route_points(waypoints)
	# Endpoints unchanged; the turn waypoint itself is replaced by the arc's sampled points,
	# so the exact (0, 0.001) turn coordinate should not appear verbatim in the path.
	assert path[0] == (_PREV[0], _PREV[1])
	assert path[-1] == (_NEXT[0], _NEXT[1])
	assert (_TURN[0], _TURN[1]) not in path
	assert len(path) > 3


def test_build_route_points_passes_straight_through_zero_radius_waypoint() -> None:
	waypoints = [
		RouteWaypoint(lat=_PREV[0], lon=_PREV[1], switch_radius=5),
		RouteWaypoint(lat=_TURN[0], lon=_TURN[1], switch_radius=0),
		RouteWaypoint(lat=_NEXT[0], lon=_NEXT[1], switch_radius=5),
	]
	path = build_route_points(waypoints)
	assert path == [_PREV, _TURN, _NEXT]


_ORIGIN_LAT = 59.9083
_ORIGIN_LON = 10.7512


def test_latlon_to_local_cartesian_origin_maps_to_zero() -> None:
	x, y = latlon_to_local_cartesian(_ORIGIN_LAT, _ORIGIN_LON, _ORIGIN_LAT, _ORIGIN_LON)
	assert x == 0
	assert y == 0


def test_latlon_to_local_cartesian_is_inverse_of_local_cartesian_to_latlon() -> None:
	lat, lon = 59.91, 10.76
	x, y = latlon_to_local_cartesian(lat, lon, _ORIGIN_LAT, _ORIGIN_LON)
	round_trip_lat, round_trip_lon = local_cartesian_to_latlon(x, y, _ORIGIN_LAT, _ORIGIN_LON)
	assert round_trip_lat == pytest.approx(lat, abs=1e-9)
	assert round_trip_lon == pytest.approx(lon, abs=1e-9)
