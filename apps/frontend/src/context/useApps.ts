import { createContext, useContext } from "react";
import type { AppContextValue } from "./AppContext.js";

export const AppContext = createContext<AppContextValue | null>(null);

export function useApps(): AppContextValue {
	const ctx = useContext(AppContext);
	if (!ctx) throw new Error("useApps must be used within AppProvider");
	return ctx;
}
