import { act, cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { NavigationMenu } from "./NavigationMenu.js";
import { useApps } from "../../context/useApps.js";
import { useLayout } from "../../context/useLayout.js";
import { ALL_APP_IDS, APPS } from "../widgets/apps.js";

vi.mock("../../context/useApps.js", () => ({
	useApps: vi.fn(),
}));
vi.mock("../../context/useLayout.js", () => ({
	useLayout: vi.fn(),
}));

const mockUseApps = useApps as Mock;
const mockUseLayout = useLayout as Mock;

const setActiveApp = vi.fn();
const setEditMode = vi.fn();

function setApp(overrides: Partial<ReturnType<typeof useApps>> = {}) {
	mockUseApps.mockReturnValue({
		activeAppId: "custom",
		appDef: APPS.custom,
		isLocked: false,
		setActiveApp,
		...overrides,
	});
}

function setLayout(overrides: Partial<ReturnType<typeof useLayout>> = {}) {
	mockUseLayout.mockReturnValue({
		editMode: false,
		setEditMode,
		...overrides,
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("NavigationMenu", () => {
	it("lists every app", () => {
		setApp();
		setLayout();
		render(<NavigationMenu onClose={vi.fn()} />);
		expect(document.querySelectorAll("obc-navigation-item")).toHaveLength(ALL_APP_IDS.length);
	});

	it("marks the active app's item as checked", () => {
		setApp({ activeAppId: "mission" });
		setLayout();
		render(<NavigationMenu onClose={vi.fn()} />);
		const items = document.querySelectorAll("obc-navigation-item") as NodeListOf<
			HTMLElement & { checked: boolean; label: string }
		>;
		const missionItem = [...items].find((item) => item.label === APPS.mission.label);
		expect(missionItem?.checked).toBe(true);
		const otherItem = [...items].find((item) => item.label === APPS.conning.label);
		expect(otherItem?.checked).toBe(false);
	});

	it("selecting an app calls setActiveApp with its id, and closes the menu", () => {
		const onClose = vi.fn();
		setApp();
		setLayout();
		render(<NavigationMenu onClose={onClose} />);
		const items = document.querySelectorAll("obc-navigation-item") as NodeListOf<
			HTMLElement & { label: string }
		>;
		const conningItem = [...items].find((item) => item.label === APPS.conning.label);

		act(() => {
			conningItem?.click();
		});
		expect(setActiveApp).toHaveBeenCalledWith("conning");
		expect(onClose).toHaveBeenCalledOnce();
	});

	it("forces edit mode off when selecting a locked app while editing", () => {
		setApp();
		setLayout({ editMode: true });
		render(<NavigationMenu onClose={vi.fn()} />);
		const items = document.querySelectorAll("obc-navigation-item") as NodeListOf<
			HTMLElement & { label: string }
		>;
		const conningItem = [...items].find((item) => item.label === APPS.conning.label);

		act(() => {
			conningItem?.click();
		});
		expect(setEditMode).toHaveBeenCalledWith(false);
	});

	it("does not touch edit mode when selecting the customizable dashboard app", () => {
		setApp({ activeAppId: "conning" });
		setLayout({ editMode: true });
		render(<NavigationMenu onClose={vi.fn()} />);
		const items = document.querySelectorAll("obc-navigation-item") as NodeListOf<
			HTMLElement & { label: string }
		>;
		const customItem = [...items].find((item) => item.label === APPS.custom.label);

		act(() => {
			customItem?.click();
		});
		expect(setEditMode).not.toHaveBeenCalled();
		expect(setActiveApp).toHaveBeenCalledWith("custom");
	});
});
