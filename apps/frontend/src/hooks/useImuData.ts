import { useBridgeData } from "../context/BridgeDataContext.js";

export interface ImuData {
	rollDeg: number | null;
	pitchDeg: number | null;
	yawDeg: number | null;
	accelX: number | null;
	accelY: number | null;
	accelZ: number | null;
	angVelX: number | null;
	angVelY: number | null;
	angVelZ: number | null;
}

export function useImuData(): ImuData {
	const { imu } = useBridgeData();

	return {
		rollDeg: imu?.roll_deg ?? null,
		pitchDeg: imu?.pitch_deg ?? null,
		yawDeg: imu?.yaw_deg ?? null,
		accelX: imu?.accel_x ?? null,
		accelY: imu?.accel_y ?? null,
		accelZ: imu?.accel_z ?? null,
		angVelX: imu?.ang_vel_x ?? null,
		angVelY: imu?.ang_vel_y ?? null,
		angVelZ: imu?.ang_vel_z ?? null,
	};
}
