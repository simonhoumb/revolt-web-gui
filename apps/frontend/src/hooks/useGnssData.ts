import { useBridgeData } from "../context/BridgeDataContext.js";

export type FixLabel = "No fix" | "Fix" | "SBAS" | "GBAS" | "Unknown";

export interface GnssData {
	latitude: number | null;
	longitude: number | null;
	altitudeM: number | null;
	fixStatus: number | null;
	fixLabel: FixLabel;
	speedMs: number | null;
	headingDeg: number | null;
	isSimulation: boolean;
}

const FIX_LABELS: Record<number, FixLabel> = {
	[-1]: "No fix",
	[0]: "Fix",
	[1]: "SBAS",
	[2]: "GBAS",
};

export function useGnssData(): GnssData {
	const { gnssFix, gnssVelocity, bridgeStatus } = useBridgeData();

	const isSimulation = bridgeStatus?.target === "simulation";
	const fixStatus = gnssFix?.fix_status ?? null;

	return {
		latitude: gnssFix?.latitude ?? null,
		longitude: gnssFix?.longitude ?? null,
		altitudeM: gnssFix?.altitude_m ?? null,
		fixStatus,
		fixLabel: fixStatus !== null ? (FIX_LABELS[fixStatus] ?? "Unknown") : "No fix",
		speedMs: gnssVelocity?.speed ?? null,
		headingDeg:
			gnssVelocity !== null ? gnssVelocity.heading_rad * (180 / Math.PI) : null,
		isSimulation,
	};
}
