import { useEffect, useState, type ReactNode } from "react";
import { APPS, type AppDefinition, type AppId } from "../components/widgets/apps.js";
import { AppContext } from "./useApps.js";

/** Which locked/custom app is currently active, and whether the layout is locked to it. */
export interface AppContextValue {
	activeAppId: AppId;
	setActiveApp: (id: AppId) => void;
	appDef: AppDefinition;
	isLocked: boolean;
}

const ACTIVE_APP_KEY = "revolt-active-app";

function isAppId(value: unknown): value is AppId {
	return typeof value === "string" && value in APPS;
}

function loadActiveAppId(): AppId {
	try {
		const stored = localStorage.getItem(ACTIVE_APP_KEY);
		return isAppId(stored) ? stored : "custom";
	} catch {
		return "custom";
	}
}

function saveActiveAppId(id: AppId): void {
	try {
		localStorage.setItem(ACTIVE_APP_KEY, id);
	} catch {
		// localStorage unavailable, silently ignore
	}
}

/** Tracks the active app selection, persisted to localStorage. */
export function AppProvider({ children }: { children: ReactNode }) {
	const [activeAppId, setActiveAppId] = useState<AppId>(loadActiveAppId);

	useEffect(() => {
		saveActiveAppId(activeAppId);
	}, [activeAppId]);

	const appDef = APPS[activeAppId];

	return (
		<AppContext.Provider
			value={{
				activeAppId,
				setActiveApp: setActiveAppId,
				appDef,
				isLocked: appDef.kind === "locked",
			}}
		>
			{children}
		</AppContext.Provider>
	);
}
