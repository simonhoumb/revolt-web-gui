import { describe, expect, it } from "vitest";
import { rosPointsToThreeBufferPositions } from "./lidarPointCloud.js";
import type { PointCloudPoint } from "../hooks/usePointCloudData.js";

describe("rosPointsToThreeBufferPositions", () => {
	it("maps ROS x/y/z (forward/left/up) to three.js x/y/z (right/up/toward-viewer)", () => {
		const points: PointCloudPoint[] = [
			{ x: 1, y: 2, z: 3 },
			{ x: -4, y: -5, z: -6 },
		];
		const positions = rosPointsToThreeBufferPositions(points);
		expect(Array.from(positions)).toEqual([1, 3, -2, -4, -6, 5]);
	});

	it("returns an empty buffer for no points", () => {
		expect(rosPointsToThreeBufferPositions([]).length).toBe(0);
	});
});
