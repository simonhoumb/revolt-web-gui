import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { HazardSummary } from "@revolt/shared-types";
import { useMission } from "./MissionContext.js";

interface LegHazardsContextValue {
	// Keyed by waypoint id (the leg ending at that waypoint). Written by MapWidget's client-side
	// ENC check (useWaypointMarkers); empty until that first evaluation lands.
	legValidation: Record<string, HazardSummary>;
	setLegValidation: (result: Record<string, HazardSummary>) => void;
}

const LegHazardsContext = createContext<LegHazardsContextValue | null>(null);

/**
 * Owns the client-side (Phase 1) ENC hazard-check results, keyed by leg. Separate from
 * MissionContext so that "which mission is selected / its CRUD" and "what did the last hazard
 * evaluation for its route find" are two independently-changing pieces of state, not one context
 * that changes for both reasons. Must be rendered inside MissionProvider -- it reads
 * activeMissionId to know when to clear a stale result.
 */
export function LegHazardsProvider({ children }: { children: ReactNode }) {
	const { activeMissionId } = useMission();
	const [legValidation, setLegValidation] = useState<Record<string, HazardSummary>>({});

	// A hazard evaluation describes a specific route; switching to a different mission (or to
	// none) makes any prior result stale, so clear it rather than briefly showing the previous
	// mission's hazards against the newly selected one's waypoints.
	useEffect(() => {
		setLegValidation({});
	}, [activeMissionId]);

	return (
		<LegHazardsContext.Provider value={{ legValidation, setLegValidation }}>
			{children}
		</LegHazardsContext.Provider>
	);
}

export function useLegHazards(): LegHazardsContextValue {
	const ctx = useContext(LegHazardsContext);
	if (!ctx) throw new Error("useLegHazards must be used within LegHazardsProvider");
	return ctx;
}
