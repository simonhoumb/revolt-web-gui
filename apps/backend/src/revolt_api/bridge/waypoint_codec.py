from collections.abc import Sequence

from geoalchemy2.shape import to_shape

from revolt_api.bridge.client import RosBridgeClient
from revolt_api.models.mission import Waypoint

_KNOTS_TO_MS = 0.514444


def _waypoint_cartesian(wp: Waypoint, bridge: RosBridgeClient) -> tuple[float, float]:
	point = to_shape(wp.position)
	return bridge.latlon_to_cartesian(point.y, point.x)


def waypoint_to_ros_dict(wp: Waypoint, bridge: RosBridgeClient) -> dict:
	"""Build a custom_msgs/Waypoint JSON dict matching the sim's wire format.

	id is the waypoint's sequence_number, not its UUID — the sequence number is the
	correlation key the /waypoint_list echo uses to confirm a send landed (see
	RosBridgeClient.publish_and_await_ack). target_speed is stored in knots (matching the
	rest of the domain model); the sim's desired_speed field is m/s.
	"""
	x, y = _waypoint_cartesian(wp, bridge)
	return {
		"id": wp.sequence_number,
		"pose": {
			"header": {"frame_id": "map"},
			"pose": {
				"position": {"x": x, "y": y, "z": 0.0},
				"orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
			},
		},
		"switch_radius": wp.switch_radius,
		"desired_speed": wp.target_speed * _KNOTS_TO_MS,
		"heading_mode": wp.heading_mode,
		"heading": wp.heading_rad if wp.heading_rad is not None else 0.0,
	}


def waypoint_list_to_ros_dict(waypoints: Sequence[Waypoint], bridge: RosBridgeClient) -> dict:
	return {"waypoints": [waypoint_to_ros_dict(wp, bridge) for wp in waypoints]}


def expected_ack(
	waypoints: Sequence[Waypoint], bridge: RosBridgeClient
) -> list[tuple[int, float, float]]:
	"""The (sequence_number, x, y) tuples publish_and_await_ack compares the echo against."""
	return [(wp.sequence_number, *_waypoint_cartesian(wp, bridge)) for wp in waypoints]
