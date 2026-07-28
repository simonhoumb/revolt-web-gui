"""Local dev rosbridge mock.

Emulates a subset of rosbridge_suite sufficient for the backend bridge client:
- Accepts subscribe frames and starts emitting fake telemetry for each subscribed topic
- Accepts publish frames (logs them, takes no further action)
- Sends realistic values at rates matching real hardware
- Accepts call_service frames for a fake rosapi (Feature 16, ROS2 command execution): this is a
  hand-rolled server, not real rosbridge_suite, so rosapi isn't available for free the way it
  would be against a real vessel/simulation rosbridge -- these handlers exist purely so
  RosCommandWidget and the backend's call_service path have something to talk to locally.
"""

import asyncio
import base64
import io
import json
import logging
import math
import os
import random
import struct
import time

from websockets.asyncio.server import ServerConnection, serve

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("rosbridge_mock")

BRIDGE_TARGET = os.environ.get("BRIDGE_TARGET", "physical")


def _make_camera_frame(t: float) -> str:
    """Generate a 1280×720 JPEG test frame matching RealSense D456 resolution."""
    from PIL import Image, ImageDraw, ImageFont

    W, H = 1280, 720
    img = Image.new("RGB", (W, H), color=(5, 10, 20))
    draw = ImageDraw.Draw(img)

    cx, cy = W // 2, H // 2
    radius = min(cx, cy) - 40  # 320 px — scales with the larger canvas

    # Animated sweep line
    angle = t * 60 % 360
    rad = math.radians(angle)
    end_x = int(cx + radius * math.cos(rad))
    end_y = int(cy - radius * math.sin(rad))
    draw.line([(cx, cy), (end_x, end_y)], fill=(34, 211, 238), width=6)

    # Outer ring
    draw.ellipse(
        [(cx - radius, cy - radius), (cx + radius, cy + radius)],
        outline=(30, 50, 80),
        width=3,
    )

    # Centre dot
    draw.ellipse([(cx - 10, cy - 10), (cx + 10, cy + 10)], fill=(245, 158, 11))

    # Label — load_default(size=) requires Pillow >= 10
    font = ImageFont.load_default(size=32)
    draw.text((20, 20), "CAM MOCK  1280x720", fill=(100, 120, 140), font=font)

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=60)
    return base64.b64encode(buf.getvalue()).decode()


# Emit intervals in seconds per topic — physical vessel topics
INTERVALS_PHYSICAL: dict[str, float] = {
    "/arduino/stern/battery_voltage": 2.0,
    "/arduino/stern/port/current": 0.5,
    "/arduino/stern/starboard/current": 0.5,
    "/arduino/bow/current": 0.5,
    "/arduino/stern/dht22/temperature": 5.0,
    "/arduino/stern/dht22/humidity": 5.0,
    "/arduino/bow/dht22/temperature": 5.0,
    "/arduino/bow/dht22/humidity": 5.0,
    "/arduino/stern/emergency_stop_status": 1.0,
    "/arduino/bow/linear_actuator_retract_state": 2.0,
    "/thruster/port/feedback_angle": 0.5,
    "/thruster/starboard/feedback_angle": 0.5,
    "/arduino/stern/rc_remote_input": 0.2,
    "/arduino/stern/light_beacon_status": 0.5,  # matches the firmware's own EMERGENCY_LED_INTERVAL
    "/control_mode": 1.0,
    "/fix": 1.0,
    "/vel": 1.0,
    "/heading": 0.5,
    "/camera/camera/color/image_raw/compressed": 0.2,  # 5 fps
    "/scan": 0.1,  # 10 Hz
    "/velodyne_points": 0.25,  # 4 Hz, matching client.py's frontend_throttle_ms for this topic
    "/radar/spoke": 0.01,  # ~= 20s-rotation / 2048 fine steps, so each tick advances one step
    "/ais/decoded_message": 3.0,  # one target report per tick, round-robin (see _make_msg)
    "/imu/data": 0.1,  # sent at the already-throttled 10Hz rate, same as /scan below
}

# Emit intervals for simulation topics
INTERVALS_SIMULATION: dict[str, float] = {
    "/revolt/sim/stc/position/hull": 0.1,  # 10 Hz
    "/revolt/sim/stc/position/velocity": 0.1,
    "/revolt/sim/stc/gnss/antenna1/position": 0.5,
    "/revolt/sim/stc/gnss/antenna2/position": 0.5,
    "/revolt/sim/stc/gnss/velocity_vector": 0.5,
    "/revolt/sim/stc/imu/data": 0.05,  # 20 Hz
    "/thruster/bow": 0.1,
    "/thruster/port": 0.1,
    "/thruster/starboard": 0.1,
    "/waypoint_list": 5.0,
}

INTERVALS = (
    INTERVALS_SIMULATION if BRIDGE_TARGET == "simulation" else INTERVALS_PHYSICAL
)

# Message types per topic, mirroring apps/backend/src/revolt_api/bridge/protocol.py's TopicSpec
# entries -- kept as a plain dict here since this script is standalone (runs in its own
# container, not importing the backend package) and only needs the type string, not the full spec.
TOPIC_TYPES_PHYSICAL: dict[str, str] = {
    "/arduino/stern/battery_voltage": "std_msgs/Float32",
    "/arduino/stern/port/current": "std_msgs/Int16",
    "/arduino/stern/starboard/current": "std_msgs/Int16",
    "/arduino/bow/current": "std_msgs/Int16",
    "/arduino/stern/dht22/temperature": "std_msgs/Float32",
    "/arduino/stern/dht22/humidity": "std_msgs/Float32",
    "/arduino/bow/dht22/temperature": "std_msgs/Float32",
    "/arduino/bow/dht22/humidity": "std_msgs/Float32",
    "/arduino/stern/emergency_stop_status": "std_msgs/UInt16",
    "/arduino/bow/linear_actuator_retract_state": "std_msgs/UInt16",
    "/thruster/port/feedback_angle": "std_msgs/Float32",
    "/thruster/starboard/feedback_angle": "std_msgs/Float32",
    "/arduino/stern/rc_remote_input": "custom_msgs/RCRemote",
    "/arduino/stern/light_beacon_status": "std_msgs/UInt16",
    "/control_mode": "std_msgs/UInt8",
    "/fix": "sensor_msgs/NavSatFix",
    "/vel": "geometry_msgs/TwistStamped",
    "/heading": "geometry_msgs/QuaternionStamped",
    "/camera/camera/color/image_raw/compressed": "sensor_msgs/CompressedImage",
    "/scan": "sensor_msgs/LaserScan",
    "/velodyne_points": "sensor_msgs/PointCloud2",
    "/radar/spoke": "custom_msgs/RadarSpoke",
    "/ais/decoded_message": "custom_msgs/SimpleAISdata",
    "/imu/data": "sensor_msgs/Imu",
}
TOPIC_TYPES_SIMULATION: dict[str, str] = {
    "/revolt/sim/stc/position/hull": "geometry_msgs/PoseStamped",
    "/revolt/sim/stc/position/velocity": "geometry_msgs/Twist",
    "/revolt/sim/stc/gnss/antenna1/position": "geometry_msgs/PointStamped",
    "/revolt/sim/stc/gnss/antenna2/position": "geometry_msgs/PointStamped",
    "/revolt/sim/stc/gnss/velocity_vector": "std_msgs/Float32MultiArray",
    "/revolt/sim/stc/imu/data": "geometry_msgs/Twist",
    "/thruster/bow": "std_msgs/Float32MultiArray",
    "/thruster/port": "std_msgs/Float32MultiArray",
    "/thruster/starboard": "std_msgs/Float32MultiArray",
    "/waypoint_list": "custom_msgs/WaypointList",
}
TOPIC_TYPES = TOPIC_TYPES_SIMULATION if BRIDGE_TARGET == "simulation" else TOPIC_TYPES_PHYSICAL

# Fake ROS graph state for the rosapi call_service handlers below -- not derived from anything
# real, just enough shape for RosCommandWidget's introspection commands to have data to show.
FAKE_NODE_DETAILS: dict[str, dict[str, list[str]]] = {
    "/waypoint_switcher_node": {
        "subscribing": ["/update_waypoint_list"],
        "publishing": ["/waypoint_list"],
        "services": ["/waypoint_switcher_node/get_parameters"],
    },
    "/los_guidance_node": {
        "subscribing": ["/waypoint_list", "/fix", "/heading"],
        "publishing": ["/control_mode"],
        "services": ["/los_guidance_node/get_parameters"],
    },
    "/rosbridge_websocket": {
        "subscribing": [],
        "publishing": [],
        "services": ["/rosapi/topics", "/rosapi/nodes", "/rosapi/services"],
    },
}

# Keys use rosapi's real "<node>:<param>" format (verified against rosapi_node's
# _get_node_and_param_name, which splits get_param's request.name on ":" -- get_param_names
# returns entries in this same format, and the two are designed to be used as a pair).
FAKE_PARAMS: dict[str, str] = {
    "/waypoint_switcher_node:default_switch_radius": "5.0",
    "/los_guidance_node:lookahead_distance": "10.0",
}

_start_time = time.time()

# Mutable "vessel state" for the active waypoint queue, mirroring waypoint_switcher_node's
# pop-as-you-go queue: /update_waypoint_list wholesale-replaces it, so pause/terminate publishing
# an empty list here must actually stick until the next real update, not get silently replayed by
# the periodic emit below (which would make Pause/Terminate look broken during manual testing).
_waypoint_queue: list[dict] = [
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
        "heading": 0.0,
    },
    {
        "id": 2,
        "pose": {
            "header": {"seq": 0, "stamp": {"secs": 0, "nsecs": 0}, "frame_id": "map"},
            "pose": {
                "position": {"x": 59.002, "y": 10.502, "z": 0.0},
                "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0},
            },
        },
        "switch_radius": 5.0,
        "desired_speed": 1.0,
        "heading_mode": 0,
        "heading": 0.0,
    },
]

# Env-gated: pop the front waypoint every ~8s so current-waypoint/progress can be watched
# advancing without the real guidance stack. Off by default to keep existing behavior stable.
MOCK_AUTO_POP = os.environ.get("MOCK_AUTO_POP", "") == "1"

CRAB_ANGLE_RAD = math.radians(
    15
)  # simulated cross-current/wind drift: COG diverges from heading


# VLP-16 firing order elevations, -15..+15 degrees in 2-degree steps.
_VELODYNE_RING_ELEVATIONS_DEG = [-15 + i * 2 for i in range(16)]
# Coarser than a real sweep's ~1800 points/ring -- keeps this mock's per-tick loop fast.
_VELODYNE_AZIMUTH_STEPS = 200


def _make_velodyne_points_msg(t: float) -> dict:
    """Synthetic PointCloud2 (all 16 rings), same obstacle-ring pattern as /scan but in 3D.

    Field layout (x,y,z,intensity,ring,time) matches the real velodyne_pointcloud driver's
    unpadded layout, though the backend's parser reads offsets from `fields` regardless.
    """
    field_specs = [
        {"name": "x", "offset": 0, "datatype": 7, "count": 1},
        {"name": "y", "offset": 4, "datatype": 7, "count": 1},
        {"name": "z", "offset": 8, "datatype": 7, "count": 1},
        {"name": "intensity", "offset": 12, "datatype": 7, "count": 1},
        {"name": "ring", "offset": 16, "datatype": 4, "count": 1},
        {"name": "time", "offset": 18, "datatype": 7, "count": 1},
    ]
    point_step = 22
    angle_inc = (2 * math.pi) / _VELODYNE_AZIMUTH_STEPS

    packed = bytearray()
    for ring_idx, elevation_deg in enumerate(_VELODYNE_RING_ELEVATIONS_DEG):
        elevation = math.radians(elevation_deg)
        for i in range(_VELODYNE_AZIMUTH_STEPS):
            azimuth = i * angle_inc
            # Same obstacle-ring-with-gaps pattern as /scan's case below, so the 3D view shows
            # a recognizable shape rather than pure noise.
            if (azimuth % (math.pi / 2)) < 0.2:
                r = 125.0 + random.gauss(0, 0.5)
            else:
                r = 40.0 + 20.0 * math.sin(azimuth * 3 + t) + random.gauss(0, 0.5)
            r = max(0.9, min(r, 129.9))
            x = r * math.cos(elevation) * math.cos(azimuth)
            y = r * math.cos(elevation) * math.sin(azimuth)
            z = r * math.sin(elevation)

            row = bytearray(point_step)
            struct.pack_into("<f", row, 0, x)
            struct.pack_into("<f", row, 4, y)
            struct.pack_into("<f", row, 8, z)
            struct.pack_into("<f", row, 12, 100.0)  # intensity, unused by the backend
            struct.pack_into("<H", row, 16, ring_idx)
            struct.pack_into("<f", row, 18, 0.0)  # time offset, unused by the backend
            packed += row

    return {
        "point_step": point_step,
        "is_bigendian": False,
        "fields": field_specs,
        "data": base64.b64encode(bytes(packed)).decode(),
        "header": {"stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "velodyne"},
    }


def _mock_heading_rad(t: float) -> float:
    # Bearing of travel matching the /fix drift (lat=sin, lon=cos of t/60).
    return -(t / 60) % (2 * math.pi)


def _make_msg(topic: str) -> dict:
    t = time.time() - _start_time
    match topic:
        # Physical vessel topics
        case "/arduino/stern/battery_voltage":
            # Cycles through all four GUI voltage states, 15 s each (60 s total loop):
            #   0-15 s : normal   ~13.0 V  (between WARN 11.5 V and FULL 14.4 V)
            #  15-30 s : warning  ~11.3 V  (between ALARM 11.0 V and WARN 11.5 V)
            #  30-45 s : alarm    ~10.5 V  (below ALARM 11.0 V, above EMPTY 10.0 V)
            #  45-60 s : overvolt ~17.0 V  (above OVERVOLT 16.0 V)
            phase = int(t / 15) % 4
            base = [13.0, 11.3, 10.5, 17.0][phase]
            return {"data": round(base + random.gauss(0, 0.05), 2)}
        case "/arduino/stern/port/current":
            # Firmware-converted amps (ACS712 formula applied on Arduino); typical range 0-30 A
            return {"data": int(round(max(0.0, 10.0 + random.gauss(0, 1.5))))}
        case "/arduino/stern/starboard/current":
            return {"data": int(round(max(0.0, 12.0 + random.gauss(0, 1.5))))}
        case "/arduino/bow/current":
            # Raw ADC 0-1023; backend applies _ADC_TO_AMPS (30/1023) → ~15 A
            return {"data": max(0, min(1023, int(512 + random.gauss(0, 30))))}
        case "/arduino/stern/dht22/temperature" | "/arduino/bow/dht22/temperature":
            return {"data": round(22.0 + random.gauss(0, 0.3), 1)}
        case "/arduino/stern/dht22/humidity" | "/arduino/bow/dht22/humidity":
            return {"data": round(60.0 + random.gauss(0, 1.0), 1)}
        case "/arduino/stern/emergency_stop_status":
            # Toggles active every 5 s for easy testing (change to longer for demos)
            return {"data": int(t / 5) % 2}
        case "/arduino/bow/linear_actuator_retract_state":
            # Alternates retracted/deployed every 20 s
            return {"data": int(t / 20) % 2}
        case "/thruster/port/feedback_angle":
            # Slow azimuth sweep, -90 to 90 degrees
            return {"data": round(90.0 * math.sin(t / 10), 1)}
        case "/thruster/starboard/feedback_angle":
            return {"data": round(90.0 * math.sin(t / 10 + 0.3), 1)}
        case "/arduino/stern/rc_remote_input":
            # PWM range 1070-1930, center ~1500; gear toggles manual/auto every 15 s
            return {
                "throttle": int(1500 + 400 * math.sin(t / 3)),
                "aileron": int(1500 + 300 * math.sin(t / 4)),
                "elevation": 1500,
                "rudder": int(1500 + 300 * math.cos(t / 5)),
                "gear": int(t / 15) % 2,
                "aux": 1500,
            }
        case "/arduino/stern/light_beacon_status":
            # Cycles every 10s through a few plausible real states: steady green (normal),
            # blinking red (warning), blinking yellow paired with green (manual mode, still
            # otherwise fine). Blink toggles once per tick, same cadence as the firmware's own
            # EMERGENCY_LED_INTERVAL in Hardware/actuators/firmware/stern/src/main.cpp.
            blink_on = int(t / 0.5) % 2 == 0
            phase = int(t / 10) % 3
            if phase == 0:
                red, yellow, green = False, False, True
            elif phase == 1:
                red, yellow, green = blink_on, False, False
            else:
                red, yellow, green = False, blink_on, True
            raw = (1 if red else 0) | (2 if yellow else 0) | (4 if green else 0)
            return {"data": raw}
        case "/control_mode":
            # Cycles through all four modes every 40 s so UI state changes are visible
            return {"data": int(t / 10) % 4}
        case "/fix":
            # Simulated NavSatFix: Bekkelaget, Oslo Fjord with tiny drift
            return {
                "latitude": round(59.3783 + 0.0001 * math.sin(t / 60), 7),
                "longitude": round(10.5930 + 0.0001 * math.cos(t / 60), 7),
                "altitude": round(5.0 + random.gauss(0, 0.1), 2),
                "status": {"status": 0, "service": 1},
                "position_covariance": [0.0] * 9,
                "position_covariance_type": 0,
            }
        case "/heading":
            heading_rad = _mock_heading_rad(t)
            return {
                "quaternion": {
                    "x": 0.0,
                    "y": 0.0,
                    "z": round(math.sin(heading_rad / 2), 4),
                    "w": round(math.cos(heading_rad / 2), 4),
                }
            }
        case "/vel":
            speed = 3.0 + 0.2 * math.sin(t / 15)
            # Simulated cross-current/wind crab: course over ground leads
            # heading by a fixed angle so H (heading-up) and C (course-up)
            # chart orientation modes are visibly distinct in the mock,
            # matching real-world drift where COG != heading.
            course_rad = (_mock_heading_rad(t) + CRAB_ANGLE_RAD) % (2 * math.pi)
            return {
                "twist": {
                    "linear": {
                        "x": round(speed * math.sin(course_rad), 3),
                        "y": round(speed * math.cos(course_rad), 3),
                        "z": 0.0,
                    }
                }
            }
        # Simulation topics
        case "/revolt/sim/stc/position/hull":
            # Simulated vessel doing slow circles; position in arbitrary NED-like units
            angle = t * 0.02  # yaw rate rad/s
            return {
                "header": {
                    "seq": 0,
                    "stamp": {"secs": int(t), "nsecs": 0},
                    "frame_id": "map",
                },
                "pose": {
                    "position": {
                        "x": round(100.0 * math.cos(angle), 3),
                        "y": round(100.0 * math.sin(angle), 3),
                        "z": 0.0,
                    },
                    # Quaternion for yaw-only rotation: q = [0, 0, sin(yaw/2), cos(yaw/2)]
                    "orientation": {
                        "x": 0.0,
                        "y": 0.0,
                        "z": round(math.sin(angle / 2), 4),
                        "w": round(math.cos(angle / 2), 4),
                    },
                },
            }
        case "/revolt/sim/stc/position/velocity":
            speed = 1.5 + 0.5 * math.sin(t / 20)
            angle = t * 0.02
            return {
                "linear": {
                    "x": round(speed * math.cos(angle), 3),
                    "y": round(speed * math.sin(angle), 3),
                    "z": 0.0,
                },
                "angular": {
                    "x": 0.0,
                    "y": 0.0,
                    "z": round(0.02 + random.gauss(0, 0.001), 4),
                },
            }
        case "/revolt/sim/stc/gnss/antenna1/position":
            angle = t * 0.02
            return {
                "header": {
                    "seq": 0,
                    "stamp": {"secs": int(t), "nsecs": 0},
                    "frame_id": "map",
                },
                "point": {
                    "x": round(59.0 + 0.001 * math.cos(angle), 6),
                    "y": round(10.5 + 0.001 * math.sin(angle), 6),
                    "z": round(2.0 + random.gauss(0, 0.01), 3),
                },
            }
        case "/revolt/sim/stc/gnss/antenna2/position":
            angle = t * 0.02
            return {
                "header": {
                    "seq": 0,
                    "stamp": {"secs": int(t), "nsecs": 0},
                    "frame_id": "map",
                },
                "point": {
                    "x": round(59.0 + 0.001 * math.cos(angle) + 0.0001, 6),
                    "y": round(10.5 + 0.001 * math.sin(angle) + 0.0001, 6),
                    "z": round(2.0 + random.gauss(0, 0.01), 3),
                },
            }
        case "/revolt/sim/stc/gnss/velocity_vector":
            heading_rad = (t * 0.02) % (2 * math.pi)
            return {
                "data": [round(1.5 + 0.5 * math.sin(t / 20), 3), round(heading_rad, 4)],
                "layout": {"dim": [], "data_offset": 0},
            }
        case "/revolt/sim/stc/imu/data":
            return {
                "linear": {
                    "x": round(random.gauss(0, 0.05), 4),
                    "y": round(random.gauss(0, 0.05), 4),
                    "z": round(9.81 + random.gauss(0, 0.01), 4),
                },
                "angular": {
                    "x": round(random.gauss(0, 0.1), 4),
                    "y": round(random.gauss(0, 0.1), 4),
                    "z": round(math.degrees(0.02) + random.gauss(0, 0.05), 4),
                },
            }
        case "/thruster/bow":
            return {
                "data": [round(random.gauss(0, 10), 2), round(random.gauss(0, 5), 2)],
                "layout": {"dim": [], "data_offset": 0},
            }
        case "/thruster/port":
            return {
                "data": [
                    round(50 + random.gauss(0, 5), 2),
                    round(random.gauss(0, 2), 2),
                ],
                "layout": {"dim": [], "data_offset": 0},
            }
        case "/thruster/starboard":
            return {
                "data": [
                    round(50 + random.gauss(0, 5), 2),
                    round(random.gauss(0, 2), 2),
                ],
                "layout": {"dim": [], "data_offset": 0},
            }
        case "/waypoint_list":
            return {"waypoints": _waypoint_queue}
        case "/camera/camera/color/image_raw/compressed":
            return {
                "header": {
                    "stamp": {"secs": int(t), "nsecs": 0},
                    "frame_id": "camera_color_frame",
                },
                "format": "jpeg",
                "data": _make_camera_frame(t),
            }
        case "/scan":
            num_points = 1800  # VLP-16 at 600 RPM ≈ 0.2° resolution
            angle_inc = (2 * math.pi) / num_points
            ranges = []
            for i in range(num_points):
                angle = i * angle_inc
                # Obstacle ring at ~40 m with animated bumps, gaps at cardinal sectors
                if (angle % (math.pi / 2)) < 0.2:
                    r = 125.0 + random.gauss(0, 0.5)  # gap (far reading)
                else:
                    r = 40.0 + 20.0 * math.sin(angle * 3 + t) + random.gauss(0, 0.5)
                ranges.append(round(max(0.9, min(r, 129.9)), 3))
            return {
                "angle_min": 0.0,
                "angle_max": round(2 * math.pi, 6),
                "angle_increment": round(angle_inc, 6),
                "range_min": 0.9,
                "range_max": 130.0,
                "ranges": ranges,
                "intensities": [],
                "header": {
                    "stamp": {"secs": int(t), "nsecs": 0},
                    "frame_id": "velodyne",
                },
            }
        case "/velodyne_points":
            return _make_velodyne_points_msg(t)
        case "/radar/spoke":
            # Simulated Furuno DRS4D-NXT. The real unit emits 8,192 raw spokes/revolution
            # (confirmed via Furuno's own NavNet API spec, bundled in Hardware/radar/RadarSDK/),
            # but at that resolution and a typical 24-48 RPM rotation the real spoke rate is
            # several thousand messages/second -- too fast to usefully exercise in a local mock
            # loop. This simulates a coarser 2048 fine steps/revolution, still finer than the
            # backend's own RADAR_NUM_BINS=512 aggregation bins (client.py) so several fine mock
            # spokes land in each bin, exercising the same max-merge path real hardware would.
            fine_steps_per_rev = 2048
            rotation_period_s = 20.0
            step = int(t / (rotation_period_s / fine_steps_per_rev)) % fine_steps_per_rev
            azimuth = step * (2 * math.pi / fine_steps_per_rev)
            # num_samples=480 and range_start=0.0 match radar_node.cpp's real behaviour and the
            # NavNet API spec's own worked example. range_increment is chosen to place a realistic
            # 8 nm range boundary at the end of the sweep (480 samples covering 8 nm) rather than
            # reusing radar_node.cpp's `range_increment = 125.0f / scale` formula -- that formula
            # doesn't reproduce the spec's own worked example (sweep_len=480, scale=240 -> 8 nm
            # boundary at sample 240, i.e. ~61.7 m/sample, not the ~0.52 m/sample the formula
            # gives), a ~118x discrepancy that looks like a real unit bug in the existing driver.
            num_samples = 480
            range_start = 0.0
            range_increment = (8 * 1852.0) / num_samples
            target_azimuth = 1.2
            # ~740 m (~0.4 nm) out -- visible at the widget's default 1 nm zoom (dock-adjacent
            # testing needs the tight end of the range ladder, not an offshore-transit range).
            target_sample_idx = 24
            angle_diff = abs(((azimuth - target_azimuth + math.pi) % (2 * math.pi)) - math.pi)
            intensity_bytes = bytearray(num_samples)
            for i in range(num_samples):
                level = 10 + random.gauss(0, 3)
                if angle_diff < 0.1 and abs(i - target_sample_idx) < 4:
                    level += 200
                intensity_bytes[i] = max(0, min(255, int(level)))
            return {
                "azimuth": round(azimuth, 5),
                "range_start": range_start,
                "range_increment": round(range_increment, 4),
                "num_samples": num_samples,
                "min_intensity": 0,
                "max_intensity": 255,
                "intensity": base64.b64encode(bytes(intensity_bytes)).decode(),
            }
        case "/ais/decoded_message":
            # Real AIS is a shared broadcast channel: targets take turns reporting, not one
            # message carrying every target at once. Round-robin through a few synthetic targets
            # so the map ends up with several live markers after a few ticks, same as it would
            # from a real receiver.
            targets = [
                {  # underway, full nav data
                    "mmsi": 257123456,
                    "lat": round(59.3783 + 0.006 * math.sin(t / 40), 6),
                    "lon": round(10.6030 + 0.004 * math.cos(t / 40), 6),
                    "sog": round(8.0 + random.gauss(0, 0.2), 1),
                    "heading": int((t * 3) % 360),
                },
                {  # slower vessel, opposite side of own-ship
                    "mmsi": 257654321,
                    "lat": round(59.3733 - 0.003 * math.cos(t / 60), 6),
                    "lon": round(10.5850 - 0.003 * math.sin(t / 60), 6),
                    "sog": round(4.0 + random.gauss(0, 0.1), 1),
                    "heading": int((200 + t * 1.5) % 360),
                },
                {  # base station: no sog/heading, matches SimpleAISdata.msg's sentinels
                    "mmsi": 2571234,
                    "lat": 59.3820,
                    "lon": 10.6010,
                    "sog": 102.3,
                    "heading": 511,
                },
            ]
            return targets[int(t / 3) % len(targets)]
        case "/imu/data":
            # Gentle synthetic roll/pitch oscillation plus the same simulated heading used for
            # /heading, so yaw stays consistent with the rest of the mock's vessel motion.
            roll_rad = 0.15 * math.sin(t / 4)
            pitch_rad = 0.08 * math.sin(t / 6 + 1.0)
            yaw_rad = _mock_heading_rad(t)
            cr, sr = math.cos(roll_rad / 2), math.sin(roll_rad / 2)
            cp, sp = math.cos(pitch_rad / 2), math.sin(pitch_rad / 2)
            cy, sy = math.cos(yaw_rad / 2), math.sin(yaw_rad / 2)
            return {
                "orientation": {
                    "w": cr * cp * cy + sr * sp * sy,
                    "x": sr * cp * cy - cr * sp * sy,
                    "y": cr * sp * cy + sr * cp * sy,
                    "z": cr * cp * sy - sr * sp * cy,
                },
                "angular_velocity": {
                    "x": round(random.gauss(0, 0.01), 4),
                    "y": round(random.gauss(0, 0.01), 4),
                    "z": round(random.gauss(0, 0.01), 4),
                },
                "linear_acceleration": {
                    "x": round(random.gauss(0, 0.05), 3),
                    "y": round(random.gauss(0, 0.05), 3),
                    "z": round(9.81 + random.gauss(0, 0.05), 3),
                },
            }
        case _:
            return {"data": 0}


async def _emit_topic(
    ws: ServerConnection,
    topic: str,
    interval: float,
    active: asyncio.Event,
) -> None:
    while not ws.close_code:
        frame = json.dumps({"op": "publish", "topic": topic, "msg": _make_msg(topic)})
        try:
            await ws.send(frame)
        except Exception:
            return
        await asyncio.sleep(interval)


async def _echo_waypoint_list(
    ws: ServerConnection, waypoint_list_msg: dict, delay_s: float = 1.0
) -> None:
    """Simulate the mission planner accepting an /update_waypoint_list publish and adopting it as
    the active list: echo the same payload back on /waypoint_list after a short delay, so the
    backend's ack/echo flow (RosBridgeClient.publish_and_await_ack) is testable without the real
    pygemini/STC stack."""
    await asyncio.sleep(delay_s)
    try:
        await ws.send(
            json.dumps(
                {"op": "publish", "topic": "/waypoint_list", "msg": waypoint_list_msg}
            )
        )
    except Exception:
        pass


async def _auto_pop_waypoints(ws: ServerConnection, interval_s: float = 8.0) -> None:
    """MOCK_AUTO_POP=1 only: pop the front waypoint every interval and re-broadcast immediately,
    so current-waypoint/progress can be watched advancing without the real guidance stack."""
    global _waypoint_queue
    while not ws.close_code:
        await asyncio.sleep(interval_s)
        if not _waypoint_queue:
            continue
        popped = _waypoint_queue[0]
        _waypoint_queue = _waypoint_queue[1:]
        log.info(
            "auto-pop: reached waypoint %s, %d remaining",
            popped.get("id"),
            len(_waypoint_queue),
        )
        try:
            await ws.send(
                json.dumps(
                    {
                        "op": "publish",
                        "topic": "/waypoint_list",
                        "msg": {"waypoints": _waypoint_queue},
                    }
                )
            )
        except Exception:
            return


def _handle_rosapi_call(service: str, args: dict) -> tuple[dict, bool]:
    """Fake rosapi service handlers backing Feature 16's introspection commands. Returns
    (values, result) matching the call_service response shape (op=service_response)."""
    match service:
        case "/rosapi/topics":
            topics = list(TOPIC_TYPES.keys())
            return {"topics": topics, "types": [TOPIC_TYPES[t] for t in topics]}, True
        case "/rosapi/nodes":
            return {"nodes": list(FAKE_NODE_DETAILS.keys())}, True
        case "/rosapi/services":
            services = sorted({s for node in FAKE_NODE_DETAILS.values() for s in node["services"]})
            return {"services": services}, True
        case "/rosapi/node_details":
            node = args.get("node", "")
            details = FAKE_NODE_DETAILS.get(node)
            if details is None:
                return {"subscribing": [], "publishing": [], "services": []}, False
            return dict(details), True
        case "/rosapi/get_param":
            name = args.get("name", "")
            if name in FAKE_PARAMS:
                return {"value": FAKE_PARAMS[name], "successful": True, "reason": ""}, True
            return {"value": "", "successful": False, "reason": "parameter not set"}, True
        case "/rosapi/get_param_names":
            return {"names": list(FAKE_PARAMS.keys())}, True
        case _:
            return {}, False


async def _handle(ws: ServerConnection) -> None:
    log.info("client connected: %s", ws.remote_address)
    tasks: list[asyncio.Task] = []
    subscribed: set[str] = set()

    try:
        async for raw in ws:
            try:
                frame = json.loads(raw)
            except json.JSONDecodeError:
                continue

            op = frame.get("op")
            topic = frame.get("topic", "")

            if op == "subscribe" and topic not in subscribed:
                subscribed.add(topic)
                interval = INTERVALS.get(topic, 1.0)
                task = asyncio.create_task(
                    _emit_topic(ws, topic, interval, asyncio.Event()),
                    name=f"emit:{topic}",
                )
                tasks.append(task)
                log.info("subscribed: %s (%.1f s interval)", topic, interval)
                if topic == "/waypoint_list" and MOCK_AUTO_POP:
                    tasks.append(
                        asyncio.create_task(
                            _auto_pop_waypoints(ws), name="auto_pop:/waypoint_list"
                        )
                    )

            elif op == "publish":
                log.info("received publish on %s: %s", topic, frame.get("msg"))
                if topic == "/update_waypoint_list":
                    global _waypoint_queue
                    _waypoint_queue = list(frame.get("msg", {}).get("waypoints", []))
                    task = asyncio.create_task(
                        _echo_waypoint_list(ws, frame.get("msg", {})),
                        name="echo:/waypoint_list",
                    )
                    tasks.append(task)

            elif op == "call_service":
                service = frame.get("service", "")
                values, result = _handle_rosapi_call(service, frame.get("args") or {})
                log.info("call_service %s -> result=%s", service, result)
                await ws.send(
                    json.dumps(
                        {
                            "op": "service_response",
                            "id": frame.get("id", ""),
                            "service": service,
                            "values": values,
                            "result": result,
                        }
                    )
                )

    except Exception:
        pass
    finally:
        for t in tasks:
            t.cancel()
        log.info("client disconnected: %s", ws.remote_address)


async def main() -> None:
    log.info("rosbridge mock listening on ws://0.0.0.0:9090")
    async with serve(_handle, "0.0.0.0", 9090):
        await asyncio.get_running_loop().create_future()


if __name__ == "__main__":
    asyncio.run(main())
