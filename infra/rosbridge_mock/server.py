"""Local dev rosbridge mock.

Emulates a subset of rosbridge_suite sufficient for the backend bridge client:
- Accepts subscribe frames and starts emitting fake telemetry for each subscribed topic
- Accepts publish frames (logs them, takes no further action)
- Sends realistic values at rates matching real hardware
"""

import asyncio
import base64
import io
import json
import logging
import math
import os
import random
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
    draw.ellipse([(cx - radius, cy - radius), (cx + radius, cy + radius)], outline=(30, 50, 80), width=3)

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
	"/control_mode": 1.0,
	"/fix": 1.0,
	"/vel": 1.0,
	"/heading": 0.5,
	"/camera/camera/color/image_raw/compressed": 0.2,   # 5 fps
	"/scan": 0.1,                                        # 10 Hz
}

# Emit intervals for simulation topics
INTERVALS_SIMULATION: dict[str, float] = {
	"/revolt/sim/stc/position/hull": 0.1,       # 10 Hz
	"/revolt/sim/stc/position/velocity": 0.1,
	"/revolt/sim/stc/gnss/antenna1/position": 0.5,
	"/revolt/sim/stc/gnss/antenna2/position": 0.5,
	"/revolt/sim/stc/gnss/velocity_vector": 0.5,
	"/revolt/sim/stc/imu/data": 0.05,           # 20 Hz
	"/thruster/bow": 0.1,
	"/thruster/port": 0.1,
	"/thruster/starboard": 0.1,
	"/waypoint_list": 5.0,
}

INTERVALS = INTERVALS_SIMULATION if BRIDGE_TARGET == "simulation" else INTERVALS_PHYSICAL

_start_time = time.time()

CRAB_ANGLE_RAD = math.radians(15)  # simulated cross-current/wind drift: COG diverges from heading


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
					"x": 0.0, "y": 0.0,
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
				"header": {"seq": 0, "stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "map"},
				"pose": {
					"position": {"x": round(100.0 * math.cos(angle), 3), "y": round(100.0 * math.sin(angle), 3), "z": 0.0},
					# Quaternion for yaw-only rotation: q = [0, 0, sin(yaw/2), cos(yaw/2)]
					"orientation": {"x": 0.0, "y": 0.0, "z": round(math.sin(angle / 2), 4), "w": round(math.cos(angle / 2), 4)},
				},
			}
		case "/revolt/sim/stc/position/velocity":
			speed = 1.5 + 0.5 * math.sin(t / 20)
			angle = t * 0.02
			return {
				"linear": {"x": round(speed * math.cos(angle), 3), "y": round(speed * math.sin(angle), 3), "z": 0.0},
				"angular": {"x": 0.0, "y": 0.0, "z": round(0.02 + random.gauss(0, 0.001), 4)},
			}
		case "/revolt/sim/stc/gnss/antenna1/position":
			angle = t * 0.02
			return {
				"header": {"seq": 0, "stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "map"},
				"point": {
					"x": round(59.0 + 0.001 * math.cos(angle), 6),
					"y": round(10.5 + 0.001 * math.sin(angle), 6),
					"z": round(2.0 + random.gauss(0, 0.01), 3),
				},
			}
		case "/revolt/sim/stc/gnss/antenna2/position":
			angle = t * 0.02
			return {
				"header": {"seq": 0, "stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "map"},
				"point": {
					"x": round(59.0 + 0.001 * math.cos(angle) + 0.0001, 6),
					"y": round(10.5 + 0.001 * math.sin(angle) + 0.0001, 6),
					"z": round(2.0 + random.gauss(0, 0.01), 3),
				},
			}
		case "/revolt/sim/stc/gnss/velocity_vector":
			heading_rad = (t * 0.02) % (2 * math.pi)
			return {"data": [round(1.5 + 0.5 * math.sin(t / 20), 3), round(heading_rad, 4)], "layout": {"dim": [], "data_offset": 0}}
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
			return {"data": [round(random.gauss(0, 10), 2), round(random.gauss(0, 5), 2)], "layout": {"dim": [], "data_offset": 0}}
		case "/thruster/port":
			return {"data": [round(50 + random.gauss(0, 5), 2), round(random.gauss(0, 2), 2)], "layout": {"dim": [], "data_offset": 0}}
		case "/thruster/starboard":
			return {"data": [round(50 + random.gauss(0, 5), 2), round(random.gauss(0, 2), 2)], "layout": {"dim": [], "data_offset": 0}}
		case "/waypoint_list":
			return {
				"waypoints": [
					{
						"id": 1,
						"pose": {
							"header": {"seq": 0, "stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "map"},
							"pose": {"position": {"x": 59.001, "y": 10.501, "z": 0.0}, "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
						},
						"switch_radius": 5.0,
						"desired_speed": 1.5,
						"heading_mode": 1,
						"heading": 0.0,
					},
					{
						"id": 2,
						"pose": {
							"header": {"seq": 0, "stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "map"},
							"pose": {"position": {"x": 59.002, "y": 10.502, "z": 0.0}, "orientation": {"x": 0.0, "y": 0.0, "z": 0.0, "w": 1.0}},
						},
						"switch_radius": 5.0,
						"desired_speed": 1.0,
						"heading_mode": 0,
						"heading": 0.0,
					},
				]
			}
		case "/camera/camera/color/image_raw/compressed":
			return {
				"header": {"stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "camera_color_frame"},
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
				"header": {"stamp": {"secs": int(t), "nsecs": 0}, "frame_id": "velodyne"},
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


async def _echo_waypoint_list(ws: ServerConnection, waypoint_list_msg: dict, delay_s: float = 1.0) -> None:
	"""Simulate the mission planner accepting an /update_waypoint_list publish and adopting it as
	the active list: echo the same payload back on /waypoint_list after a short delay, so the
	backend's ack/echo flow (RosBridgeClient.publish_and_await_ack) is testable without the real
	pygemini/STC stack."""
	await asyncio.sleep(delay_s)
	try:
		await ws.send(json.dumps({"op": "publish", "topic": "/waypoint_list", "msg": waypoint_list_msg}))
	except Exception:
		pass


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

			elif op == "publish":
				log.info("received publish on %s: %s", topic, frame.get("msg"))
				if topic == "/update_waypoint_list":
					task = asyncio.create_task(
						_echo_waypoint_list(ws, frame.get("msg", {})),
						name="echo:/waypoint_list",
					)
					tasks.append(task)

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
