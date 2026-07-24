import { useState, type ReactNode } from "react";
import { getSessionId } from "../session.js";
import { SessionContext } from "./useSession.js";

/** Provides a stable per-tab session id (sessionStorage-backed) to useSession(). */
export function SessionProvider({ children }: { children: ReactNode }) {
	const [sessionId] = useState(() => getSessionId());
	return <SessionContext.Provider value={sessionId}>{children}</SessionContext.Provider>;
}
