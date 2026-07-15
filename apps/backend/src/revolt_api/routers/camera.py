import asyncio

from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse

from revolt_api.bridge import RosBridgeClient, get_bridge

router = APIRouter(prefix="/api")


@router.get("/camera/{camera_id}/stream")
async def camera_stream(camera_id: str, bridge: RosBridgeClient = Depends(get_bridge)):  # noqa: B008
	async def frame_generator():
		boundary = b"--frame\r\nContent-Type: image/jpeg\r\n\r\n"
		last_counter = -1
		while True:
			counter = bridge.get_camera_frame_count(camera_id)
			if counter != last_counter:
				frame = bridge.get_camera_frame(camera_id)
				if frame:
					yield boundary + frame + b"\r\n"
					last_counter = counter
			await asyncio.sleep(
				0.033
			)  # poll at ~30 Hz; actual frame rate gated by rosbridge throttle

	return StreamingResponse(
		frame_generator(),
		media_type="multipart/x-mixed-replace; boundary=frame",
	)
