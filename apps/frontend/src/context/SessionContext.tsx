import { useState, type ReactNode } from "react";
import { getSessionId } from "../session.js";
import { SessionContext } from "./useSession.js";

export function SessionProvider({ children }: { children: ReactNode }) {
	const [sessionId] = useState(() => getSessionId());
	return <SessionContext.Provider value={sessionId}>{children}</SessionContext.Provider>;
}
