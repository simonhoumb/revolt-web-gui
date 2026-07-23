import { useBridgeData } from "../context/useBridgeData.js";

export interface LightBeaconData {
	red: boolean;
	yellow: boolean;
	green: boolean;
}

export function useLightBeaconData(): LightBeaconData {
	const { lightBeacon } = useBridgeData();

	return {
		red: lightBeacon?.red ?? false,
		yellow: lightBeacon?.yellow ?? false,
		green: lightBeacon?.green ?? false,
	};
}
