import { useCallback, useMemo, useReducer, type ReactNode } from "react";
import type { BridgeMessage } from "@revolt/shared-types";
import { useBridgeConnection } from "../hooks/useBridgeConnection.js";
import { initialData, bridgeDataReducer } from "./bridgeDataReducer.js";
import { BridgeDataContext } from "./useBridgeData.js";

export function BridgeDataProvider({ children }: { children: ReactNode }) {
	const [data, dispatch] = useReducer(bridgeDataReducer, initialData);

	const handleMessage = useCallback((msg: BridgeMessage) => {
		dispatch(msg);
	}, []);

	const { wsConnected, bridgeConnected, latencyMs } = useBridgeConnection({
		onMessage: handleMessage,
	});

	const value = useMemo(
		() => ({ ...data, wsConnected, bridgeConnected, latencyMs }),
		[data, wsConnected, bridgeConnected, latencyMs],
	);

	return <BridgeDataContext.Provider value={value}>{children}</BridgeDataContext.Provider>;
}
