import { useBridgeData } from "../context/useBridgeData.js";

export type FixLabel = "No fix" | "Fix" | "SBAS" | "GBAS" | "Unknown";

export interface GnssData {
	latitude: number | null;
	longitude: number | null;
	altitudeM: number | null;
	fixStatus: number | null;
	fixLabel: FixLabel;
	speedMs: number | null;
	headingDeg: number | null;
	courseDeg: number | null;
	isSimulation: boolean;
}

const FIX_LABELS: Record<number, FixLabel> = {
	[-1]: "No fix",
	[0]: "Fix",
	[1]: "SBAS",
	[2]: "GBAS",
};

/** GNSS position, heading, and speed, from the physical compass or the simulation's own feed. */
export function useGnssData(): GnssData {
	const { gnssFix, gnssHeading, gnssVelocity, gnssVelocityPhysical, bridgeStatus } =
		useBridgeData();

	const isSimulation = bridgeStatus?.target === "simulation";
	const fixStatus = gnssFix?.fix_status ?? null;
	const headingDeg =
		gnssHeading?.heading_deg ??
		(gnssVelocity !== null ? gnssVelocity.heading_rad * (180 / Math.PI) : null);

	return {
		latitude: gnssFix?.latitude ?? null,
		longitude: gnssFix?.longitude ?? null,
		altitudeM: gnssFix?.altitude_m ?? null,
		fixStatus,
		fixLabel: fixStatus !== null ? (FIX_LABELS[fixStatus] ?? "Unknown") : "No fix",
		speedMs: gnssVelocityPhysical?.speed_ms ?? gnssVelocity?.speed ?? null,
		headingDeg,
		// Course over ground (COG) vs. true heading only differ on the physical
		// vessel (GnssVelocityMsg.course_deg vs GnssHeadingMsg.heading_deg,
		// e.g. under drift/crab); the simulation contract has no separate COG
		// field, so fall back to heading there.
		courseDeg: gnssVelocityPhysical?.course_deg ?? headingDeg,
		isSimulation,
	};
}
