import { createContext, useContext } from "react";
import type { LayoutContextValue } from "./LayoutContext.js";

export const LayoutContext = createContext<LayoutContextValue | null>(null);

export function useLayout(): LayoutContextValue {
	const ctx = useContext(LayoutContext);
	if (!ctx) throw new Error("useLayout must be used within LayoutProvider");
	return ctx;
}
