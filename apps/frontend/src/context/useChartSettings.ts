import { createContext, useContext } from "react";
import type { ChartSettingsContextValue } from "./ChartSettingsContext.js";

export const ChartSettingsContext = createContext<ChartSettingsContextValue | null>(null);

export function useChartSettings(): ChartSettingsContextValue {
	const ctx = useContext(ChartSettingsContext);
	if (!ctx) throw new Error("useChartSettings must be used within ChartSettingsProvider");
	return ctx;
}
