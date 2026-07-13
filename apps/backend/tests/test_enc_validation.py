"""Unit tests for enc_validation.py's priority logic, with a mocked AsyncSession so these run
without a real Postgres connection (see test_mission_api.py's integration tests for the real
PostGIS round-trip against actually-ingested Oslo Fjord chart data)."""

from unittest.mock import AsyncMock, MagicMock

from revolt_api.enc_validation import _route_linestring_wkt, evaluate_route_hazards
from revolt_api.geo import RouteWaypoint
from revolt_api.models.mission import Waypoint
from revolt_api.schemas.mission import position_to_wkt


def _waypoint(lat: float, lon: float, switch_radius: float = 5.0) -> Waypoint:
	return Waypoint(
		sequence_number=0,
		position=position_to_wkt(lat, lon),
		target_speed=5.0,
		switch_radius=switch_radius,
		heading_mode=0,
		heading_rad=None,
	)


def _mock_db(values: list[int | bool | None]) -> AsyncMock:
	"""values[i] is the result of the i-th db.execute(...).scalar_one() call, in call order.
	Call order within evaluate_route_hazards: resare, obstrn, uwtroc, lndare counts (int) -- then,
	only if none of those hit, the coverage check (bool | None) followed by the depth count (int)."""
	results = []
	for value in values:
		result = MagicMock()
		result.scalar_one.return_value = value
		results.append(result)
	db = AsyncMock()
	db.execute = AsyncMock(side_effect=results)
	return db


def test_route_linestring_wkt_none_for_fewer_than_two_waypoints() -> None:
	assert _route_linestring_wkt([]) is None
	assert _route_linestring_wkt([_waypoint(59.0, 10.0)]) is None


def test_route_linestring_wkt_uses_lon_lat_order() -> None:
	wkt = _route_linestring_wkt([_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)])
	assert wkt is not None
	assert wkt.startswith("LINESTRING(10.0 59.0")


async def test_evaluate_route_hazards_safe_with_no_hits() -> None:
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	# 4 blocked-layer queries (resare, obstrn, uwtroc, lndare), then the coverage check (covered,
	# i.e. lacks_coverage=False), then the depth query -- all clear.
	db = _mock_db([0, 0, 0, 0, False, 0])
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "safe"
	assert result.hazards == []


async def test_evaluate_route_hazards_warning_on_shallow_depth_only() -> None:
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	db = _mock_db([0, 0, 0, 0, False, 2])  # covered, 2 shallow depare hits
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "warning"
	assert len(result.hazards) == 1
	assert result.hazards[0].layer == "depare"
	assert result.hazards[0].count == 2


async def test_evaluate_route_hazards_no_data_when_route_lacks_coverage() -> None:
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	db = _mock_db([0, 0, 0, 0, True, 0])  # not covered, no depth data either (none to find)
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "no_data"
	assert result.hazards[0].layer == "m_covr"


async def test_evaluate_route_hazards_no_data_outranks_warning_but_keeps_both_hazards() -> None:
	# A route that's both partly uncovered AND has a known shallow-water warning elsewhere --
	# no_data is the worse unknown, but the depth warning is still worth surfacing alongside it.
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	db = _mock_db([0, 0, 0, 0, True, 2])
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "no_data"
	assert {h.layer for h in result.hazards} == {"m_covr", "depare"}


async def test_evaluate_route_hazards_treats_missing_coverage_data_as_no_data() -> None:
	# NOT ST_Covers(NULL, ...) is SQL NULL when enc_m_covr has zero CATCOV=1 rows (e.g. ingestion
	# never run) -- must not silently default to "covered".
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	db = _mock_db([0, 0, 0, 0, None, 0])
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "no_data"


async def test_evaluate_route_hazards_blocked_takes_priority_over_depth_query() -> None:
	waypoints = [_waypoint(59.0, 10.0), _waypoint(59.1, 10.1)]
	# resare hits; obstrn/uwtroc/lndare don't -- all four blocked layers are still checked (so the
	# operator sees every reason a route is blocked, not just the first), but the depth query
	# never runs since a blocked result was already found.
	db = _mock_db([3, 0, 0, 0])
	result = await evaluate_route_hazards(db, waypoints, safety_margin_m=15.0, safety_contour_m=3.0)
	assert result.status == "blocked"
	assert [h.layer for h in result.hazards] == ["resare"]
	assert db.execute.await_count == 4


async def test_evaluate_route_hazards_safe_trivially_for_single_waypoint() -> None:
	db = _mock_db([])
	result = await evaluate_route_hazards(
		db, [_waypoint(59.0, 10.0)], safety_margin_m=15.0, safety_contour_m=3.0
	)
	assert result.status == "safe"
	db.execute.assert_not_awaited()


def test_route_waypoint_matches_build_route_points_signature() -> None:
	# Sanity check that enc_validation.py's use of RouteWaypoint stays in sync with geo.py's
	# actual field names, since that's an easy thing to silently drift on a rename.
	rw = RouteWaypoint(lat=1.0, lon=2.0, switch_radius=5.0)
	assert (rw.lat, rw.lon, rw.switch_radius) == (1.0, 2.0, 5.0)
