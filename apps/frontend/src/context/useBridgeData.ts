import { createContext, useContext } from "react";
import type { BridgeData } from "./bridgeDataReducer.js";

export const BridgeDataContext = createContext<BridgeData | null>(null);

export function useBridgeData(): BridgeData {
	const ctx = useContext(BridgeDataContext);
	if (ctx === null) {
		throw new Error("useBridgeData must be used within BridgeDataProvider");
	}
	return ctx;
}
