import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ImuWidget } from "./ImuWidget.js";
import { useImuData, type ImuData } from "../../hooks/useImuData.js";
import { useApps } from "../../context/AppContext.js";
import { APPS } from "./apps.js";

vi.mock("../../hooks/useImuData.js", () => ({
	useImuData: vi.fn(),
}));
vi.mock("../../context/AppContext.js", () => ({
	useApps: vi.fn(),
}));

const mockUseImuData = useImuData as Mock;
const mockUseApps = useApps as Mock;

function makeImuData(overrides: Partial<ImuData> = {}): ImuData {
	return {
		rollDeg: null,
		pitchDeg: null,
		yawDeg: null,
		accelX: null,
		accelY: null,
		accelZ: null,
		angVelX: null,
		angVelY: null,
		angVelZ: null,
		...overrides,
	};
}

function setApp(activeAppId: keyof typeof APPS = "custom") {
	mockUseApps.mockReturnValue({
		activeAppId,
		appDef: APPS[activeAppId],
		isLocked: activeAppId !== "custom",
		setActiveApp: vi.fn(),
	});
}

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ImuWidget", () => {
	it("shows 'No data' when there is no roll reading, and 'Live' once there is", () => {
		setApp();
		mockUseImuData.mockReturnValue(makeImuData());
		const { rerender } = render(<ImuWidget />);
		expect(screen.getByText("No data")).toBeInTheDocument();

		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 1.2 }));
		rerender(<ImuWidget />);
		expect(screen.getByText("Live")).toBeInTheDocument();
	});

	it("shows roll/pitch/yaw and accel values to their expected precision in detailed view", () => {
		setApp();
		mockUseImuData.mockReturnValue(
			makeImuData({
				rollDeg: 1.234,
				pitchDeg: -2.5,
				yawDeg: 90,
				accelX: 0.111,
				accelY: -9.81,
				accelZ: 0.0,
			}),
		);
		render(<ImuWidget />);
		expect(screen.getByText("1.2°")).toBeInTheDocument();
		expect(screen.getByText("-2.5°")).toBeInTheDocument();
		expect(screen.getByText("90.0°")).toBeInTheDocument();
		expect(screen.getByText("0.11 m/s²")).toBeInTheDocument();
		expect(screen.getByText("-9.81 m/s²")).toBeInTheDocument();
		expect(screen.getByText("0.00 m/s²")).toBeInTheDocument();
	});

	it("defaults to detailed view outside the Conning app, and instrument view inside it", () => {
		setApp("custom");
		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 5, pitchDeg: -3 }));
		render(<ImuWidget />);
		expect(screen.getByText("5.0°")).toBeInTheDocument();
		expect(document.querySelector("obc-pitch-roll")).toBeNull();
		cleanup();

		setApp("conning");
		render(<ImuWidget />);
		expect(screen.queryByText("5.0°")).not.toBeInTheDocument();
		expect(document.querySelector("obc-pitch-roll")).not.toBeNull();
	});

	it("maps pitch/roll onto obc-pitch-roll in instrument view, and keeps accel visible in both views", () => {
		setApp("custom");
		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 12, pitchDeg: -6, accelX: 1.5 }));
		render(<ImuWidget />);
		expect(screen.getByText("1.50 m/s²")).toBeInTheDocument();

		act(() => {
			document.querySelector("obc-toggle-button-group")?.dispatchEvent(
				new CustomEvent("value", {
					detail: { value: "instrument", previousValue: "detailed" },
				}),
			);
		});

		const pitchRoll = document.querySelector("obc-pitch-roll") as HTMLElement & {
			pitch: number;
			roll: number;
		};
		expect(pitchRoll.pitch).toBe(-6);
		expect(pitchRoll.roll).toBe(12);
		expect(screen.getByText("1.50 m/s²")).toBeInTheDocument();
		expect(screen.queryByText("12.0°")).not.toBeInTheDocument();
	});
});
