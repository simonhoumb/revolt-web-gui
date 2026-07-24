import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { CameraWidget } from "./CameraWidget.js";
import { useBridgeData } from "../../context/useBridgeData.js";

vi.mock("../../context/useBridgeData.js", () => ({
	useBridgeData: vi.fn(),
}));

const mockUseBridgeData = useBridgeData as Mock;

afterEach(() => {
	cleanup();
});

describe("CameraWidget", () => {
	it("shows the no-signal overlay when the WS is disconnected", () => {
		mockUseBridgeData.mockReturnValue({
			wsConnected: false,
			bridgeConnected: false,
			cameraStatus: null,
		});
		render(<CameraWidget />);
		expect(screen.getByText("No signal")).toBeInTheDocument();
	});

	it("shows the no-signal overlay when connected but the camera itself is not", () => {
		mockUseBridgeData.mockReturnValue({
			wsConnected: true,
			bridgeConnected: true,
			cameraStatus: { connected: false },
		});
		render(<CameraWidget />);
		expect(screen.getByText("No signal")).toBeInTheDocument();
	});

	it("hides the overlay once the WS, bridge, and camera are all connected", () => {
		mockUseBridgeData.mockReturnValue({
			wsConnected: true,
			bridgeConnected: true,
			cameraStatus: { connected: true },
		});
		render(<CameraWidget />);
		expect(screen.queryByText("No signal")).not.toBeInTheDocument();
	});

	it("always renders the MJPEG stream image", () => {
		mockUseBridgeData.mockReturnValue({
			wsConnected: true,
			bridgeConnected: true,
			cameraStatus: { connected: true },
		});
		render(<CameraWidget />);
		expect(screen.getByAltText("Live camera feed")).toHaveAttribute(
			"src",
			"/api/camera/main/stream",
		);
	});
});
