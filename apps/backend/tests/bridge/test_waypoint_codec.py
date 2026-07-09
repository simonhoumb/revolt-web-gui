"""Unit tests for waypoint_codec.py — no network or DB required.

Waypoint.position is populated directly via position_to_wkt() the same way the ORM
would return it post-commit (confirmed to round-trip through geoalchemy2.shape.to_shape
without a real database in test_mission_schemas.py's WKT tests).
"""

from revolt_api.bridge.client import RosBridgeClient
from revolt_api.bridge.waypoint_codec import (
	expected_ack,
	waypoint_list_to_ros_dict,
	waypoint_to_ros_dict,
)
from revolt_api.models.mission import Waypoint
from revolt_api.schemas.mission import position_to_wkt


def _waypoint(**overrides: object) -> Waypoint:
	defaults: dict[str, object] = {
		"sequence_number": 0,
		"position": position_to_wkt(latitude=59.91, longitude=10.75),
		"target_speed": 5.0,  # knots
		"switch_radius": 5.0,
		"heading_mode": 0,
		"heading_rad": None,
	}
	defaults.update(overrides)
	return Waypoint(**defaults)  # type: ignore[arg-type]


def _bridge() -> RosBridgeClient:
	return RosBridgeClient(
		"ws://unused:9090", "simulation", gnss_origin_lat=59.9083, gnss_origin_lon=10.7512
	)


def test_waypoint_to_ros_dict_converts_knots_to_ms() -> None:
	wp = _waypoint(target_speed=10.0)
	ros_dict = waypoint_to_ros_dict(wp, _bridge())
	assert ros_dict["desired_speed"] == 10.0 * 0.514444


def test_waypoint_to_ros_dict_uses_sequence_number_as_id() -> None:
	wp = _waypoint(sequence_number=3)
	ros_dict = waypoint_to_ros_dict(wp, _bridge())
	assert ros_dict["id"] == 3


def test_waypoint_to_ros_dict_defaults_heading_to_zero_when_none() -> None:
	wp = _waypoint(heading_rad=None)
	ros_dict = waypoint_to_ros_dict(wp, _bridge())
	assert ros_dict["heading"] == 0.0


def test_waypoint_to_ros_dict_position_round_trips_through_latlon_to_cartesian() -> None:
	bridge = _bridge()
	wp = _waypoint(position=position_to_wkt(latitude=59.9083, longitude=10.7512))
	ros_dict = waypoint_to_ros_dict(wp, bridge)
	# Waypoint sits exactly at the bridge's own sim origin -> cartesian offset is (0, 0).
	position = ros_dict["pose"]["pose"]["position"]
	assert position["x"] == 0.0
	assert position["y"] == 0.0


def test_waypoint_list_to_ros_dict_preserves_order() -> None:
	bridge = _bridge()
	waypoints = [_waypoint(sequence_number=0), _waypoint(sequence_number=1)]
	ros_dict = waypoint_list_to_ros_dict(waypoints, bridge)
	assert [wp["id"] for wp in ros_dict["waypoints"]] == [0, 1]


def test_expected_ack_matches_waypoint_to_ros_dict_cartesian() -> None:
	bridge = _bridge()
	wp = _waypoint(sequence_number=2)
	ros_dict = waypoint_to_ros_dict(wp, bridge)
	[(seq, x, y)] = expected_ack([wp], bridge)
	position = ros_dict["pose"]["pose"]["position"]
	assert seq == 2
	assert x == position["x"]
	assert y == position["y"]
