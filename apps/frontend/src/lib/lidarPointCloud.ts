import type { PointCloudPoint } from "../hooks/usePointCloudData.js";

/**
 * Converts ROS convention (x=forward, y=left, z=up) to three.js convention (x=right, y=up,
 * z=toward viewer) and flattens into an interleaved buffer: x_three=x_ros, y_three=z_ros,
 * z_three=-y_ros. Used by Lidar3DScene to feed a three.js BufferAttribute.
 */
export function rosPointsToThreeBufferPositions(points: PointCloudPoint[]): Float32Array {
	const arr = new Float32Array(points.length * 3);
	points.forEach((p, i) => {
		arr[i * 3] = p.x;
		arr[i * 3 + 1] = p.z;
		arr[i * 3 + 2] = -p.y;
	});
	return arr;
}
