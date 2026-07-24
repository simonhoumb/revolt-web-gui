import { useBridgeData } from "../context/useBridgeData.js";

export interface LightBeaconData {
	red: boolean;
	yellow: boolean;
	green: boolean;
}

/** Stern light beacon red/yellow/green lamp state. */
export function useLightBeaconData(): LightBeaconData {
	const { lightBeacon } = useBridgeData();

	return {
		red: lightBeacon?.red ?? false,
		yellow: lightBeacon?.yellow ?? false,
		green: lightBeacon?.green ?? false,
	};
}
