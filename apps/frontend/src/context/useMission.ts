import { createContext, useContext } from "react";
import type { MissionContextValue } from "./MissionContext.js";

export const MissionContext = createContext<MissionContextValue | null>(null);

export function useMission(): MissionContextValue {
	const ctx = useContext(MissionContext);
	if (!ctx) throw new Error("useMission must be used within MissionProvider");
	return ctx;
}
