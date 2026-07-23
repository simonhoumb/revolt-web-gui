import { createContext, useContext } from "react";
import type { LegHazardsContextValue } from "./LegHazardsContext.js";

export const LegHazardsContext = createContext<LegHazardsContextValue | null>(null);

export function useLegHazards(): LegHazardsContextValue {
	const ctx = useContext(LegHazardsContext);
	if (!ctx) throw new Error("useLegHazards must be used within LegHazardsProvider");
	return ctx;
}
