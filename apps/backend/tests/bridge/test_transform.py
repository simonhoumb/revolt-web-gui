"""Unit tests for RosBridgeClient._transform().

No network required — exercises the topic→contract mapping for every known
physical vessel topic. Each test asserts the correct contract type is returned
and that key fields are populated correctly.
"""

import base64

import pytest

from revolt_api.bridge.client import RosBridgeClient


@pytest.fixture
def client() -> RosBridgeClient:
	return RosBridgeClient("ws://unused:9090", "physical")


@pytest.fixture
def sim_client() -> RosBridgeClient:
	return RosBridgeClient(
		"ws://unused:9090",
		"simulation",
		gnss_origin_lat=59.9083,
		gnss_origin_lon=10.7512,
	)


def test_battery_voltage(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/battery_voltage", {"data": 23.8})
	assert result is not None
	assert result["type"] == "battery"
	assert result["v"] == "1"
	assert result["voltage_v"] == 23.8
	assert isinstance(result["timestamp_ms"], int)


def test_stern_port_current(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/port/current", {"data": 512})
	assert result is not None
	assert result["type"] == "current"
	assert result["location"] == "stern_port"
	assert result["raw_adc"] == 512
	assert result["amperes"] == pytest.approx(512.0)


def test_stern_star_current(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/starboard/current", {"data": 256})
	assert result is not None
	assert result["type"] == "current"
	assert result["location"] == "stern_star"
	assert result["raw_adc"] == 256


def test_bow_current(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/bow/current", {"data": 100})
	assert result is not None
	assert result["type"] == "current"
	assert result["location"] == "bow"


def test_stern_temperature(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/dht22/temperature", {"data": 22.5})
	assert result is not None
	assert result["type"] == "temperature"
	assert result["location"] == "stern"
	assert result["value_c"] == 22.5


def test_stern_humidity(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/dht22/humidity", {"data": 65.0})
	assert result is not None
	assert result["type"] == "humidity"
	assert result["location"] == "stern"
	assert result["value_pct"] == 65.0


def test_bow_temperature(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/bow/dht22/temperature", {"data": 19.0})
	assert result is not None
	assert result["type"] == "temperature"
	assert result["location"] == "bow"


def test_bow_humidity(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/bow/dht22/humidity", {"data": 70.0})
	assert result is not None
	assert result["type"] == "humidity"
	assert result["location"] == "bow"


def test_emergency_stop_inactive(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/emergency_stop_status", {"data": 0})
	assert result is not None
	assert result["type"] == "emergency_stop"
	assert result["active"] is False


def test_emergency_stop_active(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/stern/emergency_stop_status", {"data": 1})
	assert result is not None
	assert result["active"] is True


def test_linear_actuator_retracted(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/bow/linear_actuator_retract_state", {"data": 1})
	assert result is not None
	assert result["type"] == "linear_actuator"
	assert result["retracted"] is True


def test_linear_actuator_extended(client: RosBridgeClient) -> None:
	result = client._transform("/arduino/bow/linear_actuator_retract_state", {"data": 0})
	assert result is not None
	assert result["retracted"] is False


def test_azimuth_feedback_port(client: RosBridgeClient) -> None:
	result = client._transform("/thruster/port/feedback_angle", {"data": 12.5})
	assert result is not None
	assert result["type"] == "azimuth_feedback"
	assert result["location"] == "port"
	assert result["angle_deg"] == 12.5


def test_azimuth_feedback_starboard(client: RosBridgeClient) -> None:
	result = client._transform("/thruster/starboard/feedback_angle", {"data": -8.0})
	assert result is not None
	assert result["type"] == "azimuth_feedback"
	assert result["location"] == "starboard"
	assert result["angle_deg"] == -8.0


def test_rc_remote_manual(client: RosBridgeClient) -> None:
	result = client._transform(
		"/arduino/stern/rc_remote_input",
		{
			"throttle": 1500,
			"aileron": 1200,
			"elevation": 1500,
			"rudder": 1800,
			"gear": 0,
			"aux": 1500,
		},
	)
	assert result is not None
	assert result["type"] == "rc_remote"
	assert result["throttle"] == 1500
	assert result["aileron"] == 1200
	assert result["rudder"] == 1800
	assert result["gear"] == "manual"


def test_rc_remote_auto(client: RosBridgeClient) -> None:
	result = client._transform(
		"/arduino/stern/rc_remote_input",
		{
			"throttle": 1500,
			"aileron": 1500,
			"elevation": 1500,
			"rudder": 1500,
			"gear": 1,
			"aux": 1500,
		},
	)
	assert result is not None
	assert result["gear"] == "auto"


@pytest.mark.parametrize(
	"raw,red,yellow,green",
	[
		(0, False, False, False),
		(1, True, False, False),
		(2, False, True, False),
		(4, False, False, True),
		(5, True, False, True),  # red + green simultaneously (not a real firmware state, but the
		# bitmask itself doesn't forbid it, so the unpacking should still be exact)
		(7, True, True, True),
	],
)
def test_light_beacon_unpacks_bitmask(
	client: RosBridgeClient, raw: int, red: bool, yellow: bool, green: bool
) -> None:
	result = client._transform("/arduino/stern/light_beacon_status", {"data": raw})
	assert result is not None
	assert result["type"] == "light_beacon"
	assert result["red"] is red
	assert result["yellow"] is yellow
	assert result["green"] is green


@pytest.mark.parametrize(
	"raw,expected_mode",
	[
		(0, "manual"),
		(1, "manual_assisted"),
		(2, "autonomous"),
		(3, "miscommunication"),
		(99, "miscommunication"),  # unknown value falls back to miscommunication
	],
)
def test_control_mode(client: RosBridgeClient, raw: int, expected_mode: str) -> None:
	result = client._transform("/control_mode", {"data": raw})
	assert result is not None
	assert result["type"] == "control_mode"
	assert result["mode"] == expected_mode


def _radar_spoke_msg(azimuth: float, intensity: list[int]) -> dict:
	return {
		"azimuth": azimuth,
		"range_start": 0.0,
		"range_increment": 0.5,
		"num_samples": len(intensity),
		"min_intensity": 0,
		"max_intensity": 255,
		"intensity": base64.b64encode(bytes(intensity)).decode(),
	}


def test_radar_spoke_buffers_without_emitting_on_first_call(client: RosBridgeClient) -> None:
	result = client._transform("/radar/spoke", _radar_spoke_msg(0.0, [0, 10, 255, 128]))
	assert result is None


def test_radar_spoke_emits_finalized_bin_on_azimuth_change(client: RosBridgeClient) -> None:
	assert client._transform("/radar/spoke", _radar_spoke_msg(0.0, [1, 2, 3, 4])) is None
	# 1.0 rad is far enough from 0.0 to land in a different one of the 512 aggregation bins.
	result = client._transform("/radar/spoke", _radar_spoke_msg(1.0, [5, 6, 7, 8]))
	assert result is not None
	assert result["type"] == "radar_spoke"
	assert result["azimuth"] == pytest.approx(0.0)
	assert result["intensity"] == [1, 2, 3, 4]


def test_radar_spoke_merges_same_bin_by_max_intensity(client: RosBridgeClient) -> None:
	assert client._transform("/radar/spoke", _radar_spoke_msg(0.0, [1, 20, 3, 4])) is None
	assert client._transform("/radar/spoke", _radar_spoke_msg(0.0, [10, 2, 30, 1])) is None
	result = client._transform("/radar/spoke", _radar_spoke_msg(1.0, [0, 0, 0, 0]))
	assert result is not None
	assert result["intensity"] == [10, 20, 30, 4]


def test_radar_spoke_flushes_after_stale_timeout(client: RosBridgeClient) -> None:
	assert client._transform("/radar/spoke", _radar_spoke_msg(0.0, [1, 2, 3, 4])) is None
	client._radar_accum_started_ms -= 10_000  # simulate the antenna stalling on this bin
	result = client._transform("/radar/spoke", _radar_spoke_msg(0.0, [5, 6, 7, 8]))
	assert result is not None
	assert result["intensity"] == [1, 2, 3, 4]


def test_ais_target_full_report(client: RosBridgeClient) -> None:
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 257123456, "lat": 59.3783, "lon": 10.6030, "sog": 8.2, "heading": 91},
	)
	assert result is not None
	assert result["type"] == "ais_target"
	assert result["mmsi"] == 257123456
	assert result["lat"] == pytest.approx(59.3783)
	assert result["lon"] == pytest.approx(10.6030)
	assert result["sog_kn"] == pytest.approx(8.2)
	assert result["heading_deg"] == 91


def test_ais_target_heading_not_available_sentinel(client: RosBridgeClient) -> None:
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 2571234, "lat": 59.382, "lon": 10.601, "sog": 0.0, "heading": 511},
	)
	assert result is not None
	assert result["heading_deg"] is None


def test_ais_target_sog_protocol_not_available_sentinel(client: RosBridgeClient) -> None:
	# custom_msgs/SimpleAISdata.msg documents 102.3 as the AIS protocol's own sentinel.
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 2571234, "lat": 59.382, "lon": 10.601, "sog": 102.3, "heading": 45},
	)
	assert result is not None
	assert result["sog_kn"] is None


def test_ais_target_sog_decoder_default_sentinel(client: RosBridgeClient) -> None:
	# Hardware/ais/ais/ais_decoder.py falls back to 0.00001 when a message type has no speed
	# field at all (e.g. a base station report), distinct from the protocol's own 102.3 sentinel.
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 2571234, "lat": 59.382, "lon": 10.601, "sog": 0.00001, "heading": 45},
	)
	assert result is not None
	assert result["sog_kn"] is None


def test_ais_target_position_not_available_sentinel(client: RosBridgeClient) -> None:
	# ITU-R M.1371's own "position not available" sentinel (lat=91, lon=181), decoded verbatim
	# by pyais with no filtering -- outside the real geographic range, which is exactly what
	# crashed the frontend's map marker before this was dropped here instead.
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 2571234, "lat": 91.0, "lon": 181.0, "sog": 0.0, "heading": 511},
	)
	assert result is None


def test_ais_target_out_of_range_position_dropped(client: RosBridgeClient) -> None:
	result = client._transform(
		"/ais/decoded_message",
		{"mmsi": 2571234, "lat": 95.0, "lon": 10.601, "sog": 0.0, "heading": 511},
	)
	assert result is None


def test_unknown_topic_returns_none(client: RosBridgeClient) -> None:
	assert client._transform("/some/unknown/topic", {"data": 42}) is None


def test_all_results_have_version(client: RosBridgeClient) -> None:
	topics_and_msgs = [
		("/arduino/stern/battery_voltage", {"data": 24.0}),
		("/arduino/stern/port/current", {"data": 500}),
		("/arduino/stern/starboard/current", {"data": 500}),
		("/arduino/bow/current", {"data": 500}),
		("/arduino/stern/dht22/temperature", {"data": 20.0}),
		("/arduino/stern/dht22/humidity", {"data": 60.0}),
		("/arduino/bow/dht22/temperature", {"data": 20.0}),
		("/arduino/bow/dht22/humidity", {"data": 60.0}),
		("/arduino/stern/emergency_stop_status", {"data": 0}),
		("/arduino/bow/linear_actuator_retract_state", {"data": 1}),
		("/control_mode", {"data": 0}),
		(
			"/ais/decoded_message",
			{"mmsi": 257123456, "lat": 59.3783, "lon": 10.6030, "sog": 8.2, "heading": 91},
		),
		(
			"/imu/data",
			{
				"orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
				"angular_velocity": {"x": 0.0, "y": 0.0, "z": 0.0},
				"linear_acceleration": {"x": 0.0, "y": 0.0, "z": 9.81},
			},
		),
		("/arduino/stern/light_beacon_status", {"data": 4}),
	]
	for topic, msg in topics_and_msgs:
		result = client._transform(topic, msg)
		assert result is not None, f"_transform returned None for {topic}"
		assert result["v"] == "1", f"Missing version for {topic}"
		assert "timestamp_ms" in result, f"Missing timestamp_ms for {topic}"


# Simulation topic tests

_TWIST = {"linear": {"x": 1.1, "y": 2.2, "z": 3.3}, "angular": {"x": 4.4, "y": 5.5, "z": 6.6}}
_POSE_STAMPED = {
	"header": {"seq": 0, "stamp": {"secs": 0, "nsecs": 0}, "frame_id": "map"},
	"pose": {
		"position": {"x": 10.0, "y": 20.0, "z": 0.5},
		"orientation": {"x": 0.0, "y": 0.0, "z": 0.707, "w": 0.707},
	},
}
_POINT_STAMPED = {
	"header": {"seq": 0, "stamp": {"secs": 0, "nsecs": 0}, "frame_id": "map"},
	"point": {"x": 59.0, "y": 10.5, "z": 2.0},
}
_FLOAT32MA_2 = {"data": [1.5, 0.785], "layout": {"dim": [], "data_offset": 0}}
_WAYPOINT_LIST = {
	"waypoints": [
		{
			"id": 1,
			"pose": {
				"header": {"seq": 0, "stamp": {"secs": 0, "nsecs": 0}, "frame_id": "map"},
				"pose": {
					"position": {"x": 59.001, "y": 10.501, "z": 0.0},
					"orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
				},
			},
			"switch_radius": 5.0,
			"desired_speed": 1.5,
			"heading_mode": 1,
			"heading": 0.785,
		}
	]
}


def test_sim_hull_position(client: RosBridgeClient) -> None:
	result = client._transform("/revolt/sim/stc/position/hull", _POSE_STAMPED)
	assert result is not None
	assert result["type"] == "sim_hull_position"
	assert result["v"] == "1"
	assert result["pos_x"] == pytest.approx(10.0)
	assert result["pos_y"] == pytest.approx(20.0)
	assert result["pos_z"] == pytest.approx(0.5)
	assert result["orient_x"] == pytest.approx(0.0)
	assert result["orient_y"] == pytest.approx(0.0)
	assert result["orient_z"] == pytest.approx(0.707)
	assert result["orient_w"] == pytest.approx(0.707)


def test_sim_hull_velocity(client: RosBridgeClient) -> None:
	result = client._transform("/revolt/sim/stc/position/velocity", _TWIST)
	assert result is not None
	assert result["type"] == "sim_hull_velocity"
	assert result["vel_x"] == pytest.approx(1.1)
	assert result["ang_vel_z"] == pytest.approx(6.6)


def test_sim_gnss_antenna1_produces_gnss_fix(sim_client: RosBridgeClient) -> None:
	result = sim_client._transform("/revolt/sim/stc/gnss/antenna1/position", _POINT_STAMPED)
	assert result is not None
	assert result["type"] == "gnss_fix"
	assert result["v"] == "1"
	# _POINT_STAMPED has point.x=59.0 (East) and point.y=10.5 (North)
	# lat = origin_lat + y_m / 111320.0
	assert result["latitude"] == pytest.approx(59.9083 + 10.5 / 111320.0, abs=1e-6)
	assert result["altitude_m"] == pytest.approx(2.0)
	assert result["fix_status"] == 0  # simulation always treated as FIX


def test_sim_gnss_antenna2_returns_none(client: RosBridgeClient) -> None:
	assert client._transform("/revolt/sim/stc/gnss/antenna2/position", _POINT_STAMPED) is None


def test_physical_gnss_fix(client: RosBridgeClient) -> None:
	msg = {
		"latitude": 59.9083,
		"longitude": 10.7512,
		"altitude": 5.2,
		"status": {},
		"position_covariance": [],
		"position_covariance_type": 0,
	}
	result = client._transform("/fix", msg)
	assert result is not None
	assert result["type"] == "gnss_fix"
	assert result["latitude"] == pytest.approx(59.9083)
	assert result["longitude"] == pytest.approx(10.7512)
	assert result["altitude_m"] == pytest.approx(5.2)
	assert result["fix_status"] == -1  # "status": {} has no "status" key → fallback -1


def test_physical_gnss_fix_with_status(client: RosBridgeClient) -> None:
	msg = {
		"latitude": 59.9083,
		"longitude": 10.7512,
		"altitude": 5.2,
		"status": {"status": 0, "service": 1},
		"position_covariance": [],
		"position_covariance_type": 0,
	}
	result = client._transform("/fix", msg)
	assert result is not None
	assert result["fix_status"] == 0  # FIX


def test_physical_gnss_heading(client: RosBridgeClient) -> None:
	# quaternion_from_euler(0, 0, radians(90)) -> pure yaw quaternion for 90 degrees
	msg = {"quaternion": {"x": 0.0, "y": 0.0, "z": 0.7071067811865476, "w": 0.7071067811865476}}
	result = client._transform("/heading", msg)
	assert result is not None
	assert result["type"] == "gnss_heading"
	assert result["heading_deg"] == pytest.approx(90.0)


def test_physical_gnss_heading_wraps_to_positive(client: RosBridgeClient) -> None:
	# yaw of -90 degrees should normalize to 270
	msg = {"quaternion": {"x": 0.0, "y": 0.0, "z": -0.7071067811865476, "w": 0.7071067811865476}}
	result = client._transform("/heading", msg)
	assert result is not None
	assert result["heading_deg"] == pytest.approx(270.0)


def test_physical_gnss_velocity(client: RosBridgeClient) -> None:
	# speed=5 m/s, course=45 degrees -> x = 5*sin(45deg), y = 5*cos(45deg)
	msg = {"twist": {"linear": {"x": 3.5355339059327378, "y": 3.5355339059327378, "z": 0.0}}}
	result = client._transform("/vel", msg)
	assert result is not None
	assert result["type"] == "gnss_velocity"
	assert result["speed_ms"] == pytest.approx(5.0)
	assert result["course_deg"] == pytest.approx(45.0)


def test_gnss_velocity_below_min_speed_has_no_course(client: RosBridgeClient) -> None:
	# Course over ground is an angle derived from the velocity vector -- below MIN_COG_SPEED_MS
	# the vector is small enough that receiver noise dominates the angle, so it's published as
	# None rather than a meaningless number (see MIN_COG_SPEED_MS's own comment in client.py).
	msg = {"twist": {"linear": {"x": 0.01, "y": 0.01, "z": 0.0}}}
	result = client._transform("/vel", msg)
	assert result is not None
	assert result["speed_ms"] == pytest.approx(0.01414, abs=1e-4)
	assert result["course_deg"] is None


def test_gnss_velocity_ema_smooths_course_across_messages(client: RosBridgeClient) -> None:
	# Same speed (5 m/s), course swings from 45deg to 135deg between two messages -- the smoothed
	# course should land somewhere between the two raw values, not jump straight to 135.
	msg_45 = {"twist": {"linear": {"x": 3.5355339059327378, "y": 3.5355339059327378, "z": 0.0}}}
	msg_135 = {"twist": {"linear": {"x": 3.5355339059327378, "y": -3.5355339059327378, "z": 0.0}}}

	first = client._transform("/vel", msg_45)
	assert first is not None
	assert first["course_deg"] == pytest.approx(45.0)

	second = client._transform("/vel", msg_135)
	assert second is not None
	assert second["course_deg"] is not None
	assert 45.0 < second["course_deg"] < 135.0


def test_sim_gnss_velocity(client: RosBridgeClient) -> None:
	result = client._transform("/revolt/sim/stc/gnss/velocity_vector", _FLOAT32MA_2)
	assert result is not None
	assert result["type"] == "sim_gnss_velocity"
	assert result["speed"] == pytest.approx(1.5)
	assert result["heading_rad"] == pytest.approx(0.785)


def test_sim_imu(client: RosBridgeClient) -> None:
	result = client._transform("/revolt/sim/stc/imu/data", _TWIST)
	assert result is not None
	assert result["type"] == "sim_imu"
	assert result["accel_x"] == pytest.approx(1.1)
	assert result["ang_vel_x"] == pytest.approx(4.4)


def _imu_msg(qx: float, qy: float, qz: float, qw: float) -> dict:
	return {
		"orientation": {"x": qx, "y": qy, "z": qz, "w": qw},
		"angular_velocity": {"x": 0.01, "y": 0.02, "z": 0.03},
		"linear_acceleration": {"x": 0.1, "y": 0.2, "z": 9.81},
	}


def test_imu_identity_quaternion(client: RosBridgeClient) -> None:
	result = client._transform("/imu/data", _imu_msg(0.0, 0.0, 0.0, 1.0))
	assert result is not None
	assert result["type"] == "imu_data"
	assert result["roll_deg"] == pytest.approx(0.0)
	assert result["pitch_deg"] == pytest.approx(0.0)
	assert result["yaw_deg"] == pytest.approx(0.0)


def test_imu_pure_roll(client: RosBridgeClient) -> None:
	# 30 degree rotation about x: q = (sin(15deg), 0, 0, cos(15deg))
	result = client._transform("/imu/data", _imu_msg(0.258819, 0.0, 0.0, 0.965926))
	assert result is not None
	assert result["roll_deg"] == pytest.approx(30.0, abs=1e-3)
	assert result["pitch_deg"] == pytest.approx(0.0, abs=1e-3)
	assert result["yaw_deg"] == pytest.approx(0.0, abs=1e-3)


def test_imu_pure_yaw_wraps_to_positive(client: RosBridgeClient) -> None:
	# -90 degree yaw should normalize to 270, same convention as gnss_heading
	result = client._transform(
		"/imu/data", _imu_msg(0.0, 0.0, -0.7071067811865476, 0.7071067811865476)
	)
	assert result is not None
	assert result["yaw_deg"] == pytest.approx(270.0, abs=1e-3)


def test_imu_accel_and_angular_velocity_passthrough(client: RosBridgeClient) -> None:
	result = client._transform("/imu/data", _imu_msg(0.0, 0.0, 0.0, 1.0))
	assert result is not None
	assert result["accel_x"] == pytest.approx(0.1)
	assert result["accel_y"] == pytest.approx(0.2)
	assert result["accel_z"] == pytest.approx(9.81)
	assert result["ang_vel_x"] == pytest.approx(0.01)
	assert result["ang_vel_y"] == pytest.approx(0.02)
	assert result["ang_vel_z"] == pytest.approx(0.03)


@pytest.mark.parametrize(
	"topic,expected_thruster",
	[
		("/thruster/bow", "bow"),
		("/thruster/port", "port"),
		("/thruster/starboard", "starboard"),
	],
)
def test_sim_thruster_feedback(client: RosBridgeClient, topic: str, expected_thruster: str) -> None:
	result = client._transform(topic, _FLOAT32MA_2)
	assert result is not None
	assert result["type"] == "sim_thruster_feedback"
	assert result["thruster"] == expected_thruster
	assert result["force"] == pytest.approx(1.5)
	assert result["angle"] == pytest.approx(0.785)


def test_sim_waypoint_list(client: RosBridgeClient) -> None:
	result = client._transform("/waypoint_list", _WAYPOINT_LIST)
	assert result is not None
	assert result["type"] == "sim_waypoint_list"
	assert len(result["waypoints"]) == 1
	wp = result["waypoints"][0]
	assert wp["id"] == 1
	assert wp["pos_x"] == pytest.approx(59.001)
	assert wp["pos_y"] == pytest.approx(10.501)
	assert wp["switch_radius"] == pytest.approx(5.0)
	assert wp["desired_speed"] == pytest.approx(1.5)
	assert wp["heading_mode"] == 1
	assert wp["heading_rad"] == pytest.approx(0.785)


def test_sim_waypoint_list_empty(client: RosBridgeClient) -> None:
	result = client._transform("/waypoint_list", {"waypoints": []})
	assert result is not None
	assert result["type"] == "sim_waypoint_list"
	assert result["waypoints"] == []


def test_lidar_scan_basic(client: RosBridgeClient) -> None:
	import math

	msg = {
		"angle_min": 0.0,
		"angle_max": round(2 * math.pi, 6),
		"angle_increment": round(2 * math.pi / 360, 6),
		"range_min": 0.9,
		"range_max": 10.0,
		"ranges": [5.0] * 360,
		"intensities": [],
	}
	result = client._transform("/scan", msg)
	assert result is not None
	assert result["type"] == "lidar_scan"
	assert result["v"] == "1"
	assert "timestamp_ms" in result
	assert result["angle_min"] == pytest.approx(0.0)
	assert result["range_max"] == pytest.approx(10.0)
	assert len(result["ranges"]) == 360
	assert result["ranges"][0] == pytest.approx(5.0)


def test_lidar_scan_replaces_inf_with_range_max(client: RosBridgeClient) -> None:
	import math

	msg = {
		"angle_min": 0.0,
		"angle_max": math.pi,
		"angle_increment": math.pi / 2,
		"range_min": 0.1,
		"range_max": 25.0,
		"ranges": [float("inf"), 3.0, float("nan")],
	}
	result = client._transform("/scan", msg)
	assert result is not None
	assert result["ranges"][0] == pytest.approx(25.0)
	assert result["ranges"][1] == pytest.approx(3.0)
	assert result["ranges"][2] == pytest.approx(25.0)


def _make_pointcloud2_msg(
	points: list[tuple[float, float, float]],
	*,
	fields_in_order: list[str] | None = None,
	is_bigendian: bool = False,
) -> dict:
	"""Build a synthetic PointCloud2-shaped wire dict.

	fields_in_order controls the on-wire field layout (default x,y,z first) so tests can prove
	the parser reads offsets from `fields` rather than assuming x,y,z start at offset 0.
	"""
	import struct

	fields_in_order = fields_in_order or ["x", "y", "z"]
	endian = ">" if is_bigendian else "<"
	field_specs = []
	offset = 0
	for name in fields_in_order:
		field_specs.append({"name": name, "offset": offset, "datatype": 7, "count": 1})
		offset += 4
	point_step = offset

	packed = bytearray()
	for x, y, z in points:
		values = {"x": x, "y": y, "z": z}
		row = bytearray(point_step)
		for spec in field_specs:
			struct.pack_into(f"{endian}f", row, spec["offset"], values.get(spec["name"], 0.0))
		packed += row

	return {
		"point_step": point_step,
		"is_bigendian": is_bigendian,
		"fields": field_specs,
		"data": base64.b64encode(bytes(packed)).decode(),
	}


def test_velodyne_points_basic(client: RosBridgeClient) -> None:
	points = [(1.0, 2.0, 0.5), (3.0, -1.0, 1.5)]
	result = client._transform("/velodyne_points", _make_pointcloud2_msg(points))
	assert result is not None
	assert result["type"] == "point_cloud"
	assert result["v"] == "1"
	assert result["point_count"] == 2
	assert result["points"] == pytest.approx([1.0, 2.0, 0.5, 3.0, -1.0, 1.5])


def test_velodyne_points_field_order_independent(client: RosBridgeClient) -> None:
	# intensity placed before x/y/z shifts their offsets; the parser must read `fields` rather
	# than assume x,y,z start at offset 0.
	msg = _make_pointcloud2_msg([(2.0, 4.0, -0.5)], fields_in_order=["intensity", "x", "y", "z"])
	result = client._transform("/velodyne_points", msg)
	assert result is not None
	assert result["points"] == pytest.approx([2.0, 4.0, -0.5])


def test_velodyne_points_filters_nan(client: RosBridgeClient) -> None:
	points = [(1.0, 1.0, 1.0), (float("nan"), 2.0, 2.0)]
	result = client._transform("/velodyne_points", _make_pointcloud2_msg(points))
	assert result is not None
	assert result["point_count"] == 1
	assert result["points"] == pytest.approx([1.0, 1.0, 1.0])


def test_velodyne_points_all_invalid_returns_none(client: RosBridgeClient) -> None:
	points = [(float("nan"), float("nan"), float("nan"))]
	result = client._transform("/velodyne_points", _make_pointcloud2_msg(points))
	assert result is None


def test_velodyne_points_bigendian(client: RosBridgeClient) -> None:
	msg = _make_pointcloud2_msg([(5.0, -2.5, 0.0)], is_bigendian=True)
	result = client._transform("/velodyne_points", msg)
	assert result is not None
	assert result["points"] == pytest.approx([5.0, -2.5, 0.0])


def test_velodyne_points_missing_xyz_field_returns_none(client: RosBridgeClient) -> None:
	msg = _make_pointcloud2_msg([(1.0, 2.0, 3.0)], fields_in_order=["x", "y"])  # no z field
	result = client._transform("/velodyne_points", msg)
	assert result is None


def test_voxel_decimate_reduces_dense_cluster_but_preserves_z_spread() -> None:
	import numpy as np

	from revolt_api.bridge.client import _voxel_decimate

	# Two dense clusters of near-duplicate points at different heights, within a single voxel
	# cell of each other -- proves multi-ring height info survives decimation, not just that
	# point count goes down.
	low = np.array([[0.0, 0.0, 0.0], [0.01, 0.0, 0.0], [0.0, 0.01, 0.0]])
	high = np.array([[0.0, 0.0, 2.0], [0.01, 0.0, 2.0], [0.0, 0.01, 2.0]])
	xyz = np.vstack([low, high])
	result = _voxel_decimate(xyz, voxel_size=0.15, max_points=100)
	assert result.shape[0] == 2
	z_values = sorted(result[:, 2])
	assert z_values[0] == pytest.approx(0.0)
	assert z_values[1] == pytest.approx(2.0)


def test_voxel_decimate_caps_at_max_points() -> None:
	import numpy as np

	from revolt_api.bridge.client import _voxel_decimate

	rng = np.random.default_rng(42)
	xyz = rng.uniform(-50, 50, size=(1000, 3))  # spread out, most land in distinct voxel cells
	result = _voxel_decimate(xyz, voxel_size=0.15, max_points=100)
	assert result.shape[0] <= 100


def test_camera_frame_stores_bytes_and_returns_none(client: RosBridgeClient) -> None:
	import base64

	fake_jpeg = base64.b64encode(b"\xff\xd8\xff\xd9").decode()  # minimal JPEG SOI+EOI
	result = client._transform(
		"/camera/camera/color/image_raw/compressed",
		{"format": "jpeg", "data": fake_jpeg},
	)
	assert result is None  # not forwarded via WebSocket
	assert client.latest_camera_frames.get("main") == b"\xff\xd8\xff\xd9"
	assert client._camera_frame_counters.get("main") == 1


def test_camera_frame_counter_increments(client: RosBridgeClient) -> None:
	import base64

	payload = {"format": "jpeg", "data": base64.b64encode(b"\xff\xd8\xff\xd9").decode()}
	client._transform("/camera/camera/color/image_raw/compressed", payload)
	client._transform("/camera/camera/color/image_raw/compressed", payload)
	assert client._camera_frame_counters.get("main") == 2


def test_camera_empty_data_returns_none(client: RosBridgeClient) -> None:
	result = client._transform(
		"/camera/camera/color/image_raw/compressed", {"format": "jpeg", "data": ""}
	)
	assert result is None
	assert "main" not in client.latest_camera_frames


def test_all_sim_results_have_version(sim_client: RosBridgeClient) -> None:
	sim_topics = [
		("/revolt/sim/stc/position/hull", _POSE_STAMPED),
		("/revolt/sim/stc/position/velocity", _TWIST),
		("/revolt/sim/stc/gnss/antenna1/position", _POINT_STAMPED),
		("/revolt/sim/stc/gnss/velocity_vector", _FLOAT32MA_2),
		("/revolt/sim/stc/imu/data", _TWIST),
		("/thruster/bow", _FLOAT32MA_2),
		("/thruster/port", _FLOAT32MA_2),
		("/thruster/starboard", _FLOAT32MA_2),
		("/waypoint_list", _WAYPOINT_LIST),
	]
	for topic, msg in sim_topics:
		result = sim_client._transform(topic, msg)
		assert result is not None, f"_transform returned None for {topic}"
		assert result["v"] == "1", f"Missing version for {topic}"
		assert "timestamp_ms" in result, f"Missing timestamp_ms for {topic}"
