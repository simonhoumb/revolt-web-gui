import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { missionApi } from "./missionApi.js";
import { apiFetch } from "./api.js";

vi.mock("./api.js", () => ({
	apiFetch: vi.fn(),
}));

const mockApiFetch = apiFetch as Mock;

function jsonResponse(body: unknown, ok = true, status = 200): Response {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Error",
		json: () => Promise.resolve(body),
	} as Response;
}

beforeEach(() => {
	vi.clearAllMocks();
});

describe("missionApi", () => {
	it("list() calls GET /api/missions with no query when status is omitted", async () => {
		mockApiFetch.mockResolvedValue(jsonResponse([]));
		await missionApi.list();
		expect(mockApiFetch).toHaveBeenCalledWith("/api/missions");
	});

	it("list() appends a status query param when provided", async () => {
		mockApiFetch.mockResolvedValue(jsonResponse([]));
		await missionApi.list("draft" as never);
		expect(mockApiFetch).toHaveBeenCalledWith("/api/missions?status=draft");
	});

	it("create() posts JSON and returns the parsed mission", async () => {
		const mission = { id: "m1", name: "Test" };
		mockApiFetch.mockResolvedValue(jsonResponse(mission));
		const result = await missionApi.create({ name: "Test" });
		expect(mockApiFetch).toHaveBeenCalledWith(
			"/api/missions",
			expect.objectContaining({ method: "POST", body: JSON.stringify({ name: "Test" }) }),
		);
		expect(result).toEqual(mission);
	});

	it("throws on a non-ok response", async () => {
		mockApiFetch.mockResolvedValue(jsonResponse({ detail: "not found" }, false, 404));
		await expect(missionApi.get("missing")).rejects.toThrow(/404/);
	});

	it("deleteWaypoint() issues a DELETE and resolves with no value", async () => {
		mockApiFetch.mockResolvedValue(jsonResponse(undefined, true, 204));
		await expect(missionApi.deleteWaypoint("m1", "wp1")).resolves.toBeUndefined();
		expect(mockApiFetch).toHaveBeenCalledWith(
			"/api/missions/m1/waypoints/wp1",
			expect.objectContaining({ method: "DELETE" }),
		);
	});
});
