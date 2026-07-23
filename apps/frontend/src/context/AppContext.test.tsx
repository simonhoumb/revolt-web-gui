import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AppProvider } from "./AppContext.js";
import { useApps } from "./useApps.js";

const ACTIVE_APP_KEY = "revolt-active-app";

beforeEach(() => {
	localStorage.clear();
});

afterEach(() => {
	localStorage.clear();
});

function renderApps() {
	return renderHook(() => useApps(), { wrapper: AppProvider });
}

describe("AppProvider", () => {
	it("defaults to the custom app when nothing is stored", () => {
		const { result } = renderApps();
		expect(result.current.activeAppId).toBe("custom");
		expect(result.current.isLocked).toBe(false);
	});

	it("falls back to the custom app when the stored value is not a known app id", () => {
		localStorage.setItem(ACTIVE_APP_KEY, "not-a-real-app");
		const { result } = renderApps();
		expect(result.current.activeAppId).toBe("custom");
	});

	it("loads a previously stored active app", () => {
		localStorage.setItem(ACTIVE_APP_KEY, "conning");
		const { result } = renderApps();
		expect(result.current.activeAppId).toBe("conning");
		expect(result.current.isLocked).toBe(true);
	});

	it("setActiveApp updates state, isLocked, appDef, and persists to localStorage", () => {
		const { result } = renderApps();
		act(() => {
			result.current.setActiveApp("mission");
		});
		expect(result.current.activeAppId).toBe("mission");
		expect(result.current.isLocked).toBe(true);
		expect(result.current.appDef.id).toBe("mission");
		expect(localStorage.getItem(ACTIVE_APP_KEY)).toBe("mission");
	});

	it("useApps throws when used outside an AppProvider", () => {
		expect(() => renderHook(() => useApps())).toThrow(
			"useApps must be used within AppProvider",
		);
	});
});
