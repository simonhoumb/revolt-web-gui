import { afterEach, describe, expect, it, vi } from "vitest";
import type { Mock } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { Canvas } from "@react-three/fiber";
import { Lidar3DScene } from "./Lidar3DScene.js";

// r3f's <Canvas> requires a real WebGL context, which jsdom doesn't provide -- stubbed here so
// this test can assert on the props Lidar3DScene passes down (camera config) without mounting
// r3f's renderer. The buffer-position conversion has its own unit test against the pure
// rosPointsToThreeBufferPositions function (see lib/lidarPointCloud.test.ts).
vi.mock("@react-three/fiber", () => ({
	Canvas: vi.fn(() => null),
}));
vi.mock("@react-three/drei", () => ({
	OrbitControls: () => null,
}));

const mockCanvas = Canvas as unknown as Mock;

afterEach(() => {
	cleanup();
});

describe("Lidar3DScene", () => {
	it("passes a chase-cam default position (elevated, ~40m back) and a field of view suited to the ~30-50m operating range", () => {
		render(<Lidar3DScene points={[]} />);
		const props = mockCanvas.mock.calls[0]?.[0] as {
			camera: { position: number[]; fov: number };
		};
		expect(props.camera.fov).toBe(50);
		const [x, y, z] = props.camera.position;
		expect(y).toBeCloseTo(25); // CHASE_HEIGHT
		// Horizontal distance from the origin should be CHASE_DISTANCE regardless of the current
		// MOUNTING_YAW_DEG -- the exact x/z split rotates with that tunable value, the radius doesn't.
		expect(Math.hypot(x ?? 0, z ?? 0)).toBeCloseTo(40);
	});
});
