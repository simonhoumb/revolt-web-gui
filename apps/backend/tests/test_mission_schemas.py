import pytest
from pydantic import ValidationError
from shapely.geometry import Point

from revolt_api.schemas.mission import WaypointCreate, position_to_wkt


def test_position_to_wkt_orders_lon_lat() -> None:
	# shapely.Point takes (x, y) i.e. (lon, lat) — easy to get backwards, which would silently
	# swap every waypoint's coordinates once round-tripped through PostGIS.
	element = position_to_wkt(latitude=59.91, longitude=10.75)
	expected = Point(10.75, 59.91)
	assert element.srid == 4326
	assert str(element) == expected.wkt


def test_waypoint_create_rejects_out_of_range_heading() -> None:
	with pytest.raises(ValidationError):
		WaypointCreate(sequence_number=0, latitude=0, longitude=0, target_speed=1, heading_deg=400)


def test_waypoint_create_rejects_negative_speed() -> None:
	with pytest.raises(ValidationError):
		WaypointCreate(sequence_number=0, latitude=0, longitude=0, target_speed=-1)


def test_waypoint_create_defaults() -> None:
	wp = WaypointCreate(sequence_number=0, latitude=59.0, longitude=10.0, target_speed=5.0)
	assert wp.switch_radius == 5.0
	assert wp.heading_mode == 0
	assert wp.heading_deg is None
