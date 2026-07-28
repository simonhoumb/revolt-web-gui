import { useBridgeData } from "../context/useBridgeData.js";
import { useLiveTick } from "./useLiveTick.js";
import { isStale } from "../lib/staleness.js";

export interface LightBeaconData {
	red: boolean;
	yellow: boolean;
	green: boolean;
	stale: boolean;
}

/** Stern light beacon red/yellow/green lamp state. */
export function useLightBeaconData(): LightBeaconData {
	useLiveTick();
	const { lightBeacon } = useBridgeData();

	return {
		red: lightBeacon?.red ?? false,
		yellow: lightBeacon?.yellow ?? false,
		green: lightBeacon?.green ?? false,
		stale: isStale(lightBeacon?.timestamp_ms, Date.now()),
	};
}
