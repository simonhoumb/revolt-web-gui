import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { TopNav } from "./TopNav.js";
import { useVesselHealth } from "../../hooks/useVesselHealth.js";
import { useBatteryData } from "../../hooks/useBatteryData.js";
import { useLayout } from "../../context/useLayout.js";
import { useApps } from "../../context/useApps.js";
import { useChartSettings } from "../../context/useChartSettings.js";
import { APPS } from "../widgets/apps.js";
import { useMinuteUpdate } from "../../hooks/useMinuteUpdate.js";

vi.mock("../../hooks/useVesselHealth.js", () => ({
	useVesselHealth: vi.fn(),
}));
vi.mock("../../hooks/useBatteryData.js", () => ({
	useBatteryData: vi.fn(),
}));
vi.mock("../../context/useLayout.js", () => ({
	useLayout: vi.fn(),
}));
vi.mock("../../context/useApps.js", () => ({
	useApps: vi.fn(),
}));
vi.mock("../../context/useChartSettings.js", () => ({
	useChartSettings: vi.fn(),
}));
vi.mock("../../hooks/useMinuteUpdate.js", () => ({
	useMinuteUpdate: vi.fn(),
}));

const mockUseVesselHealth = useVesselHealth as Mock;
const mockUseBatteryData = useBatteryData as Mock;
const mockUseLayout = useLayout as Mock;
const mockUseApps = useApps as Mock;
const mockUseChartSettings = useChartSettings as Mock;
const mockUseMinuteUpdate = useMinuteUpdate as Mock;

const toggleEditMode = vi.fn();
const setEditMode = vi.fn();
const setActiveApp = vi.fn();
const setPalette = vi.fn();
const setBrightness = vi.fn();

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
	mockUseBatteryData.mockReturnValue({
		voltageV: 12.6,
		voltagePercent: 80,
		voltageStatus: "normal",
		current: {
			stern_port: { amperes: null, isOn: false },
			stern_star: { amperes: null, isOn: false },
			bow: { amperes: null, isOn: false },
		},
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
		setEditMode,
	});
	mockUseApps.mockReturnValue({
		activeAppId: "custom",
		appDef: APPS.custom,
		isLocked: false,
		setActiveApp,
	});
	mockUseChartSettings.mockReturnValue({
		palette: "dusk",
		setPalette,
		symbolStyle: "simplified",
		setSymbolStyle: vi.fn(),
		safetyContourM: 3,
		setSafetyContourM: vi.fn(),
		brightness: 50,
		setBrightness,
	});
	mockUseMinuteUpdate.mockReturnValue("2026-07-15T00:00:00.000Z");
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("TopNav", () => {
	it("syncs the data-obc-theme attribute from the chart settings palette", () => {
		setDefaults();
		document.documentElement.removeAttribute("data-obc-theme");
		render(<TopNav />);
		expect(document.documentElement.getAttribute("data-obc-theme")).toBe("dusk");
	});

	it("opens the brilliance panel on the dimming button click, and closes it again on a second click", () => {
		setDefaults();
		render(<TopNav />);

		expect(document.querySelector("obc-brilliance-menu")).toBeNull();
		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("dimming-button-clicked"));
		});
		expect(document.querySelector("obc-brilliance-menu")).not.toBeNull();

		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("dimming-button-clicked"));
		});
		expect(document.querySelector("obc-brilliance-menu")).toBeNull();
	});

	it("changing the brilliance panel's palette updates the chart settings, which the data-obc-theme sync effect then applies", () => {
		setDefaults();
		render(<TopNav />);
		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("dimming-button-clicked"));
		});

		act(() => {
			document
				.querySelector("obc-brilliance-menu")
				?.dispatchEvent(new CustomEvent("palette-changed", { detail: { value: "night" } }));
		});
		expect(setPalette).toHaveBeenCalledWith("night");
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

	it("opens the navigation menu on the top bar's menu button click, and closes it again on a second click", () => {
		setDefaults();
		render(<TopNav />);

		expect(document.querySelector("obc-navigation-menu")).toBeNull();
		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("menu-button-clicked"));
		});
		expect(document.querySelector("obc-navigation-menu")).not.toBeNull();

		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("menu-button-clicked"));
		});
		expect(document.querySelector("obc-navigation-menu")).toBeNull();
	});

	it("opening the navigation menu closes an already-open widget picker, and vice versa", () => {
		setDefaults();
		render(<TopNav />);

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-app-menu")).not.toBeNull();

		act(() => {
			document
				.querySelector("obc-top-bar")
				?.dispatchEvent(new CustomEvent("menu-button-clicked"));
		});
		expect(document.querySelector("obc-app-menu")).toBeNull();
		expect(document.querySelector("obc-navigation-menu")).not.toBeNull();
	});

	it("hides the widget picker button when a locked app is active", () => {
		setDefaults();
		mockUseApps.mockReturnValue({
			activeAppId: "conning",
			appDef: APPS.conning,
			isLocked: true,
			setActiveApp,
		});
		render(<TopNav />);
		expect(screen.queryByLabelText("Dashboard widgets")).not.toBeInTheDocument();
	});

	it("renders the system button with wifi and battery state derived from vessel health and battery data", () => {
		setDefaults();
		render(<TopNav />);
		const systemButton = document.querySelector("obc-system-button") as HTMLElement & {
			systemState: { wifi: { connected: boolean }; battery: { level: number } };
		};
		expect(systemButton).not.toBeNull();
		expect(systemButton.systemState.wifi.connected).toBe(true);
		expect(systemButton.systemState.battery.level).toBe(80);
	});

	it("shows the wifi icon as disconnected (not misleadingly good) when the socket is up but the ROS bridge is not, and surfaces the distinction in the system menu instead", () => {
		setDefaults();
		mockUseVesselHealth.mockReturnValue({
			wsConnected: true,
			bridgeConnected: false,
			latencyMs: 10,
			emergencyStopActive: false,
			alerts: [],
			alertCount: 0,
			highestAlertLevel: null,
		});
		render(<TopNav />);
		const systemButton = document.querySelector("obc-system-button") as HTMLElement & {
			systemState: { wifi: { connected: boolean; strength: number } };
		};
		expect(systemButton.systemState.wifi.connected).toBe(false);
		expect(systemButton.systemState.wifi.strength).toBe(0);

		act(() => {
			systemButton.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		const systemMenu = document.querySelector("obc-system-menu") as unknown as {
			wifiState: { networkName: string };
		} | null;
		expect(systemMenu?.wifiState.networkName).toBe("WebSocket connected, ROS Bridge offline");
	});

	it("states both the WebSocket and ROS Bridge are connected in the system menu status when they are", () => {
		setDefaults();
		render(<TopNav />);
		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		const systemMenu = document.querySelector("obc-system-menu") as unknown as {
			wifiState: { networkName: string };
		} | null;
		expect(systemMenu?.wifiState.networkName).toBe("WebSocket and ROS Bridge connected");
	});

	it("states the WebSocket is disconnected in the system menu status when the socket itself is down", () => {
		setDefaults();
		mockUseVesselHealth.mockReturnValue({
			wsConnected: false,
			bridgeConnected: false,
			latencyMs: null,
			emergencyStopActive: false,
			alerts: [],
			alertCount: 0,
			highestAlertLevel: null,
		});
		render(<TopNav />);
		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		const systemMenu = document.querySelector("obc-system-menu") as unknown as {
			wifiState: { networkName: string };
		} | null;
		expect(systemMenu?.wifiState.networkName).toBe("WebSocket disconnected");
	});

	it("rounds the battery level shown on the system button and system menu", () => {
		setDefaults();
		mockUseBatteryData.mockReturnValue({
			voltageV: 12.6,
			voltagePercent: 63.4782,
			voltageStatus: "normal",
			current: {
				stern_port: { amperes: null, isOn: false },
				stern_star: { amperes: null, isOn: false },
				bow: { amperes: null, isOn: false },
			},
		});
		render(<TopNav />);
		const systemButton = document.querySelector("obc-system-button") as HTMLElement & {
			systemState: { battery: { level: number } };
		};
		expect(systemButton.systemState.battery.level).toBe(63);

		act(() => {
			systemButton.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		const systemMenu = document.querySelector("obc-system-menu") as unknown as {
			batteryState: { level: number };
		} | null;
		expect(systemMenu?.batteryState.level).toBe(63);
	});

	it("renders the latency badge, falling back to a placeholder when latency is unknown", () => {
		setDefaults();
		const { rerender } = render(<TopNav />);
		expect(screen.getByText("10 ms")).toBeInTheDocument();

		mockUseVesselHealth.mockReturnValue({
			wsConnected: false,
			bridgeConnected: false,
			latencyMs: null,
			emergencyStopActive: false,
			alerts: [],
			alertCount: 0,
			highestAlertLevel: null,
		});
		rerender(<TopNav />);
		expect(screen.getByText("— ms")).toBeInTheDocument();
	});

	it("opens the system menu when the system button reports it opened, and closes it on a second toggle", () => {
		setDefaults();
		render(<TopNav />);

		expect(document.querySelector("obc-system-menu")).toBeNull();
		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		expect(document.querySelector("obc-system-menu")).not.toBeNull();

		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: false } }));
		});
		expect(document.querySelector("obc-system-menu")).toBeNull();
	});

	it("opening the system menu closes an already-open widget picker, and vice versa", () => {
		setDefaults();
		render(<TopNav />);

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-app-menu")).not.toBeNull();

		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		expect(document.querySelector("obc-app-menu")).toBeNull();
		expect(document.querySelector("obc-system-menu")).not.toBeNull();

		act(() => {
			screen.getByLabelText("Dashboard widgets").click();
		});
		expect(document.querySelector("obc-system-menu")).toBeNull();
		expect(document.querySelector("obc-app-menu")).not.toBeNull();
	});

	it("closes the system menu on an outside click", () => {
		setDefaults();
		render(<TopNav />);

		act(() => {
			document
				.querySelector("obc-system-button")
				?.dispatchEvent(new CustomEvent("menu-toggle", { detail: { open: true } }));
		});
		expect(document.querySelector("obc-system-menu")).not.toBeNull();

		act(() => {
			document.body.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
		});
		expect(document.querySelector("obc-system-menu")).toBeNull();
	});
});
