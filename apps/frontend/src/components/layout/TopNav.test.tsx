import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { TopNav } from "./TopNav.js";
import { useVesselHealth } from "../../hooks/useVesselHealth.js";
import { useLayout } from "../../context/LayoutContext.js";
import { useMinuteUpdate } from "../../hooks/useMinuteUpdate.js";

vi.mock("../../hooks/useVesselHealth.js", () => ({
	useVesselHealth: vi.fn(),
}));
vi.mock("../../context/LayoutContext.js", () => ({
	useLayout: vi.fn(),
}));
vi.mock("../../hooks/useMinuteUpdate.js", () => ({
	useMinuteUpdate: vi.fn(),
}));

const mockUseVesselHealth = useVesselHealth as Mock;
const mockUseLayout = useLayout as Mock;
const mockUseMinuteUpdate = useMinuteUpdate as Mock;

const toggleEditMode = vi.fn();

function setDefaults() {
	mockUseVesselHealth.mockReturnValue({
		wsConnected: true,
		bridgeConnected: true,
		latencyMs: 10,
		emergencyStopActive: false,
		alerts: [],
		alertCount: 0,
		highestAlertLevel: null,
	});
	mockUseLayout.mockReturnValue({
		config: { tiles: [], hiddenWidgets: [] },
		updateLayout: vi.fn(),
		addWidget: vi.fn(),
		removeWidget: vi.fn(),
		resetLayout: vi.fn(),
		templates: [],
		saveTemplate: vi.fn(),
		loadTemplate: vi.fn(),
		deleteTemplate: vi.fn(),
		editMode: false,
		toggleEditMode,
	});
	mockUseMinuteUpdate.mockReturnValue("2026-07-15T00:00:00.000Z");
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("TopNav", () => {
	it("toggles the theme attribute on the document root and the dimming button state", () => {
		setDefaults();
		document.documentElement.removeAttribute("data-obc-theme");
		render(<TopNav />);

		const dimButton = document.querySelector("obc-top-bar") as HTMLElement & {
			dimmingButtonActivated: boolean;
		};
		expect(dimButton.dimmingButtonActivated).toBe(true);

		act(() => {
			dimButton.dispatchEvent(new CustomEvent("dimming-button-clicked"));
		});
		expect(document.documentElement.getAttribute("data-obc-theme")).toBe("day");
	});

	it("opens the widget picker on click, and closes it again on a second click", () => {
		setDefaults();
		render(<TopNav />);

		expect(document.querySelector("obc-app-menu")).toBeNull();
		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-app-menu")).not.toBeNull();

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-app-menu")).toBeNull();
	});

	it("opening the widget picker closes an already-open alert menu, and vice versa", () => {
		setDefaults();
		mockUseVesselHealth.mockReturnValue({
			wsConnected: true,
			bridgeConnected: true,
			latencyMs: 10,
			emergencyStopActive: false,
			alerts: [{ id: "a", title: "t", description: "d", level: "warning" }],
			alertCount: 1,
			highestAlertLevel: "warning",
		});
		render(<TopNav />);

		// ObcAlertButton fires "click-alert" (mapped from its onClickAlert prop by the @lit/react
		// wrapper), not a plain DOM click on an aria-labeled element -- same event-dispatch
		// pattern already validated for obc-title-container's action-click.
		act(() => {
			document
				.querySelector("obc-alert-button")
				?.dispatchEvent(new CustomEvent("click-alert"));
		});
		expect(document.querySelector("obc-alert-menu")).not.toBeNull();

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-alert-menu")).toBeNull();
		expect(document.querySelector("obc-app-menu")).not.toBeNull();
	});

	it("closes any open menu on an outside click", () => {
		setDefaults();
		render(<TopNav />);

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-app-menu")).not.toBeNull();

		act(() => {
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		expect(document.querySelector("obc-app-menu")).toBeNull();
	});
});
