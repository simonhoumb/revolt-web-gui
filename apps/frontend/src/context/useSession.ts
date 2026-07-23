import { createContext, useContext } from "react";

export const SessionContext = createContext<string | null>(null);

export function useSession(): string {
	const id = useContext(SessionContext);
	if (!id) throw new Error("useSession must be used within SessionProvider");
	return id;
}
