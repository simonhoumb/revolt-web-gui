import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { ConnectionWidget } from "./ConnectionWidget.js";
import { useVesselHealth, type VesselHealth } from "../../hooks/useVesselHealth.js";

vi.mock("../../hooks/useVesselHealth.js", () => ({
	useVesselHealth: vi.fn(),
}));

const mockUseVesselHealth = useVesselHealth as Mock;

function makeHealth(overrides: Partial<VesselHealth> = {}): VesselHealth {
	return {
		wsConnected: false,
		bridgeConnected: false,
		latencyMs: null,
		emergencyStopActive: false,
		alerts: [],
		alertCount: 0,
		highestAlertLevel: null,
		...overrides,
	};
}

afterEach(() => {
	cleanup();
});

describe("ConnectionWidget", () => {
	it("shows a latency placeholder when there is no reading", () => {
		mockUseVesselHealth.mockReturnValue(makeHealth());
		render(<ConnectionWidget />);
		expect(screen.getByText("—")).toBeInTheDocument();
	});

	it("shows the latency value in milliseconds once available", () => {
		mockUseVesselHealth.mockReturnValue(makeHealth({ wsConnected: true, latencyMs: 42 }));
		render(<ConnectionWidget />);
		expect(screen.getByText("42 ms")).toBeInTheDocument();
	});

	it("labels every status row", () => {
		mockUseVesselHealth.mockReturnValue(makeHealth());
		render(<ConnectionWidget />);
		expect(screen.getByText("WebSocket")).toBeInTheDocument();
		expect(screen.getByText("ROS Bridge")).toBeInTheDocument();
		expect(screen.getByText("Emergency Stop")).toBeInTheDocument();
	});
});
