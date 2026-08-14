import { useMemo } from "react";
import type { RadarPointCloudMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";

export interface RadarPoint {
	x: number; // metres
	y: number; // metres
	z: number; // metres
	intensity: number; // 0-255
}

export interface RadarPointsData {
	cloud: RadarPointCloudMsg | null;
	points: RadarPoint[];
	stale: boolean;
}

/**
 * Latest Cartesian radar point cloud (/radar/points), unpacked into x/y/z/intensity points.
 *
 * An alternative to useRadarData's polar spoke accumulation, kept alongside it while the two
 * topics are evaluated against each other -- not RadarWidget's data source yet.
 */
export function useRadarPointsData(): RadarPointsData {
	useLiveTick();
	const { radarPointCloud } = useBridgeData();

	const points = useMemo(() => {
		if (!radarPointCloud) return [];
		const out: RadarPoint[] = [];
		for (let i = 0; i + 3 < radarPointCloud.points.length; i += 4) {
			const x = radarPointCloud.points[i];
			const y = radarPointCloud.points[i + 1];
			const z = radarPointCloud.points[i + 2];
			const intensity = radarPointCloud.points[i + 3];
			if (x === undefined || y === undefined || z === undefined || intensity === undefined) {
				continue;
			}
			out.push({ x, y, z, intensity });
		}
		return out;
	}, [radarPointCloud]);

	return {
		cloud: radarPointCloud,
		points,
		stale: isStale(radarPointCloud?.timestamp_ms, Date.now()),
	};
}
