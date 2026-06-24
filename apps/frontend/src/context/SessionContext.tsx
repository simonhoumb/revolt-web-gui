import { createContext, useContext, useState, type ReactNode } from "react";
import { getSessionId } from "../session.js";

const SessionContext = createContext<string | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
	const [sessionId] = useState(() => getSessionId());
	return <SessionContext.Provider value={sessionId}>{children}</SessionContext.Provider>;
}

export function useSession(): string {
	const id = useContext(SessionContext);
	if (!id) throw new Error("useSession must be used within SessionProvider");
	return id;
}
