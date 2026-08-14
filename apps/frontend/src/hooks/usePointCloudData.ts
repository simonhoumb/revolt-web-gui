import { useMemo } from "react";
import type { PointCloudMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";

export interface PointCloudPoint {
	x: number; // metres, ROS convention: forward
	y: number; // metres, ROS convention: left
	z: number; // metres, ROS convention: up
}

export interface PointCloudData {
	cloud: PointCloudMsg | null;
	points: PointCloudPoint[];
	stale: boolean;
}

/** Latest decimated Velodyne point cloud (all 16 rings), unpacked into x/y/z points. */
export function usePointCloudData(): PointCloudData {
	useLiveTick();
	const { pointCloud } = useBridgeData();

	const points = useMemo(() => {
		if (!pointCloud) return [];
		const out: PointCloudPoint[] = [];
		for (let i = 0; i + 2 < pointCloud.points.length; i += 3) {
			const x = pointCloud.points[i];
			const y = pointCloud.points[i + 1];
			const z = pointCloud.points[i + 2];
			if (x === undefined || y === undefined || z === undefined) continue;
			out.push({ x, y, z });
		}
		return out;
	}, [pointCloud]);

	return { cloud: pointCloud, points, stale: isStale(pointCloud?.timestamp_ms, Date.now()) };
}
