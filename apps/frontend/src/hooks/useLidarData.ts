import { useMemo } from "react";
import type { LidarScanMsg } from "@revolt/shared-types";
import { useBridgeData } from "../context/useBridgeData.js";

export interface LidarPoint {
	x: number; // metres East (X=right in vessel frame)
	y: number; // metres North (Y=up in vessel frame)
}

export interface LidarData {
	scan: LidarScanMsg | null;
	points: LidarPoint[];
}

export function useLidarData(): LidarData {
	const { lidarScan } = useBridgeData();

	const points = useMemo(() => {
		if (!lidarScan) return [];
		return lidarScan.ranges.flatMap((range, i) => {
			if (range <= lidarScan.range_min || range >= lidarScan.range_max) return [];
			const angle = lidarScan.angle_min + i * lidarScan.angle_increment;
			return [{ x: range * Math.cos(angle), y: range * Math.sin(angle) }];
		});
	}, [lidarScan]);

	return { scan: lidarScan, points };
}
