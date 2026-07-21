import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import {
	RosCommandInvalidParamsError,
	RosCommandNotFoundError,
	rosCommandApi,
} from "./rosCommandApi.js";
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

describe("rosCommandApi", () => {
	it("list() calls GET /api/ros-commands and returns the parsed registry", async () => {
		const commands = [{ command_id: "list_topics", label: "List topics" }];
		mockApiFetch.mockResolvedValue(jsonResponse(commands));
		const result = await rosCommandApi.list();
		expect(mockApiFetch).toHaveBeenCalledWith("/api/ros-commands");
		expect(result).toEqual(commands);
	});

	it("execute() posts the command id and params", async () => {
		const result = {
			command_id: "echo_topic",
			ok: true,
			error: null,
			result: {},
			executed_at: "t",
		};
		mockApiFetch.mockResolvedValue(jsonResponse(result));
		const response = await rosCommandApi.execute("echo_topic", { topic: "/fix" });
		expect(mockApiFetch).toHaveBeenCalledWith(
			"/api/ros-commands/echo_topic",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({ params: { topic: "/fix" } }),
			}),
		);
		expect(response).toEqual(result);
	});

	it("execute() throws RosCommandNotFoundError on a 404", async () => {
		mockApiFetch.mockResolvedValue(
			jsonResponse({ detail: "Unknown command: nope" }, false, 404),
		);
		await expect(rosCommandApi.execute("nope", {})).rejects.toThrow(RosCommandNotFoundError);
	});

	it("execute() throws RosCommandInvalidParamsError on a 400", async () => {
		mockApiFetch.mockResolvedValue(
			jsonResponse(
				{ detail: "Topic is not allow-listed for target 'physical': /bad" },
				false,
				400,
			),
		);
		await expect(rosCommandApi.execute("echo_topic", { topic: "/bad" })).rejects.toThrow(
			RosCommandInvalidParamsError,
		);
	});

	it("execute() throws a generic error on other non-ok statuses", async () => {
		mockApiFetch.mockResolvedValue(jsonResponse({}, false, 500));
		await expect(rosCommandApi.execute("list_topics", {})).rejects.toThrow(/500/);
	});
});
