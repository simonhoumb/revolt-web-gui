import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ImuWidget } from "./ImuWidget.js";
import { useImuData, type ImuData } from "../../hooks/useImuData.js";

vi.mock("../../hooks/useImuData.js", () => ({
	useImuData: vi.fn(),
}));

const mockUseImuData = useImuData as Mock;

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

afterEach(() => {
	cleanup();
	vi.clearAllMocks();
});

describe("ImuWidget", () => {
	it("shows 'No data' when there is no roll reading, and 'Live' once there is, in detailed view", () => {
		mockUseImuData.mockReturnValue(makeImuData());
		const { rerender } = render(<ImuWidget viewMode="detailed" />);
		expect(screen.getByText("No data")).toBeInTheDocument();

		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 1.2 }));
		rerender(<ImuWidget viewMode="detailed" />);
		expect(screen.getByText("Live")).toBeInTheDocument();
	});

	it("shows roll/pitch/yaw and accel values to their expected precision in detailed view", () => {
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
		render(<ImuWidget viewMode="detailed" />);
		expect(screen.getByText("1.2°")).toBeInTheDocument();
		expect(screen.getByText("-2.5°")).toBeInTheDocument();
		expect(screen.getByText("90.0°")).toBeInTheDocument();
		expect(screen.getByText("0.11 m/s²")).toBeInTheDocument();
		expect(screen.getByText("-9.81 m/s²")).toBeInTheDocument();
		expect(screen.getByText("0.00 m/s²")).toBeInTheDocument();
	});

	it("defaults to instrument view when no viewMode prop is given", () => {
		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 5, pitchDeg: -3 }));
		render(<ImuWidget />);
		expect(document.querySelector("obc-pitch-roll")).not.toBeNull();
		expect(screen.queryByText("5.0°")).not.toBeInTheDocument();
	});

	it("maps pitch/roll onto obc-pitch-roll in instrument view", () => {
		mockUseImuData.mockReturnValue(makeImuData({ rollDeg: 12, pitchDeg: -6, accelX: 1.5 }));
		render(<ImuWidget viewMode="instrument" />);

		const pitchRoll = document.querySelector("obc-pitch-roll") as HTMLElement & {
			pitch: number;
			roll: number;
		};
		expect(pitchRoll.pitch).toBe(-6);
		expect(pitchRoll.roll).toBe(12);
		expect(screen.queryByText("12.0°")).not.toBeInTheDocument();
	});
});
